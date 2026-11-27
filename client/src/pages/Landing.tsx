import { useRef, useEffect, useState, lazy } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowRight, CalendarHeart, Flag, Lock, MapPin, MessageCircle, ShieldCheck, SlidersHorizontal, Sparkles, Users } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { DestiraLockup } from "@/components/brand/logo";
import { isNativeApp } from "@/lib/native";
import { pendingReferralCode } from "@/lib/attribution";
import { trackCustom, trackPageView } from "@/lib/pixel";
import { recordLandingVisit } from "@/lib/attribution";
import type { LandingEvent } from "@/components/landing/events";
import { FAQ, FaqItem } from "@/components/landing/faq";
import { useHeadline, HeroOffers, startGoogle, SignupButtons, ANDROID_DOWNLOAD, GetTheApp } from "@/components/landing/hero";
import { usePhotos, PhotoTile, PhotoWall } from "@/components/landing/photos";
import { Reveal, Eyebrow, SectionHeading, WhenNear } from "@/components/landing/shared";
import { WhatYoullFind } from "@/components/landing/what-youll-find";

// Sections far below the fold load their code as you scroll towards them
// (WhenNear), so a phone's first load is just the top of the page (Part K5).
const twinDemos = () => import("@/components/landing/twin-demos");
const TwinsTalking = lazy(() => twinDemos().then((m) => ({ default: m.TwinsTalking })));
const TwinQuiz = lazy(() => twinDemos().then((m) => ({ default: m.TwinQuiz })));
const AskATwin = lazy(() => twinDemos().then((m) => ({ default: m.AskATwin })));
const eventsModule = () => import("@/components/landing/events");
const EventCard = lazy(() => eventsModule().then((m) => ({ default: m.EventCard })));
const TonightsThreeTeaser = lazy(() => eventsModule().then((m) => ({ default: m.TonightsThreeTeaser })));

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

// ── 8 · Made in Harare ───────────────────────────────────────────────

const PLACES = ["Harare", "Bulawayo", "Mutare", "Gweru", "Masvingo", "Victoria Falls", "Zimbabweans abroad"];

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
    recordLandingVisit(headline.key);
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
            <WhenNear minHeight={340}>
              <div className="mt-8 max-w-[1180px] mx-auto">
                <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4 overflow-x-auto sm:overflow-visible snap-x snap-mandatory px-5 sm:px-6 pb-2 [scrollbar-width:none]">
                  {live.events.map((e) => (
                    <EventCard key={e.id} e={e} />
                  ))}
                </div>
              </div>
            </WhenNear>
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
          <WhenNear minHeight={560}>
            <TonightsThreeTeaser />
          </WhenNear>
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
            <WhenNear minHeight={420}>
              <TwinsTalking />
            </WhenNear>
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
            <WhenNear minHeight={420}>
              <TwinQuiz />
            </WhenNear>
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
            <WhenNear minHeight={420}>
              <AskATwin />
            </WhenNear>
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
