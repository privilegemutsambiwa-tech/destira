// The Play Store "rate this app" card, asked for once: just after a member's
// first match, when they're happiest with us. Never after a bad moment: if
// they blocked or reported someone, unmatched, or saw an error (a failed
// payment, a message that didn't send) in the last day, we don't ask.
//
// Google decides whether the card actually shows (it limits how often), and
// never tells us if they rated, so "asked" is all we can record.
// Phone app 1.4+ only (DestiraNativePlugin.requestReview); a no-op elsewhere.
// (Same native plugin as native.ts; Capacitor hands back the one already
// registered, with a console note.)
import { registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { isNativeApp } from "./native";

const ReviewNative = registerPlugin<{ requestReview(): Promise<void> }>("DestiraNative");

const ASKED = "destira.review.asked";
const BAD = "destira.review.bad-at";
const QUIET_AFTER_BAD_MS = 24 * 60 * 60 * 1000;
/** The first app build with requestReview (android versionCode). */
const FIRST_BUILD = 5;

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function set(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: worst case we skip asking */
  }
}

/** Something went wrong for the member: no review prompt for a day. */
export function noteBadMoment() {
  set(BAD, String(Date.now()));
}

/** Whether now is a good moment, given how many matches they have. */
export function reviewMomentOk(matchCount: number, now = Date.now()): boolean {
  if (get(ASKED)) return false;
  if (matchCount !== 1) return false;
  const bad = Number(get(BAD) || 0);
  return !(bad && now - bad < QUIET_AFTER_BAD_MS);
}

/** After the match moment closes: ask, if this was their first match. */
export async function maybeAskForReview(): Promise<void> {
  if (!isNativeApp() || get(ASKED)) return;
  try {
    if ((Number((await App.getInfo()).build) || 0) < FIRST_BUILD) return;
  } catch {
    return;
  }
  let count = 0;
  try {
    const res = await fetch("/api/matches", { credentials: "include" });
    if (!res.ok) return;
    const list = await res.json();
    count = Array.isArray(list) ? list.length : 0;
  } catch {
    return;
  }
  if (!reviewMomentOk(count)) return;
  set(ASKED, new Date().toISOString());
  try {
    await ReviewNative.requestReview();
  } catch {
    /* no Play Store on this phone */
  }
}
