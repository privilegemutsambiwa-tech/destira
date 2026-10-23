// Over-the-air updates for the app's screens, self-hosted: every website
// deploy also publishes the app's screens (script/app-bundle.ts), and
// server/app-update.ts says which is newest. The app downloads it quietly
// in the background and switches to it at the next launch, behind the
// splash screen, never mid-use. New native features (plugins, permissions)
// still need a store release; a bundle that needs a newer app than the one
// installed is skipped (minNativeBuild).
//
// If a downloaded bundle fails to start, the updater rolls back to the
// previous one on its own and marks it failed: notifyAppReady() below is
// what tells it the new screens came up fine.
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { App } from "@capacitor/app";
import { isNativeApp } from "./native";
import { API_BASE } from "./app-api";

/** The id of the screens this code was built into (set at build time). */
const THIS_BUNDLE = (import.meta.env.VITE_BUNDLE_ID as string | undefined) || "dev";

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
let lastCheck = 0;
let checking = false;

interface Offer {
  version: string;
  url: string;
  checksum: string;
  minNativeBuild: number;
}

async function checkForUpdate() {
  if (checking || Date.now() - lastCheck < CHECK_EVERY_MS) return;
  checking = true;
  lastCheck = Date.now();
  try {
    const res = await fetch(`${API_BASE}/api/app/bundle`);
    if (!res.ok) return;
    const offer = (await res.json()) as Offer;
    if (!offer?.version || offer.version === THIS_BUNDLE) return;

    const nativeBuild = Number((await App.getInfo()).build) || 0;
    if (nativeBuild < offer.minNativeBuild) return; // needs the store update first

    const { bundles } = await CapacitorUpdater.list();
    const same = bundles.filter((b) => b.version === offer.version);
    // Already tried and it didn't start: don't keep retrying a broken one.
    if (same.some((b) => b.status === "error")) return;
    // Downloaded on an earlier check, waiting for the next launch.
    let bundle = same.find((b) => b.status === "success" || b.status === "pending");
    if (!bundle) {
      bundle = await CapacitorUpdater.download({ url: offer.url, version: offer.version, checksum: offer.checksum });
    }
    writePending({ id: bundle.id, version: bundle.version });
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
