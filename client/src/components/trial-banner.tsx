import { useState } from "react";
import { Link } from "wouter";
import { Sparkles, X } from "lucide-react";
import { useSubscription } from "@/hooks/use-interactions";
import { LIMITS } from "@shared/entitlements";

const DISMISS_KEY = "vf_trial_banner_dismissed";

// Sits at the top of the authenticated app shell, so it's visible from
// Discover/Lounge/Events without every page having to render it itself.
// Only ever renders for the server-granted signup trial (isTrial from
// GET /api/subscription), never for a real Flame purchase.
export function TrialBanner() {
  const { data: sub } = useSubscription();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (dismissed || !sub?.isTrial || sub.daysRemaining == null) return null;

  const days = sub.daysRemaining as number;
  const dayLabel = days <= 0 ? "expires today" : days === 1 ? "1 day left" : `${days} days left`;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* noop */
    }
  };

  return (
    <div
      className="vf-card relative rounded-[18px] border border-vf-ember/25 px-4 py-3.5 pr-11 sm:pr-4 mb-6 sm:flex sm:items-center sm:gap-4"
      style={{ background: "linear-gradient(135deg, hsl(var(--vf-ember) / 0.1), var(--vf-surface2) 78%)" }}
      data-testid="trial-banner"
    >
      <div className="flex items-start gap-3 sm:items-center min-w-0">
        <span
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "hsl(var(--vf-ember) / 0.14)" }}
          aria-hidden="true"
        >
          <Sparkles className="w-4.5 h-4.5 text-vf-ember" />
        </span>
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-vf-ember">
            Flame trial · {dayLabel}
          </div>
          <p className="text-[13.5px] text-vf-text leading-snug mt-0.5">
            Host events, create up to {LIMITS.flame.groupsCreatedMax} groups, and send up to{" "}
            {LIMITS.flame.dailyLikes} likes a day — free while it lasts.
          </p>
        </div>
      </div>
      <Link href="/plans">
        <a
          className="mt-2.5 sm:mt-0 sm:ml-auto inline-flex items-center gap-1 shrink-0 text-[12.5px] font-semibold text-vf-ember hover:text-[var(--vf-ember-soft)] transition-colors whitespace-nowrap"
          data-testid="trial-banner-explore"
        >
          Explore Flame features
        </a>
      </Link>
      <button
        onClick={dismiss}
        className="absolute top-3.5 right-3.5 sm:static sm:top-auto sm:right-auto text-vf-faint hover:text-vf-text transition-colors shrink-0 rounded-full p-0.5 hover:bg-vf-elevated"
        aria-label="Dismiss trial banner"
        data-testid="trial-banner-dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
