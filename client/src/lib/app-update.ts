// Over-the-air updates for the app's screens, self-hosted: every website
// deploy also publishes the app's screens (script/app-bundle.ts), and
// server/app-update.ts says which is newest. The app downloads it quietly
// in the background, then offers a restart (AppUpdatePrompt); if the member
// says later, it switches at the next launch, behind the splash screen.
// New native features (plugins, permissions) need a new APK: when
// destira.date/download/android has a newer one than this app, the member is
// asked to install it. A bundle that needs a newer app than the one installed
// is skipped (minNativeBuild).
//
// If a downloaded bundle fails to start, the updater rolls back to the
// previous one on its own and marks it failed: notifyAppReady() below is
// what tells it the new screens came up fine.
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { isNativeApp } from "./native";
import { API_BASE } from "./app-api";

/** The id of the screens this code was built into (set at build time). */
const THIS_BUNDLE = (import.meta.env.VITE_BUNDLE_ID as string | undefined) || "dev";

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
let lastCheck = 0;
let checking = false;

/** Bundle ids start with their build time (yyyymmddhhmm, UTC). */
const builtAt = (id: string) => id.match(/\d{12}/)?.[0] ?? null;

interface Offer {
  version: string;
  url: string;
  checksum: string;
  minNativeBuild: number;
}

/** What AppUpdatePrompt shows: a newer APK to install, or new screens ready. */
export type UpdateOffer =
  | { kind: "app"; versionCode: number; versionName: string; url: string }
  | { kind: "screens"; id: string; version: string };

let offer: UpdateOffer | null = null;
const listeners = new Set<() => void>();
function setOffer(next: UpdateOffer | null) {
  offer = next;
  listeners.forEach((l) => l());
}
export function subscribeUpdateOffer(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}
export const getUpdateOffer = () => offer;
/** The prompt was answered: hide it. */
export const clearOffer = () => setOffer(null);

/** Switch to the downloaded screens now (the app reloads into them). */
export function restartIntoUpdate(id: string) {
  writePending(null);
  CapacitorUpdater.set({ id }).catch(() => {});
}

const SNOOZE_KEY = "destira.appUpdateSnooze";
const SNOOZE_MS = 24 * 60 * 60 * 1000;
/** "Later" on a new APK: ask again in a day (or sooner for a newer one). */
export function snoozeAppUpdate(versionCode: number) {
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify({ versionCode, until: Date.now() + SNOOZE_MS }));
  } catch {
    /* storage unavailable: asks again next check */
  }
}
function snoozed(versionCode: number): boolean {
  try {
    const s = JSON.parse(localStorage.getItem(SNOOZE_KEY) || "null");
    return !!s && s.versionCode >= versionCode && Date.now() < s.until;
  } catch {
    return false;
  }
}

/** A newer APK than this app on destira.date? True if the member was asked
 *  (a snoozed one lets the screens update go ahead meanwhile). */
async function checkForNewApp(nativeBuild: number): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/app/android`);
  if (!res.ok) return false;
  const latest = (await res.json()) as { versionCode: number; versionName: string; url: string };
  if (!latest?.versionCode || latest.versionCode <= nativeBuild) return false;
  if (snoozed(latest.versionCode)) return false;
  setOffer({ kind: "app", ...latest });
  return true;
}

async function checkForUpdate() {
  if (checking || Date.now() - lastCheck < CHECK_EVERY_MS) return;
  checking = true;
  lastCheck = Date.now();
  try {
    const nativeBuild = Number((await App.getInfo()).build) || 0;
    // Only on Android: the APK download is Android's. A newer app wins over
    // new screens (it carries them).
    if (Capacitor.getPlatform() === "android" && (await checkForNewApp(nativeBuild).catch(() => false))) return;

    const res = await fetch(`${API_BASE}/api/app/bundle`);
    if (!res.ok) return;
    const bundleOffer = (await res.json()) as Offer;
    if (!bundleOffer?.version || bundleOffer.version === THIS_BUNDLE) return;
    // A fresh store install can carry newer screens than the website has
    // published yet: never "update" back to older ones.
    const offered = builtAt(bundleOffer.version), mine = builtAt(THIS_BUNDLE);
    if (offered && mine && offered <= mine) return;

    if (nativeBuild < bundleOffer.minNativeBuild) return; // needs the new APK first

    const { bundles } = await CapacitorUpdater.list();
    const same = bundles.filter((b) => b.version === bundleOffer.version);
    // Already tried and it didn't start: don't keep retrying a broken one.
    if (same.some((b) => b.status === "error")) return;
    // Downloaded on an earlier check, waiting for the next launch.
    let bundle = same.find((b) => b.status === "success" || b.status === "pending");
    if (!bundle) {
      bundle = await CapacitorUpdater.download({ url: bundleOffer.url, version: bundleOffer.version, checksum: bundleOffer.checksum });
    }
    writePending({ id: bundle.id, version: bundle.version });
    setOffer({ kind: "screens", id: bundle.id, version: bundle.version });
  } catch (e) {
    console.warn("[update] check failed", e);
  } finally {
    checking = false;
  }
}

const PENDING_KEY = "destira.pendingBundle";

function readPending(): { id: string; version: string } | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writePending(p: { id: string; version: string } | null) {
  try {
    if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage unavailable: the update waits for a later check */
  }
}

export function initAppUpdates() {
  if (!isNativeApp()) return;

  // An update downloaded last time: switch to it now, while the splash
  // screen is still up. set() reloads into the new screens; if they fail to
  // start, the updater puts these back and marks that bundle as failed.
  const pending = readPending();
  if (pending) {
    writePending(null);
    if (pending.version !== THIS_BUNDLE) {
      CapacitorUpdater.set({ id: pending.id }).catch(() => {});
      return;
    }
  }

  // These screens started: keep them (otherwise the updater rolls back).
  CapacitorUpdater.notifyAppReady().catch(() => {});
  // Give the first screen a head start, then look for an update; again
  // whenever the app comes back to the front, at most every few hours.
  window.setTimeout(checkForUpdate, 8000);
  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) checkForUpdate();
  });
}
