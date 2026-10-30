// A slim bar while the phone has no connection: what still works (anything
// already on screen or saved) and that it will catch up by itself. Sits above
// the app's own header, clear of the status bar, and pushes the screen down
// by its own height (html.vf-offline in index.css) so it never covers a
// header or a back button.
import { useEffect, useRef, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (!offline || !el) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty("--vf-offline-bar", `${el.offsetHeight}px`);
    measure();
    root.classList.add("vf-offline");
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.classList.remove("vf-offline");
      root.style.removeProperty("--vf-offline-bar");
    };
  }, [offline]);
  if (!offline) return null;
  return (
    <div
      ref={bar}
      role="status"
      className="fixed top-0 inset-x-0 z-[90] flex items-center justify-center gap-2 bg-vf-text text-vf-ink text-[12.5px] font-medium py-1.5 px-4"
      style={{ paddingTop: "calc(6px + env(safe-area-inset-top, 0px))" }}
      data-testid="offline-banner"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      You're offline · showing what's saved
    </div>
  );
}
