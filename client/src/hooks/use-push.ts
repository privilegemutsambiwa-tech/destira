import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

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
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    SUPPORTED ? Notification.permission : "unsupported",
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (SUPPORTED) getRegistration().catch(() => {});
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
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
  }, []);

  const unsubscribe = useCallback(async () => {
    if (!SUPPORTED) return;
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
  }, []);

  return { supported: SUPPORTED, permission, busy, subscribe, unsubscribe };
}
