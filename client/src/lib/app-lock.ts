// Optional app lock (Settings → Account → App lock): the phone's fingerprint
// or face unlock, with its PIN/pattern as the fallback, before Destira shows
// anything. Asked when the app opens and when it comes back after more than
// a minute away. A setting of this phone, cleared at sign-out.
import { NativeBiometric } from "@capgo/capacitor-native-biometric";
import { isNativeApp } from "./native";

const KEY = "destira.appLock";
/** Away for longer than this and the app asks again. */
export const RELOCK_AFTER_MS = 60_000;

export function appLockEnabled(): boolean {
  if (!isNativeApp()) return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setAppLockEnabled(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the lock stays as it was */
  }
}

/** Whether this phone has a fingerprint, face or screen lock to use. */
export async function appLockAvailable(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    return (await NativeBiometric.isAvailable({ useFallback: true })).isAvailable;
  } catch {
    return false;
  }
}

/** Shows the phone's own unlock prompt. True if the owner got through. */
export async function verifyOwner(reason = "Unlock Destira"): Promise<boolean> {
  try {
    await NativeBiometric.verifyIdentity({
      title: reason,
      subtitle: "Use your fingerprint, face or screen lock",
      useFallback: true,
      maxAttempts: 5,
    });
    return true;
  } catch {
    return false;
  }
}
