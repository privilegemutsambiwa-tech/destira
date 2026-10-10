import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// Side effect: catches beforeinstallprompt, which fires once, early.
import "./lib/engagement-prompts";
import { captureAttribution } from "./lib/attribution";

// Before the router can rewrite the URL: ?ref= and where this visit came from.
// The console (/console) is staff-only, so it's never a member's first touch.
if (!window.location.pathname.startsWith("/console")) captureAttribution();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(<App />);
