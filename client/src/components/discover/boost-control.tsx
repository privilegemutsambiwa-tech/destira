// Discover: rewind, super like and boost counts, and the boost button.

import { useState, useEffect } from "react";
import { Loader2, Zap } from "lucide-react";
import { singlePrice } from "@shared/single-purchases";

export type DiscoverPerks = {
  tier: string;
  rewind: { perDay: number | null; usedToday: number };
  superLike: { perWeek: number; usedThisWeek: number; bought: number; left: number };
  boost: { perWeek: number; usedThisWeek: number; bought: number; left: number; active: { endsAt: string; shownTo: number } | null };
};

/** Only for members who have a boost to use or one running. Says what it
 *  really did: minutes left and how many decks it reached. */
export function BoostControl({ perks, onBoost, onBuy, busy }: { perks?: DiscoverPerks; onBoost: () => void; onBuy: () => void; busy: boolean }) {
  const [, tick] = useState(0);
  const active = perks?.boost.active;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [active]);
  if (!perks) return null;
  if (active) {
    const mins = Math.max(0, Math.ceil((new Date(active.endsAt).getTime() - Date.now()) / 60_000));
    return (
      <div className="flex justify-center mt-3">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-vf-ember/10 text-vf-ember text-[12.5px] font-medium" data-testid="boost-on">
          <Zap className="w-3.5 h-3.5 shrink-0" fill="currentColor" strokeWidth={0} />
          Boost on · {mins} min left · first in {active.shownTo} {active.shownTo === 1 ? "deck" : "decks"} so far
        </span>
      </div>
    );
  }
  if (perks.boost.left <= 0) {
    return (
      <div className="flex justify-center mt-3">
        <button
          onClick={onBuy}
          className="inline-flex items-center gap-1 h-8 px-3 rounded-full border border-vf-line text-vf-muted text-[12.5px] font-medium hover:text-vf-text hover:bg-vf-ember/5"
          data-testid="button-buy-boost"
        >
          <Zap className="w-3.5 h-3.5" strokeWidth={1.8} />
          Boost for 30 minutes · {singlePrice("boost")}
        </button>
      </div>
    );
  }
  return (
    <div className="flex justify-center mt-3">
    <button
      onClick={onBoost}
      disabled={busy}
      className="inline-flex items-center gap-1 h-8 px-3 rounded-full border border-vf-ember/40 text-vf-ember text-[12.5px] font-semibold hover:bg-vf-ember/10 disabled:opacity-50"
      data-testid="button-boost"
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />}
      Boost for 30 minutes · {perks.boost.left} left
    </button>
    </div>
  );
}
