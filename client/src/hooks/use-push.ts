import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { isNativeApp, nativePushAvailable, nativePushPermission, nativeRegisterPush } from "@/lib/native";

// Web push subscription lifecycle. The service worker (/sw.js) does the actual
// notification display; this hook registers it, asks the browser for permission,
// and hands the PushSubscription to the server. All no-ops gracefully when the
// browser lacks support or the server has no VAPID keys.

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const SUPPORTED =
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

let swReg: Promise<ServiceWorkerRegistration> | null = null;
function getRegistration(): Promise<ServiceWorkerRegistration> {
  if (!swReg) swReg = navigator.serviceWorker.register("/sw.js");
  return swReg;
}

export function usePushSubscribe() {
  // In the store app, push goes through Firebase instead of the browser's
  // web push (which an app's web view doesn't have).
  const native = isNativeApp();
  const [nativeReady, setNativeReady] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    native ? "unsupported" : SUPPORTED ? Notification.permission : "unsupported",
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (native) {
      nativePushAvailable().then(async (ok) => {
        setNativeReady(ok);
        if (ok) setPermission(await nativePushPermission());
      });
      return;
    }
    if (SUPPORTED) getRegistration().catch(() => {});
  }, [native]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (native) {
      setBusy(true);
      try {
        const perm = await nativeRegisterPush();
        setPermission(perm);
        return perm === "granted";
      } catch {
        return false;
      } finally {
        setBusy(false);
      }
    }
    if (!SUPPORTED) return false;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return false;

      const keyRes = await fetch("/api/push/vapid-public-key", { credentials: "include" });
      const { key, configured } = await keyRes.json();
      if (!configured || !key) return false; // server can't push yet — in-app alerts still work

      const reg = await getRegistration();
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
      }
      const json = sub.toJSON();
      await apiRequest("POST", "/api/push/subscribe", {
        endpoint: json.endpoint,
        keys: json.keys,
      });
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, [native]);

  const unsubscribe = useCallback(async () => {
    if (native || !SUPPORTED) return;
    try {
      const reg = await getRegistration();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiRequest("POST", "/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }, [native]);

  return { supported: native ? nativeReady : SUPPORTED, permission, busy, subscribe, unsubscribe };
}
