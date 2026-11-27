// Discover: the greeting, the Everyone / Within 20 km scope, and the way back.

import { FirstDayChip } from "@/components/first-day-card";
import { TonightsThree } from "@/components/tonights-three";
import { TonightSeatStrip } from "@/components/seat-ticket";
import { useMySeats } from "@/hooks/use-events";
import { TwinOrbButton } from "@/components/twin-orb";
import { MapPin, ChevronLeft, Users } from "lucide-react";
import { wantsFriends } from "@shared/friends";
import { Link } from "wouter";
import { useProfile } from "@/hooks/use-profiles";
import { greetingFor } from "./card-gallery";
import { StoriesCarousel } from "./stories-carousel";

// One read a day, so there is no feed to filter — the only scope that has
// backend support today is distance. "Within 20km" toggles between the
// distance-sorted view and everyone.
export type FilterChip = "all" | "nearby";

export function getInitialFilter(): FilterChip {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("filter") === "nearby") return "nearby";
  }
  return "all";
}

function ScopePill({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={active}
      className={`vf-press inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-[13px] font-medium transition-colors ${
        active
          ? "bg-vf-text border-transparent text-vf-ink"
          : "border-vf-line bg-vf-surface text-vf-text hover:border-vf-text/25"
      }`}
      data-testid="chip-nearby"
    >
      <MapPin className="w-3.5 h-3.5" /> Within 20 km
    </button>
  );
}

/** Discover's slim top bar (docs/destira-upgrade-prompt.md §7.4): the date,
 *  a greeting, the twin orb; then the scope and the first-day chip;
 *  Tonight's three as one row or one line; stories only when new. */
export function DiscoverTopBar({ filter, onScope, name }: { filter: FilterChip; onScope: () => void; name: string | null }) {
  const now = new Date();
  const date = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const { data: seats } = useMySeats();
  const { data: me } = useProfile();
  const friendsToo = wantsFriends((me as any)?.lookingFor);
  return (
    <header className="mb-5 flex flex-col gap-3" data-testid="discover-top-bar">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="vf-label text-vf-faint" data-testid="text-discover-date">{date}</div>
          <h1 className="vf-h1 text-vf-text mt-1 truncate" data-testid="text-discover-greeting">
            {greetingFor(now)}{name ? `, ${name}` : ""}
          </h1>
        </div>
        <TwinOrbButton />
      </div>
      <div className="flex flex-wrap items-center gap-2" data-testid="filter-chips">
        <ScopePill active={filter === "nearby"} onToggle={onScope} />
        {friendsToo && (
          <Link href="/friends">
            <span
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-vf-mint/40 text-vf-mint text-[13px] cursor-pointer hover:bg-vf-mint/[0.08]"
              data-testid="chip-friends"
            >
              <Users className="w-3.5 h-3.5" /> Friends
            </span>
          </Link>
        )}
        <FirstDayChip />
      </div>
      <TonightSeatStrip seats={seats} />
      <TonightsThree />
      <StoriesCarousel />
    </header>
  );
}

// The way out of "Within 20km" — the pill toggles it too, but a nearby-only
// deck should have an obvious back, the same as every other scoped screen.
export function BackToEveryone({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="inline-flex items-center gap-1 -ml-1 mb-3 text-[13px] text-vf-muted hover:text-vf-text transition-colors"
      data-testid="button-discover-back"
    >
      <ChevronLeft className="w-4 h-4" /> Back to everyone
    </button>
  );
}
