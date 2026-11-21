import type React from "react";
import { useRef, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowRight, CalendarHeart, ChevronDown, Download, Flag, Heart, HeartHandshake, Lock, MapPin, MessageCircle, PartyPopper, RotateCcw, ShieldCheck, SlidersHorizontal, Smartphone, Sparkles, Users } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { DestiraLockup } from "@/components/brand/logo";
import { ResonanceDial } from "@/components/resonance-dial";
import type { Photo } from "@/lib/photos";
import { isNativeApp } from "@/lib/native";
import { useDataSaver } from "@/lib/data-saver";
import { pendingReferralCode } from "@/lib/attribution";
import { GoogleSignInCancelled, startGoogleSignIn } from "@/lib/google-signin";
import { consumePendingInvite, resolvePendingInviteRoute } from "@/lib/pending-invite";
import { trackCustom, trackEvent, trackPageView } from "@/lib/pixel";
import { LANDING_QUIZ, saveQuizAnswers, twinNote, type QuizAnswers } from "@/lib/landing-quiz";

// The app doesn't carry the website's photo library (hundreds of MB); its
// welcome screen loads these from destira.date and shows the blurred
// placeholder while offline.
const PHOTO_ORIGIN = isNativeApp() ? "https://www.destira.date" : "";
const remote = (u: string) => u.replace(/(^|\s|,)\/photos\//g, `$1${PHOTO_ORIGIN}/photos/`);

/* ------------------------------------------------------------------ *
 *  Landing — route "/" for signed-out visitors, and where the ads land.
 *  Built for a cold visitor on a phone: say what Destira is in one line,
 *  offer one-tap sign-up immediately, then let them try it (the quiz and
 *  the twin demo) before asking again.
 *
 *    1  Nav
 *    2  Hero          — a living wall of local couples; the headline matched
 *                       to the ad (?v=); Google + email; twins whispering
 *    3  Tonight's three — the real 19:00 Harare release, counted down live,
 *                       with three locked example cards
 *    4  Twins talking — an example conversation that plays as you scroll
 *    5  Quiz          — three real onboarding questions → the twin's note
 *    6  Ask a twin    — tap a question, see how a twin answers (and refuses)
 *    7  How it works  — three steps
 *    8  Made in Harare — local photos, places, and real upcoming events
 *    9  Why switch    — the difference from swiping, side by side
 *   10  Safety        — the twin never speaks as you; you set its limits
 *   11  FAQ
 *   12  Closing CTA over the wall, footer, sticky sign-up bar on phones
 *
 *  Every number shown is real or absent: no invented member counts. Demo
 *  people and conversations are labelled as examples. No prices here: the
 *  first visit is about what Destira is; plans live inside the app.
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
  // Visible by default. Only content that starts below the fold is hidden,
  // and only once we know the observer is there to bring it back.
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (reduce || !el || typeof IntersectionObserver === "undefined") return;
    if (el.getBoundingClientRect().top < window.innerHeight) return; // already on screen
    setShown(false);
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

// ── Photos ───────────────────────────────────────────────────────────
// Destira launches in Zimbabwe, so the landing shows Black couples only:
// a hand-picked set from client/public/photos (hero-81+ repeat 26–80, so
// only the originals are listed). Order is for variety along each column.
const LOCAL_ORDER = [39, 64, 26, 46, 59, 41, 43, 62, 66, 36, 38, 28, 70, 30, 42, 44, 45, 52, 56, 61, 65, 67, 68, 71, 75, 37];
//
// The manifest (lib/photos.ts) is mostly blur-up placeholders for every
// photo, so it loads as its own chunk instead of sitting in the app's first
// load. The request starts as soon as this module runs, so it overlaps with
// the first render; the headline and buttons never wait for it.
interface PhotoSet {
  local: Photo[];
  byName: Map<string, Photo>;
  pick: (...ns: number[]) => Photo[];
}

let photoSet: PhotoSet | null = null;
let photoLoad: Promise<PhotoSet> | null = null;

function loadPhotos(): Promise<PhotoSet> {
  photoLoad ??= import("@/lib/photos").then(({ photos }) => {
    const all: Photo[] = PHOTO_ORIGIN
      ? photos.map((p) => ({ ...p, src: remote(p.src), srcSet: remote(p.srcSet), webpSrcSet: remote(p.webpSrcSet), variants: p.variants.map((v) => ({ ...v, webp: remote(v.webp), jpg: remote(v.jpg) })) }))
      : photos;
    const byName = new Map(all.map((p) => [p.name, p]));
    const pick = (...ns: number[]) => ns.map((n) => byName.get(`hero-${n}`)).filter((p): p is Photo => !!p);
    photoSet = { local: pick(...LOCAL_ORDER), byName, pick };
    return photoSet;
  });
  return photoLoad;
}
if (typeof window !== "undefined") loadPhotos().catch(() => { photoLoad = null; });

function usePhotos(): PhotoSet | null {
  const [set, setSet] = useState(photoSet);
  useEffect(() => {
    if (set) return;
    let live = true;
    loadPhotos().then((s) => live && setSet(s)).catch(() => {});
    return () => {
      live = false;
    };
  }, [set]);
  return set;
}

/** Wall tiles are small, so their srcset stops at 960w. */
const tileSet = (p: Photo, ext: "webp" | "jpg") =>
  p.variants
    .filter((v) => v.width <= 960)
    .map((v) => `${v[ext]} ${v.width}w`)
    .join(", ");

function PhotoTile({
  p,
  eager = false,
  sizes = "(min-width: 1024px) 18vw, 46vw",
  ratio = "3/4",
  className = "",
  style,
  position = "center 35%",
}: {
  p: Photo;
  eager?: boolean;
  sizes?: string;
  ratio?: string;
  className?: string;
  style?: React.CSSProperties;
  position?: string;
}) {
  return (
    <div className={`relative w-full overflow-hidden ${className}`} style={{ aspectRatio: ratio, ...style }}>
      <picture>
        <source type="image/webp" srcSet={tileSet(p, "webp")} sizes={sizes} />
        <img
          src={p.variants[0]?.jpg ?? p.src}
          srcSet={tileSet(p, "jpg")}
          sizes={sizes}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: position, backgroundImage: `url("${p.lqip}")`, backgroundSize: "cover" }}
        />
      </picture>
    </div>
  );
}

