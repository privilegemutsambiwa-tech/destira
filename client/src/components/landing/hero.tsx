// Landing: the hero. Headline matched to the ad, tonight's countdown, sign-up and the app.

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Download, Hand, Heart, HeartHandshake, MessageCircle, PartyPopper, Smartphone, Users } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { isNativeApp } from "@/lib/native";
import { GoogleSignInCancelled, startGoogleSignIn } from "@/lib/google-signin";
import { consumePendingInvite, resolvePendingInviteRoute } from "@/lib/pending-invite";
import { trackCustom } from "@/lib/pixel";

// ── Tonight's three: the 19:00 Harare release (server/daily-picks.ts) ──
const HARARE_OFFSET = 2 * 3600e3; // UTC+2, no daylight saving

export function useTonight() {
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
  // Destira Friends ads (Part O): new in town, looking for people, not a date.
  friends: {
    lead: "New in Harare?",
    accent: "Find your people.",
    sub: "Make real friends near you. Wave at people who want new friends too, and every Sunday sit down to lunch with five people you'd get on with. Free to join.",
  },
  serious: {
    lead: "For people who are",
    accent: "done with games.",
    sub: "Everyone here is looking for something real. Your AI twin finds the people who want what you want, before either of you spends an evening finding out.",
  },
};

export function useHeadline() {
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
  return { ...HEADLINES[key], key };
}

// ── What's here: said plainly, first ─────────────────────────────────
// Ad visitors are looking for love, a partner, people. Big (the headline),
// medium (the line under it), small (this row): the three things the eye
// lands on in order, before any button.

const OFFERS = [
  { icon: Users, label: "Meet new people", short: "Meet people" },
  { icon: Hand, label: "Make friends", short: "Friends" },
  { icon: Heart, label: "Find a partner", short: "Find a partner" },
  { icon: HeartHandshake, label: "Build something real", short: "Something real" },
  { icon: MessageCircle, label: "Join groups", short: "Groups" },
  { icon: PartyPopper, label: "Go to events", short: "Events" },
];

export function HeroOffers({ className = "" }: { className?: string }) {
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

// ── Sign-up buttons ──────────────────────────────────────────────────

/** Google sign-in from the welcome page; in the app it finishes here. */
export async function startGoogle(): Promise<void> {
  const user = await startGoogleSignIn();
  if (user) {
    const pendingInvite = consumePendingInvite();
    window.location.assign(pendingInvite ? resolvePendingInviteRoute(pendingInvite) : "/");
  }
}

/** Google (one tap for most phones) above email. The pair every CTA uses. */
export function SignupButtons({ className = "", testId = "hero" }: { className?: string; testId?: string }) {
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
export const ANDROID_DOWNLOAD = "/download/android";

const isAndroidBrowser = () => typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

const isIOS = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

/** "Get the Android app": on an Android phone, one tap downloads it and the
 *  three install steps appear (Android asks people to allow it the first
 *  time). On a computer, a pointer to open the site on the phone. Not shown
 *  on iPhone, or inside the app itself. */
export function GetTheApp({ className = "" }: { className?: string }) {
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
