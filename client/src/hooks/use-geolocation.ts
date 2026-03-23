import { useEffect, useRef, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";

const STORAGE_KEY = "location_permission_asked";
const LOCATION_UPDATE_INTERVAL = 10 * 60 * 1000;

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { "User-Agent": "VibeFlow/1.0" } }
    );
    if (!res.ok) return "Unknown location";
    const data = await res.json();
    const addr = data.address || {};
    return addr.city || addr.town || addr.village || addr.suburb || addr.county || "Unknown location";
  } catch {
    return "Unknown location";
  }
}

async function sendLocationUpdate(lat: number, lng: number) {
  const locationName = await reverseGeocode(lat, lng);
  await apiRequest("POST", "/api/location/update", { lat, lng, locationName });
}

export function useGeolocation() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const requestAndUpdate = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        sendLocationUpdate(pos.coords.latitude, pos.coords.longitude).catch(() => {});
      },
      () => {},
      { timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  }, []);

  const enable = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "asked");
    requestAndUpdate();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(requestAndUpdate, LOCATION_UPDATE_INTERVAL);
  }, [requestAndUpdate]);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "asked") {
      enable();
    }
    const onFocus = () => {
      if (localStorage.getItem(STORAGE_KEY) === "asked") {
        requestAndUpdate();
      }
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enable, requestAndUpdate]);

  return { enable, hasAsked: localStorage.getItem(STORAGE_KEY) === "asked" };
}
