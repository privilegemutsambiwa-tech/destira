import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// Side effect: catches beforeinstallprompt, which fires once, early.
import "./lib/engagement-prompts";
import { captureAttribution } from "./lib/attribution";
import { initNative, isNativeApp } from "./lib/native";
import { installAppApi } from "./lib/app-api";
import { initAppUpdates } from "./lib/app-update";
import { initOutbox } from "./lib/outbox";
import { initCrashReporting } from "./lib/crash-report";

// In the Android/iOS app: send /api requests to the server with the member's
// token (the screens themselves are packaged in the app). No-op on the web.
installAppApi();

// Before the router can rewrite the URL: ?ref= and where this visit came from.
// The console (/console) is staff-only, so it's never a member's first touch.
if (!window.location.pathname.startsWith("/console")) captureAttribution();
// Android/iOS app shell only: status bar, back button, deep links.
initNative();
initAppUpdates();
initOutbox();
initCrashReporting();

// The website's service worker (web push, install). The app has its own push
// and packaged screens, so it doesn't register one.
if ("serviceWorker" in navigator && !isNativeApp()) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(<App />);
