import { useEffect } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  useProximityAlerts,
  useMarkAlertSeen,
  useDismissAlert,
  useDismissProximityUpsell,
  type ProximityAlert,
} from "@/hooks/use-proximity";
import { useStartInterview } from "@/hooks/use-interactions";
import { useGeolocation } from "@/hooks/use-geolocation";
import { apiRequest } from "@/lib/queryClient";

// The twin speaking: "someone worth knowing is at the same place as you."
// Mint layer (this IS the twin layer). Free carries no identity — one gold
// upsell line only. Paid adds the portrait, name, and the two actions.

export function ProximityAlerts() {
  const { hasAsked } = useGeolocation();
  const { data } = useProximityAlerts(hasAsked);
  const markSeen = useMarkAlertSeen();
  const dismiss = useDismissAlert();
  const dismissUpsell = useDismissProximityUpsell();
  const startInterview = useStartInterview();
  const [, setLocation] = useLocation();
  const reduce = useReducedMotion();

  const openProximitySettings = () => {
    try {
      sessionStorage.setItem("open_settings_panel", "proximity");
    } catch {
      /* ignore */
    }
    setLocation("/settings");
  };

  const alert: ProximityAlert | undefined = data?.alerts?.[0];
  const canSeeIdentity = data?.canSeeIdentity ?? false;
  const upsell = data?.upsell ?? null;

  useEffect(() => {
    if (alert && !alert.seenAt) markSeen.mutate(alert.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert?.id]);

  if (!alert) return null;

  const anim = reduce
    ? {}
    : {
        initial: { y: -24, opacity: 0 },
        animate: { y: 0, opacity: 1 },
        exit: { y: -24, opacity: 0 },
        transition: { type: "spring" as const, stiffness: 320, damping: 32 },
      };

  return (
    <AnimatePresence>
      <motion.div
        key={alert.id}
        {...anim}
        className="fixed left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
        data-testid="proximity-alert"
      >
        <div className="rounded-2xl border border-vf-mint/25 bg-vf-surface2 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-start gap-3">
            <span
              className="mt-1.5 w-2 h-2 rounded-full bg-vf-mint shrink-0 animate-[vf-pulse_2.6s_ease-in-out_infinite] motion-reduce:animate-none"
              style={{ boxShadow: "0 0 10px var(--vf-mint-vivid)" }}
            />
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-vf-mint">
                {alert.distanceLabel}
                <span className="text-vf-faint"> · {alert.freshness}</span>
              </div>

              <p className="font-serif text-[19px] leading-snug text-vf-text mt-1.5">
                {alert.read.line}
              </p>

              {canSeeIdentity && alert.subject ? (
                <div className="mt-3 flex items-center gap-3">
                  {alert.subject.portraitUrl ? (
                    <img
                      src={alert.subject.portraitUrl}
                      alt=""
                      className="w-11 h-11 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-vf-mint/20 flex items-center justify-center font-serif text-vf-mint text-lg shrink-0">
                      {alert.subject.firstName[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-vf-text truncate">{alert.subject.firstName}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-vf-faint truncate">
                      {alert.place.label}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-vf-faint mt-2">
                  {alert.place.label}
                </p>
              )}

              <div className="mt-3.5 flex flex-wrap items-center gap-2">
                {canSeeIdentity && alert.subject ? (
                  <>
                    <button
                      onClick={() => setLocation(alert.subject!.profileUrl)}
                      className="h-9 px-3.5 rounded-lg text-[13px] font-medium bg-vf-ember text-vf-ink"
                      data-testid="proximity-open-profile"
                    >
                      Their profile
                    </button>
                    <button
                      disabled={startInterview.isPending}
                      onClick={() =>
                        startInterview.mutate(alert.subject!.userId, {
                          onSuccess: (iv: any) => {
                            dismiss.mutate(alert.id);
                            if (iv?.id) setLocation(`/interviews/${iv.id}/chat`);
                          },
                        })
                      }
                      className="h-9 px-3.5 rounded-lg text-[13px] font-medium border border-vf-mint/40 text-vf-mint disabled:opacity-50"
                      data-testid="proximity-ask-twin"
                    >
                      Ask their twin
                    </button>
                  </>
                ) : null}
                <button
                  onClick={() => dismiss.mutate(alert.id)}
                  className="h-9 px-3 rounded-lg text-[13px] text-vf-faint hover:text-vf-text transition-colors"
                  data-testid="proximity-dismiss"
                >
                  Dismiss
                </button>
                {canSeeIdentity && alert.subject ? (
                  <button
                    onClick={async () => {
                      await apiRequest(
                        "POST",
                        `/api/users/block/${alert.subject!.userId}`,
                      ).catch(() => {});
                      dismiss.mutate(alert.id);
                    }}
                    className="h-9 px-3 rounded-lg text-[13px] text-vf-faint hover:text-vf-text transition-colors"
                    data-testid="proximity-block"
                  >
                    Block &amp; report
                  </button>
                ) : (
                  <button
                    onClick={() => openProximitySettings()}
                    className="h-9 px-3 rounded-lg text-[13px] text-vf-faint hover:text-vf-text transition-colors"
                    data-testid="proximity-turn-down"
                  >
                    Turn these down
                  </button>
                )}
              </div>

              {!canSeeIdentity && upsell && (
                <div className="mt-3 pt-3 border-t border-vf-line flex items-center justify-between gap-2">
                  <button
                    onClick={() => setLocation(upsell.href)}
                    className="text-[12px] text-vf-gold text-left leading-snug"
                    data-testid="proximity-upsell"
                  >
                    {upsell.line}
                  </button>
                  <button
                    onClick={() => dismissUpsell.mutate()}
                    className="font-mono text-[10px] uppercase tracking-[0.14em] text-vf-faint shrink-0"
                    data-testid="proximity-upsell-dismiss"
                  >
                    Hide
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
