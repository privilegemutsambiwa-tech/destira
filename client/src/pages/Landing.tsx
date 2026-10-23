import type React from "react";
import { useRef, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowRight, CalendarHeart, ChevronDown, Flag, Lock, MessageCircle, ShieldCheck, SlidersHorizontal, Sparkles, Users } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { DestiraLockup } from "@/components/brand/logo";
import { ResonanceDial } from "@/components/resonance-dial";
import { photos as BUNDLED_PHOTOS, type Photo } from "@/lib/photos";
import { isNativeApp } from "@/lib/native";
import { pendingReferralCode } from "@/lib/attribution";
import { supabase } from "@/lib/supabase";
import { NATIVE_AUTH_REDIRECT, openNativeOAuth } from "@/lib/native";
import { trackEvent, trackPageView } from "@/lib/pixel";
import { LANDING_QUIZ, saveQuizAnswers, twinNote, type QuizAnswers } from "@/lib/landing-quiz";

// The app doesn't carry the website's photo library (hundreds of MB); its
// welcome screen loads these from destira.date and shows the blurred
// placeholder while offline.
const PHOTO_ORIGIN = isNativeApp() ? "https://www.destira.date" : "";
const remote = (u: string) => u.replace(/(^|\s|,)\/photos\//g, `$1${PHOTO_ORIGIN}/photos/`);
const HERO_PHOTOS: Photo[] = PHOTO_ORIGIN
  ? BUNDLED_PHOTOS.map((p) => ({ ...p, src: remote(p.src), srcSet: remote(p.srcSet), webpSrcSet: remote(p.webpSrcSet), variants: p.variants.map((v) => ({ ...v, webp: remote(v.webp), jpg: remote(v.jpg) })) }))
  : BUNDLED_PHOTOS;

/* ------------------------------------------------------------------ *
 *  Landing — route "/" for signed-out visitors, and where the ads land.
 *  Built for a cold visitor on a phone: say what Destira is in one line,
 *  offer one-tap sign-up immediately, then let them try it (the quiz and
 *  the twin demo) before asking again.
 *
 *    1  Nav
 *    2  Hero          — headline matched to the ad (?v=), Google + email
 *    3  Quiz          — three real onboarding questions → the twin's note
 *    4  How it works  — three steps
 *    5  Ask a twin    — tap a question, see how a twin answers (and refuses)
 *    6  Happening soon — real upcoming public events (/api/public/landing)
 *    7  Why switch    — the difference from swiping, side by side
 *    8  Safety        — the twin never speaks as you; you set its limits
 *    9  FAQ
 *   10  Closing CTA, footer, and a sticky sign-up bar on phones
 *
 *  Every number shown is real or absent: no invented member counts.
 * ------------------------------------------------------------------ */

function isInIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduce;
}

/** Scroll-in reveal: opacity 0→1, translateY(16px)→0 over 600ms, fires once.
 *  Renders the final state immediately under prefers-reduced-motion. */
function Reveal({
  delay = 0,
  className,
  children,
}: {
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const reduce = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (reduce) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          io.disconnect();
          window.setTimeout(() => setShown(true), delay);
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [delay, reduce]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(16px)",
        transition: "opacity 600ms ease-out, transform 600ms ease-out",
      }}
    >
      {children}
    </div>
  );
}

// New arrivals (hero-81+, the curated couples batch) show up roughly twice as
// often as the older set — each priority photo is duplicated in the cycle,
// spaced a full lap apart so it never repeats back-to-back.
const NEW_HERO_START = 81;
const isPriorityPhoto = (name: string) => {
  const m = /^hero-(\d+)$/.exec(name);
  return !!m && Number(m[1]) >= NEW_HERO_START;
};

function buildWeightedHeroSet(all: Photo[]): Photo[] {
  const priority = all.filter((p) => isPriorityPhoto(p.name));
  const rest = all.filter((p) => !isPriorityPhoto(p.name));
  const priorityTwice = [...priority, ...priority];
  const merged: Photo[] = [];
  const len = Math.max(priorityTwice.length, rest.length);
  for (let i = 0; i < len; i++) {
    if (i < priorityTwice.length) merged.push(priorityTwice[i]);
    if (i < rest.length) merged.push(rest[i]);
  }
  return merged;
}

// The hero cycles through every photo in the generated manifest, weighted
// toward the newest batch. A 404 self-heals out of the rotation.
const HERO_SET: Photo[] = buildWeightedHeroSet(HERO_PHOTOS);

/** Picks a starting index a fraction of the way through HERO_SET so multiple
 *  rotating sections on the same page desync instead of mirroring each other. */
const heroOffset = (fraction: number) => Math.floor(HERO_SET.length * fraction);

const HERO_SIZES = "(min-width: 1024px) 45vw, 100vw";

/** Cycles through a list of manifest photos, swapping the image directly (no
 *  fade) on an interval. Static (first item) under prefers-reduced-motion.
 *  Never renders empty — a 404'd photo drops itself out of the rotation. */