/** The living wall: columns of couples drifting past each other, slowly, in
 *  opposite directions. Each column holds its photos twice and scrolls by
 *  exactly one copy, so the loop is seamless. Still under reduced motion,
 *  and only a few photos when the visitor is saving data. */
function PhotoWall({
  photos,
  columns = 3,
  eager = false,
  className = "",
  style,
}: {
  photos: Photo[];
  columns?: number;
  eager?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const reduce = usePrefersReducedMotion();
  const { on: saving } = useDataSaver();
  const perCol = saving ? 2 : 5;
  const cols = Array.from({ length: columns }, (_, c) => photos.slice(c * perCol, c * perCol + perCol));
  const moving = !reduce && !saving;
  return (
    <div className={`flex gap-3 ${className}`} style={style} aria-hidden="true">
      {cols.map((col, c) => (
        <div key={c} className={`flex-1 min-w-0 ${c >= 2 ? "hidden lg:block" : ""}`} style={{ marginTop: c % 2 ? "-22%" : 0 }}>
          <div
            className={moving ? (c % 2 ? "vf-wall-down" : "vf-wall-up") : ""}
            style={moving ? { animationDuration: `${84 + c * 14}s` } : undefined}
          >
            {(moving ? [...col, ...col] : col).map((p, i) => (
              <div key={i} className="pb-3">
                <PhotoTile p={p} eager={eager && i < 2 && c < 2} className="rounded-[20px] bg-white/5" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tonight's three: the 19:00 Harare release (server/daily-picks.ts) ──
const HARARE_OFFSET = 2 * 3600e3; // UTC+2, no daylight saving

function useTonight() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const h = new Date(now + HARARE_OFFSET); // read the UTC fields as Harare time
  const out = h.getUTCHours() >= 19;
  const next =
    Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate(), 19) - HARARE_OFFSET + (out ? 86400e3 : 0);
  const left = Math.max(0, next - now);
  const hh = Math.floor(left / 3600e3);
  const mm = Math.floor((left % 3600e3) / 60e3);
  const ss = Math.floor((left % 60e3) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { out, clock: `${pad(hh)}:${pad(mm)}:${pad(ss)}`, short: hh > 0 ? `${hh}h ${pad(mm)}m` : `${mm}m ${pad(ss)}s` };
}

// ── Message match ────────────────────────────────────────────────────
// Each ad set links with ?v=<key> so the first line someone reads continues
// the ad they tapped. Unknown or missing keys get the default. Kept for the
// visit, so coming back to "/" from /signup shows the same promise.
const HEADLINES: Record<string, { lead: string; accent: string; sub: string }> = {
  // What someone tapping a dating ad came for, before anything about how it
  // works: love, a partner, people. The twin is explained further down.
  default: {
    lead: "Find love.",
    accent: "Find your forever.",
    sub: "Meet new people, date someone who wants what you want, and build a relationship that lasts. Make friends in groups and meet in person at events.",
  },
  // Ads about love and a partner (couples, romance, "your person").
  love: {
    lead: "Someone is looking",
    accent: "for someone like you.",
    sub: "Meet single people in Zimbabwe who want a real relationship. Like the ones you'd love to meet, and when they like you back, start talking. Free to join.",
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

// ── What's here: said plainly, first ─────────────────────────────────
// Ad visitors are looking for love, a partner, people. Big (the headline),
// medium (the line under it), small (this row): the three things the eye
// lands on in order, before any button.

const OFFERS = [
  { icon: Users, label: "Meet new people", short: "Meet people" },
  { icon: Heart, label: "Find a partner", short: "Find a partner" },
  { icon: HeartHandshake, label: "Build something real", short: "Something real" },
  { icon: MessageCircle, label: "Join groups", short: "Groups" },
  { icon: PartyPopper, label: "Go to events", short: "Events" },
];

function HeroOffers({ className = "" }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-1.5 sm:gap-2 ${className}`} data-testid="hero-offers">
      {OFFERS.map((o) => (
        <li
          key={o.label}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 text-[12.5px] sm:text-[13px] font-medium"
          style={{ background: "rgba(245,240,234,0.10)", border: "1px solid rgba(245,240,234,0.18)", color: "#F5F0EA" }}
        >
          <o.icon className="w-3.5 h-3.5" style={{ color: "#FF8A6B" }} aria-hidden="true" />
          <span className="sm:hidden">{o.short}</span>
          <span className="hidden sm:inline">{o.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** Right under the hero: everything Destira is for, as four cards, before
 *  any of how it works. */
function WhatYoullFind({ pick }: { pick: (...ns: number[]) => Photo[] }) {
  const [meet] = pick(39);
  const [love] = pick(64);
  const faces = pick(59, 41, 43, 62);
  const photoCards = [
    {
      p: meet,
      icon: Users,
      title: "Meet new people",
      body: "See people near you, like the ones you'd love to meet, and when they like you back, it's a match. Then just say hello.",
    },
    {
      p: love,
      icon: Heart,
      title: "Find love that lasts",
      body: "Everyone here is looking for something real: a partner, a relationship, someone to build a life with. No games.",
    },
  ];
  const iconCards = [
    {
      icon: MessageCircle,
      title: "Join groups",
      body: "Rooms for what you love: faith, fitness, food, music, your city. Chat, play games together and make friends.",
    },
    {
      icon: PartyPopper,
      title: "Go to events, or host your own",
      body: "Dinners, hikes and game nights near you. Meet people face to face, where it's easy to talk.",
    },
  ];
  return (
    <div>
      <Reveal>
        <Eyebrow tone="ember">What you'll find</Eyebrow>
        <SectionHeading id="find-heading">Everything you need to find your person.</SectionHeading>
      </Reveal>
      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
        {photoCards.map((c, n) => (
          <Reveal key={c.title} delay={n * 90}>
            <div className="h-full rounded-[24px] border border-vf-line bg-vf-surface overflow-hidden" data-testid={`find-${n + 1}`}>
              {c.p ? (
                <PhotoTile p={c.p} ratio="16/10" sizes="(min-width: 768px) 46vw, 92vw" />
              ) : (
                <div style={{ aspectRatio: "16/10" }} className="bg-vf-surface2" />
              )}
              <div className="p-6">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-full bg-vf-ember/10 text-vf-ember flex items-center justify-center">
                    <c.icon className="w-[18px] h-[18px]" />
                  </span>
                  <div className="text-[20px] font-semibold text-vf-text">{c.title}</div>
                </div>
                <p className="mt-3 text-[15.5px] leading-[1.6] text-vf-muted">{c.body}</p>
              </div>
            </div>
          </Reveal>
        ))}
        {iconCards.map((c, n) => (
          <Reveal key={c.title} delay={(n + 2) * 90}>
            <div className="h-full rounded-[24px] border border-vf-line bg-vf-surface p-6" data-testid={`find-${n + 3}`}>
              <div className="flex items-center justify-between">
                <span className="w-11 h-11 rounded-full bg-vf-ember/10 text-vf-ember flex items-center justify-center">
                  <c.icon className="w-5 h-5" />
                </span>
                <div className="flex -space-x-2.5" aria-hidden="true">
                  {faces.slice(n * 2, n * 2 + 2).concat(faces.slice(0, 1)).map((p, i) => (
                    <div key={i} className="w-9 h-9 rounded-full overflow-hidden border-2 border-vf-surface">
                      <PhotoTile p={p} ratio="1/1" sizes="40px" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-5 text-[20px] font-semibold text-vf-text">{c.title}</div>
              <p className="mt-2 text-[15.5px] leading-[1.6] text-vf-muted">{c.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal delay={120}>
        <div className="mt-10 flex flex-col items-center text-center">
          <p className="text-[16px] text-vf-muted">Free to join. It takes about two minutes.</p>
          <SignupButtons className="mt-4" testId="find" />
        </div>
      </Reveal>
    </div>
  );
}

// ── Sign-up buttons ──────────────────────────────────────────────────

/** Google sign-in from the welcome page; in the app it finishes here. */
async function startGoogle(): Promise<void> {
  const user = await startGoogleSignIn();
  if (user) {
    const pendingInvite = consumePendingInvite();
    window.location.assign(pendingInvite ? resolvePendingInviteRoute(pendingInvite) : "/");
  }
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
    } catch (e) {
      if (!(e instanceof GoogleSignInCancelled)) setFailed(true);
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

/** Where the Android app downloads from (server/app-update.ts). */
const ANDROID_DOWNLOAD = "/download/android";

const isAndroidBrowser = () => typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
const isIOS = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

/** "Get the Android app": on an Android phone, one tap downloads it and the
 *  three install steps appear (Android asks people to allow it the first
 *  time). On a computer, a pointer to open the site on the phone. Not shown
 *  on iPhone, or inside the app itself. */
function GetTheApp({ className = "" }: { className?: string }) {
  const [started, setStarted] = useState(false);
  if (isNativeApp() || isIOS()) return null;
  const android = isAndroidBrowser();
  const onDownload = () => {
    trackCustom("DownloadAndroidApp", { from: "landing" });
    setStarted(true);
  };
  return (
    <div className={`w-full max-w-[400px] rounded-[18px] border border-vf-line bg-vf-surface px-4 py-3.5 ${className}`} data-testid="card-get-app">
      <div className="flex items-center gap-3">
        <span className="shrink-0 w-10 h-10 rounded-[12px] bg-vf-mint/15 flex items-center justify-center" aria-hidden="true">
          <Smartphone className="w-5 h-5 text-vf-mint" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-semibold text-vf-text whitespace-nowrap">Android app</div>
          <div className="text-[12.5px] text-vf-muted leading-snug">
            {android ? "Faster, works offline, tells you about replies." : "Open destira.date on your Android phone to install it."}
          </div>
        </div>
        <a
          href={ANDROID_DOWNLOAD}
          onClick={onDownload}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-vf-text text-vf-ink font-semibold h-10 px-4 text-[13.5px] btn-press"
          data-testid="link-download-android"
        >
          <Download className="w-4 h-4" />
          {android ? "Install" : "Download"}
        </a>
      </div>
      {started && (
        <ol className="mt-3 pt-3 border-t border-vf-line space-y-1.5 text-[13px] text-vf-text list-decimal pl-5" data-testid="install-steps">
          <li>When the download finishes, tap <strong>Destira.apk</strong> to open it.</li>
          <li>If Android asks, tap <strong>Settings</strong> and allow installs from your browser.</li>
          <li>Tap <strong>Install</strong>, then open Destira and sign in.</li>
        </ol>
      )}
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
    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }),
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

// ── 3 · Tonight's three ──────────────────────────────────────────────
// Three locked example cards. The colour behind each is only the photo's
// tiny blur-up placeholder, so this section costs no image bytes.

const TEASER = [
  { n: 59, reason: "You'd both rather talk it out than go quiet.", rot: -8, y: 18 },
  { n: 39, reason: "Family comes first for both of you.", rot: 0, y: 0 },
  { n: 64, reason: "One of you plans the date. Both of you let it wander.", rot: 8, y: 18 },
];

function TonightsThreeTeaser() {
  const t = useTonight();
  const [, setLocation] = useLocation();
  const photos = usePhotos();
  const cards = TEASER.map((c) => ({ ...c, p: photos?.byName.get(`hero-${c.n}`) }));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-12 lg:gap-16 items-center">
      <div>
        <Reveal>
          <Eyebrow tone="ember">Every evening · 19:00</Eyebrow>
          <SectionHeading id="tonight-heading">
            Three people. Every evening. <em className="italic text-vf-ember">Chosen, not swiped.</em>
          </SectionHeading>
          <p className="mt-4 text-[16px] md:text-[17px] leading-[1.6] text-vf-muted max-w-[46ch]">
            At seven, your twin brings you three people it has already talked to, each with the reason it thinks
            you'd click. No endless feed. Just three good reasons to say hello.
          </p>
        </Reveal>
        <Reveal delay={100}>
          <div className="mt-8 rounded-[24px] border border-vf-line bg-vf-surface px-5 py-4 inline-flex flex-col" data-testid="tonight-countdown">
            {t.out ? (
              <>
                <span className="font-display text-[34px] sm:text-[40px] leading-none text-vf-text">Out now</span>
                <span className="mt-2 text-[13.5px] text-vf-muted">Tonight's three have arrived. The next three come tomorrow at 19:00.</span>
              </>
            ) : (
              <>
                <span className="font-mono tabular-nums text-vf-text leading-none" style={{ fontSize: "clamp(38px, 7vw, 56px)", letterSpacing: "-0.02em" }}>
                  {t.clock}
                </span>
                <span className="mt-2 text-[13.5px] text-vf-muted">until tonight's three · 19:00 Harare time</span>
              </>
            )}
          </div>
          <div className="mt-6">
            <button
              onClick={() => setLocation("/signup")}
              className="inline-flex items-center gap-2 rounded-full bg-vf-ember text-white font-semibold h-[52px] px-7 text-[15.5px] btn-press hover:bg-[var(--vf-ember-soft)] transition-colors"
              data-testid="button-tonight-join"
            >
              Get your three <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </Reveal>
      </div>

      <Reveal delay={120}>
        <div className="relative flex justify-center items-start pt-2 pb-10" aria-hidden="true">
          {cards.map((c, i) => (
            <div
              key={c.n}
              className={`relative shrink-0 ${i === 1 ? "z-10 w-[36%] -mx-1 sm:-mx-2 max-w-[240px]" : "z-0 w-[32%] max-w-[220px]"}`}
              style={{ transform: `translateY(${c.y}px) rotate(${c.rot}deg)` }}
            >
              <div className="relative overflow-hidden rounded-[22px] shadow-[0_30px_60px_-28px_rgba(0,0,0,0.55)]" style={{ aspectRatio: "3/4", background: "#2a1f24" }}>
                {c.p && (
                  <div
                    className="absolute inset-0"
                    style={{ backgroundImage: `url("${c.p.lqip}")`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(10px) saturate(1.25)", transform: "scale(1.35)" }}
                  />
                )}
                <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(12,9,16,0.05) 30%, rgba(12,9,16,0.82) 100%)" }} />
                <div className={`absolute inset-0 items-center justify-center ${i === 1 ? "flex" : "hidden sm:flex"}`}>
                  <span className="w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md" style={{ background: "rgba(245,240,234,0.18)", border: "1px solid rgba(245,240,234,0.35)" }}>
                    <Lock className="w-[18px] h-[18px]" style={{ color: "#F5F0EA" }} />
                  </span>
                </div>
                {i === 1 && (
                  <span className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em]" style={{ background: "rgba(12,9,16,0.6)", color: "#F5F0EA" }}>
                    Example
                  </span>
                )}
                <p className={`absolute bottom-2.5 sm:bottom-3 text-[11.5px] sm:text-[13px] leading-[1.35] ${i === 0 ? "left-2.5 right-4 sm:left-3 sm:right-6" : i === 2 ? "left-4 right-2.5 sm:left-6 sm:right-3" : "left-2.5 right-2.5 sm:left-3 sm:right-3"}`} style={{ color: "#F5F0EA" }}>
                  {c.reason}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </div>
  );
}

// ── 4 · Twins talking ────────────────────────────────────────────────
// An example conversation between two members' twins. It plays once when it
// scrolls into view (all at once under reduced motion) and can be replayed.

const TALK: { from: "r" | "t"; text: string }[] = [
  { from: "r", text: "Rufaro's at the Avondale market before nine most Saturdays. Is Tendai a morning person?" },
  { from: "t", text: "He'd tell you no. He's at the gym by six, though, and he'd go anywhere for good coffee." },
  { from: "r", text: "What does he do when something's bothering him?" },
  { from: "t", text: "Says it the same day. He hates going quiet on people." },
  { from: "r", text: "So does she. I think these two should meet." },
];

function TwinsTalking() {
  const reduce = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(0); // bumps to (re)start playback
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce || typeof IntersectionObserver === "undefined") {
      setShown(TALK.length);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          io.disconnect();
          setRun(1);
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);

  useEffect(() => {
    if (!run) return;
    setShown(0);
    const timers: number[] = [];
    let at = 300;
    TALK.forEach((m, i) => {
      timers.push(window.setTimeout(() => setTyping(true), at));
      at += Math.min(1500, 500 + m.text.length * 12);
      timers.push(
        window.setTimeout(() => {
          setTyping(false);
          setShown(i + 1);
        }, at),
      );
      at += 650;
    });
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [run]);

  const done = shown >= TALK.length;
  const next = TALK[shown];

  return (
    <div ref={ref} className="rounded-[28px] border border-vf-line bg-vf-surface p-4 sm:p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.35)]" data-testid="twins-talking">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex -space-x-2.5" aria-hidden="true">
            <span className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-[18px] text-white ring-2 ring-vf-surface" style={{ background: "linear-gradient(135deg, var(--vf-mint-vivid), hsl(var(--vf-mint)))" }}>
              R
            </span>
            <span className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-[18px] text-white ring-2 ring-vf-surface" style={{ background: "linear-gradient(135deg, hsl(var(--vf-ember)), var(--vf-warn))" }}>
              T
            </span>
          </div>
          <div>
            <div className="text-[14.5px] font-semibold text-vf-text">Rufaro's twin and Tendai's twin</div>
            <div className="text-[12px] text-vf-muted">An example conversation</div>
          </div>
        </div>
        {done && !reduce && (
          <button onClick={() => setRun((n) => n + 1)} className="shrink-0 w-9 h-9 rounded-full border border-vf-line flex items-center justify-center text-vf-muted hover:text-vf-text btn-press" aria-label="Play the conversation again">
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="mt-5 space-y-3 min-h-[300px]" aria-live="polite">
        {TALK.slice(0, shown).map((m, i) => (
          <div key={`${run}-${i}`} className={`flex ${m.from === "t" ? "justify-end" : ""} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
            <div
              className={`max-w-[86%] rounded-[18px] px-3.5 py-2.5 text-[14.5px] leading-[1.45] text-vf-text ${
                m.from === "t" ? "rounded-br-[6px] bg-vf-ember/[0.12]" : "rounded-bl-[6px] bg-vf-mint/[0.14]"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {typing && next && (
          <div className={`flex ${next.from === "t" ? "justify-end" : ""}`} aria-hidden="true">
            <span className={`inline-flex gap-1 rounded-full px-3.5 py-3 ${next.from === "t" ? "bg-vf-ember/[0.12]" : "bg-vf-mint/[0.14]"}`}>
              {[0, 1, 2].map((d) => (
                <span key={d} className="w-1.5 h-1.5 rounded-full bg-vf-muted animate-bounce" style={{ animationDelay: `${d * 140}ms` }} />
              ))}
            </span>
          </div>
        )}
      </div>

      <div
        className={`mt-4 rounded-[20px] border border-vf-line bg-vf-surface2 p-3.5 flex items-center gap-3.5 transition-all duration-500 ${
          done ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
        }`}
        data-testid="twins-result"
      >
        <ResonanceDial score={87} size={56} />
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold text-vf-text">Introduced to both of them</div>
          <div className="text-[13px] leading-[1.45] text-vf-muted">Both say what's wrong straight away. Both love an early Saturday.</div>
        </div>
      </div>
    </div>
  );
}

// ── 8 · Made in Harare ───────────────────────────────────────────────

const PLACES = ["Harare", "Bulawayo", "Mutare", "Gweru", "Masvingo", "Victoria Falls", "Zimbabweans abroad"];

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
  const photos = usePhotos();
  const LOCAL = photos?.local ?? [];
  const pick = (...ns: number[]) => photos?.pick(...ns) ?? [];

  const heroCtaRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef<HTMLElement>(null);
  const [heroCtaVisible, setHeroCtaVisible] = useState(true);
  const [closingVisible, setClosingVisible] = useState(false);

  const [live, setLive] = useState<{ events: LandingEvent[]; memberCount: number }>({ events: [], memberCount: 0 });

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
      <section className="px-2 sm:px-3" aria-labelledby="hero-heading" data-testid="section-hero">
        <div
          className="relative overflow-hidden rounded-[28px] sm:rounded-[36px] flex min-h-[calc(100svh-72px)] lg:min-h-[min(880px,calc(100vh-76px))]"
          style={{ background: "#0C0910" }}
        >
          <div className="absolute inset-0 lg:left-[38%] overflow-hidden">
            <PhotoWall
              photos={LOCAL}
              columns={3}
              eager
              className="absolute -top-[6%] inset-x-0 px-3 lg:-top-[24%] lg:-right-[6%] lg:left-[2%] lg:[transform:rotate(-6deg)_scale(1.08)]"
            />
          </div>
          <div
            className="absolute inset-0 lg:hidden"
            aria-hidden="true"
            style={{ background: "linear-gradient(180deg, rgba(12,9,16,0.05) 0%, rgba(12,9,16,0.35) 18%, rgba(12,9,16,0.92) 34%, #0C0910 46%)" }}
          />
          <div
            className="absolute inset-0 hidden lg:block"
            aria-hidden="true"
            style={{ background: "linear-gradient(90deg, #0C0910 36%, rgba(12,9,16,0.80) 46%, rgba(12,9,16,0.12) 68%, rgba(12,9,16,0.20) 100%)" }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-40 hidden lg:block"
            aria-hidden="true"
            style={{ background: "linear-gradient(0deg, rgba(12,9,16,0.85), transparent)" }}
          />

          <div className="relative z-10 w-full max-w-[1180px] mx-auto px-5 sm:px-8 lg:px-12 flex flex-col justify-end lg:justify-center pt-[26vh] sm:pt-[36vh] lg:pt-16 pb-8 lg:pb-16">
            <div className="max-w-[580px]">
              {inviter && (
                <div
                  className="mb-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13.5px]"
                  style={{ background: "hsl(var(--vf-ember) / 0.22)", border: "1px solid hsl(var(--vf-ember) / 0.5)", color: "#F5F0EA" }}
                  data-testid="banner-invited-by"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-vf-ember" aria-hidden="true" />
                  {inviter.firstName} invited you. Join and you both get a free week.
                </div>
              )}
              <h1
                id="hero-heading"
                className="font-serif font-normal"
                style={{ color: "#F5F0EA", fontSize: "clamp(42px, 6.6vw, 86px)", lineHeight: 0.98, letterSpacing: "-0.03em" }}
              >
                {headline.lead}
                <br />
                <em className="italic" style={{ color: "#FF8A6B" }}>{headline.accent}</em>
              </h1>
              <p className="mt-4 sm:mt-5 text-[16.5px] md:text-[19px] leading-[1.55] max-w-[46ch]" style={{ color: "rgba(245,240,234,0.86)" }}>
                {headline.sub}
              </p>
              <HeroOffers className="mt-4 sm:mt-5" />
              <div ref={heroCtaRef} className="mt-6 sm:mt-7">
                <SignupButtons />
                <GetTheApp className="mt-3" />
                <p className="mt-3.5 text-[13px]" style={{ color: "rgba(245,240,234,0.66)" }}>
                  Free · 18+ · About 2 minutes{" "}
                  <span aria-hidden="true">·</span>{" "}
                  <button onClick={() => setLocation("/login")} className="underline underline-offset-2 hover:text-white" data-testid="hero-log-in">
                    I have an account
                  </button>
                </p>
                {members > 0 && (
                  <p className="mt-4 inline-flex items-center gap-2 text-[13.5px]" style={{ color: "#F5F0EA" }}>
                    <Users className="w-4 h-4 text-vf-mint" />
                    Join {members.toLocaleString()}+ people already on Destira
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ 3 · WHAT YOU'LL FIND ============ */}
      <section className="px-5 sm:px-6 py-16 sm:py-24" aria-labelledby="find-heading" data-testid="section-find">
        <div className="max-w-[1080px] mx-auto">
          <WhatYoullFind pick={pick} />
        </div>
      </section>

      {/* ============ 4 · MADE IN HARARE (+ real events) ============ */}
      <section className="py-16 sm:py-24 bg-vf-surface2/60" aria-labelledby="local-heading" data-testid="section-local">
        <div className="max-w-[1180px] mx-auto px-5 sm:px-6 grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-10 lg:gap-16 items-center">
          <Reveal>
            <Eyebrow tone="ember">Made in Harare</Eyebrow>
            <SectionHeading id="local-heading">Dating that feels like home.</SectionHeading>
            <p className="mt-4 text-[16px] md:text-[17px] leading-[1.6] text-vf-muted max-w-[46ch]">
              Destira started in Harare, for the way people date here. Your twin knows that family comes into it,
              that faith might too, and that a great first date can be tea in Borrowdale or an early climb at
              Domboshava.
            </p>
            <div className="mt-6 flex flex-wrap gap-2" data-testid="local-places">
              {PLACES.map((p) => (
                <span key={p} className="inline-flex items-center gap-1.5 rounded-full border border-vf-line bg-vf-surface px-3.5 py-1.5 text-[13.5px] text-vf-text">
                  <MapPin className="w-3.5 h-3.5 text-vf-ember" aria-hidden="true" />
                  {p}
                </span>
              ))}
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="grid grid-cols-3 gap-3" aria-hidden="true">
              {pick(26).map((p) => (
                <PhotoTile key={p.name} p={p} ratio="4/5" sizes="(min-width: 1024px) 34vw, 64vw" className="col-span-2 rounded-[24px]" />
              ))}
              <div className="grid grid-rows-2 gap-3">
                {pick(46, 70).map((p) => (
                  <PhotoTile key={p.name} p={p} ratio="auto" sizes="(min-width: 1024px) 17vw, 32vw" className="h-full rounded-[20px]" />
                ))}
              </div>
            </div>
          </Reveal>
        </div>

        {live.events.length > 0 && (
          <div className="mt-16" data-testid="section-events">
            <div className="max-w-[1180px] mx-auto px-5 sm:px-6">
              <Reveal>
                <Eyebrow>Happening soon</Eyebrow>
                <h3 id="events-heading" className="font-serif font-normal text-vf-text mt-3" style={{ fontSize: "clamp(26px, 3.4vw, 38px)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                  Meet people in real life, too.
                </h3>
                <p className="mt-3 text-[16px] leading-[1.6] text-vf-muted max-w-[52ch]">
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
          </div>
        )}
      </section>

      {/* ============ 5 · SAFETY ============ */}
      <section className="px-5 sm:px-6 py-16 sm:py-24" aria-labelledby="safety-heading" data-testid="section-safety">
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
          <Reveal>
            <p className="mt-8 text-[15px] leading-[1.6] text-vf-muted max-w-[60ch]" data-testid="text-no-placement">
              <span className="text-vf-text">Nobody can pay to be seen first.</span> Nothing on Destira buys a better spot in
              anyone's Discover. And nobody sees you on a map: at most a rough distance or a named place.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ============ 6 · HOW IT WORKS ============ */}
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

      {/* ============ 7 · TONIGHT'S THREE ============ */}
      <section className="px-5 sm:px-6 py-20 sm:py-28 overflow-hidden" aria-labelledby="tonight-heading" data-testid="section-tonight">
        <div className="max-w-[1180px] mx-auto">
          <TonightsThreeTeaser />
        </div>
      </section>

      {/* ============ 8 · TWINS TALKING ============ */}
      <section className="px-5 sm:px-6 py-20 sm:py-28 bg-vf-surface2/60" aria-labelledby="talk-heading" data-testid="section-talk">
        <div className="max-w-[1080px] mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-10 lg:gap-14 items-center">
          <Reveal>
            <Eyebrow tone="mint">While you get on with your day</Eyebrow>
            <SectionHeading id="talk-heading">Before you say hello, your twins already have.</SectionHeading>
            <p className="mt-4 text-[16px] md:text-[17px] leading-[1.6] text-vf-muted max-w-[46ch]">
              Your twin has the getting-to-know-you chat with other members' twins: the small talk, the deal-breakers,
              the Saturday plans. You only hear about the people worth meeting, and why.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <TwinsTalking />
          </Reveal>
        </div>
      </section>

      {/* ============ 9 · QUIZ ============ */}
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

      {/* ============ 10 · ASK A TWIN ============ */}
      <section className="px-5 sm:px-6 py-16 sm:py-24 bg-vf-surface2/60" aria-labelledby="ask-heading" data-testid="section-ask">
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

      {/* ============ 11 · WHY SWITCH ============ */}
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

      {/* ============ 12 · FAQ ============ */}
      <section id="faq" className="px-5 sm:px-6 py-16 sm:py-24 bg-vf-surface2/60" aria-labelledby="faq-heading" data-testid="section-faq">
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

      {/* ============ 13 · CLOSING CTA ============ */}
      <section ref={closingRef} className="px-2 sm:px-3 pb-3" aria-labelledby="closing-heading" data-testid="section-closing">
        <div
          className="relative overflow-hidden rounded-[28px] sm:rounded-[36px] px-5 sm:px-6 py-24 sm:py-32 flex items-center justify-center"
          style={{ background: "#0C0910" }}
        >
          <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
            <PhotoWall photos={[...LOCAL.slice(11), ...LOCAL.slice(0, 11)]} columns={3} className="absolute -top-[10%] inset-x-0 px-3" />
            <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(12,9,16,0.90) 30%, rgba(12,9,16,0.62) 100%)" }} />
          </div>
          <div className="relative max-w-[720px] mx-auto text-center flex flex-col items-center">
            <Reveal>
              <h2
                id="closing-heading"
                className="font-serif font-normal"
                style={{ color: "#F5F0EA", fontSize: "clamp(40px, 7vw, 84px)", lineHeight: 1.02, letterSpacing: "-0.025em" }}
              >
                Your person might <em className="italic" style={{ color: "#FF8A6B" }}>already be here.</em>
              </h2>
            </Reveal>
            <Reveal delay={100}>
              <p className="mt-5 text-[16.5px] leading-[1.6] max-w-[46ch] mx-auto" style={{ color: "rgba(245,240,234,0.8)" }}>
                Join free in about two minutes. Your twin gets to work as soon as you've answered a few questions, and
                every evening at 19:00 there are three new people to meet.
              </p>
            </Reveal>
            <Reveal delay={180} className="w-full flex justify-center">
              <SignupButtons className="mt-8" testId="closing" />
            </Reveal>
          </div>
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
              {!isNativeApp() && (
                <a
                  href={ANDROID_DOWNLOAD}
                  onClick={() => trackCustom("DownloadAndroidApp", { from: "footer" })}
                  className="text-left text-vf-muted hover:text-vf-text"
                  data-testid="footer-link-android"
                >
                  Android app
                </a>
              )}
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
