// Data saver (docs/destira-upgrade-prompt.md §8.4). On when the member turns
// it on, or by itself when the connection is slow or Android/Chrome data
// saver is on. While on: smaller photos and no story autoplay.
//
// It also keeps a rough count of what the app downloaded this week on this
// device, from the browser's own resource timings. Some files from other
// servers don't report their size, so the figure is a floor, and the copy
// says "about".
import { useEffect, useState } from "react";

export type DataSaverPref = "auto" | "on";

const PREF_KEY = "vf_data_saver";
const USAGE_KEY = "vf_data_week";

type Conn = { saveData?: boolean; effectiveType?: string; addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void };
const conn = (): Conn | undefined => (typeof navigator !== "undefined" ? (navigator as any).connection : undefined);

export function dataSaverPref(): DataSaverPref {
  try {
    return localStorage.getItem(PREF_KEY) === "on" ? "on" : "auto";
  } catch {
    return "auto";
  }
}

export function slowConnection(): boolean {
  const c = conn();
  if (!c) return false;
  return !!c.saveData || c.effectiveType === "slow-2g" || c.effectiveType === "2g" || c.effectiveType === "3g";
}

export function dataSaverOn(): boolean {
  return dataSaverPref() === "on" || slowConnection();
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

export function setDataSaverPref(p: DataSaverPref) {
  try {
    if (p === "on") localStorage.setItem(PREF_KEY, "on");
    else localStorage.removeItem(PREF_KEY);
  } catch {
    /* private mode */
  }
  notify();
}

/** Re-renders when the setting or the connection changes. */
export function useDataSaver(): { on: boolean; pref: DataSaverPref; slow: boolean } {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    const c = conn();
    c?.addEventListener?.("change", f);
    return () => {
      listeners.delete(f);
      c?.removeEventListener?.("change", f);
    };
  }, []);
  return { on: dataSaverOn(), pref: dataSaverPref(), slow: slowConnection() };
}

/** The photo URL to load: the 800 px derivative while saving data. */
export function photoForSaver(full: string | null | undefined, small: string | null | undefined, saving: boolean): string | null {
  return (saving ? small || full : full || small) ?? null;
}

// ── Weekly usage ─────────────────────────────────────────────────────

function weekStart(d = new Date()): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x.toISOString().slice(0, 10);
}

function readUsage(): { week: string; bytes: number } {
  try {
    const v = JSON.parse(localStorage.getItem(USAGE_KEY) || "null");
    if (v && v.week === weekStart() && typeof v.bytes === "number") return v;
  } catch {
    /* fall through */
  }
  return { week: weekStart(), bytes: 0 };
}

/** Bytes downloaded this week on this device (a floor, see above). */
export function bytesThisWeek(): number {
  return readUsage().bytes + pending;
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

let pending = 0;
function flush() {
  if (!pending) return;
  const u = readUsage();
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify({ week: u.week, bytes: u.bytes + pending }));
    pending = 0;
  } catch {
    /* keep counting in memory */
  }
}

let started = false;
export function initDataSaver() {
  if (started || typeof window === "undefined") return;
  started = true;
  const mark = () => {
    document.documentElement.dataset.datasaver = dataSaverOn() ? "on" : "off";
  };
  mark();
  listeners.add(mark);
  conn()?.addEventListener?.("change", mark);

  if (typeof PerformanceObserver === "undefined") return;
  try {
    const add = (list: PerformanceEntryList) => {
      for (const e of list as PerformanceResourceTiming[]) pending += e.transferSize || 0;
    };
    add(performance.getEntriesByType("navigation"));
    add(performance.getEntriesByType("resource"));
    new PerformanceObserver((l) => add(l.getEntries())).observe({ type: "resource", buffered: false });
    // The browser keeps only a few hundred timings unless we clear them.
    performance.addEventListener?.("resourcetimingbufferfull", () => performance.clearResourceTimings());
    window.setInterval(flush, 30_000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  } catch {
    /* no timings in this browser: no figure */
  }
}
