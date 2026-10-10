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
  } catch {
    /* never block the app on attribution */
  }
}
