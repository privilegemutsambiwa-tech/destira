// Evening light (docs/destira-upgrade-prompt.md §3.2): the page ground
// follows the member's own clock. It's one attribute on <html>, updated
// once a minute; index.css turns it into a faint background wash. It never
// touches a semantic colour, and it is off with reduce motion or with
// "Plain background" (Settings → App).

export type Daypart = "day" | "golden" | "evening" | "night" | "off";

const PLAIN_KEY = "vf_plain_bg";

export function daypartFor(d: Date): Exclude<Daypart, "off"> {
  const h = d.getHours();
  if (h >= 6 && h < 17) return "day";
  if (h >= 17 && h < 19) return "golden";
  if (h >= 19) return "evening";
  return "night";
}

export function plainBackground(): boolean {
  try {
    return localStorage.getItem(PLAIN_KEY) === "1";
  } catch {
    return false;
  }
}

function reduceMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function apply() {
  const part: Daypart = plainBackground() || reduceMotion() ? "off" : daypartFor(new Date());
  if (document.documentElement.dataset.daypart !== part) document.documentElement.dataset.daypart = part;
}

export function setPlainBackground(on: boolean) {
  try {
    if (on) localStorage.setItem(PLAIN_KEY, "1");
    else localStorage.removeItem(PLAIN_KEY);
  } catch {
    /* private mode: still applies for this visit */
  }
  apply();
  if (on) document.documentElement.dataset.daypart = "off";
}

let started = false;
export function initEveningLight() {
  if (started || typeof document === "undefined") return;
  started = true;
  apply();
  window.setInterval(apply, 60_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") apply();
  });
  window.matchMedia?.("(prefers-reduced-motion: reduce)").addEventListener?.("change", apply);
}
