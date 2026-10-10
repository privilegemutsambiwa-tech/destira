import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// Side effect: catches beforeinstallprompt, which fires once, early.
import "./lib/engagement-prompts";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(<App />);
