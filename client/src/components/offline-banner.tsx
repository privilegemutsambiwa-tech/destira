// A slim bar while the phone has no connection: what still works (anything
// already on screen or saved) and that it will catch up by itself. Sits above
// the app's own header, clear of the status bar.
import { useEffect, useState } from "react";
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
  if (!offline) return null;
  return (
    <div
      role="status"
      className="fixed top-0 inset-x-0 z-[90] flex items-center justify-center gap-2 bg-vf-text text-vf-ink text-[12.5px] font-medium py-1.5 px-4"
      style={{ paddingTop: "calc(6px + env(safe-area-inset-top, 0px))" }}
      data-testid="offline-banner"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      You're offline. Showing what's saved; it'll catch up when you're back.
    </div>
  );
}
