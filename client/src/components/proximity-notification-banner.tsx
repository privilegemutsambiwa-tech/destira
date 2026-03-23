import { useState, useEffect, useRef, useCallback } from "react";
import { X, MapPin } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

const POLL_INTERVAL = 10 * 60 * 1000;
const THROTTLE_KEY_PREFIX = "proximity_notif_";
const THROTTLE_MS = 60 * 60 * 1000;

function isThrottled(locationKey: string) {
  const v = localStorage.getItem(`${THROTTLE_KEY_PREFIX}${locationKey}`);
  if (!v) return false;
  return Date.now() - parseInt(v, 10) < THROTTLE_MS;
}

function setThrottled(locationKey: string) {
  localStorage.setItem(`${THROTTLE_KEY_PREFIX}${locationKey}`, String(Date.now()));
}

export function ProximityNotificationBanner() {
  const [banner, setBanner] = useState<{ count: number; locationName: string } | null>(null);
  const [, setLocation] = useLocation();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkNearby = useCallback(async () => {
    if (localStorage.getItem("location_permission_asked") !== "asked") return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const res = await apiRequest("POST", "/api/location/check-nearby", {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        const nearby: any[] = await res.json();
        if (!Array.isArray(nearby) || nearby.length === 0) return;
        const locationName = nearby[0]?.locationName || "your area";
        const locationKey = locationName.toLowerCase().replace(/\s+/g, "_");
        if (isThrottled(locationKey)) return;
        setThrottled(locationKey);
        setBanner({ count: nearby.length, locationName });
      } catch {}
    }, () => {}, { timeout: 8000, maximumAge: 5 * 60 * 1000 });
  }, []);

  useEffect(() => {
    checkNearby();
    timerRef.current = setInterval(checkNearby, POLL_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [checkNearby]);

  if (!banner) return null;

  const handleDiscover = () => {
    setBanner(null);
    setLocation("/discover?filter=nearby");
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 gap-3"
      style={{
        background: "linear-gradient(135deg, #7C3AED, #EC4899)",
        boxShadow: "0 4px 20px rgba(124,58,237,0.4)",
      }}
      data-testid="proximity-banner"
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <MapPin className="w-4 h-4 text-white shrink-0" />
        <p className="text-sm font-medium text-white truncate">
          {banner.count} {banner.count === 1 ? "person" : "people"} nearby in {banner.locationName}
        </p>
      </div>
      <button
        onClick={handleDiscover}
        className="text-white text-sm font-semibold shrink-0"
        style={{ background: "rgba(255,255,255,0.2)", borderRadius: "8px", padding: "4px 12px", border: "none" }}
        data-testid="button-proximity-discover"
      >
        Discover →
      </button>
      <button
        onClick={() => setBanner(null)}
        className="w-7 h-7 flex items-center justify-center rounded-full shrink-0"
        style={{ background: "rgba(255,255,255,0.2)", border: "none" }}
        data-testid="button-proximity-close"
      >
        <X className="w-4 h-4 text-white" />
      </button>
    </div>
  );
}
