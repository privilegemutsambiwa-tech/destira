// Moment-based asks: notification permission right after the member does
// something they'd want to hear back about (a like, an RSVP, joining a
// lounge), and "add to home screen" where the browser supports it. Kept in
// one place so the asks share snoozes and never stack on top of each other.

export type PushNudgeReason = "like" | "rsvp" | "lounge";

const NUDGE_EVENT = "vf:push-nudge";

/** Ask the mounted <PushNudge /> to offer notifications, if it should. */
export function requestPushNudge(reason: PushNudgeReason) {
  try {
    window.dispatchEvent(new CustomEvent(NUDGE_EVENT, { detail: { reason } }));
  } catch {
    /* ignore */
  }
}

export function onPushNudge(handler: (reason: PushNudgeReason) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent).detail?.reason ?? "like");
  window.addEventListener(NUDGE_EVENT, listener);
  return () => window.removeEventListener(NUDGE_EVENT, listener);
}

// ── snoozes (per device; losing them only means asking again) ──────────
export function snoozedUntil(key: string): boolean {
  try {
    return Number(localStorage.getItem(key) ?? 0) > Date.now();
  } catch {
    return false;
  }
}
export function snooze(key: string, days: number) {
  try {
    localStorage.setItem(key, String(Date.now() + days * 24 * 60 * 60 * 1000));
  } catch {
    /* ignore */
  }
}

// ── install ("add to home screen") ─────────────────────────────────────
// Chrome/Edge/Samsung Internet fire beforeinstallprompt once, early; it has
// to be caught at load and kept for when we actually want to ask.
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferredInstall: InstallPromptEvent | null = null;
const installListeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e as InstallPromptEvent;
    installListeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    installListeners.forEach((fn) => fn());
  });
}

export function canPromptInstall(): boolean {
  return !!deferredInstall;
}
export function onInstallAvailabilityChange(fn: () => void): () => void {
  installListeners.add(fn);
  return () => installListeners.delete(fn);
}
export async function promptInstall(): Promise<boolean> {
  if (!deferredInstall) return false;
  const ev = deferredInstall;
  deferredInstall = null;
  await ev.prompt();
  const choice = await ev.userChoice.catch(() => ({ outcome: "dismissed" }));
  installListeners.forEach((fn) => fn());
  return choice.outcome === "accepted";
}

export function isStandalone(): boolean {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
  } catch {
    return false;
  }
}
export function isIOS(): boolean {
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}
