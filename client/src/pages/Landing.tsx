import type React from "react";
import { useRef, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle } from "lucide-react";
import { DestiraLockup } from "@/components/brand/logo";
import { PhotoFrame } from "@/components/brand/photo-frame";
import { ResonanceDial } from "@/components/resonance-dial";
import { ResonanceAxes } from "@/components/resonance-axes";
import { photos as HERO_PHOTOS, photosByName, type Photo } from "@/lib/photos";

/* ------------------------------------------------------------------ *
 *  Landing — marketing page, route "/" for unauthenticated visitors.
 *
 *  Section order (headlines carry the whole argument on their own):
 *    1  Nav
 *    2  Hero          — "You have not been unlucky."
 *    3  The Turn      — "Your twin goes first."          + live transcript
 *    4  The Read      — [pending review of 1-3]
 *    5  Communities   — [pending]
 *    6  The Objection — [pending]
 *    7  Closing CTA   — [pending]
 *    8  Footer        — [pending]
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

const PHOTO_WIDTHS = [640, 960, 1440, 1920] as const;

/** Non-hero imagery (the Turn, Communities, closing) still uses flat slot ids
 *  in client/public/photos/ — ids match docs/photo-manifest.md and the
 *  [data-photo-slot] attributes. The hero rotation uses the generated manifest
 *  in @/lib/photos instead. */
function photo(slot: string) {
  return {
    src: `/photos/${slot}.jpg`,
    srcSet: PHOTO_WIDTHS.map((w) => `/photos/${slot}-${w}.webp ${w}w`).join(", "),
  };
}

// The hero cycles through every photo in the generated manifest (hero-1..22,
// the couples-in-love set). A 404 self-heals out of the rotation.
const HERO_SET: Photo[] = HERO_PHOTOS;

const HERO_SIZES = "(min-width: 1024px) 45vw, 100vw";

/** Crossfades through a list of manifest photos. Mounts at most two <img> at a
 *  time. Static (first item) under prefers-reduced-motion. Never renders empty. */
