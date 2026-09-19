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
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-vf-ember/25 bg-gradient-to-r from-vf-ember/[0.12] to-transparent px-4 py-3 mb-6"
      data-testid="trial-banner"
    >
      <Sparkles className="w-4 h-4 text-vf-ember shrink-0" />
      <p className="flex-1 min-w-[220px] text-[13px] text-vf-text leading-snug">
        <span className="font-medium">🎉 You're on a 1-Month Free Flame Pass</span>
        <span className="text-vf-muted">
          {" "}
          — host your own events, create up to {LIMITS.flame.groupsCreatedMax} groups, and send up to{" "}
          {LIMITS.flame.dailyLikes} likes a day. ({dayLabel})
        </span>
      </p>
      <Link href="/plans">
        <a
          className="text-[12.5px] font-medium text-vf-ember hover:text-[var(--vf-ember-soft)] transition-colors whitespace-nowrap"
          data-testid="trial-banner-explore"
        >
          Explore Flame Features
        </a>
      </Link>
      <button
        onClick={dismiss}
        className="text-vf-faint hover:text-vf-text transition-colors shrink-0"
        aria-label="Dismiss trial banner"
        data-testid="trial-banner-dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
