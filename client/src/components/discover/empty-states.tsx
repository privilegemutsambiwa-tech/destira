// Discover: what shows instead of a card. Today's likes are used up, or
// nobody is left who fits.

import { Loader2, RotateCcw } from "lucide-react";
import { EmptyState, VfButton } from "@/components/ui-vf";
import { resetLabel, type GateState } from "@/hooks/use-gate";
import { gateCopy } from "@shared/entitlements";
import { ExpandSearchOptions } from "./notes";
import type { FilterChip } from "./top-bar";

export function LikesUsedUp({ likesGate, copy, onSeePlans }: {
  likesGate: GateState;
  copy: ReturnType<typeof gateCopy>;
  onSeePlans: () => void;
}) {
  return (
      <div className="rounded-[24px] border border-vf-line bg-vf-surface" data-testid="discover-likes-exhausted">
        <EmptyState
          title={`That's today's ${likesGate.limit != null ? `${likesGate.limit} ` : ""}likes.`}
          body={
            <>
              <span className="block">{likesGate.line || copy.line}</span>
              <span className="block mt-2" data-testid="text-discover-paused">
                New people {resetLabel(likesGate.resetAt) === "at midnight" || !likesGate.resetAt ? "tomorrow" : resetLabel(likesGate.resetAt)}. Or move up a plan to keep going now.
              </span>
            </>
          }
          action={
            <VfButton
              variant="premium"
              onClick={onSeePlans}
              data-testid="button-discover-likes-upgrade"
            >
              {likesGate.requiredTierName || copy.requiredTierName ? `See ${likesGate.requiredTierName || copy.requiredTierName}` : "See plans"}
            </VfButton>
          }
        />
      </div>
  );
}

export function DeckEmpty({ filter, anyDecided, onSeeEveryone, userLat, userLng, onRewind, rewinding }: {
  filter: FilterChip;
  anyDecided: boolean;
  onSeeEveryone: () => void;
  userLat: number | null;
  userLng: number | null;
  onRewind: () => void;
  rewinding: boolean;
}) {
  return (
      <div className="rounded-[24px] border border-vf-line bg-vf-surface" data-testid="discover-empty">
        <EmptyState
          title={filter === "nearby" ? "Nobody within 20 km right now." : anyDecided ? "That's everyone for now." : "No one here yet."}
          body={
            filter === "nearby"
              ? "See everyone instead, or look again later when people are around."
              : anyDecided
                ? "You've seen everyone who fits right now. New people join every day."
                : "New people join every day. Finish your profile so they find you too."
          }
          action={
            filter !== "all" ? (
              <VfButton variant="secondary" onClick={onSeeEveryone}>See everyone</VfButton>
            ) : undefined
          }
        />
        {filter === "all" && (
          <div className="px-6 pb-8 -mt-4">
            <ExpandSearchOptions userLat={userLat} userLng={userLng} />
          </div>
        )}
        <div className="px-6 pb-6 -mt-2 flex justify-center">
          <button
            onClick={onRewind}
            disabled={rewinding}
            className="inline-flex items-center gap-1.5 text-[13px] text-vf-muted hover:text-vf-text min-h-[40px] disabled:opacity-50"
            data-testid="button-rewind-empty"
          >
            {rewinding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            Bring back the last person you passed on
          </button>
        </div>
      </div>
  );
}