function RotatingPhoto({
  slots,
  ratio,
  priority = false,
  className = "",
  intervalMs = 4600,
}: {
  slots: Photo[];
  ratio: string;
  priority?: boolean;
  className?: string;
  intervalMs?: number;
}) {
  const reduce = usePrefersReducedMotion();
  const [live, setLive] = useState<Photo[]>(slots);
  const [i, setI] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);

  useEffect(() => {
    if (reduce || live.length < 2) return;
    const id = window.setInterval(() => {
      setPrev(i);
      setI((n) => (n + 1) % live.length);
      window.setTimeout(() => setPrev(null), 900);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [reduce, live.length, intervalMs, i]);

  const dropPhoto = (name: string) =>
    setLive((cur) => {
      const next = cur.filter((p) => p.name !== name);
      return next.length ? next : cur; // never empty
    });

  const idx = Math.min(i, live.length - 1);
  const showIdxs = prev !== null && prev !== idx ? [prev, idx] : [idx];

  return (
    <figure
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio: ratio, borderRadius: "20px" }}
      data-photo-slot={live[idx]?.name}
    >
      {showIdxs.map((n) => {
        const p = live[n];
        return (
          <picture key={p.name}>
            <source type="image/webp" srcSet={p.webpSrcSet} sizes={HERO_SIZES} />
            <img
              src={p.src}
              srcSet={p.srcSet}
              sizes={HERO_SIZES}
              alt=""
              loading={priority && n === 0 ? "eager" : "lazy"}
              decoding="async"
              onError={() => dropPhoto(p.name)}
              className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[900ms] ease-in-out"
              style={{
                opacity: n === idx ? 1 : 0,
                filter: "saturate(1.05)",
                backgroundImage: `url("${p.lqip}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
          </picture>
        );
      })}
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
    </figure>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">
      {children}
    </div>
  );
}

// Vision order: Zimbabwe → the rest of Africa → the world. Destira is not a
// Zimbabwe-only product; it starts there.
const PLACES = [
  "Harare",
  "Bulawayo",
  "Nairobi",
  "Lagos",
  "Accra",
  "Kampala",
  "Cape Town",
  "Dar es Salaam",
  "Kigali",
  "London",
  "Berlin",
  "New York",
  "São Paulo",
  "Sydney",
];

/** A place name that cycles through PLACES with a soft fade. Static (first item)
 *  under prefers-reduced-motion. Decorative — the sentence around it still reads
 *  with any single value. */
function RotatingPlace({ className = "" }: { className?: string }) {
  const reduce = usePrefersReducedMotion();
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => {
      setShown(false);
      window.setTimeout(() => {
        setI((n) => (n + 1) % PLACES.length);
        setShown(true);
      }, 240);
    }, 2400);
    return () => window.clearInterval(id);
  }, [reduce]);

  return (
    <span
      className={`inline-block transition-opacity duration-[240ms] ${shown ? "opacity-100" : "opacity-0"} ${className}`}
      aria-hidden="true"
    >
      {PLACES[i]}
    </span>
  );
}

/** The primary ember CTA — routes straight to open signup. */
function SignupButton({
  label = "Create your account",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  const [, setLocation] = useLocation();
  return (
    <button
      onClick={() => setLocation("/signup")}
      className={`inline-flex items-center justify-center rounded-full bg-vf-ember text-vf-ink font-bold px-7 h-12 text-[15px] btn-press transition-colors hover:bg-[var(--vf-ember-soft)] ${className}`}
      data-testid="button-create-account"
    >
      {label}
    </button>
  );
}

/** Inline email capture — removes a page from the signup funnel by carrying the
 *  address straight into /signup as step one. */
function EmailCapture({ className = "" }: { className?: string }) {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setLocation("/signup");
      return;
    }
    setLocation(`/signup?email=${encodeURIComponent(trimmed)}`);
  };

  return (
    <form onSubmit={submit} className={`flex flex-col sm:flex-row gap-2.5 max-w-[440px] ${className}`}>
      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        aria-label="Your email"
        className="flex-1 rounded-full border border-vf-line bg-white/5 px-5 h-12 text-[14.5px] text-vf-text placeholder:text-vf-faint focus:outline-none focus:ring-2 focus:ring-vf-ember/60 focus:ring-offset-2 focus:ring-offset-vf-ink transition-shadow"
        data-testid="input-hero-email"
      />
      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-full bg-vf-ember text-vf-ink font-bold px-6 h-12 text-[14.5px] btn-press transition-colors hover:bg-[var(--vf-ember-soft)] shrink-0"
        data-testid="button-hero-email-continue"
      >
        Create your twin
      </button>
    </form>
  );
}

/** Static ON/OFF pill toggle from the Twin screen — decorative here. */
function BoundaryToggle({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`w-[42px] h-[24px] rounded-full shrink-0 flex items-center p-[3px] ${
          on ? "bg-vf-mint justify-end" : "bg-white/[0.14] justify-start"
        }`}
      >
        <span className="block w-[18px] h-[18px] rounded-full bg-vf-ink" />
      </span>
      <span className="text-[13.5px] text-vf-soft">{label}</span>
    </div>
  );
}

const TRANSCRIPT: { who: "HERS" | "YOURS"; text: string }[] = [
  { who: "HERS", text: "She won't move cities again for someone. She's said it twice, both unprompted." },
  { who: "YOURS", text: "He isn't asking anyone to. He wants someone who already built a life here." },
  { who: "HERS", text: "Then the thing they'd argue about isn't the thing they think it is." },
  { who: "YOURS", text: "Agreed. Put them in a room." },
];

/** Self-animating twin-to-twin transcript. Types lines in alternately,
 *  loops with a hold, pauses off-screen, freezes complete under
 *  prefers-reduced-motion. Purely decorative — aria-hidden. */
function TwinTranscript() {
  const reduce = usePrefersReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0); // count of fully-typed lines
  const [typed, setTyped] = useState(""); // partial text of the line being typed

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.3,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduce || !visible) return;
    let cancelled = false;
    const timers: number[] = [];

    if (step >= TRANSCRIPT.length) {
      timers.push(
        window.setTimeout(() => {
          if (!cancelled) {
            setStep(0);
            setTyped("");
          }
        }, 3000),
      );
      return () => {
        cancelled = true;
        timers.forEach(window.clearTimeout);
      };
    }

    const line = TRANSCRIPT[step].text;
    const perChar = Math.max(14, Math.floor(1600 / line.length));
    let i = 0;
    const tick = () => {
      if (cancelled) return;
      i += 1;
      setTyped(line.slice(0, i));
      if (i < line.length) {
        timers.push(window.setTimeout(tick, perChar));
      } else {
        timers.push(
          window.setTimeout(() => {
            if (!cancelled) {
              setStep((s) => s + 1);
              setTyped("");
            }
          }, 900),
        );
      }
    };
    timers.push(window.setTimeout(tick, 250));

    return () => {
      cancelled = true;
      timers.forEach(window.clearTimeout);
    };
  }, [step, visible, reduce]);

  const lines = reduce
    ? TRANSCRIPT
    : [
        ...TRANSCRIPT.slice(0, step),
        ...(step < TRANSCRIPT.length ? [{ who: TRANSCRIPT[step].who, text: typed }] : []),
      ];

  return (
    <div
      ref={containerRef}
      className="rounded-[22px] border border-vf-mint/[0.22] bg-vf-surface2 p-6 min-h-[340px]"
      aria-hidden="true"
    >
      <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-mint mb-5">
        twin transcript
      </div>
      <div className="flex flex-col gap-4">
        {lines.map((line, i) => (
          <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
            <span
              className={`font-mono text-[10.5px] uppercase pt-0.5 ${
                line.who === "HERS" ? "text-vf-mint" : "text-vf-ember"
              }`}
            >
              {line.who}
            </span>
            <span className="text-[14.5px] leading-[1.55] text-vf-text">{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Landing() {
  const inIframe = isInIframe();
  const [, setLocation] = useLocation();
  const [scrolled, setScrolled] = useState(false);

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
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ?ref=CODE → stash for 30 days so signup can attribute the referral.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref && /^[2-9A-HJ-NP-Z]{8}$/i.test(ref)) {
      document.cookie = `vf_ref=${ref.toUpperCase()}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    }
  }, []);

  // Page-level head meta. (No react-helmet in this repo — a native effect
  // gets the same title/OG tags without a new dep + provider.)
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Destira — resonance over photographs";
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
      "Photographs cannot tell you how someone argues, what they want in three years, or whether they will actually turn up. So we stopped asking you to guess.";
    setMeta("name", "description", desc);
    setMeta("property", "og:title", "Destira — resonance over photographs");
    setMeta("property", "og:description", desc);
    // TODO: a proper 1200×630 share card. The 512 icon is a placeholder that at
    // least resolves (there was no og.png).
    setMeta("property", "og:image", "/brand/destira-icon-512.png");
    return () => {
      document.title = prevTitle;
      created.forEach((m) => m.remove());
    };
  }, []);

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
            <a
              href={window.location.origin}
              target="_blank"
              rel="noreferrer"
              className="underline font-bold"
              data-testid="link-open-direct"
            >
              {window.location.origin}
            </a>
          </span>
        </div>
      )}

      {/* ============ 1 · NAV ============ */}
      <nav
        className="sticky top-0 z-50 transition-all duration-300"
        style={{
          backdropFilter: scrolled ? "blur(12px)" : "none",
          background: scrolled ? "rgba(12,9,16,0.7)" : "transparent",
          borderBottom: `1px solid ${scrolled ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0)"}`,
        }}
        data-testid="landing-nav"
      >
        <div className="max-w-[1180px] mx-auto flex items-center justify-between px-6 h-16">
          <a href="/" className="flex items-center" data-testid="link-logo">
            <DestiraLockup orientation="horizontal" size={28} />
          </a>
          <div className="flex items-center gap-4 sm:gap-6">
            <a
              href="#how-it-works"
              className="hidden md:inline text-[14px] text-vf-muted hover:text-vf-text transition-colors"
            >
              How it works
            </a>
            <a
              href="#communities"
              className="hidden md:inline text-[14px] text-vf-muted hover:text-vf-text transition-colors"
            >
              The Lounge
            </a>
            <button
              onClick={() => setLocation("/login")}
              className="text-[14px] text-vf-text hover:text-vf-muted transition-colors"
              data-testid="nav-log-in"
            >
              Log in
            </button>
            <SignupButton label="Sign up" className="!h-10 !px-5 text-[13.5px]" />
          </div>
        </div>
      </nav>

      {/* ============ 2 · HERO ============ */}
      <section
        className="relative px-6 pb-[88px] lg:pb-0 lg:min-h-dvh lg:flex lg:items-center"
        aria-labelledby="hero-heading"
        data-testid="section-hero"
      >
        <div className="max-w-[1180px] mx-auto w-full pt-20 lg:pt-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] items-center gap-12 lg:gap-[clamp(40px,5vw,88px)]">
          {/* LEFT — type column (unchanged copy) */}
          <div>
            <Reveal>
              <Eyebrow>
                <RotatingPlace /> · Free to join
              </Eyebrow>
              <span className="sr-only">In Harare and opening city by city across Africa and the world. Free to join.</span>
            </Reveal>
            <Reveal delay={80}>
              <h1
                id="hero-heading"
                className="font-serif font-normal text-vf-text mt-5"
                style={{
                  fontSize: "clamp(38px, 6.5vw, 86px)",
                  lineHeight: 1.02,
                  letterSpacing: "-0.025em",
                }}
              >
                Come and find
                <br />
                <em className="italic text-vf-ember">your person.</em>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-7 text-[16px] md:text-[17px] leading-[1.65] text-vf-muted max-w-[56ch]">
                If it feels like everybody else got the simple version of this, you are not
                behind and you are not too late. Destira is a place to actually meet people,
                wherever you are — your AI twin does the first awkward part, and the rest is a
                home worth spending time in: groups, events, and a feed that is about the people.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-9">
                <EmailCapture />
                <p className="mt-3 text-[13px] text-vf-faint">
                  Free, forever. No swiping through strangers.{" "}
                  <span aria-hidden="true">·</span>{" "}
                  <button
                    onClick={() => setLocation("/login")}
                    className="text-vf-muted hover:text-vf-text transition-colors underline underline-offset-2"
                    data-testid="hero-log-in"
                  >
                    Already here? Log in
                  </button>
                </p>
              </div>
            </Reveal>

            {/* Below lg (1024) this column runs full-width, which on an
                iPad's 768–1023px portrait band would stretch a phone-sized
                4:5 photo well past 1000px tall — constrain it so tablet
                portrait gets a sane single photo, not a full-bleed poster. */}
            <div className="lg:hidden mt-10 max-w-[420px] mx-auto md:mx-0">
              <RotatingPhoto slots={HERO_SET} ratio="4/5" priority />
            </div>
          </div>

          {/* RIGHT — two-image stagger, desktop only */}
          <Reveal delay={200} className="hidden lg:block">
            <div className="relative group">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-10 translate-x-8 -translate-y-8"
                style={{
                  background: "radial-gradient(45% 45% at 65% 30%, rgba(255,107,74,0.35), rgba(12,9,16,0) 70%)",
                  filter: "blur(60px)",
                  opacity: 0.1,
                }}
              />
              <RotatingPhoto
                slots={HERO_SET}
                ratio="4/5"
                priority
                className="relative transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.015]"
              />
              <div
                className="absolute w-[46%] rotate-[-3deg] transition-transform duration-500 ease-out motion-safe:group-hover:rotate-[-1.5deg]"
                style={{ bottom: "-8%", left: "-14%", zIndex: 3, boxShadow: "0 0 0 4px #0C0910", borderRadius: "20px" }}
              >
                <PhotoFrame
                  slot="hero-secondary"
                  {...photo("hero-secondary")}
                  alt="A couple holding hands across a restaurant table on a date"
                  ratio="1/1"
                  treatment="warm"
                  caption="THURSDAY · THE LISTENING ROOM"
                />
              </div>
            </div>
          </Reveal>
        </div>

        <div className="hidden lg:flex absolute left-1/2 -translate-x-1/2 bottom-8 flex-col items-center gap-3">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">
            How it actually works
          </span>
          <span className="w-px h-10 bg-white/20" aria-hidden="true" />
        </div>
      </section>

      {/* ============ 3 · BELONGING ============ */}
      <section
        className="px-6"
        style={{ paddingBlock: "clamp(72px, 10vh, 128px)" }}
        aria-labelledby="belonging-heading"
        data-testid="section-belonging"
      >
        <div className="max-w-[720px] mx-auto text-center">
          <Reveal>
            <Eyebrow>You are not late</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h2
              id="belonging-heading"
              className="font-serif font-normal text-vf-text mt-4"
              style={{ fontSize: "clamp(28px, 3.6vw, 44px)", lineHeight: 1.1, letterSpacing: "-0.02em" }}
            >
              Everyone here is looking for the same thing you are.
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 text-[16px] md:text-[17px] leading-[1.65] text-vf-muted mx-auto max-w-[56ch]">
              Nobody on Destira is here to collect matches and disappear. It is built for
              meeting — groups you actually show up to, events on real evenings, and people who
              got tired of pretending they weren't looking. It started in Harare. It opens in a
              new city most months.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-10 flex flex-col sm:flex-row sm:divide-x divide-vf-line border-y border-vf-line">
              {[
                ["Your twin talks first", "the first message is never cold"],
                ["Built for meeting", "every match points at a real evening"],
                ["Free forever", "the twin, the groups, the events — all of it"],
              ].map(([label, sub]) => (
                <div key={label} className="flex-1 py-5 px-4">
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-text">
                    {label}
                  </div>
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint mt-1.5">
                    {sub}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ 4 · THE TURN ============ */}
      <section
        id="how-it-works"
        className="px-6"
        style={{ paddingBlock: "clamp(88px, 12vh, 160px)" }}
        aria-labelledby="turn-heading"
        data-testid="section-turn"
      >
        <div className="max-w-[1180px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
          <div>
            <Reveal>
              <Eyebrow>How it works</Eyebrow>
            </Reveal>
            <Reveal delay={80}>
              <h2
                id="turn-heading"
                className="font-serif font-normal text-vf-text mt-4"
                style={{ fontSize: "clamp(32px, 4.4vw, 52px)", lineHeight: 1.05, letterSpacing: "-0.02em" }}
              >
                Your twin goes first.
              </h2>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 text-[16px] md:text-[17px] leading-[1.65] text-vf-muted max-w-[56ch]">
                You talk to your twin — an AI that learns how you think, what you have already
                decided about your life, and what you will not compromise on. Then it talks to
                theirs.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <p className="mt-4 text-[16px] md:text-[17px] leading-[1.65] text-vf-muted max-w-[56ch]">
                Two twins have the conversation you would have had on an awkward first date, in
                ninety seconds, before either of you gives up an evening. Then you read what was
                said. Both sides. Including the parts that do not flatter you.
              </p>
            </Reveal>
          </div>

          <Reveal delay={120}>
            <TwinTranscript />
            <div className="mt-4">
              <PhotoFrame
                slot="turn"
                {...photo("turn")}
                alt="A couple sharing a bottle of wine across a table, leaning in toward each other"
                ratio="16/9"
                treatment="plain"
                caption="NINETY SECONDS OF TWIN CONVERSATION, THEN AN ACTUAL EVENING"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ 5 · THE READ ============ */}
      <section
        className="px-6"
        style={{ paddingBlock: "clamp(88px, 12vh, 160px)" }}
        aria-labelledby="read-heading"
        data-testid="section-read"
      >
        <div className="max-w-[1180px] mx-auto">
          <div className="max-w-[720px]">
            <Reveal>
              <Eyebrow>Who your twin brings you</Eyebrow>
            </Reveal>
            <Reveal delay={80}>
              <h2
                id="read-heading"
                className="font-serif font-normal text-vf-text mt-4"
                style={{ fontSize: "clamp(32px, 4.4vw, 52px)", lineHeight: 1.05, letterSpacing: "-0.02em" }}
              >
                People, with the reasons shown.
              </h2>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 text-[16px] md:text-[17px] leading-[1.65] text-vf-muted max-w-[56ch]">
                Your twin brings you people it has already talked to — each with a resonance
                score and the four things it is built from, including the one you score worst on.
                We would rather tell you she moves slower than you do than sell you a match we
                cannot defend.
              </p>
            </Reveal>
          </div>

          <Reveal delay={200} className="mt-12">
            <div className="max-w-[460px] mx-auto rounded-[26px] border border-vf-line bg-vf-surface p-6 md:p-8 flex flex-col gap-6">
              <div className="flex items-center gap-5 flex-wrap">
                <ResonanceDial score={87} size={96} />
                <div className="min-w-0">
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-muted">
                    Resonance read
                  </div>
                  <p className="text-[15px] leading-relaxed text-vf-text mt-1.5 max-w-[240px]">
                    Strong on how you both handle conflict. Thin on pace — she moves slower than you do.
                  </p>
                </div>
              </div>
              <ResonanceAxes
                axes={[
                  { label: "How you argue", value: 94 },
                  { label: "What you want next", value: 89 },
                  { label: "Daily rhythm", value: 71 },
                  { label: "Pace", value: 58 },
                ]}
              />
              <div className="rounded-[18px] border border-vf-mint/20 bg-vf-mint/[0.05] p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-vf-mint mb-3">
                  Twin transcript
                </div>
                <div className="flex flex-col gap-2.5">
                  <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5">
                    <span className="font-mono text-[10px] uppercase text-vf-mint pt-0.5">Hers</span>
                    <span className="text-[13.5px] leading-[1.5] text-vf-text">
                      She won't move cities again for someone.
                    </span>
                  </div>
                  <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5">
                    <span className="font-mono text-[10px] uppercase text-vf-ember pt-0.5">Yours</span>
                    <span className="text-[13.5px] leading-[1.5] text-vf-text">
                      He isn't asking anyone to. He wants someone who already built a life here.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={120} className="mt-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6 max-w-[900px] mx-auto">
              {[
                ["No cold openers", "Your twins talk before you do, so nobody starts from nothing."],
                ["No paid matches", "We do not sell you back people who already liked you."],
                ["No guessing", "Every score opens into the conversation it came from."],
              ].map(([label, note]) => (
                <div key={label}>
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">
                    {label}
                  </div>
                  <p className="mt-2 text-[14px] leading-[1.6] text-vf-muted">{note}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ 6 · WHAT'S INSIDE (the tour) ============ */}
      <section
        className="px-6"
        style={{ paddingBlock: "clamp(88px, 12vh, 160px)" }}
        aria-labelledby="inside-heading"
        data-testid="section-inside"
      >
        <div className="max-w-[1180px] mx-auto">
          <div className="max-w-[720px]">
            <Reveal>
              <Eyebrow>Everything in there, now</Eyebrow>
            </Reveal>
            <Reveal delay={80}>
              <h2
                id="inside-heading"
                className="font-serif font-normal text-vf-text mt-4"
                style={{ fontSize: "clamp(32px, 4.4vw, 52px)", lineHeight: 1.05, letterSpacing: "-0.02em" }}
              >
                What you get on day one.
              </h2>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 text-[16px] md:text-[17px] leading-[1.65] text-vf-muted max-w-[56ch]">
                No trial, no tiers to compare, nothing held back to sell you later. This is the
                free account.
              </p>
            </Reveal>
          </div>

          <Reveal delay={200} className="mt-12">
            <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
              {[
                {
                  n: "01",
                  title: "Your AI twin",
                  body:
                    "A version of you that learns from how you talk to it. It never sends messages as you and never agrees to anything on your behalf.",
                  fragment: (
                    <div className="relative w-11 h-11">
                      <div
                        className="absolute inset-0 rounded-full animate-[vf-breathe_5s_ease-in-out_infinite]"
                        style={{ background: "radial-gradient(circle at 35% 30%, var(--vf-mint-vivid), #2E7F6B)" }}
                      />
                    </div>
                  ),
                },
                {
                  n: "02",
                  title: "Matches worth meeting",
                  body:
                    "Your twin brings you people it has already talked to. Every match points at a real evening, not an endless thread.",
                  fragment: <ResonanceDial score={87} size={76} />,
                },
                {
                  n: "03",
                  title: "Resonance, with the maths",
                  body:
                    "Four axes, scored honestly, including where you are weak. Every score opens into the conversation it came from.",
                  fragment: (
                    <div className="w-full max-w-[220px]">
                      <ResonanceAxes
                        axes={[
                          { label: "How you argue", value: 94 },
                          { label: "What you want next", value: 89 },
                          { label: "Daily rhythm", value: 71 },
                          { label: "Pace", value: 58 },
                        ]}
                      />
                    </div>
                  ),
                },
                {
                  n: "04",
                  title: "Twin transcripts",
                  body:
                    "Read what the two twins actually said before you met. Nobody starts from nothing.",
                  fragment: (
                    <div className="flex flex-col gap-1.5 text-[12px] leading-[1.4]">
                      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
                        <span className="font-mono uppercase text-vf-mint">Hers</span>
                        <span className="text-vf-text">She won't move cities again for someone.</span>
                      </div>
                      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
                        <span className="font-mono uppercase text-vf-ember">Yours</span>
                        <span className="text-vf-text">He isn't asking anyone to.</span>
                      </div>
                    </div>
                  ),
                },
                {
                  n: "05",
                  title: "The Lounge",
                  body:
                    "Interest groups — musicians, runners, long dinners — where you actually talk to people. Your twin sits in the rooms you join and learns who you are with your own people.",
                  fragment: (
                    <div className="flex items-center gap-2.5">
                      <div className="flex -space-x-2">
                        {["#3A3350", "#4A2F3A", "#2E4A3F"].map((bg, i) => (
                          <span
                            key={i}
                            className="w-6 h-6 rounded-full border-2 border-vf-surface2"
                            style={{ background: bg }}
                          />
                        ))}
                      </div>
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">
                        412 members
                      </span>
                    </div>
                  ),
                },
                {
                  n: "06",
                  title: "Events",
                  body:
                    "Small hosted evenings, starting in Harare and rolling out city by city. Your twin flags who is going that you would get on with.",
                  fragment: (
                    <div className="w-14 rounded-[12px] border border-vf-line bg-vf-surface overflow-hidden text-center">
                      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-vf-faint py-1 border-b border-vf-line">
                        Thu
                      </div>
                      <div className="font-serif text-vf-text text-[22px] py-1.5">14</div>
                    </div>
                  ),
                },
                {
                  n: "07",
                  title: "Stories",
                  body:
                    "Post a moment, see everyone else's. A feed that is actually about the people, not the performance.",
                  fragment: (
                    <div className="flex -space-x-1.5">
                      {["#4A2F3A", "#2E4A3F", "#3A3350"].map((bg, i) => (
                        <span
                          key={i}
                          className="w-8 h-8 rounded-full p-[2px]"
                          style={{ background: "#FF6B4A" }}
                        >
                          <span className="block w-full h-full rounded-full border-2 border-vf-surface2" style={{ background: bg }} />
                        </span>
                      ))}
                    </div>
                  ),
                },
                {
                  n: "08",
                  title: "Boundaries you set",
                  body:
                    "Your twin discusses exactly what you allow and nothing else. Strike any fact out of its memory whenever you want.",
                  fragment: (
                    <div className="flex flex-col gap-2.5" aria-hidden="true">
                      <BoundaryToggle label="Can discuss wanting kids" on />
                      <BoundaryToggle label="Cannot discuss earnings" on={false} />
                    </div>
                  ),
                },
              ].map((card) => (
                <div
                  key={card.n}
                  className="rounded-[20px] border border-vf-line bg-vf-surface2 p-6 flex flex-col gap-3"
                  data-testid={`inside-card-${card.n}`}
                >
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">
                    {card.n}
                  </div>
                  <div className="text-[17px] text-vf-text">{card.title}</div>
                  <p className="text-[14px] leading-[1.6] text-vf-muted">{card.body}</p>
                  <div className="mt-1 min-h-[44px] flex items-center">{card.fragment}</div>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={120}>
            <p className="mt-10 text-center text-[14px] text-vf-muted">
              Ember, our paid tier, only makes your twin work harder. It never buys you matches.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ============ 7 · COMMUNITIES ============ */}
      <section
        id="communities"
        className="px-6"
        style={{ paddingBlock: "clamp(88px, 12vh, 160px)" }}
        aria-labelledby="communities-heading"
        data-testid="section-communities"
      >
        <div className="max-w-[1180px] mx-auto">
          <div className="max-w-[720px]">
            <Reveal>
              <Eyebrow>The Lounge</Eyebrow>
            </Reveal>
            <Reveal delay={80}>
              <h2
                id="communities-heading"
                className="font-serif font-normal text-vf-text mt-4"
                style={{ fontSize: "clamp(30px, 3.6vw, 44px)", lineHeight: 1.05, letterSpacing: "-0.02em" }}
              >
                Groups you actually show up to.
              </h2>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 text-[16px] md:text-[17px] leading-[1.65] text-vf-muted max-w-[56ch]">
                Rooms for the things you actually do — musicians, runners, long dinners. You talk
                to people like you first, and your twin sits in and learns who you are with your
                own people, which is a better signal than anything you would write about yourself.
              </p>
            </Reveal>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              ["Late Practice", "412 members · musicians with day jobs", "hero-1", "Two people close together in an everyday moment"],
              ["Sunday Trail", "1,208 members · 6am starts, no excuses", "hero-2", "Two people close together in an everyday moment"],
              ["Table for Six", "330 members · long dinners, dating with intent", "hero-7", "Two people close together in an everyday moment"],
            ].map(([name, meta, slot, alt], i) => {
              const p = photosByName[slot];
              return (
                <Reveal key={name} delay={i * 80}>
                  <div className="rounded-[22px] border border-vf-line bg-vf-surface overflow-hidden">
                    <PhotoFrame
                      slot={slot}
                      src={p?.src}
                      srcSet={p?.srcSet}
                      alt={alt}
                      ratio="3/2"
                      treatment="warm"
                      style={{ borderRadius: 0 }}
                    />
                    <div className="p-5">
                      <div className="text-[16px] text-vf-text">{name}</div>
                      <div className="text-[13px] text-vf-muted mt-1">{meta}</div>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ 5.5 · BRING YOUR PEOPLE (strip, not a section) ============ */}
      <div className="px-6" data-testid="strip-referral">
        <div className="max-w-[1180px] mx-auto border-y border-vf-line py-8 md:py-10">
          <Reveal>
            <Eyebrow>Bring your people</Eyebrow>
            <p
              className="font-serif font-normal text-vf-text mt-3"
              style={{ fontSize: "clamp(20px, 2.6vw, 30px)", lineHeight: 1.15, letterSpacing: "-0.015em" }}
            >
              Every friend who joins gets you five more profile views.
            </p>
            <p className="mt-3 text-[14.5px] leading-[1.6] text-vf-muted max-w-[62ch]">
              Profile views are for looking someone up properly. They never buy you a match —
              your twin still does all the introducing, and that part is not for sale.
            </p>
          </Reveal>
        </div>
      </div>

      {/* ============ 6 · THE OBJECTION ============ */}
      <section
        className="px-6"
        style={{ paddingBlock: "clamp(88px, 12vh, 160px)" }}
        aria-labelledby="objection-heading"
        data-testid="section-objection"
      >
        <div className="max-w-[720px] mx-auto text-center">
          <Reveal>
            <Eyebrow>The obvious worry</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h2
              id="objection-heading"
              className="font-serif font-normal text-vf-text mt-4"
              style={{ fontSize: "clamp(32px, 4.4vw, 52px)", lineHeight: 1.05, letterSpacing: "-0.02em" }}
            >
              It is not pretending to be you.
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 text-[16px] md:text-[17px] leading-[1.65] text-vf-muted mx-auto max-w-[56ch]">
              Your twin never sends a message as you, never agrees to a date for you, and never
              discusses anything you have not switched on. You can read every word it has said. You
              can strike any fact out of its memory.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <p className="mt-4 text-[16px] md:text-[17px] leading-[1.65] text-vf-muted mx-auto max-w-[56ch]">
              It is not a mask. It is the part of dating that should have been automated years ago:
              finding out, early, whether this is worth an evening.
            </p>
          </Reveal>
          <Reveal delay={320}>
            <div
              className="mt-10 inline-flex flex-col gap-3.5 rounded-[18px] border border-vf-line bg-vf-surface2 p-6 text-left"
              aria-hidden="true"
            >
              <BoundaryToggle label="Can discuss wanting kids" on />
              <BoundaryToggle label="Can discuss my past, in outline" on />
              <BoundaryToggle label="Cannot discuss earnings" on={false} />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ 8 · CLOSING CTA ============ */}
      <section
        className="relative px-6 flex items-center justify-center overflow-hidden"
        style={{ minHeight: "78vh" }}
        aria-labelledby="closing-heading"
        data-testid="section-closing"
      >
        {/* full-bleed backdrop: a night-street embrace */}
        <div className="absolute inset-0" aria-hidden="true" data-photo-slot="closing-fullbleed">
          <img
            src="/photos/closing.jpg"
            srcSet={PHOTO_WIDTHS.map((w) => `/photos/closing-${w}.webp ${w}w`).join(", ")}
            sizes="100vw"
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: "center 40%" }}
          />
          {/* legibility scrim + top/bottom fade into the page */}
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(rgba(12,9,16,0.72), rgba(12,9,16,0.88))" }}
          />
          <div className="absolute inset-x-0 top-0 h-[120px] bg-gradient-to-b from-vf-ink to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-[120px] bg-gradient-to-t from-vf-ink to-transparent" />
        </div>
        <div className="relative max-w-[820px] mx-auto text-center">
          <Reveal>
            <h2
              id="closing-heading"
              className="font-serif font-normal text-vf-text"
              style={{ fontSize: "clamp(44px, 8vw, 104px)", lineHeight: 1.02, letterSpacing: "-0.025em" }}
            >
              Your person is already here.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-7 text-[16px] md:text-[17px] leading-[1.65] text-vf-muted mx-auto max-w-[56ch]">
              Free to join, free to stay. Your twin asks four questions, then you are in —
              matches, groups, events, the whole thing. No photos needed to begin.
            </p>
          </Reveal>
          <Reveal delay={200}>
            <div className="mt-9 flex flex-col items-center gap-3">
              <EmailCapture className="w-full mx-auto sm:justify-center" />
              <p className="text-[13px] text-vf-faint">
                Two minutes. Four questions. Nothing to lose.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ 9 · FOOTER ============ */}
      <footer className="px-6 border-t border-vf-line" data-testid="landing-footer">
        <div className="max-w-[1180px] mx-auto py-14 flex flex-col md:flex-row gap-10 md:gap-16 md:items-start md:justify-between">
          <div>
            <div className="text-vf-text">
              <DestiraLockup orientation="horizontal" size={28} />
            </div>
            <p className="mt-4 text-[13px] text-vf-muted">Made in Harare.</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-vf-faint">
              Resonance over photographs
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-vf-faint">
              Starting in Zimbabwe · Africa next · then everywhere
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 sm:gap-12 text-[13.5px]">
            <div className="flex flex-col gap-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-vf-faint mb-1">
                Product
              </span>
              <button
                onClick={() => setLocation("/login")}
                className="text-left text-vf-muted hover:text-vf-text transition-colors"
                data-testid="footer-link-login"
              >
                Log in
              </button>
              <button
                onClick={handleDemo}
                className="text-left text-vf-muted hover:text-vf-text transition-colors"
                data-testid="footer-link-demo"
              >
                Try a demo
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-vf-faint mb-1">
                Community
              </span>
              <a href="#how-it-works" className="text-vf-muted hover:text-vf-text transition-colors">
                How it works
              </a>
              <a href="#communities" className="text-vf-muted hover:text-vf-text transition-colors">
                Communities
              </a>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-vf-faint mb-1">
                Legal
              </span>
              <a href="#" className="text-vf-muted hover:text-vf-text transition-colors">
                Terms
              </a>
              <a href="#" className="text-vf-muted hover:text-vf-text transition-colors">
                Privacy
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
