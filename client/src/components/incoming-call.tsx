// While the app is open and signed in, checks every few seconds whether a
// match is video calling, and opens the call screen when one is. (With the
// app closed, the push notification does the same job: tapping it opens
// /call/:id.) Rings softly and vibrates while the call screen is ringing.
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { callApi } from "@/lib/video-call";

const CHECK_EVERY_MS = 4000;

export function IncomingCallWatcher() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const seen = useRef(new Set<number>());
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(() => {
    if (!user) return;
    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      if (locationRef.current.startsWith("/call/")) return;
      try {
        const { call } = await callApi.incoming();
        if (call && !seen.current.has(call.id) && !locationRef.current.startsWith("/call/")) {
          seen.current.add(call.id);
          setLocation(`/call/${call.id}`);
        }
      } catch {
        /* offline or signed out: next time */
      }
    };
    void check();
    const t = setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, setLocation]);

  return null;
}

/** A gentle two-tone ring plus vibration, until stop() is called. Browsers
 *  may block sound before the member has touched the page; vibration and
 *  the screen still show the call. */
export function startRinging(): () => void {
  let ctx: AudioContext | null = null;
  try {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch {
    ctx = null;
  }
  const ring = () => {
    try {
      navigator.vibrate?.([400, 200, 400]);
    } catch {
      /* not supported */
    }
    if (!ctx) return;
    const now = ctx.currentTime;
    [0, 0.45].forEach((offset, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.frequency.value = i === 0 ? 660 : 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, now + offset + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.4);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.42);
    });
  };
  ring();
  const t = setInterval(ring, 2500);
  return () => {
    clearInterval(t);
    try {
      navigator.vibrate?.(0);
    } catch {
      /* not supported */
    }
    void ctx?.close().catch(() => {});
  };
}
