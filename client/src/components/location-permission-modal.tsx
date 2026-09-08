import { useState } from "react";
import { X } from "lucide-react";
import { useGeolocation } from "@/hooks/use-geolocation";
import { usePushSubscribe } from "@/hooks/use-push";

const STORAGE_KEY = "location_permission_asked";

export function LocationPermissionModal() {
  const [visible, setVisible] = useState(() => !localStorage.getItem(STORAGE_KEY));
  const { enable } = useGeolocation();
  const { subscribe } = usePushSubscribe();

  if (!visible) return null;

  const handleEnable = () => {
    enable();
    subscribe().catch(() => {});
    setVisible(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "declined");
    setVisible(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
    >
      <div className="w-full max-w-sm rounded-2xl p-6 relative bg-vf-surface2 border border-vf-line shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-vf-faint hover:text-vf-text transition-colors"
          data-testid="button-location-dismiss"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-vf-mint mb-3 flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full bg-vf-mint animate-[vf-pulse_2.6s_ease-in-out_infinite] motion-reduce:animate-none"
            style={{ boxShadow: "0 0 10px var(--vf-mint)" }}
          />
          your twin
        </div>

        <h3 className="font-serif text-[22px] leading-tight text-vf-text mb-2">
          Let your twin notice when someone worth knowing is at the same place
        </h3>
        <p className="text-[13.5px] text-vf-muted mb-5 leading-relaxed">
          Only while the app is open, and only for named places — a campus, a mall, an office park.
          Never a map, never a direction, never a trail. You can pause it or go invisible anywhere,
          any time.
        </p>

        <button
          onClick={handleEnable}
          className="w-full h-11 rounded-xl font-medium text-vf-ink bg-vf-ember mb-2.5 text-[14px]"
          data-testid="button-location-enable"
        >
          Turn it on
        </button>
        <button
          onClick={handleDismiss}
          className="w-full text-[13px] font-medium text-vf-faint hover:text-vf-text transition-colors"
          data-testid="button-location-later"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
