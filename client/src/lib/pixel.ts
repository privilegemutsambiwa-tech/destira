// Meta (Facebook/Instagram) Pixel, so ad campaigns can see which visits turn
// into sign-ups and Meta can find more people like them. Destira's pixel ID
// is built in (it's public in every page anyway); VITE_META_PIXEL_ID
// overrides it, and VITE_META_PIXEL_ID=off turns it off (local builds).
// Never loaded inside the store app (installs are measured by the store).
//
// Events sent, nothing else:
//   PageView              every signed-out landing visit
//   ViewContent           the homepage quiz was started
//   Lead                  the homepage quiz was finished
//   CompleteRegistration  a new account reached the basics screen (once per account)
import { isNativeApp } from "./native";

const DESTIRA_PIXEL_ID = "1741505700253566";
const configured = (import.meta.env.VITE_META_PIXEL_ID as string | undefined)?.trim();
// Off in local dev too, so testing never shows up in the ad numbers.
const PIXEL_ID = configured === "off" || import.meta.env.DEV ? undefined : configured || DESTIRA_PIXEL_ID;

type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string; callMethod?: (...a: unknown[]) => void; push?: unknown };
declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

let started = false;

function start(): boolean {
  if (!PIXEL_ID || isNativeApp() || typeof window === "undefined") return false;
  if (started) return true;
  started = true;
  // Meta's standard loader, written out instead of pasted as a minified blob.
  if (!window.fbq) {
    const fbq: Fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue!.push(args);
    } as Fbq;
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.push = fbq;
    window.fbq = fbq;
    window._fbq = fbq;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
  }
  window.fbq!("init", PIXEL_ID);
  return true;
}

export function trackPageView() {
  if (start()) window.fbq!("track", "PageView");
}

export function trackEvent(name: "ViewContent" | "Lead" | "CompleteRegistration", params?: Record<string, unknown>) {
  if (start()) window.fbq!("track", name, params ?? {});
}

/** CompleteRegistration, at most once per account on this device. */
export function trackRegistrationOnce(userId: string) {
  if (!PIXEL_ID || isNativeApp()) return;
  const key = `destira.px.reg.${userId}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    /* storage blocked: may send twice, which Meta de-duplicates loosely */
  }
  trackEvent("CompleteRegistration");
}
