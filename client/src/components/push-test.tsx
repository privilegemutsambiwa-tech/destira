// Settings → Notifications → "Send a test notification". Turns notifications
// on for this phone or browser if they aren't yet, then asks the server to
// send one, and says plainly what happened (or what's missing).
import { BellRing } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePushSubscribe } from "@/hooks/use-push";
import { isNativeApp } from "@/lib/native";

type Row = React.ComponentType<{ icon: any; label: string; sublabel?: string; onClick: () => void; testId?: string }>;

export function PushTestRow({ Row }: { Row: Row }) {
  const { toast } = useToast();
  const { supported, permission, subscribe, busy } = usePushSubscribe();

  const run = async () => {
    if (busy) return;
    if (!supported) {
      toast({ title: "Notifications aren't available here", description: isNativeApp() ? "Update the app to the latest version." : "This browser can't receive notifications." });
      return;
    }
    if (permission !== "granted") {
      const ok = await subscribe();
      if (!ok) {
        toast({ title: "Notifications are off", description: "Allow notifications for Destira in your phone's settings, then try again." });
        return;
      }
      // The phone hands its address to the server a moment after permission.
      await new Promise((r) => setTimeout(r, 2500));
    }
    try {
      const res = await fetch("/api/push/test", { method: "POST", credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: body.message || "Couldn't send the test" });
        return;
      }
      const reached = (body.phones ?? 0) + (body.browsers ?? 0);
      if (reached > 0) {
        toast({ title: "Test sent", description: "It should arrive in a few seconds." });
      } else if (isNativeApp() && !body.appPushConfigured) {
        toast({ title: "Not switched on yet", description: "Destira's app notifications are still being set up. Try again later." });
      } else {
        toast({ title: "No device to send to yet", description: "Wait a few seconds and try again." });
      }
    } catch {
      toast({ title: "You're offline", description: "Try again when you're connected." });
    }
  };

  return <Row icon={BellRing} label="Send a test notification" sublabel="Check notifications reach this device" onClick={run} testId="row-push-test" />;
}
