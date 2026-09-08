import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

// Foreground-only location reporting for Twin Proximity Alerts.
//
// We watchPosition while the tab is VISIBLE, and report to the server on a real
// move (~75m) or every 10 minutes, whichever comes first. No hidden-tab polling,
// no reverse-geocoding — the server resolves the point to a curated place (or to
// nothing) and stores the latest ping only. The server sweeps stale pings after
// 30 minutes, so stopping the watch is enough to disappear.

const STORAGE_KEY = "location_permission_asked";
const MIN_MOVE_M = 75;
const MAX_SILENCE_MS = 10 * 60 * 1000;

function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function useGeolocation() {
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const [hasAsked, setHasAsked] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "asked",
  );

  const maybeReport = useCallback((lat: number, lng: number, force = false) => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible" && !force) return;
    const prev = lastSentRef.current;
    const now = Date.now();
    if (
      !force &&
      prev &&
      now - prev.at < MAX_SILENCE_MS &&
      metresBetween(prev.lat, prev.lng, lat, lng) < MIN_MOVE_M
    ) {
      return;
    }
    lastSentRef.current = { lat, lng, at: now };
    apiRequest("POST", "/api/location/report", { lat, lng }).catch(() => {});
  }, []);

  const startWatch = useCallback(() => {
    if (!("geolocation" in navigator) || watchIdRef.current != null) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => maybeReport(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 },
    );
  }, [maybeReport]);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const enable = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "asked");
    setHasAsked(true);
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => maybeReport(pos.coords.latitude, pos.coords.longitude, true),
      () => {},
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 },
    );
    startWatch();
  }, [maybeReport, startWatch]);

  useEffect(() => {
    if (!hasAsked) return;
    startWatch();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        startWatch();
        navigator.geolocation?.getCurrentPosition(
          (pos) => maybeReport(pos.coords.latitude, pos.coords.longitude, true),
          () => {},
          { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 },
        );
      } else {
        stopWatch();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopWatch();
    };
  }, [hasAsked, startWatch, stopWatch, maybeReport]);

  return { enable, hasAsked };
}