function RotatingPhoto({
  slots,
  ratio,
  priority = false,
  className = "",
  style,
  intervalMs = 4600,
  startIndex = 0,
  caption,
}: {
  slots: Photo[];
  ratio: string;
  priority?: boolean;
  className?: string;
  style?: React.CSSProperties;
  intervalMs?: number;
  startIndex?: number;
  caption?: string;
}) {
  const reduce = usePrefersReducedMotion();
  const [live, setLive] = useState<Photo[]>(slots);
  const [i, setI] = useState(() => (slots.length ? startIndex % slots.length : 0));

  useEffect(() => {
    if (reduce || live.length < 2) return;
    const id = window.setInterval(() => {
      setI((n) => (n + 1) % live.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [reduce, live.length, intervalMs]);

  const dropPhoto = (name: string) =>
    setLive((cur) => {
      const next = cur.filter((p) => p.name !== name);
      return next.length ? next : cur; // never empty
    });

  const idx = Math.min(i, live.length - 1);
  const p = live[idx];

  return (
    <figure
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio: ratio, borderRadius: "20px", ...style }}
      data-photo-slot={p?.name}
    >
      {p && (
        <picture>
          <source type="image/webp" srcSet={p.webpSrcSet} sizes={HERO_SIZES} />
          <img
            src={p.src}
            srcSet={p.srcSet}
            sizes={HERO_SIZES}
            alt=""
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            onError={() => dropPhoto(p.name)}
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              filter: "saturate(1.05)",
              backgroundImage: `url("${p.lqip}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        </picture>
      )}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "#FF6B4A", opacity: 0.07, mixBlendMode: "soft-light" }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ borderRadius: "20px", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.09)" }}
      />
      {caption && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-vf-scrim/85 to-transparent"
            style={{ height: "45%" }}
          />
          <figcaption
            className="absolute bottom-4 left-4 right-4 font-mono text-[10.5px] uppercase tracking-[0.16em]"
            style={{ color: "rgba(245,240,234,0.9)" }}
          >
            {caption}
          </figcaption>
        </>
      )}
    </figure>
  );
}

/** Full-bleed rotating backdrop (the Closing section). Same no-fade swap as
 *  RotatingPhoto, but a bare absolute-fill <img> — the section around it
 *  supplies its own scrim/gradient overlays. */
function RotatingBackdrop({
  slots,
  startIndex = 0,
  intervalMs = 5200,
  objectPosition = "center 40%",
}: {
  slots: Photo[];
  startIndex?: number;
  intervalMs?: number;
  objectPosition?: string;
}) {
  const reduce = usePrefersReducedMotion();
  const [live, setLive] = useState<Photo[]>(slots);
  const [i, setI] = useState(() => (slots.length ? startIndex % slots.length : 0));

  useEffect(() => {
    if (reduce || live.length < 2) return;
    const id = window.setInterval(() => {
      setI((n) => (n + 1) % live.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [reduce, live.length, intervalMs]);

  const dropPhoto = (name: string) =>
    setLive((cur) => {
      const next = cur.filter((p) => p.name !== name);
      return next.length ? next : cur;
    });

  const idx = Math.min(i, live.length - 1);
  const p = live[idx];
  if (!p) return null;

  return (
    <picture>
      <source type="image/webp" srcSet={p.webpSrcSet} sizes="100vw" />
      <img
        src={p.src}
        srcSet={p.srcSet}
        sizes="100vw"
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => dropPhoto(p.name)}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition }}
      />
    </picture>
  );
}

// ── Message match ────────────────────────────────────────────────────
// Each ad set links with ?v=<key> so the first line someone reads continues
// the ad they tapped. Unknown or missing keys get the default. Kept for the
// visit, so coming back to "/" from /signup shows the same promise.
const HEADLINES: Record<string, { lead: string; accent: string; sub: string }> = {
  default: {
    lead: "Meet people you",
    accent: "actually click with.",
    sub: "Your AI twin chats with other members' twins first, then brings you the people you'd really get on with, and tells you why. No endless swiping. No cold openers.",
  },
  twin: {
    lead: "Your AI twin breaks",
    accent: "the ice for you.",
    sub: "It has the awkward first conversation with other members' twins, then shows you who you'd click with and why. You only step in when it's worth it.",
  },
  events: {
    lead: "Meet new people",
    accent: "at real events.",
    sub: "Dinners, hikes, game nights and more, hosted by Destira and its members. Your AI twin points out who's going that you'd actually get on with.",
  },
  serious: {
    lead: "For people who are",
    accent: "done with games.",
    sub: "Everyone here is looking for something real. Your AI twin finds the people who want what you want, before either of you spends an evening finding out.",
  },
};

function useHeadline() {
  const [key] = useState(() => {
    let v = "";
    try {
      v = new URLSearchParams(window.location.search).get("v")?.toLowerCase() ?? "";
      if (v && HEADLINES[v]) sessionStorage.setItem("destira.v", v);
      else v = sessionStorage.getItem("destira.v") ?? "";
    } catch {
      /* storage blocked: default headline */
    }
    return HEADLINES[v] ? v : "default";
  });
  return HEADLINES[key];
}

// ── Sign-up buttons ──────────────────────────────────────────────────

async function startGoogle(): Promise<void> {
  const native = isNativeApp();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: native ? NATIVE_AUTH_REDIRECT : `${window.location.origin}/auth/callback`,
      skipBrowserRedirect: native,
    },
  });
  if (error) throw error;
  if (native && data?.url) await openNativeOAuth(data.url);
}

/** Google (one tap for most phones) above email. The pair every CTA uses. */
function SignupButtons({ className = "", testId = "hero" }: { className?: string; testId?: string }) {
  const [, setLocation] = useLocation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const google = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await startGoogle();
    } catch {
      setFailed(true);
    } finally {
      // On the web the page navigates away; this only matters if it didn't.
      window.setTimeout(() => setBusy(false), 4000);
    }
  };

  return (
    <div className={`flex flex-col gap-2.5 w-full max-w-[400px] ${className}`}>
      <button
        onClick={google}
        disabled={busy}
        className="inline-flex items-center justify-center gap-2.5 rounded-full bg-vf-surface border border-vf-line text-vf-text font-semibold h-[52px] text-[15.5px] btn-press shadow-[0_1px_2px_rgba(0,0,0,0.06)] disabled:opacity-70"
        data-testid={`button-${testId}-google`}
      >
        <FcGoogle className="w-5 h-5" />
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      <button
        onClick={() => setLocation("/signup")}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-vf-ember text-white font-semibold h-[52px] text-[15.5px] btn-press transition-colors hover:bg-[var(--vf-ember-soft)]"
        data-testid={`button-${testId}-email`}
      >
        Sign up with email
      </button>
      {failed && <p className="text-[13px] text-vf-ember">Couldn't open Google. Try again, or use email.</p>}
    </div>
  );
}

function Eyebrow({ children, tone = "faint" }: { children: React.ReactNode; tone?: "faint" | "mint" | "ember" }) {
  const color = tone === "mint" ? "text-vf-mint" : tone === "ember" ? "text-vf-ember" : "text-vf-faint";
  return <div className={`font-mono text-[11px] uppercase tracking-[0.16em] ${color}`}>{children}</div>;
}

function SectionHeading({ id, children, className = "" }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <h2
      id={id}
      className={`font-serif font-normal text-vf-text mt-3 ${className}`}
      style={{ fontSize: "clamp(30px, 4.4vw, 50px)", lineHeight: 1.06, letterSpacing: "-0.02em" }}
    >
      {children}
    </h2>
  );
}

// ── 3 · The quiz ─────────────────────────────────────────────────────

function TwinQuiz() {
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [i, setI] = useState(0);
  const started = useRef(false);
  const done = i >= LANDING_QUIZ.length;

  const pick = (orderIndex: number, value: string) => {
    if (!started.current) {
      started.current = true;
      trackEvent("ViewContent", { content_name: "twin_quiz" });
    }
    const next = { ...answers, [orderIndex]: value };
    setAnswers(next);
    window.setTimeout(() => {
      setI((n) => n + 1);
      if (i + 1 >= LANDING_QUIZ.length) {
        saveQuizAnswers(next);
        trackEvent("Lead", { content_name: "twin_quiz" });
      }
    }, 180);
  };

  const restart = () => {
    setAnswers({});
    setI(0);
  };

  const note = done ? twinNote(answers) : null;
  const q = LANDING_QUIZ[Math.min(i, LANDING_QUIZ.length - 1)];

  return (
    <div
      className="rounded-[28px] border border-vf-mint/25 p-5 sm:p-8 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.35)]"
      style={{ background: "linear-gradient(160deg, hsl(var(--vf-mint) / 0.10), var(--vf-surface) 55%)" }}
      data-testid="twin-quiz"
    >
      {!done ? (
        <div key={i} className="animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="flex items-center justify-between">
            <Eyebrow tone="mint">Question {i + 1} of {LANDING_QUIZ.length}</Eyebrow>
            <div className="flex gap-1.5" aria-hidden="true">
              {LANDING_QUIZ.map((_, n) => (
                <span key={n} className={`h-1.5 rounded-full transition-all ${n <= i ? "w-6 bg-vf-mint" : "w-3 bg-vf-text/15"}`} />
              ))}
            </div>
          </div>
          <p className="font-serif text-vf-text mt-4" style={{ fontSize: "clamp(23px, 3vw, 30px)", lineHeight: 1.15 }}>
            {q.prompt}
          </p>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {q.options.map((o) => {
              const on = answers[q.orderIndex] === o.value;
              return (
                <button
                  key={o.value}
                  onClick={() => pick(q.orderIndex, o.value)}
                  className={`text-left rounded-[16px] border px-4 py-3.5 text-[15px] font-medium transition-all btn-press ${
                    on ? "border-vf-mint bg-vf-mint/15 text-vf-text" : "border-vf-line bg-vf-surface text-vf-text hover:border-vf-mint/50"
                  }`}
                  data-testid={`quiz-option-${q.orderIndex}`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          {i > 0 && (
            <button onClick={() => setI((n) => n - 1)} className="mt-4 text-[13px] text-vf-muted underline underline-offset-2">
              Back
            </button>
          )}
        </div>
      ) : (
        <div className="animate-in fade-in zoom-in-95 duration-500" data-testid="quiz-result">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-vf-mint animate-pulse" aria-hidden="true" />
            <Eyebrow tone="mint">Your twin's first note about you</Eyebrow>
          </div>
          <p className="font-serif text-vf-text mt-4" style={{ fontSize: "clamp(22px, 2.8vw, 28px)", lineHeight: 1.25 }}>
            “{note!.about}”
          </p>
          <p className="mt-4 text-[15.5px] leading-[1.6] text-vf-muted">
            It would look for <span className="text-vf-text font-medium">{note!.looksFor}</span>, and talk to their twin
            before you ever have to.
          </p>
          <div className="mt-6 rounded-[16px] bg-vf-mint/10 border border-vf-mint/20 px-4 py-3 text-[14px] leading-[1.5] text-vf-text">
            <b className="font-semibold">Your 3 answers are saved.</b> Create your free account and your twin starts with
            them, already part-way to its first introductions.
          </div>
          <SignupButtons className="mt-5" testId="quiz" />
          <button onClick={restart} className="mt-4 text-[13px] text-vf-muted underline underline-offset-2">
            Start over
          </button>
        </div>
      )}
    </div>
  );
}

// ── 5 · Ask a twin ───────────────────────────────────────────────────
// A fictional member's twin, so visitors can feel how it answers, including
// how it declines a topic its owner hasn't switched on.

const ASK_EXAMPLES: { q: string; a: string; refused?: boolean }[] = [
  {
    q: "What's she like on a free weekend?",
    a: "Saturday mornings she's at the Avondale market before nine. Afternoons are for her sister's kids. She keeps Sunday slow on purpose.",
  },
  {
    q: "What would be a deal-breaker?",
    a: "Someone who goes quiet instead of saying what's wrong. She'd rather have the hard conversation early than guess for a week.",
  },
  {
    q: "How much does she earn?",
    a: "That's not something she's switched on for me to discuss. If it matters, it's a question for her, later, in person.",
    refused: true,
  },
  {
    q: "Would we get on?",
    a: "Probably on the things that matter: you both say what's bothering you straight away. You'd differ on pace. She plans, you improvise.",
  },
];

function AskATwin() {
  const reduce = usePrefersReducedMotion();
  const [active, setActive] = useState<number | null>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (active == null) return;
    const full = ASK_EXAMPLES[active].a;
    if (reduce) {
      setTyped(full);
      return;
    }
    setTyped("");
    let n = 0;
    const id = window.setInterval(() => {
      n += 2;
      setTyped(full.slice(0, n));
      if (n >= full.length) window.clearInterval(id);
    }, 16);
    return () => window.clearInterval(id);
  }, [active, reduce]);

  const ex = active != null ? ASK_EXAMPLES[active] : null;

  return (
    <div className="rounded-[28px] border border-vf-line bg-vf-surface p-5 sm:p-7" data-testid="ask-a-twin">
      <div className="flex items-center gap-3">
        <div className="relative" aria-hidden="true">
          <span
            className="w-12 h-12 rounded-full flex items-center justify-center font-serif text-[22px] text-white"
            style={{ background: "linear-gradient(135deg, hsl(var(--vf-ember)), var(--vf-mint-vivid))" }}
          >
            R
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-vf-mint border-2 border-vf-surface" />
        </div>
        <div>
          <div className="text-[15px] font-semibold text-vf-text">Rufaro's twin</div>
          <div className="text-[12.5px] text-vf-muted">An example member · answers only what she allows</div>
        </div>
      </div>

      <div className="mt-5 min-h-[120px] rounded-[18px] bg-vf-surface2 p-4" aria-live="polite">
        {ex ? (
          <>
            <div className="flex justify-end">
              <span className="rounded-[14px] rounded-br-[4px] bg-vf-ember text-white px-3.5 py-2 text-[14px] max-w-[85%]">{ex.q}</span>
            </div>
            <div className="mt-3 flex">
              <span
                className={`rounded-[14px] rounded-bl-[4px] px-3.5 py-2.5 text-[14.5px] leading-[1.5] max-w-[92%] ${
                  ex.refused ? "bg-vf-text/[0.06] text-vf-muted italic" : "bg-vf-mint/15 text-vf-text"
                }`}
              >
                {typed}
                {typed.length < ex.a.length && <span className="inline-block w-1.5 h-4 align-middle bg-vf-mint/70 ml-0.5 animate-pulse" />}
              </span>
            </div>
          </>
        ) : (
          <p className="text-[14.5px] text-vf-muted">Tap a question below to ask her twin.</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {ASK_EXAMPLES.map((e, n) => (
          <button
            key={e.q}
            onClick={() => setActive(n)}
            className={`rounded-full border px-3.5 py-2 text-[13.5px] transition-colors btn-press ${
              active === n ? "border-vf-ember bg-vf-ember/10 text-vf-text" : "border-vf-line text-vf-text hover:border-vf-ember/50"
            }`}
            data-testid={`ask-chip-${n}`}
          >
            {e.q}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── 6 · Happening soon ───────────────────────────────────────────────

interface LandingEvent {
  id: number;
  title: string;
  startsAt: string;
  suburb: string | null;
  city: string | null;
  coverImageUrl: string | null;
  goingCount: number;
  isFull: boolean;
  costLine: string;
  isOfficial: boolean;
}

function eventDay(iso: string) {
  const d = new Date(iso);
  return {
    dow: d.toLocaleDateString(undefined, { weekday: "short" }),
    day: d.toLocaleDateString(undefined, { day: "numeric" }),
    mon: d.toLocaleDateString(undefined, { month: "short" }),
    time: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

function EventCard({ e }: { e: LandingEvent }) {
  const [, setLocation] = useLocation();
  const when = eventDay(e.startsAt);
  const place = [e.suburb, e.city].filter(Boolean).join(", ");
  return (
    <button
      onClick={() => setLocation(`/events/${e.id}`)}
      className="group text-left shrink-0 w-[78%] sm:w-auto snap-start rounded-[22px] border border-vf-line bg-vf-surface overflow-hidden btn-press"
      data-testid={`landing-event-${e.id}`}
    >
      <div className="relative aspect-[16/10] bg-vf-surface2">
        {e.coverImageUrl && (
          <img src={e.coverImageUrl} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        )}
        <div className="absolute top-3 left-3 rounded-[12px] bg-vf-surface/95 text-center px-2.5 py-1.5 shadow-sm">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-vf-ember">{when.dow}</div>
          <div className="font-serif text-[20px] leading-none text-vf-text mt-0.5">{when.day}</div>
          <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-vf-muted mt-0.5">{when.mon}</div>
        </div>
        {e.isOfficial && (
          <span className="absolute top-3 right-3 rounded-full bg-vf-ember text-white text-[11px] font-semibold px-2.5 py-1">Destira event</span>
        )}
      </div>
      <div className="p-4">
        <div className="text-[16px] font-semibold text-vf-text leading-snug line-clamp-2">{e.title}</div>
        <div className="mt-1.5 text-[13px] text-vf-muted">
          {when.time}
          {place && ` · ${place}`}
        </div>
        <div className="mt-3 flex items-center justify-between text-[12.5px]">
          <span className="text-vf-muted">{e.costLine}</span>
          {e.isFull ? (
            <span className="text-vf-ember font-medium">Full</span>
          ) : e.goingCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-vf-text font-medium">
              <Users className="w-3.5 h-3.5" /> {e.goingCount} going
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

// ── 9 · FAQ ──────────────────────────────────────────────────────────

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "Is Destira free?",
    a: "Yes, joining is free: your twin, Discover, matches, chat, the Lounge and free events. Paid plans add extras such as reading full twin transcripts and hosting your own events. They're paid upfront and never renew on their own.",
  },
  {
    q: "Will the AI pretend to be me?",
    a: "No. Your twin never messages anyone as you and never agrees to a date for you. It only answers questions about you, only on topics you've switched on, and you can change those any time.",
  },
  {
    q: "What is an AI twin, exactly?",
    a: "A private assistant that learns from your answers to a few questions. When someone is curious about you, they ask your twin instead of starting with a cold “hey”. It also talks to other members' twins to find people you'd get on with.",
  },
  {
    q: "Who is on Destira?",
    a: "Adults (18+) who want to actually meet people. Destira started in Harare, Zimbabwe, and anyone can join from anywhere.",
  },
  {
    q: "Do I need photos to start?",
    a: "No. You can join, answer your twin's questions and look around first. Adding photos later helps people say yes.",
  },
  {
    q: "Is my information safe?",
    a: (
      <>
        We never sell your data. You decide what your twin may discuss, you can block or report anyone, and you can download or
        delete everything from Settings.{" "}
        <a href="/privacy" className="text-vf-ember underline underline-offset-2">
          Read the privacy policy
        </a>
        .
      </>
    ),
  },
];

function FaqItem({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <details className="group border-b border-vf-line py-1 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex items-center justify-between gap-4 cursor-pointer list-none py-4 text-[16.5px] font-medium text-vf-text">
        {q}
        <ChevronDown className="w-5 h-5 shrink-0 text-vf-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="pb-5 -mt-1 text-[15px] leading-[1.65] text-vf-muted max-w-[62ch]">{a}</div>
    </details>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export default function Landing() {
  const inIframe = isInIframe();
  const [, setLocation] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const headline = useHeadline();

  const heroCtaRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef<HTMLElement>(null);
  const [heroCtaVisible, setHeroCtaVisible] = useState(true);
  const [closingVisible, setClosingVisible] = useState(false);

  const [live, setLive] = useState<{ events: LandingEvent[]; memberCount: number }>({ events: [], memberCount: 0 });

  const handleDemo = async () => {
    try {
      const res = await fetch("/api/demo/login", { method: "POST", credentials: "include" });
      if (res.ok) {
        window.location.href = "/";
        return;
      }
    } catch {
      /* fall through to login */
    }
    setLocation("/login");
  };

  useEffect(() => {
    trackPageView();
    fetch("/api/public/landing")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setLive({ events: d.events ?? [], memberCount: d.memberCount ?? 0 }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The phone's sticky sign-up bar: only once the hero's buttons have scrolled
  // away, and not on top of the closing section's own buttons.
  useEffect(() => {
    const watch = (el: Element | null, set: (v: boolean) => void) => {
      if (!el) return () => {};
      const io = new IntersectionObserver(([entry]) => set(entry.isIntersecting), { threshold: 0 });
      io.observe(el);
      return () => io.disconnect();
    };
    const a = watch(heroCtaRef.current, setHeroCtaVisible);
    const b = watch(closingRef.current, setClosingVisible);
    return () => {
      a();
      b();
    };
  }, []);
  const showStickyBar = !heroCtaVisible && !closingVisible;

  // ?ref=CODE is stashed app-wide (lib/attribution.ts, from main.tsx) so it
  // also works on an event link. Here it just names who invited them.
  const [inviter, setInviter] = useState<{ firstName: string; rewardDays: number } | null>(null);
  useEffect(() => {
    const code = pendingReferralCode();
    if (!code) return;
    fetch(`/api/referrals/inviter/${code}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setInviter(d))
      .catch(() => {});
  }, []);

  // Page-level head meta. document.title stays the static "Destira" from
  // index.html (a PWA installed from here would otherwise get a different
  // name); og:* is what link previews read.
  useEffect(() => {
    const created: HTMLMetaElement[] = [];
    const setMeta = (attr: "name" | "property", key: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
        created.push(el);
      }
      el.setAttribute("content", content);
    };
    const desc =
      "Your AI twin chats with other members' twins first, then shows you who you'd actually click with, and why. Free to join.";
    setMeta("name", "description", desc);
    setMeta("property", "og:title", "Destira: meet people you actually click with");
    setMeta("property", "og:description", desc);
    setMeta("property", "og:image", "/brand/og-default.png");
    return () => {
      created.forEach((m) => m.remove());
    };
  }, []);

  const members = live.memberCount >= 300 ? Math.floor(live.memberCount / 100) * 100 : 0;

  return (
    <div className="min-h-dvh bg-vf-ink text-vf-text">
      {inIframe && (
        <div
          className="fixed top-0 inset-x-0 z-[100] px-4 py-2 flex items-center gap-2 text-sm font-medium"
          style={{ background: "#F59E0B", color: "#000" }}
          data-testid="banner-iframe-warning"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            <strong>Dev note:</strong> Login won't work in the Replit preview pane. Open the app directly:{" "}
            <a href={window.location.origin} target="_blank" rel="noreferrer" className="underline font-bold" data-testid="link-open-direct">
              {window.location.origin}
            </a>
          </span>
        </div>
      )}

      {/* ============ 1 · NAV ============ */}
      <nav
        className={`sticky top-0 z-50 transition-all duration-300 border-b ${
          scrolled ? "bg-vf-ink/85 backdrop-blur-md border-vf-line" : "bg-transparent border-transparent"
        }`}
        data-testid="landing-nav"
      >
        <div className="max-w-[1180px] mx-auto flex items-center justify-between px-5 sm:px-6 h-16">
          <a href="/" className="flex items-center" data-testid="link-logo">
            <DestiraLockup orientation="horizontal" size={28} />
          </a>
          <div className="flex items-center gap-4 sm:gap-6">
            <a href="#how-it-works" className="hidden md:inline text-[14px] text-vf-muted hover:text-vf-text transition-colors">
              How it works
            </a>
            <a href="#faq" className="hidden md:inline text-[14px] text-vf-muted hover:text-vf-text transition-colors">
              FAQ
            </a>
            <button
              onClick={() => setLocation("/login")}
              className="text-[14.5px] font-medium text-vf-text hover:text-vf-muted transition-colors"
              data-testid="nav-log-in"
            >
              Log in
            </button>
            <button
              onClick={() => setLocation("/signup")}
              className="hidden sm:inline-flex items-center rounded-full bg-vf-ember text-white font-semibold h-10 px-5 text-[14px] btn-press"
              data-testid="nav-sign-up"
            >
              Join free
            </button>
          </div>
        </div>
      </nav>

      {/* ============ 2 · HERO ============ */}
      <section className="relative px-5 sm:px-6 pt-6 sm:pt-10 lg:pt-14 pb-16 lg:pb-24" aria-labelledby="hero-heading" data-testid="section-hero">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[520px] -z-0"
          style={{ background: "radial-gradient(60% 60% at 80% 10%, hsl(var(--vf-ember) / 0.12), transparent 70%), radial-gradient(50% 50% at 0% 30%, hsl(var(--vf-mint) / 0.12), transparent 70%)" }}
        />
        <div className="relative max-w-[1180px] mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] items-center gap-10 lg:gap-16">
          <div>
            {inviter && (
              <div
                className="mb-5 inline-flex items-center gap-2 rounded-full border border-vf-ember/40 bg-vf-ember/10 px-4 py-2 text-[13.5px] text-vf-text"
                data-testid="banner-invited-by"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-vf-ember" aria-hidden="true" />
                {inviter.firstName} invited you. Join and you both get a free week.
              </div>
            )}
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-vf-line bg-vf-surface/70 px-3.5 py-1.5 text-[12.5px] font-medium text-vf-muted">
                <span className="relative flex w-2 h-2" aria-hidden="true">
                  <span className="absolute inset-0 rounded-full bg-vf-mint animate-ping opacity-60" />
                  <span className="relative w-2 h-2 rounded-full bg-vf-mint" />
                </span>
                Dating with an AI twin · Free to join
              </div>
            </div>
            <div>
              <h1
                id="hero-heading"
                className="font-serif font-normal text-vf-text mt-5"
                style={{ fontSize: "clamp(40px, 7vw, 80px)", lineHeight: 1.0, letterSpacing: "-0.03em" }}
              >
                {headline.lead}
                <br />
                <em className="italic text-vf-ember">{headline.accent}</em>
              </h1>
            </div>
            <div>
              <p className="mt-5 text-[16.5px] md:text-[18px] leading-[1.6] text-vf-muted max-w-[52ch]">{headline.sub}</p>
            </div>
            <div>
              <div ref={heroCtaRef} className="mt-7">
                <SignupButtons />
                <p className="mt-3.5 text-[13px] text-vf-muted">
                  Free · 18+ · About 2 minutes{" "}
                  <span aria-hidden="true">·</span>{" "}
                  <button onClick={() => setLocation("/login")} className="underline underline-offset-2 hover:text-vf-text" data-testid="hero-log-in">
                    I have an account
                  </button>
                </p>
                {members > 0 && (
                  <p className="mt-4 inline-flex items-center gap-2 text-[13.5px] text-vf-text">
                    <Users className="w-4 h-4 text-vf-mint" />
                    Join {members.toLocaleString()}+ people already on Destira
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* The product in one glance: a person, a resonance score, and the reason. */}
          <div>
            <div className="relative max-w-[440px] mx-auto lg:mx-0 lg:ml-auto">
              <RotatingPhoto slots={HERO_SET} ratio="4/5" priority className="shadow-[0_30px_80px_-30px_rgba(0,0,0,0.45)]" />
              <div className="absolute -left-3 sm:-left-8 top-6 rounded-[16px] bg-vf-surface/95 backdrop-blur border border-vf-line px-3.5 py-2.5 shadow-lg max-w-[230px] animate-in fade-in slide-in-from-left-4 duration-700">
                <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-vf-mint">
                  <Sparkles className="w-3 h-3" /> Twins talking
                </div>
                <p className="text-[13px] leading-[1.4] text-vf-text mt-1">“You both say what's bothering you straight away.”</p>
              </div>
              <div className="absolute -right-2 sm:-right-6 -bottom-6 rounded-[20px] bg-vf-surface border border-vf-line p-3.5 pr-5 shadow-xl flex items-center gap-3.5 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <ResonanceDial score={87} size={60} />
                <div>
                  <div className="text-[14px] font-semibold text-vf-text">87% resonance</div>
                  <div className="text-[12.5px] text-vf-muted">Strong on values · see why</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ 3 · QUIZ ============ */}
      <section id="try" className="px-5 sm:px-6 py-16 sm:py-24" aria-labelledby="quiz-heading" data-testid="section-quiz">
        <div className="max-w-[1080px] mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-8 lg:gap-14 items-center">
          <div>
            <Reveal>
              <Eyebrow tone="mint">Try it · 30 seconds</Eyebrow>
              <SectionHeading id="quiz-heading">See what your twin would say about you.</SectionHeading>
              <p className="mt-4 text-[16px] md:text-[17px] leading-[1.6] text-vf-muted max-w-[46ch]">
                Three taps. These are real questions from Destira, so your answers carry straight into your account
                when you join.
              </p>
            </Reveal>
          </div>
          <Reveal delay={100}>
            <TwinQuiz />
          </Reveal>
        </div>
      </section>

      {/* ============ 4 · HOW IT WORKS ============ */}
      <section id="how-it-works" className="px-5 sm:px-6 py-16 sm:py-24 bg-vf-surface2/60" aria-labelledby="how-heading" data-testid="section-how">
        <div className="max-w-[1180px] mx-auto">
          <Reveal>
            <Eyebrow>How it works</Eyebrow>
            <SectionHeading id="how-heading">Less swiping. Better first dates.</SectionHeading>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {[
              {
                icon: MessageCircle,
                title: "Tell your twin who you are",
                body: "Answer a few quick questions. Your twin learns what matters to you and what you won't compromise on.",
              },
              {
                icon: Sparkles,
                title: "Twins talk first",
                body: "Your twin chats with other members' twins, then brings you the people you'd get on with, with the reasons shown.",
              },
              {
                icon: CalendarHeart,
                title: "You take it from there",
                body: "Say hi to a match who already has something in common with you, or meet people at a small event nearby.",
              },
            ].map((s, n) => (
              <Reveal key={s.title} delay={n * 90}>
                <div className="h-full rounded-[24px] border border-vf-line bg-vf-surface p-6" data-testid={`how-step-${n + 1}`}>
                  <div className="flex items-center justify-between">
                    <span className="w-11 h-11 rounded-full bg-vf-ember/10 text-vf-ember flex items-center justify-center">
                      <s.icon className="w-5 h-5" />
                    </span>
                    <span className="font-serif text-[40px] leading-none text-vf-text/15">{n + 1}</span>
                  </div>
                  <div className="mt-5 text-[19px] font-semibold text-vf-text">{s.title}</div>
                  <p className="mt-2 text-[15px] leading-[1.6] text-vf-muted">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ 5 · ASK A TWIN ============ */}
      <section className="px-5 sm:px-6 py-16 sm:py-24" aria-labelledby="ask-heading" data-testid="section-ask">
        <div className="max-w-[1080px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-center">
          <Reveal>
            <Eyebrow tone="ember">No more cold openers</Eyebrow>
            <SectionHeading id="ask-heading">Curious about someone? Ask their twin.</SectionHeading>
            <p className="mt-4 text-[16px] md:text-[17px] leading-[1.6] text-vf-muted max-w-[48ch]">
              Instead of “hey” and a long wait, ask what you actually want to know. Their twin answers honestly, and
              politely declines anything they've kept private.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <AskATwin />
          </Reveal>
        </div>
      </section>

      {/* ============ 6 · HAPPENING SOON ============ */}
      {live.events.length > 0 && (
        <section className="py-16 sm:py-24 bg-vf-surface2/60" aria-labelledby="events-heading" data-testid="section-events">
          <div className="max-w-[1180px] mx-auto px-5 sm:px-6">
            <Reveal>
              <Eyebrow>Happening soon</Eyebrow>
              <SectionHeading id="events-heading">Meet people in real life, too.</SectionHeading>
              <p className="mt-4 text-[16px] leading-[1.6] text-vf-muted max-w-[52ch]">
                Small gatherings hosted by Destira and its members. Tap one to see the details.
              </p>
            </Reveal>
          </div>
          <div className="mt-8 max-w-[1180px] mx-auto">
            <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4 overflow-x-auto sm:overflow-visible snap-x snap-mandatory px-5 sm:px-6 pb-2 [scrollbar-width:none]">
              {live.events.map((e) => (
                <EventCard key={e.id} e={e} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============ 7 · WHY SWITCH ============ */}
      <section className="px-5 sm:px-6 py-16 sm:py-24" aria-labelledby="why-heading" data-testid="section-why">
        <div className="max-w-[880px] mx-auto">
          <Reveal>
            <Eyebrow>Why people switch</Eyebrow>
            <SectionHeading id="why-heading">Not another swiping app.</SectionHeading>
          </Reveal>
          <Reveal delay={100}>
            <div className="mt-8 rounded-[24px] border border-vf-line bg-vf-surface overflow-hidden">
              <div className="grid grid-cols-[1fr_1fr] sm:grid-cols-[0.8fr_1fr_1fr] text-[12px] font-mono uppercase tracking-[0.12em] border-b border-vf-line">
                <div className="hidden sm:block p-4 text-vf-faint" />
                <div className="p-4 text-vf-faint">Swiping apps</div>
                <div className="p-4 text-vf-ember bg-vf-ember/[0.06]">Destira</div>
              </div>
              {[
                ["First message", "“Hey” and hoping", "Your twins already found common ground"],
                ["Who you see", "Whoever swiped right", "People your twin talked to, with reasons"],
                ["Your time", "Hours of swiping", "A few questions, then your twin does the work"],
                ["Meeting up", "Up to you to arrange", "Events and groups to show up to"],
              ].map(([label, them, us]) => (
                <div key={label} className="grid grid-cols-[1fr_1fr] sm:grid-cols-[0.8fr_1fr_1fr] border-b last:border-b-0 border-vf-line">
                  <div className="col-span-2 sm:col-span-1 px-4 pt-4 sm:p-4 text-[13px] font-semibold text-vf-text">{label}</div>
                  <div className="p-4 pt-2 sm:pt-4 text-[14px] text-vf-muted">{them}</div>
                  <div className="p-4 pt-2 sm:pt-4 text-[14px] text-vf-text font-medium bg-vf-ember/[0.06]">{us}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ 8 · SAFETY ============ */}
      <section className="px-5 sm:px-6 py-16 sm:py-24 bg-vf-surface2/60" aria-labelledby="safety-heading" data-testid="section-safety">
        <div className="max-w-[1180px] mx-auto">
          <Reveal>
            <Eyebrow tone="mint">You stay in control</Eyebrow>
            <SectionHeading id="safety-heading">Your twin works for you. Never as you.</SectionHeading>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: ShieldCheck, title: "Never speaks as you", body: "It never sends a message in your name or agrees to a date for you." },
              { icon: SlidersHorizontal, title: "You set the limits", body: "Choose exactly which topics it may discuss. Change them any time." },
              { icon: Flag, title: "Block and report", body: "Block anyone in a tap. Reports are reviewed by the Destira team." },
              { icon: Lock, title: "Adults only, your data", body: "18+ only. We never sell your data, and you can delete everything." },
            ].map((t, n) => (
              <Reveal key={t.title} delay={n * 70}>
                <div className="h-full rounded-[22px] border border-vf-line bg-vf-surface p-5">
                  <t.icon className="w-6 h-6 text-vf-mint" />
                  <div className="mt-4 text-[16.5px] font-semibold text-vf-text">{t.title}</div>
                  <p className="mt-1.5 text-[14.5px] leading-[1.55] text-vf-muted">{t.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ 9 · FAQ ============ */}
      <section id="faq" className="px-5 sm:px-6 py-16 sm:py-24" aria-labelledby="faq-heading" data-testid="section-faq">
        <div className="max-w-[760px] mx-auto">
          <Reveal>
            <Eyebrow>Questions</Eyebrow>
            <SectionHeading id="faq-heading">Good to know.</SectionHeading>
          </Reveal>
          <div className="mt-6 border-t border-vf-line">
            {FAQ.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ============ 10 · CLOSING CTA ============ */}
      <section
        ref={closingRef}
        className="relative px-5 sm:px-6 py-24 sm:py-32 flex items-center justify-center overflow-hidden"
        aria-labelledby="closing-heading"
        data-testid="section-closing"
      >
        <div className="absolute inset-0" aria-hidden="true">
          <RotatingBackdrop slots={HERO_SET} startIndex={heroOffset(11 / 12)} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(rgba(12,9,16,0.70), rgba(12,9,16,0.86))" }} />
        </div>
        <div className="relative max-w-[720px] mx-auto text-center flex flex-col items-center">
          <Reveal>
            <h2
              id="closing-heading"
              className="font-serif font-normal"
              style={{ color: "#F5F0EA", fontSize: "clamp(40px, 7vw, 84px)", lineHeight: 1.02, letterSpacing: "-0.025em" }}
            >
              Your person might already be here.
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="mt-5 text-[16.5px] leading-[1.6] max-w-[46ch] mx-auto" style={{ color: "rgba(245,240,234,0.78)" }}>
              Join free in about two minutes. Your twin gets to work as soon as you've answered a few questions.
            </p>
          </Reveal>
          <Reveal delay={180} className="w-full flex justify-center">
            <SignupButtons className="mt-8" testId="closing" />
          </Reveal>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="px-5 sm:px-6 border-t border-vf-line pb-24 sm:pb-0" data-testid="landing-footer">
        <div className="max-w-[1180px] mx-auto py-12 flex flex-col md:flex-row gap-10 md:gap-16 md:items-start md:justify-between">
          <div>
            <DestiraLockup orientation="horizontal" size={28} />
            <p className="mt-4 text-[13px] text-vf-muted">Made in Harare. Open everywhere.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 sm:gap-12 text-[14px]">
            <div className="flex flex-col gap-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-vf-faint mb-1">Destira</span>
              <button onClick={() => setLocation("/signup")} className="text-left text-vf-muted hover:text-vf-text" data-testid="footer-link-signup">
                Join free
              </button>
              <button onClick={() => setLocation("/login")} className="text-left text-vf-muted hover:text-vf-text" data-testid="footer-link-login">
                Log in
              </button>
              <button onClick={handleDemo} className="text-left text-vf-muted hover:text-vf-text" data-testid="footer-link-demo">
                Try a demo
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-vf-faint mb-1">Learn</span>
              <a href="#how-it-works" className="text-vf-muted hover:text-vf-text">How it works</a>
              <a href="#faq" className="text-vf-muted hover:text-vf-text">FAQ</a>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-vf-faint mb-1">Legal</span>
              <a href="/privacy" className="text-vf-muted hover:text-vf-text">Privacy</a>
              <a href="/delete-account" className="text-vf-muted hover:text-vf-text">Delete account</a>
            </div>
          </div>
        </div>
      </footer>

      {/* ============ STICKY SIGN-UP (phones) ============ */}
      <div
        className={`sm:hidden fixed inset-x-0 bottom-0 z-40 px-4 pt-3 bg-vf-ink/95 backdrop-blur-md border-t border-vf-line transition-transform duration-300 ${
          showStickyBar ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}
        aria-hidden={!showStickyBar}
        data-testid="sticky-signup"
      >
        <div className="flex gap-2.5">
          <button
            onClick={() => startGoogle().catch(() => setLocation("/signup"))}
            className="w-[52px] h-[52px] shrink-0 rounded-full bg-vf-surface border border-vf-line flex items-center justify-center btn-press"
            aria-label="Continue with Google"
            tabIndex={showStickyBar ? 0 : -1}
          >
            <FcGoogle className="w-5 h-5" />
          </button>
          <button
            onClick={() => setLocation("/signup")}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-vf-ember text-white font-semibold h-[52px] text-[15.5px] btn-press"
            tabIndex={showStickyBar ? 0 : -1}
          >
            Join Destira free <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
