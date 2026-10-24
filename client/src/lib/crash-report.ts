// Errors that happen outside a screen's render (a failed background task, a
// broken click handler) go to the same place the ErrorBoundary sends render
// crashes: POST /api/client-errors, counted in the admin console's error
// rate. Tagged with where they came from (app or website) and which version
// of the screens, so a bad over-the-air update shows up for what it is.
//
// Connection failures aren't crashes (someone went offline), and a session
// sends at most a handful of reports.
import { isNativeApp } from "./native";

const VERSION = (import.meta.env.VITE_BUNDLE_ID as string | undefined) || "dev";
const MAX_PER_SESSION = 5;
const sent = new Set<string>();

export function clientTag() {
  return { client: isNativeApp() ? "app" : "web", version: VERSION };
}

function isNoise(message: string): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return /Failed to fetch|NetworkError|Load failed|network error|ResizeObserver loop|AbortError|aborted/i.test(message);
}

function report(message: string, stack?: string) {
  if (!message || isNoise(message) || sent.has(message) || sent.size >= MAX_PER_SESSION) return;
  sent.add(message);
  fetch("/api/client-errors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ message, stack, url: window.location.href, ...clientTag() }),
  }).catch(() => {});
}

export function initCrashReporting() {
  window.addEventListener("error", (e) => {
    report(e.message || String(e.error), e.error?.stack);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    report(r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : undefined);
  });
}
