// "Tonight's three": three people picked for this member, released at 19:00
// Harare time every day (server/daily-picks.ts).
//
// On Discover it is one compact row, never a block above the person
// (docs/destira-upgrade-prompt.md §7.6). When a new set is open, the row
// shows the three; the first time a set is seen they arrive one by one (the
// 19:00 reveal, §5.2). With nothing open it is a single countdown line to
// the next set. Someone liked or passed leaves the row, the same as they
// leave the deck.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { withFrom } from "@/lib/from-route";
import { useAuth } from "@/hooks/use-auth";
import { useDecidedIds } from "@/lib/discover-decisions";
import { VfAvatar, TonightGlyph } from "@/components/ui-vf";
import { ease } from "@/lib/motion";
import { haptic } from "@/lib/haptics";

interface DailyPick {
  userId: string;
  displayName: string;
  age: number | null;
  location: string | null;
  photoUrl: string | null;
  reasons: string[];
  status: "open" | "liked" | "passed";
}
interface DailyPicksView {
  pickDate: string;
  nextReleaseAt: string;
  picks: DailyPick[];
}

const REVEALED_KEY = "destira.picks.revealed";

function readRevealed(): string | null {
  try {
    return localStorage.getItem(REVEALED_KEY);
  } catch {
    return null;
  }
}

/** "19:00", in the member's own clock. */
function releaseTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "in 3h 12m", "in 40m", "any minute now". Ticks once a minute. */
function useCountdown(iso: string | undefined): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return "";
  const mins = Math.max(0, Math.round((new Date(iso).getTime() - now) / 60_000));
  if (mins < 1) return "any minute now";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}

export function TonightsThree() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const decidedIds = useDecidedIds(user?.id);
  const reduced = !!useReducedMotion();
  const { data, refetch } = useQuery<DailyPicksView>({
    queryKey: ["/api/daily-picks"],
    queryFn: async () => {
      const res = await fetch("/api/daily-picks", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load picks");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const countdown = useCountdown(data?.nextReleaseAt);
  // Picks up the new set the moment 19:00 passes with Discover open.
  useEffect(() => {
    if (!data?.nextReleaseAt) return;
    const ms = new Date(data.nextReleaseAt).getTime() - Date.now() + 5_000;
    if (ms <= 0 || ms > 24 * 60 * 60 * 1000) return;
    const t = setTimeout(() => refetch(), ms);
    return () => clearTimeout(t);
  }, [data?.nextReleaseAt, refetch]);

  const openPicks = data ? data.picks.filter((p) => p.status === "open" && !decidedIds.has(p.userId)) : [];
  // The reveal plays once per set, the first time it's on screen: this is
  // read before the effect below marks the set as seen.
  const playReveal = !!data && openPicks.length > 0 && readRevealed() !== data.pickDate && !reduced;
  useEffect(() => {
    if (!data || openPicks.length === 0 || readRevealed() === data.pickDate) return;
    if (!reduced) {
      openPicks.forEach((_, i) => setTimeout(() => haptic.tick(), 350 + i * 260));
    }
    try {
      localStorage.setItem(REVEALED_KEY, data.pickDate);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.pickDate, openPicks.length > 0]);

  if (!data) return null;

  if (openPicks.length === 0) {
    const first = data.picks.length === 0;
    return (
      <div className="flex items-center gap-2.5 text-vf-muted vf-small" data-testid={first ? "tonights-three-upcoming" : "tonights-three-done"}>
        <TonightGlyph size={18} className="text-vf-faint shrink-0" />
        <span>
          {first ? "Your first three arrive" : "Your next three arrive"} at {releaseTime(data.nextReleaseAt)}
          <span className="text-vf-faint"> · {countdown}</span>
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 rounded-[20px] border border-vf-line bg-vf-surface pl-4 pr-2 py-2.5"
      data-testid="tonights-three"
    >
      <div className="shrink-0 min-w-0 hidden min-[380px]:block">
        <div className="vf-label text-vf-mint">Tonight's three</div>
        <div className="vf-small text-vf-faint">Next {countdown}</div>
      </div>
      <div className="vf-label text-vf-mint min-[380px]:hidden shrink-0">Tonight</div>
      <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
        {openPicks.map((p, i) => (
          <motion.button
            key={p.userId}
            initial={playReveal ? { opacity: 0, scale: 0.6, filter: "blur(8px)" } : false}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ delay: 0.35 + i * 0.26, duration: 0.5, ease: ease.standard }}
            onClick={() => setLocation(withFrom(`/u/${p.userId}`, "/discover"))}
            className="vf-press group flex items-center gap-2 rounded-full p-1 pr-3 hover:bg-vf-surface2 transition-colors min-w-0"
            title={p.reasons[0] ?? undefined}
            data-testid={`tonights-three-pick-${p.userId}`}
          >
            <VfAvatar size={36} name={p.displayName} seed={p.userId} src={p.photoUrl ?? undefined} />
            <span className="text-[13.5px] text-vf-text truncate max-w-[72px] hidden sm:inline">{p.displayName.split(/\s+/)[0]}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
