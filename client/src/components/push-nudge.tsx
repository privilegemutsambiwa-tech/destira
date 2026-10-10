// The notification ask, shown right after a like, an RSVP or joining a lounge
// — the moments someone actually wants to hear back — instead of only inside
// the location prompt (where declining location meant never being asked).
// On an iPhone that isn't running Destira from the home screen, web push
// can't work at all, so the same moment explains how to add it instead.
import { useEffect, useState } from "react";
import { Bell, Share, X } from "lucide-react";
import { usePushSubscribe } from "@/hooks/use-push";
import { useToast } from "@/hooks/use-toast";
import { isIOS, isStandalone, onPushNudge, snooze, snoozedUntil, type PushNudgeReason } from "@/lib/engagement-prompts";

const SNOOZE_KEY = "vf_push_nudge_snooze_until";

const COPY: Record<PushNudgeReason, { title: string; body: string }> = {
  like: {
    title: "Know the moment they like you back",
    body: "Turn on notifications for matches and messages, plus tonight's three at 7pm. Nothing else.",
  },
  rsvp: {
    title: "Hear about it if plans change",
    body: "Turn on notifications so you know if this event moves or is called off, and when you match or get a message.",
  },
  lounge: {
    title: "Don't miss what happens next",
    body: "Turn on notifications for matches and messages, plus tonight's three at 7pm. Nothing else.",
  },
};

export function PushNudge() {
  const { supported, permission, busy, subscribe } = usePushSubscribe();
  const { toast } = useToast();
  const [reason, setReason] = useState<PushNudgeReason | null>(null);
  const iosNeedsInstall = !supported && isIOS() && !isStandalone();

  useEffect(
    () =>
      onPushNudge((r) => {
        if (snoozedUntil(SNOOZE_KEY)) return;
        if (supported ? permission !== "default" : !iosNeedsInstall) return;
        // A beat after the action, so it doesn't land on top of the toast or
        // the match screen the action itself just opened.
        setTimeout(() => setReason(r), 1200);
      }),
    [supported, permission, iosNeedsInstall],
  );

  if (!reason) return null;

  const close = (days: number) => {
    snooze(SNOOZE_KEY, days);
    setReason(null);
  };

  const enable = async () => {
    const ok = await subscribe();
    setReason(null);
    // Granted or denied, the browser has answered — don't ask again soon.
    snooze(SNOOZE_KEY, 30);
    if (ok) toast({ title: "Notifications on", description: "You'll hear about matches, messages and tonight's three." });
  };

  const copy = COPY[reason];

  return (
    <div className="fixed inset-x-0 bottom-0 z-[120] p-3 sm:p-4 flex justify-center pointer-events-none" data-testid="push-nudge">
      <div className="pointer-events-auto w-full max-w-md rounded-[20px] border border-vf-line bg-vf-surface2 p-5 shadow-[0_16px_48px_rgba(0,0,0,0.35)] mb-[calc(env(safe-area-inset-bottom)+64px)] lg:mb-0">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-full bg-vf-ember/10 text-vf-ember flex items-center justify-center shrink-0">
            {iosNeedsInstall ? <Share className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-serif text-[19px] leading-tight text-vf-text">
              {iosNeedsInstall ? "Add Destira to your home screen" : copy.title}
            </h3>
            <p className="text-[13px] text-vf-muted mt-1 leading-[1.5]">
              {iosNeedsInstall
                ? "On iPhone, notifications only work from the home screen. Tap Share in Safari, then “Add to Home Screen”, and open Destira from there."
                : copy.body}
            </p>
          </div>
          <button onClick={() => close(5)} className="text-vf-faint hover:text-vf-text shrink-0" aria-label="Not now" data-testid="push-nudge-dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
        {iosNeedsInstall ? (
          <button
            onClick={() => close(14)}
            className="mt-4 w-full h-11 rounded-full border border-vf-line text-vf-text text-[14px] font-medium"
            data-testid="push-nudge-ios-ok"
          >
            Got it
          </button>
        ) : (
          <div className="mt-4 flex gap-2.5">
            <button
              onClick={() => close(5)}
              className="flex-1 h-11 rounded-full border border-vf-line text-vf-muted text-[14px] font-medium"
            >
              Not now
            </button>
            <button
              onClick={enable}
              disabled={busy}
              className="flex-[1.4] h-11 rounded-full bg-vf-ember text-vf-ink font-semibold text-[14px] btn-press disabled:opacity-60"
              data-testid="push-nudge-enable"
            >
              Turn on notifications
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
