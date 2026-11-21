// First-touch attribution for the console's Growth page. On a visitor's
// first page view this stamps two cookies that signup reads once
// (server/growth.ts → attributeNewSignup) and then clears:
//
//   vf_ref  a friend's referral code from ?ref= (latest link wins)
//   vf_src  "source|detail" — where they came from (first touch only)
//
// Both last 30 days. Nothing here is sent anywhere until they sign up.

const MAX_AGE = 60 * 60 * 24 * 30;
const REF_RE = /^[2-9A-HJ-NP-Z]{8}$/i;

const SEARCH_HOSTS = ["google.", "bing.", "duckduckgo.", "yahoo.", "ecosia.", "yandex."];
const SOCIAL_HOSTS = ["facebook.", "fb.", "instagram.", "t.co", "twitter.", "x.com", "tiktok.", "linkedin.", "whatsapp.", "wa.me", "threads.", "snapchat.", "reddit."];

function readCookie(name: string): string | null {
  try {
    const hit = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
    return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
  } catch {
    return null;
  }
}

function setCookie(name: string, value: string) {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${MAX_AGE}; samesite=lax`;
  } catch {
    /* cookies blocked — attribution is best-effort */
  }
}

/** A referral code this browser is carrying, if any (for "X invited you"). */
export function pendingReferralCode(): string | null {
  const c = readCookie("vf_ref");
  return c && REF_RE.test(c) ? c.toUpperCase() : null;
}

function sourceFor(url: URL, ref: string | null): string {
  const utm = url.searchParams.get("utm_source");
  const content = url.searchParams.get("utm_content") || "";
  if (utm === "status") return `share_card|${content}`;
  if (ref) return `referral|${url.pathname.startsWith("/events/") ? "event" : ""}`;
  const event = url.pathname.match(/^\/events\/([^/]+)$/);
  if (event) return `event|${event[1]}`;
  if (url.pathname.startsWith("/join/")) return "group|";
  if (utm) return `campaign|${[utm, url.searchParams.get("utm_campaign")].filter(Boolean).join("/")}`;
  // A tap on a Facebook or Instagram ad adds fbclid (the in-app browsers
  // often hide the referrer, so this is the only sign it was an ad).
  if (url.searchParams.get("fbclid")) return "campaign|meta";

  let host = "";
  try {
    host = document.referrer ? new URL(document.referrer).hostname : "";
  } catch {
    host = "";
  }
  if (!host || host === url.hostname) return "direct|";
  if (SEARCH_HOSTS.some((h) => host.includes(h))) return `search|${host}`;
  if (SOCIAL_HOSTS.some((h) => host.includes(h))) return `social|${host}`;
  return `other_site|${host}`;
}

/** Run once per page load, before any client-side navigation. */
export function captureAttribution() {
  try {
    const url = new URL(window.location.href);
    const rawRef = url.searchParams.get("ref");
    const ref = rawRef && REF_RE.test(rawRef) ? rawRef.toUpperCase() : null;
    if (ref) setCookie("vf_ref", ref);
    if (!readCookie("vf_src")) setCookie("vf_src", sourceFor(url, ref).slice(0, 120));
    // Meta's click id, kept the way its pixel would keep it, so a sign-up or
    // payment can be matched to the ad even where the pixel is blocked.
    const fbclid = url.searchParams.get("fbclid");
    if (fbclid && !readCookie("_fbc")) {
      try {
        document.cookie = `_fbc=fb.1.${Date.now()}.${encodeURIComponent(fbclid)}; path=/; max-age=${60 * 60 * 24 * 90}; samesite=lax`;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* never block the app on attribution */
  }
}

/** The landing page reports one visit per browser session, with the headline
 *  shown (?v=) and where the visitor came from: the Funnel's first step.
 *  The headline is also kept (first one seen) for the sign-up record. */
export function recordLandingVisit(variant: string) {
  try {
    if (!readCookie("vf_v")) setCookie("vf_v", variant);
    if (sessionStorage.getItem("destira.visit")) return;
    sessionStorage.setItem("destira.visit", "1");
  } catch {
    return;
  }
  const body = JSON.stringify({ variant, source: readCookie("vf_src") ?? "" });
  try {
    fetch("/api/growth/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true, credentials: "include" }).catch(() => {});
  } catch {
    /* ignore */
  }
}
