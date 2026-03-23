import { useState } from "react";
import { MapPin, X } from "lucide-react";
import { useGeolocation } from "@/hooks/use-geolocation";

const STORAGE_KEY = "location_permission_asked";

export function LocationPermissionModal() {
  const [visible, setVisible] = useState(() => !localStorage.getItem(STORAGE_KEY));
  const { enable } = useGeolocation();

  if (!visible) return null;

  const handleEnable = () => {
    enable();
    setVisible(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "declined");
    setVisible(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 relative"
        style={{ background: "#1A1A24", border: "1px solid #2E2E42", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
      >
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full"
          style={{ background: "#242433", color: "#9090A8" }}
          data-testid="button-location-dismiss"
        >
          <X className="w-4 h-4" />
        </button>

        <div
          className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
          style={{ background: "rgba(124,58,237,0.15)" }}
        >
          <MapPin className="w-7 h-7" style={{ color: "#7C3AED" }} />
        </div>

        <h3 className="font-bold text-white mb-1" style={{ fontSize: "18px" }}>Enable Location</h3>
        <p className="text-sm mb-6" style={{ color: "#9090A8", lineHeight: "1.5" }}>
          See who's nearby right now and get notified when someone interesting is close.
        </p>

        <button
          onClick={handleEnable}
          className="w-full h-12 rounded-xl font-semibold text-white mb-3"
          style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)", border: "none", fontSize: "15px" }}
          data-testid="button-location-enable"
        >
          Enable Location
        </button>

        <button
          onClick={handleDismiss}
          className="w-full text-sm font-medium"
          style={{ color: "#9090A8", background: "none", border: "none" }}
          data-testid="button-location-later"
        >
          Maybe Later
        </button>
      </div>
    </div>
  );
}
