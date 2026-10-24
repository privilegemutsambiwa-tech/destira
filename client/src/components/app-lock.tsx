// The lock screen (lib/app-lock.ts) and its switch in Settings. The lock
// screen is opaque and sits above everything, so nothing of the member's
// chats or matches shows until they're through.
import { useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Fingerprint } from "lucide-react";
import { DestiraLockup } from "@/components/brand/logo";
import { useToast } from "@/hooks/use-toast";
import { appLockAvailable, appLockEnabled, RELOCK_AFTER_MS, setAppLockEnabled, verifyOwner } from "@/lib/app-lock";
import { isNativeApp } from "@/lib/native";

export function AppLockGate() {
  const [locked, setLocked] = useState(() => appLockEnabled());
  const awaySince = useRef<number | null>(null);
  const prompting = useRef(false);

  const unlock = async () => {
    if (prompting.current) return;
    prompting.current = true;
    // The phone's own lock was removed since app lock was turned on: there's
    // nothing left to unlock with, so stand down rather than lock the member
    // out of their account. (Removing it needed that phone's PIN anyway.)
    if (!(await appLockAvailable())) {
      setAppLockEnabled(false);
      prompting.current = false;
      setLocked(false);
      return;
    }
    const ok = await verifyOwner();
    prompting.current = false;
    if (ok) setLocked(false);
  };

  useEffect(() => {
    if (!isNativeApp()) return;
    const sub = App.addListener("appStateChange", ({ isActive }) => {
      if (!appLockEnabled()) return;
      if (!isActive) {
        awaySince.current = Date.now();
      } else if (awaySince.current !== null && Date.now() - awaySince.current > RELOCK_AFTER_MS) {
        setLocked(true);
      }
    });
    return () => {
      sub.then((s) => s.remove()).catch(() => {});
    };
  }, []);

  // Ask straight away whenever the lock appears.
  useEffect(() => {
    if (locked) void unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  if (!locked) return null;
  return (
    <div className="fixed inset-0 z-[300] bg-vf-ink flex flex-col items-center justify-center gap-10 px-8" data-testid="app-lock">
      <DestiraLockup orientation="stacked" size={64} />
      <button
        onClick={unlock}
        className="inline-flex items-center gap-2.5 rounded-full bg-vf-ember text-white font-semibold h-[52px] px-8 text-[15.5px] btn-press"
        data-testid="button-unlock"
      >
        <Fingerprint className="w-5 h-5" /> Unlock
      </button>
    </div>
  );
}

/** Settings row: only in the app, and only on phones that have a lock. */
export function AppLockSetting({ Row }: { Row: React.ComponentType<{ icon: any; label: string; value: boolean; onChange: (v: boolean) => void; testId?: string }> }) {
  const { toast } = useToast();
  const [available, setAvailable] = useState(false);
  const [on, setOn] = useState(() => appLockEnabled());

  useEffect(() => {
    appLockAvailable().then(setAvailable);
  }, []);

  if (!isNativeApp() || !available) return null;

  // Turning it on or off both need the owner, so nobody else can flip it.
  const change = async (next: boolean) => {
    const ok = await verifyOwner(next ? "Turn on app lock" : "Turn off app lock");
    if (!ok) return;
    setAppLockEnabled(next);
    setOn(next);
    toast({ title: next ? "App lock is on" : "App lock is off" });
  };

  return <Row icon={Fingerprint} label="App lock (fingerprint or screen lock)" value={on} onChange={change} testId="toggle-app-lock" />;
}
