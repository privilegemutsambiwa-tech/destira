import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { ResonanceDial } from "@/components/resonance-dial";
import { ResonanceAxes } from "@/components/resonance-axes";
import { Brain, X, Loader2, MapPin, Heart, Plus, Check, ArrowRight, ChevronLeft, ChevronRight, Flag } from "lucide-react";
import { useDiscoverProfiles, useStartInterview, useCreateMatch, useDiscoverPass, useFeedStories, useProfileCompletion, UpgradeRequiredError } from "@/hooks/use-interactions";
import { useTwinReadiness, useDismissReminder } from "@/hooks/use-onboarding";
import { LIMITS, gateCopy } from "@shared/entitlements";
import { usePaywall } from "@/hooks/use-paywall";
import { useGate, resetLabel } from "@/hooks/use-gate";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { StoryViewer, OwnStoryViewer, AddStoryButton } from "@/components/story-viewer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profiles";
import type { User } from "@shared/models/auth";

function formatDistance(km: number): string {
  if (km < 1) return "Less than 1km away";
  if (km >= 100) return `${Math.round(km)}km away`;
  return `${km.toFixed(1)}km away`;
}

// Demo-seeded profiles carry real Big-Five trait scores (openness,
// conscientiousness, ...); profiles onboarded through the app carry free-text
// soul-mapping answers instead (see Onboarding.tsx). There's no backend
// compatibility scoring yet (docs/redesign-handoff.md §4.2 is deferred), so
// the resonance dial only renders when a profile actually has numeric trait
// data — no invented numbers for the common case.
function getResonance(personalityProfile: unknown): { score: number; axes: { label: string; value: number }[] } | null {
  if (!personalityProfile || typeof personalityProfile !== "object") return null;
  const numeric = Object.entries(personalityProfile as Record<string, unknown>).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number"
  );
  if (numeric.length === 0) return null;
  const score = Math.round(numeric.reduce((sum, [, v]) => sum + v, 0) / numeric.length);
  const axes = numeric
    .slice(0, 4)
    .map(([label, value]) => ({ label: label.charAt(0).toUpperCase() + label.slice(1), value }));
  return { score, axes };
}

type GalleryPhoto = {
  id?: number;
  url: string;
  w800: string | null;
  w1600: string | null;
  role: string;
  focalX: number;
  focalY: number;
};

// The photo pane as a stepped gallery. Mirrors StoryViewer's vocabulary —
// segment ticks up top, tap the left/right third, arrow keys, hover chevrons on
// desktop. Stepping never advances the profile; it only moves within this card.
function CardGallery({ photos, initial }: { photos: GalleryPhoto[]; initial: string }) {
  const [idx, setIdx] = useState(0);
  const count = photos.length;

  useEffect(() => {
    setIdx(0);
  }, [photos]);

  const go = useCallback(
    (dir: 1 | -1) => setIdx((i) => (count ? (i + dir + count) % count : 0)),
    [count],
  );

  useEffect(() => {
    if (count < 2) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, go]);

  // preload the next photo only
  useEffect(() => {
    if (count < 2) return;
    const next = photos[(idx + 1) % count];
    const img = new Image();
    img.src = next.w800 ?? next.url;
  }, [idx, count, photos]);

  if (count === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-vf-surface2">
        <span className="font-serif text-vf-text/20" style={{ fontSize: "96px" }}>
          {initial}
        </span>
      </div>
    );
  }

  const p = photos[idx];
  return (
    <div className="absolute inset-0 group">
      <img
        key={p.url}
        src={p.w800 ?? p.url}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: `${(p.focalX ?? 0.5) * 100}% ${(p.focalY ?? 0.5) * 100}%` }}
      />

      {count > 1 && (
        <>
          <div className="absolute top-2 inset-x-2 z-20 flex gap-1" aria-hidden="true">
            {photos.map((_, i) => (
              <div
                key={i}
                className="flex-1 h-[3px] rounded-full overflow-hidden"
                style={{ background: "rgba(255,255,255,0.28)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: i <= idx ? "100%" : "0%", background: "rgba(255,255,255,0.95)" }}
                />
              </div>
            ))}
          </div>

          {/* tap zones — start below the story-ring / badge band */}
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous photo"
            className="absolute left-0 top-14 bottom-0 w-1/3 z-10 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next photo"
            className="absolute right-0 top-14 bottom-0 w-1/3 z-10 focus:outline-none"
          />

          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous photo"
            className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next photo"
            className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>

          <span className="absolute bottom-3 right-3 z-20 font-mono text-[10px] tracking-[0.16em] text-white/70">
            {idx + 1}/{count}
          </span>
        </>
      )}
    </div>
  );
}

function StoriesCarousel() {
  const { data: stories } = useFeedStories();
  const { user } = useAuth();
  const typedUser = user as User | null;
  // Just the id, not a value snapshot — so a like/comment/view invalidating
  // the feed query actually reaches the still-open viewer instead of it
  // rendering whatever `stories` array looked like the moment it was tapped.
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [showOwnStoryViewer, setShowOwnStoryViewer] = useState(false);
  const [showStoryCreator, setShowStoryCreator] = useState(false);

  const { data: myStories } = useQuery<any[]>({
    queryKey: ["/api/stories/mine"],
    queryFn: async () => {
      const res = await fetch("/api/stories/mine", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const hasMyStories = myStories && myStories.length > 0;
  const myPhotoUrl = typedUser?.profileImageUrl || "";
  const myName = typedUser?.firstName || "You";
  const myOwnStories: any[] = hasMyStories ? myStories : [];

  const grouped = useMemo(() => {
    if (!stories || stories.length === 0) return [];
    const byUser: Record<string, { userId: string; displayName: string; photoUrl: string; stories: any[] }> = {};
    stories.forEach((s: any) => {
      if (!byUser[s.userId]) {
        byUser[s.userId] = { userId: s.userId, displayName: s.displayName || "User", photoUrl: s.photoUrl || "", stories: [] };
      }
      byUser[s.userId].stories.push(s);
    });
    const groups = Object.values(byUser);
    // Anyone with at least one story you haven't opened yet sorts to the
    // front (in the server's newest-first order among themselves); everyone
    // whose stories are all already viewed rotates to the back, in that same
    // relative order. A stable sort (guaranteed by the spec since ES2019)
    // makes this a clean partition rather than a real re-sort.
    const hasUnviewed = (g: { stories: any[] }) => g.stories.some((s) => !s.viewedByMe);
    return [...groups].sort((a, b) => (hasUnviewed(b) ? 1 : 0) - (hasUnviewed(a) ? 1 : 0));
  }, [stories]);

  const viewingGroup = viewingUserId ? grouped.find((g) => g.userId === viewingUserId) || null : null;

  const STORY_SIZE = 56;

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-3 mb-5 scrollbar-hide" data-testid="stories-carousel">
        {hasMyStories ? (
          <button
            onClick={() => setShowOwnStoryViewer(true)}
            className="flex flex-col items-center gap-1.5 shrink-0"
            data-testid="story-own-ring"
          >
            <div
              className="p-[2.5px] rounded-full story-ring-active"
              style={{ width: `${STORY_SIZE}px`, height: `${STORY_SIZE}px` }}
            >
              <div className="w-full h-full rounded-full overflow-hidden" style={{ background: "var(--vf-surface2)" }}>
                <Avatar className="w-full h-full">
                  {myPhotoUrl ? (
                    <AvatarImage src={myPhotoUrl} alt={myName} />
                  ) : (
                    <AvatarFallback style={{ background: "var(--vf-surface2)", color: "hsl(var(--vf-text))", fontSize: "14px" }}>
                      {myName[0]}
                    </AvatarFallback>
                  )}
                </Avatar>
              </div>
            </div>
            <span
              style={{
                fontSize: "11px",
                maxWidth: "56px",
                textAlign: "center",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "var(--vf-muted)",
                fontWeight: 600,
              }}
            >
              Your Story
            </span>
          </button>
        ) : (
          <button
            className="flex flex-col items-center gap-1.5 shrink-0"
            onClick={() => setShowStoryCreator(true)}
            data-testid="story-add-slot"
          >
            <div
              className="rounded-full flex items-center justify-center"
              style={{
                width: `${STORY_SIZE}px`,
                height: `${STORY_SIZE}px`,
                border: "2px dashed rgba(255,255,255,0.2)",
                background: "transparent",
              }}
            >
              <Plus className="w-5 h-5" style={{ color: "var(--vf-muted)" }} />
            </div>
            <span style={{ fontSize: "11px", color: "var(--vf-muted)" }}>Add</span>
          </button>
        )}

        {grouped.map((u) => {
          const hasUnviewed = u.stories.some((s: any) => !s.viewedByMe);
          return (
          <button
            key={u.userId}
            onClick={() => setViewingUserId(u.userId)}
            className="flex flex-col items-center gap-1.5 shrink-0"
            data-testid={`story-avatar-${u.userId}`}
          >
            <div className={`${hasUnviewed ? "story-ring-active" : "story-ring-inactive"} p-[2.5px] rounded-full`} style={{ width: `${STORY_SIZE}px`, height: `${STORY_SIZE}px` }}>
              <div className="w-full h-full rounded-full overflow-hidden" style={{ background: "var(--vf-surface2)" }}>
                <Avatar className="w-full h-full">
                  {u.photoUrl ? (
                    <AvatarImage src={u.photoUrl} alt={u.displayName} />
                  ) : (
                    <AvatarFallback style={{ background: "var(--vf-elevated)", color: "hsl(var(--vf-text))", fontSize: "14px" }}>
                      {u.displayName[0]}
                    </AvatarFallback>
                  )}
                </Avatar>
              </div>
            </div>
            <span style={{ fontSize: "11px", color: "var(--vf-muted)", maxWidth: "56px", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {u.displayName.split(" ")[0]}
            </span>
          </button>
          );
        })}
      </div>

      {viewingGroup && (
        <StoryViewer
          stories={viewingGroup.stories}
          initialIndex={0}
          onClose={() => setViewingUserId(null)}
          userName={viewingGroup.displayName}
          profileImageUrl={viewingGroup.photoUrl}
        />
      )}

      {showOwnStoryViewer && hasMyStories && (
        <OwnStoryViewer
          stories={myOwnStories}
          onClose={() => setShowOwnStoryViewer(false)}
          onAddStory={() => { setShowOwnStoryViewer(false); setShowStoryCreator(true); }}
          userName={myName}
          profileImageUrl={myPhotoUrl}
        />
      )}

      {showStoryCreator && (
        <AddStoryButton
          open={showStoryCreator}
          onOpenChange={setShowStoryCreator}
          onStoryAdded={() => setShowStoryCreator(false)}
        />
      )}
    </>
  );
}

// One read a day, so there is no feed to filter — the only scope that has
// backend support today is distance. "Within 20km" toggles between the
// distance-sorted view and everyone.
type FilterChip = "all" | "nearby";

function getInitialFilter(): FilterChip {
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
      className={`text-sm font-medium px-4 py-1.5 rounded-full border transition-colors ${
        active
          ? "bg-vf-ember border-transparent text-vf-ink"
          : "border-vf-line text-vf-soft hover:border-vf-text/25"
      }`}
      data-testid="chip-nearby"
    >
      Within 20km
    </button>
  );
}

function ReadinessStrip() {
  const { data: r } = useTwinReadiness();
  const dismiss = useDismissReminder();
  const [, navigate] = useLocation();
  if (!r || r.discoverStripDismissed || r.pct >= 50) return null;
  return (
    <div
      className="mb-5 rounded-[16px] border border-vf-line bg-vf-surface2 px-4 py-3 flex items-start justify-between gap-3"
      data-testid="strip-readiness"
    >
      <p className="text-[13px] text-vf-muted leading-[1.55]">
        Your twin is answering interviews with {r.answeredCount === 1 ? "one answer" : `${r.answeredCount} answers`} to work
        from.{" "}
        <button
          onClick={() => navigate("/onboarding")}
          className="text-vf-mint hover:text-vf-text underline underline-offset-2 transition-colors"
          data-testid="link-readiness-strip"
        >
          Answer a few more
        </button>
        .
      </p>
      <button
        onClick={() => dismiss.mutate("discover_readiness_strip")}
        className="text-vf-faint hover:text-vf-text transition-colors shrink-0 -mr-1 -mt-0.5"
        aria-label="Dismiss"
        data-testid="button-dismiss-readiness"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function DisclosureIntroStrip() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { data } = useQuery<{ dismissed: boolean }>({
    queryKey: ["/api/reminders", "twin_disclosure_intro"],
    queryFn: async () => {
      const res = await fetch("/api/reminders/twin_disclosure_intro", { credentials: "include" });
      if (!res.ok) return { dismissed: true };
      return res.json();
    },
  });
  if (!data || data.dismissed) return null;
  const dismiss = async () => {
    await fetch("/api/reminders/twin_disclosure_intro/dismiss", { method: "POST", credentials: "include" });
    qc.invalidateQueries({ queryKey: ["/api/reminders", "twin_disclosure_intro"] });
  };
  return (
    <div className="mb-5 rounded-[16px] border border-vf-line bg-vf-surface2 px-4 py-3 flex items-start justify-between gap-3" data-testid="strip-disclosure-intro">
      <p className="text-[13px] text-vf-muted leading-[1.55]">
        Your twin talks to people who are deciding about you. You choose what it may say —{" "}
        <button
          onClick={() => { dismiss(); navigate("/twin-disclosure"); }}
          className="text-vf-ember hover:text-vf-text underline underline-offset-2 transition-colors"
          data-testid="link-disclosure-intro"
        >
          set the boundaries
        </button>
        .
      </p>
      <button onClick={dismiss} className="text-vf-faint hover:text-vf-text transition-colors shrink-0 -mr-1 -mt-0.5" aria-label="Dismiss" data-testid="button-dismiss-disclosure-intro">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/** Same completion score and per-task benefit copy Profile.tsx's own
 *  completeness chip already computes (server/storage.ts's
 *  getProfileCompletion) — surfaced here too, where people actually spend
 *  their time, instead of only on a page they may rarely open. */
function ProfileCompletionStrip() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { data: completion } = useProfileCompletion();
  const { data } = useQuery<{ dismissed: boolean }>({
    queryKey: ["/api/reminders", "profile_completion_nudge"],
    queryFn: async () => {
      const res = await fetch("/api/reminders/profile_completion_nudge", { credentials: "include" });
      if (!res.ok) return { dismissed: true };
      return res.json();
    },
  });
  if (!data || data.dismissed || !completion || completion.score >= 80) return null;
  const nextTask = completion.tasks.find((t: { completed: boolean }) => !t.completed);
  const dismiss = async () => {
    await fetch("/api/reminders/profile_completion_nudge/dismiss", { method: "POST", credentials: "include" });
    qc.invalidateQueries({ queryKey: ["/api/reminders", "profile_completion_nudge"] });
  };
  return (
    <div className="mb-5 rounded-[16px] border border-vf-line bg-vf-surface2 px-4 py-3 flex items-start justify-between gap-3" data-testid="strip-profile-completion">
      <p className="text-[13px] text-vf-muted leading-[1.55]">
        A complete profile gets more likes and shows up more. You're at {completion.score}%
        {nextTask ? <> — {nextTask.benefit.toLowerCase()}.</> : "."}{" "}
        <button
          onClick={() => { dismiss(); navigate("/profile"); }}
          className="text-vf-ember hover:text-vf-text underline underline-offset-2 transition-colors"
          data-testid="link-profile-completion"
        >
          Finish your profile
        </button>
        .
      </p>
      <button onClick={dismiss} className="text-vf-faint hover:text-vf-text transition-colors shrink-0 -mr-1 -mt-0.5" aria-label="Dismiss" data-testid="button-dismiss-profile-completion">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function Discover() {
  // Profiles liked or passed THIS session get pulled out of the deck the
  // instant you act on them — no waiting on a refetch to stop seeing someone
  // you already decided about. The exclusion is also persisted server-side
  // (a `matches` row for a like, `discover_passes` for a pass) so it holds
  // across reloads and future sessions too, not just this one.
  const [evaluatedIds, setEvaluatedIds] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState<FilterChip>(getInitialFilter);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  // Stable bits only (name/photo don't change from a like/comment/view) — the
  // actual `stories` array is derived live from storiesByUserId below, so an
  // invalidated feed query reaches this viewer while it's still open.
  const [viewingCardMeta, setViewingCardMeta] = useState<{ userId: string; displayName: string; photoUrl: string } | null>(null);
  const paywall = usePaywall();
  const [confirm, setConfirm] = useState<"block" | "report" | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportPhotoId, setReportPhotoId] = useState<number | null>(null);
  // Guards against a double-tap firing two Like/Pass actions on the same card
  // before the deck advances — isActingRef blocks re-entrancy synchronously
  // (state updates aren't visible until the next render), isActing state just
  // drives the disabled prop so the buttons visibly lock while it settles.
  const isActingRef = useRef(false);
  const [isActing, setIsActing] = useState(false);
  // The actual browsing order, as a list of ids — not re-derived from
  // scratch each render. Tapping a "Next up" card must permanently rotate
  // the previous front card out of the immediate preview window (otherwise
  // it lands right back in the next-up slice and two or three people just
  // trade places forever instead of the viewer ever reaching the rest of
  // the deck — this was the actual bug, not the backend candidate list).
  const [deckOrder, setDeckOrder] = useState<string[]>([]);
  const { data: rawProfiles, isLoading } = useDiscoverProfiles(filter, userLat, userLng);
  const { data: feedStories } = useFeedStories();
  const startInterview = useStartInterview();
  const createMatch = useCreateMatch();
  const discoverPass = useDiscoverPass();
  const qc = useQueryClient();
  // Checked up front, not just on tap: once today's likes are used up, the
  // whole deck stops (not just the Like button) — see the empty-state block
  // below. Passing stays free and doesn't touch this.
  const { data: likesGate } = useGate("daily_likes");
  const [woLocation, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: ownProfile, isLoading: isOwnProfileLoading } = useProfile();

  // Mandatory-onboarding gate: gender and who they're seeking must be set
  // before Discover shows anyone (this also catches Google sign-ins and any
  // direct-URL navigation that skipped the essentials step).
  const needsEssentials =
    !isOwnProfileLoading &&
    (!ownProfile || !ownProfile.gender || !Array.isArray(ownProfile.seekingGenders) || ownProfile.seekingGenders.length === 0);

  useEffect(() => {
    if (needsEssentials) setLocation("/essentials");
  }, [needsEssentials, setLocation]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFilter(params.get("filter") === "nearby" ? "nearby" : "all");
  }, [woLocation]);

  useEffect(() => {
    if (navigator.geolocation && localStorage.getItem("location_permission_asked") === "asked") {
      navigator.geolocation.getCurrentPosition(
        (pos) => { setUserLat(pos.coords.latitude); setUserLng(pos.coords.longitude); },
        () => {},
        { timeout: 5000, maximumAge: 5 * 60 * 1000 }
      );
    }
  }, []);

  const storiesByUserId = useMemo(() => {
    const map: Record<string, any[]> = {};
    if (!feedStories) return map;
    feedStories.forEach((s) => {
      if (!map[s.userId]) map[s.userId] = [];
      map[s.userId].push(s);
    });
    return map;
  }, [feedStories]);

  const viewingCardStories = viewingCardMeta ? storiesByUserId[viewingCardMeta.userId] : null;

  // Under the active filter, before this session's evaluations thin it out
  // — the stable denominator for the "N of total" counter below. Excludes
  // evaluatedIds on purpose: the counter's total shouldn't shrink every time
  // a card leaves the deck, only the position within it should climb.
  const eligibleForFilter = useMemo(() => {
    if (!rawProfiles) return [];
    return filter === "nearby" ? rawProfiles.filter((p: any) => p.distanceKm !== null && p.distanceKm !== undefined) : rawProfiles;
  }, [rawProfiles, filter]);

  // Keeps the deck's browsing order stable across renders instead of
  // re-deriving it from the raw list every time. Newly-seen candidates
  // (a fresh signup, or the filter changing) are appended at the back;
  // anyone evaluated or filtered out drops off; everyone else keeps their
  // relative position, which is what makes the "Next up" rotation below
  // actually work.
  useEffect(() => {
    const availableIds: string[] = eligibleForFilter
      .map((p: any) => p.userId as string)
      .filter((id: string) => !evaluatedIds.has(id));
    const availableSet = new Set(availableIds);
    setDeckOrder((prev) => {
      const kept = prev.filter((id) => availableSet.has(id));
      const keptSet = new Set(kept);
      const added = availableIds.filter((id) => !keptSet.has(id));
      const next = [...kept, ...added];
      const unchanged = next.length === prev.length && next.every((id, i) => id === prev[i]);
      return unchanged ? prev : next;
    });
  }, [eligibleForFilter, evaluatedIds]);

  const profiles = useMemo(() => {
    const byId = new Map<string, any>(eligibleForFilter.map((p: any) => [p.userId as string, p]));
    let list: any[] = deckOrder.map((id) => byId.get(id)).filter((p): p is any => !!p);
    if (filter === "nearby") {
      list = [...list].sort((a: any, b: any) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }
    return list;
  }, [eligibleForFilter, filter, deckOrder]);

  // Always the front of the deck — evaluating a profile removes it from
  // `profiles` above (via evaluatedIds), so there's no index to advance,
  // just a new [0] once the set changes.
  const currentProfile = profiles[0];

  useEffect(() => {
    isActingRef.current = false;
    setIsActing(false);
  }, [currentProfile?.userId]);

  const handleViewCardStory = useCallback((profile: any) => {
    const userId: string = profile.userId;
    const stories = storiesByUserId[userId];
    if (!stories || stories.length === 0) return;
    setViewingCardMeta({
      userId,
      displayName: profile.displayName || "User",
      photoUrl: profile.user?.profileImageUrl || "",
    });
  }, [storiesByUserId]);

  if (isLoading || isOwnProfileLoading || needsEssentials) {
    return (
      <LayoutShell>
        <div className="h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-vf-mint" />
        </div>
      </LayoutShell>
    );
  }

  const weekday = new Date().toLocaleDateString(undefined, { weekday: "long" });

  // Likes are the metric, not passes — free tier gets 30/day (80 Spark, 200
  // Flame, unlimited Ember). The moment that's used up, the deck itself
  // stops, not just the Like button: there's no point browsing further
  // today if nothing you tap can turn into a like. Passing stays free and
  // never trips this.
  if (likesGate && !likesGate.ok) {
    const copy = gateCopy("daily_likes", {
      tier: likesGate.tier as any,
      limit: likesGate.limit,
      used: likesGate.used,
      resetLabel: resetLabel(likesGate.resetAt),
    });
    return (
      <LayoutShell>
        <div className="max-w-lg mx-auto text-center py-20 px-6 rounded-[22px] border border-vf-line bg-vf-surface" data-testid="discover-likes-exhausted">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 bg-vf-ember/10">
            <Heart className="w-10 h-10 text-vf-ember" />
          </div>
          <h3 className="font-serif text-xl mb-2 text-vf-text">That's today's likes</h3>
          <p className="text-sm text-vf-muted">{likesGate.line || copy.line}</p>
          <button
            onClick={() => setLocation(`/plans?feature=daily_likes`)}
            className="mt-5 h-11 px-6 rounded-full bg-vf-ember text-vf-ink font-semibold text-[14px] btn-press hover:bg-[var(--vf-ember-soft)] transition-colors"
            data-testid="button-discover-likes-upgrade"
          >
            {likesGate.requiredTierName || copy.requiredTierName ? `See ${likesGate.requiredTierName || copy.requiredTierName}` : "See plans"}
          </button>
        </div>
      </LayoutShell>
    );
  }

  if (!profiles || profiles.length === 0) {
    return (
      <LayoutShell>
        <div className="max-w-lg mx-auto">
          <div className="mb-6">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint mb-2">
              {weekday} · no read yet
            </div>
            <h1 className="font-serif font-normal text-[clamp(28px,4vw,40px)] leading-[1.05] tracking-[-0.02em] text-vf-text">
              Discover
            </h1>
          </div>
          <div className="flex gap-2 mb-5" data-testid="filter-chips">
            <ScopePill active={filter === "nearby"} onToggle={() => setFilter(filter === "nearby" ? "all" : "nearby")} />
          </div>
          <StoriesCarousel />
          <div className="text-center py-20 px-6 rounded-[22px] border border-vf-line bg-vf-surface">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 bg-vf-mint/10">
              <Brain className="w-10 h-10 text-vf-mint" />
            </div>
            <h3 className="font-serif text-xl mb-2 text-vf-text">
              {filter === "nearby" ? "Nobody within 20km right now" : evaluatedIds.size > 0 ? "That's everyone for now" : "No one to discover yet"}
            </h3>
            <p className="text-sm text-vf-muted">
              {filter === "nearby"
                ? "Widen the scope to see everyone, or check back when people are near you."
                : evaluatedIds.size > 0
                  ? "You've seen everyone available right now — check back as more people join or answer."
                  : "Complete your onboarding first, then check back as more people join Destira."}
            </p>
            {filter !== "all" && (
              <button
                onClick={() => setFilter("all")}
                className="mt-4 text-sm font-medium text-vf-ember"
              >
                Show everyone
              </button>
            )}
          </div>
        </div>
      </LayoutShell>
    );
  }

  const distanceKm: number | null = currentProfile.distanceKm ?? null;
  const nearby: boolean = currentProfile.isNearbyNow ?? false;
  const isVeryClose = distanceKm !== null && distanceKm < 1;
  const cardStories = storiesByUserId[currentProfile.userId] || [];
  const hasCardStories = cardStories.length > 0;
  const resonance = getResonance(currentProfile.personalityProfile);

  // The only way a card leaves the deck: mark it evaluated so the `profiles`
  // memo drops it and [0] becomes whoever's next. No index to advance.
  const handleNext = (evaluatedUserId: string) => {
    setEvaluatedIds((prev) => new Set(prev).add(evaluatedUserId));
  };

  const handleInterview = async () => {
    try {
      const interview = await startInterview.mutateAsync(currentProfile.userId);
      toast({
        title: "Interview Started",
        description: `Chat with ${currentProfile.displayName}'s AI Twin now.`,
      });
      setLocation(`/interviews/${interview.id}/chat?from=/discover`);
    } catch (err: any) {
      if (err instanceof UpgradeRequiredError) {
        setLocation("/plans?feature=start_interview");
      } else {
        toast({
          title: "Error",
          description: err?.message || "Could not start interview.",
          variant: "destructive",
        });
      }
    }
  };

  // Free and uncounted — only likes touch the daily cap. Persisted
  // server-side (discover_passes) so this person never comes back, the
  // same permanence a like already has via the matches table.
  const handlePass = () => {
    if (isActingRef.current) return;
    isActingRef.current = true;
    setIsActing(true);
    const passedProfile = currentProfile;
    handleNext(passedProfile.userId);
    discoverPass.mutate(passedProfile.userId);
  };

  const doBlock = async () => {
    if (!currentProfile?.userId) return;
    const blockedId = currentProfile.userId;
    setConfirm(null);
    try {
      await apiRequest("POST", `/api/users/block/${blockedId}`, {});
      toast({ title: "Blocked", description: "They won't appear in your feed anymore." });
      handleNext(blockedId);
    } catch {
      toast({ title: "Could not block", variant: "destructive" });
    }
  };

  const doReport = async () => {
    if (!currentProfile?.userId) return;
    const reportedId = currentProfile.userId;
    const reason = reportReason.trim();
    const evidence = reportPhotoId != null ? [{ type: "photo", id: reportPhotoId }] : undefined;
    setConfirm(null);
    setReportReason("");
    setReportPhotoId(null);
    try {
      await apiRequest("POST", `/api/users/${reportedId}/report`, { reason, evidence });
      toast({ title: "Report sent", description: "Our team will review it. They're now blocked too." });
      handleNext(reportedId);
    } catch {
      toast({ title: "Could not send report", variant: "destructive" });
    }
  };

  // Refuse before attempting when the daily cap is already reached — the sheet
  // says the number, the reset time, and the next tier. The server still
  // enforces on /api/likes. (The empty-deck block further up already stops
  // this from ever being reachable once the cap is hit, but this stays as
  // the same defense-in-depth the rest of the app uses.)
  const handleLike = () => {
    if (isActingRef.current) return;
    isActingRef.current = true;
    setIsActing(true);
    const likedProfile = currentProfile;
    paywall.guard("daily_likes", () => {
      // Optimistic: the card leaves the deck the instant the tap lands, like a
      // swipe — the actual like request finishes in the background.
      handleNext(likedProfile.userId);
      doLike(likedProfile);
    }).finally(() => {
      // Covers the path that never advances the deck (gate refused) — the
      // effect keyed on currentProfile's id already resets this pair once
      // handleNext runs above.
      isActingRef.current = false;
      setIsActing(false);
    });
  };

  const doLike = async (targetProfile: typeof currentProfile) => {
    try {
      await fetch("/api/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });
    } catch {
      // non-critical, continue with like
    }
    try {
      await createMatch.mutateAsync(targetProfile.userId);
      // The deck-stops-at-the-cap block above reads this same query — without
      // invalidating it, a like that lands exactly on the limit wouldn't lock
      // the deck until the gate's own 60s staleTime happened to expire.
      qc.invalidateQueries({ queryKey: ["/api/gate", "daily_likes"] });
      toast({
        title: "Liked!",
        description: `${targetProfile.displayName} will be notified.`,
      });
    } catch (err) {
      if (err instanceof Error && err.message?.includes("already exists")) {
        toast({ title: "Already Connected", description: "You already have a match request with this person." });
      } else if (err instanceof Error && err.message?.includes("upgradeRequired")) {
        paywall.guard("daily_likes", () => {});
      } else {
        toast({ title: "Could not like", description: "Something went wrong. Please try again.", variant: "destructive" });
      }
    }
  };

  // Everything the payload is allowed to carry for this person (server gates it
  // to public profiles + non-private answers).
  const galleryPhotos: GalleryPhoto[] = Array.isArray(currentProfile.photos) && currentProfile.photos.length > 0
    ? currentProfile.photos
    : currentProfile.coverPhotoUrl
      ? [{ url: currentProfile.coverPhotoUrl, w800: null, w1600: null, role: "cover", focalX: 0.5, focalY: 0.5 }]
      : [];
  const answers: { question: string; answer: string }[] = Array.isArray(currentProfile.answers)
    ? currentProfile.answers.slice(0, 2)
    : [];
  const interests: string[] = Array.isArray(currentProfile.interests) ? currentProfile.interests.slice(0, 6) : [];
  const aboutText: string = currentProfile.aboutMe || currentProfile.bio || "";

  const upcoming = profiles.slice(1, 3);

  return (
    <LayoutShell>
      {/* Grid/showcase surface, not a reading column — grows with the
          viewport instead of staying pinned at 768px regardless of screen
          size (that was the actual cause of the hero card looking squeezed
          on anything wider than a tablet, not the shell's own cap). */}
      <div className="max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint mb-2">
              {weekday} · one read ready
            </div>
            <h1 className="font-serif font-normal text-[clamp(28px,4vw,40px)] leading-[1.05] tracking-[-0.02em] text-vf-text">
              Discover
            </h1>
          </div>
          <div className="flex gap-2 flex-wrap" data-testid="filter-chips">
            <ScopePill active={filter === "nearby"} onToggle={() => setFilter(filter === "nearby" ? "all" : "nearby")} />
          </div>
        </div>

        <ReadinessStrip />
        <DisclosureIntroStrip />
        <ProfileCompletionStrip />

        <StoriesCarousel />

        <AnimatePresence mode="wait">
          <motion.div
            key={currentProfile.userId}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="relative rounded-[26px] border border-vf-line bg-vf-surface grid grid-cols-1 md:grid-cols-2 mb-4"
            data-testid="card-profile"
          >
            {/* Photo pane — clips its own corners (top on mobile where it
                stacks above the read pane, left on desktop where it sits
                beside it) rather than the card clipping both, so the
                resonance medallion below can sit right on the seam between
                them without being cut off by either pane's own overflow. */}
            <div className="relative min-h-[320px] md:min-h-[440px] rounded-t-[26px] md:rounded-t-none md:rounded-l-[26px] overflow-hidden">
              <CardGallery photos={galleryPhotos} initial={currentProfile.displayName?.[0] || "?"} />

              <div
                className="absolute inset-x-0 bottom-0 pointer-events-none bg-gradient-to-t from-vf-scrim to-transparent"
                style={{ height: "52%" }}
              />

              {nearby && (
                <div
                  className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-md border border-[#22C55E]/40"
                  style={{ background: "rgba(0,0,0,0.5)" }}
                  data-testid="badge-nearby-now"
                >
                  <div className="w-2 h-2 rounded-full" style={{ background: "#22C55E", boxShadow: "0 0 6px #22C55E" }} />
                  <span className="text-[11px] font-semibold" style={{ color: "#22C55E" }}>Nearby now</span>
                </div>
              )}

              {/* Sits on the photo itself (fixed rgba(0,0,0,.5) chip), not the
                  page — mint stays the fixed dark-mode shade here rather than
                  the theme-aware vf-mint, same reasoning as the scrim above. */}
              {isVeryClose && !nearby && (
                <div
                  className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-md"
                  style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(143,227,199,0.4)" }}
                  data-testid="badge-very-close"
                >
                  <MapPin className="w-3 h-3" style={{ color: "#8FE3C7" }} />
                  <span className="text-[11px] font-semibold" style={{ color: "#8FE3C7" }}>Under 1km</span>
                </div>
              )}

              {hasCardStories && (
                <button
                  onClick={() => handleViewCardStory(currentProfile)}
                  className="absolute top-3 left-3 w-11 h-11 rounded-full p-[2px] btn-press"
                  style={{ background: "hsl(var(--vf-ember))" }}
                  data-testid="card-story-ring"
                  aria-label={`View ${currentProfile.displayName || "their"} story`}
                >
                  <div className="w-full h-full rounded-full overflow-hidden bg-vf-surface2 flex items-center justify-center">
                    {currentProfile.coverPhotoUrl || currentProfile.user?.profileImageUrl ? (
                      <img
                        src={currentProfile.coverPhotoUrl || currentProfile.user?.profileImageUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="font-serif text-white/70 text-sm">
                        {currentProfile.displayName?.[0] || "?"}
                      </span>
                    )}
                  </div>
                </button>
              )}

              <div className="absolute left-6 right-6 bottom-5 pointer-events-none">
                <h2 className="font-serif font-normal text-white leading-none mb-1.5 flex items-center gap-2" style={{ fontSize: "34px" }} data-testid="text-profile-name">
                  <span>{currentProfile.displayName}{currentProfile.age ? `, ${currentProfile.age}` : ""}</span>
                  {currentProfile.isVerified && (
                    <span
                      title="Verified"
                      data-testid="badge-verified"
                      className="inline-flex items-center justify-center rounded-full shrink-0 border border-white/25"
                      style={{ width: 22, height: 22, background: "rgba(255,255,255,0.16)", backdropFilter: "blur(6px)" }}
                    >
                      <Check className="w-3 h-3" strokeWidth={3} style={{ color: "#F5F0EA" }} />
                    </span>
                  )}
                </h2>

                {(currentProfile.locationName || currentProfile.location) && (
                  <div className="flex items-center gap-1.5 text-[13.5px] text-[#CFC7DA] mb-1">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span data-testid="text-profile-location">
                      {currentProfile.locationName || currentProfile.location}
                      {currentProfile.showDistance !== false && distanceKm !== null ? ` · ${formatDistance(distanceKm)}` : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Read pane — the twin's read AND their own voice, not one or
                the other. Top padding is taller than the sides/bottom: the
                resonance medallion overlaps down into this pane from the
                seam (see below), and the extra clearance keeps its ring
                from colliding with the first line of text. */}
            <div className="relative px-6 pb-6 pt-14 md:px-8 md:pb-8 md:pt-32 rounded-b-[26px] md:rounded-b-none md:rounded-r-[26px] overflow-hidden flex flex-col gap-5 min-w-0">
              {resonance && (
                <>
                  <div className="min-w-0">
                    <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-muted">
                      resonance read
                    </div>
                    {aboutText && (
                      <p className="text-[15px] leading-relaxed text-vf-text mt-1.5 max-w-[330px]">{aboutText}</p>
                    )}
                  </div>
                  <ResonanceAxes axes={resonance.axes} />
                </>
              )}

              {answers.length > 0 ? (
                <div>
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-muted mb-2.5">
                    in their words
                  </div>
                  <div className="flex flex-col">
                    {answers.map((a, i) => (
                      <div
                        key={i}
                        className={`py-3.5 ${i > 0 ? "border-t border-vf-line" : ""}`}
                        data-testid={`profile-answer-${i}`}
                      >
                        <div className="text-[12.5px] font-mono uppercase tracking-[0.08em] text-vf-faint mb-1.5">{a.question}</div>
                        <p className="font-serif italic text-[21px] leading-[1.4] text-vf-text">"{a.answer}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                !resonance && (
                  <div>
                    <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-muted mb-2.5">
                      in their words
                    </div>
                    {aboutText ? (
                      <p className="font-serif italic text-[21px] leading-[1.4] text-vf-text">"{aboutText}"</p>
                    ) : (
                      <p className="text-[15px] leading-relaxed text-vf-muted">Nothing shared yet.</p>
                    )}
                  </div>
                )
              )}

              {resonance && answers.length > 0 && aboutText && (
                <p className="text-[15px] leading-relaxed text-vf-muted">{aboutText}</p>
              )}

              {interests.length > 0 && (
                <div className="flex flex-wrap gap-2" data-testid="profile-interests">
                  {interests.map((tag) => (
                    <span
                      key={tag}
                      className="border border-vf-line rounded-full px-[15px] py-2 text-[13px] text-vf-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <button
                onClick={() => setLocation(`/u/${currentProfile.userId}`)}
                className="self-start inline-flex items-center gap-1.5 text-[13px] text-vf-text hover:text-vf-ember transition-colors"
                data-testid="link-full-profile"
              >
                Full profile <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <div className="flex gap-2.5 flex-wrap mt-auto pt-2">
                <button
                  onClick={handlePass}
                  disabled={isActing}
                  className="flex items-center justify-center w-12 h-12 rounded-full border border-vf-text/14 text-vf-faint hover:text-vf-text hover:border-vf-text/25 transition-colors btn-press shrink-0 disabled:opacity-50"
                  data-testid="button-pass"
                  aria-label="Pass"
                >
                  <X className="w-5 h-5" />
                </button>
                <button
                  onClick={handleInterview}
                  disabled={startInterview.isPending}
                  className="flex-1 min-w-[160px] flex items-center justify-center gap-2 h-12 rounded-full border border-vf-mint/35 bg-vf-mint/10 text-vf-mint font-medium text-[14px] transition-colors hover:bg-vf-mint/15 btn-press"
                  data-testid="button-interview"
                >
                  {startInterview.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                  Interview Twin
                </button>
                <button
                  onClick={handleLike}
                  disabled={isActing || createMatch.isPending}
                  className="flex items-center justify-center w-12 h-12 rounded-full shrink-0 font-semibold btn-press transition-colors bg-vf-ember text-vf-ink hover:bg-[var(--vf-ember-soft)] disabled:opacity-50"
                  data-testid="button-like"
                  aria-label="Like"
                >
                  {createMatch.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Heart className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Resonance medallion — a wax seal pinned to the seam between
                the two panes, not tucked inside either one. It lives here,
                a sibling of both panes inside the (non-clipping) card
                shell, specifically so it can overlap both without being
                cut off by either pane's own overflow-hidden. The seam
                itself changes axis with the layout: on mobile the panes
                stack, so the seam is the horizontal line where the photo
                ends; at md+ they sit side by side, so the seam becomes the
                vertical line between them — the medallion's position
                switches with it via the md: variants below, rather than
                trying to make one placement work for both. */}
            {resonance && (
              <div
                className="absolute z-30 left-6 top-[270px] md:left-1/2 md:top-5 md:-translate-x-1/2"
                style={{ filter: "drop-shadow(0 10px 22px rgba(12,9,16,.35))" }}
                data-testid="resonance-medallion"
              >
                <div
                  className="rounded-full"
                  style={{ padding: 4, background: "var(--vf-surface)" }}
                >
                  <ResonanceDial score={resonance.score} size={92} />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-between px-1 mb-8">
          <p className="text-xs text-vf-faint">
            {eligibleForFilter.length - profiles.length + 1} of {eligibleForFilter.length} profiles
          </p>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setConfirm("block")}
              className="text-xs text-vf-faint hover:text-vf-text transition-colors"
              data-testid="button-block-user"
            >
              Block
            </button>
            <button
              onClick={() => setConfirm("report")}
              className="text-xs text-vf-faint hover:text-vf-text transition-colors inline-flex items-center gap-1"
              data-testid="button-report-user"
            >
              <Flag className="w-3 h-3" /> Report
            </button>
          </div>
        </div>

        {upcoming.length > 0 && (
          <div>
            <div className="flex items-baseline justify-between gap-4 mb-4">
              <h2 className="font-serif font-normal text-[22px] text-vf-text">Next up</h2>
            </div>
            <div className="flex flex-wrap items-start gap-5 mb-10">
              {/* A loosely fanned hand of cards, not a grid — this is a
                  queue you're being teased with one glimpse at a time, so it
                  should look like a stack you could riffle through, not a
                  list you scan. The first (next) card sits upright and on
                  top; each one behind it tilts a little further and steps
                  right, the way a hand of cards actually overlaps. */}
              <div
                className="relative shrink-0"
                style={{ width: 132 + (upcoming.length - 1) * 34, height: 196 }}
                data-testid="fan-upcoming"
              >
                {upcoming.map((p: any, i: number) => {
                  const r = getResonance(p.personalityProfile);
                  const rotateDeg = [0, -6, 5][i % 3];
                  const topOffset = [0, 12, 4][i % 3];
                  const CARD_WIDTH = 132;
                  const STEP = 34;
                  // Each card after the first is mostly covered by the one
                  // in front of it (higher z-index, same width, offset by
                  // only STEP px) — so its real on-screen clickable area is
                  // just the STEP-px sliver poking out on the right, not
                  // its full width. A button sized to the full card here
                  // used to eat clicks meant for whichever card is actually
                  // on top there, so tapping "the second card" mostly just
                  // re-selected the first one — which is exactly what made
                  // the deck look stuck between two or three people.
                  const hitLeft = i === 0 ? 0 : i * STEP + (CARD_WIDTH - STEP);
                  const hitWidth = i === 0 ? CARD_WIDTH : STEP;
                  const handlePin = () => {
                    if (isActingRef.current) return;
                    const pinnedId = p.userId;
                    setDeckOrder((prev) => {
                      const idx = prev.indexOf(pinnedId);
                      if (idx <= 0) return prev;
                      const rest = prev.slice();
                      const [pinned] = rest.splice(idx, 1);
                      // The old front card doesn't just fall back to slot
                      // one (right back into "Next up") — it goes to the
                      // end of the line, so the viewer actually works
                      // through everyone else before it's up again, instead
                      // of two or three people trading the front spot
                      // forever.
                      const [oldFront] = rest.splice(0, 1);
                      return oldFront ? [pinned, ...rest, oldFront] : [pinned, ...rest];
                    });
                  };
                  return (
                    <div
                      key={p.userId}
                      className="absolute rounded-[18px] border border-vf-line bg-vf-surface2 overflow-hidden pointer-events-none"
                      style={{
                        left: i * STEP,
                        top: topOffset,
                        width: CARD_WIDTH,
                        height: 168,
                        transform: `rotate(${rotateDeg}deg)`,
                        zIndex: upcoming.length - i,
                        boxShadow: "0 10px 24px rgba(12,9,16,.22), 0 0 0 3px var(--vf-surface)",
                      }}
                      data-testid={`card-upcoming-${p.userId}`}
                    >
                      {p.coverPhotoUrl ? (
                        <img src={p.coverPhotoUrl} alt={p.displayName} className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="font-serif text-vf-text/20 text-5xl">{p.displayName?.[0] || "?"}</span>
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-vf-scrim to-transparent pointer-events-none" />
                      <div className="absolute left-3 right-3 bottom-2.5">
                        <div className="font-serif text-[17px] leading-none" style={{ color: "#F5F0EA" }}>
                          {p.displayName}{p.age ? `, ${p.age}` : ""}
                        </div>
                        {r && (
                          <div className="font-mono text-[10.5px] mt-1.5" style={{ color: "#8FE3C7" }}>resonance {r.score}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handlePin}
                        className="absolute btn-press cursor-pointer pointer-events-auto"
                        style={{ left: hitLeft - i * STEP, top: 0, width: hitWidth, height: 168 }}
                        aria-label={`Bring ${p.displayName || "this person"} to the front`}
                      />
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => setLocation("/plans")}
                className="text-left rounded-[20px] border border-dashed border-vf-gold/35 bg-vf-gold/5 p-4 flex flex-col justify-center gap-2 hover:bg-vf-gold/[0.08] transition-colors flex-1 min-w-[220px]"
                data-testid="card-upgrade-teaser"
                style={{ height: 196 }}
              >
                <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-gold">plans</div>
                <div className="text-[14px] leading-relaxed text-vf-text">
                  Free gives you {LIMITS.free.dailyLikes} reads a day. A paid step means more room, and you can see who asked to meet you.
                </div>
                <span className="inline-flex items-center gap-1.5 text-[13px] text-vf-gold mt-0.5">
                  See plans <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {viewingCardMeta && viewingCardStories && viewingCardStories.length > 0 && (
        <StoryViewer
          stories={viewingCardStories}
          initialIndex={0}
          onClose={() => setViewingCardMeta(null)}
          userName={viewingCardMeta.displayName}
          profileImageUrl={viewingCardMeta.photoUrl}
          onInterviewTwin={async () => {
            try {
              const interview = await startInterview.mutateAsync(viewingCardMeta.userId);
              setViewingCardMeta(null);
              setLocation(`/interviews/${interview.id}/chat?from=/discover`);
            } catch (err: any) {
              if (err instanceof UpgradeRequiredError) {
                setViewingCardMeta(null);
                setLocation("/plans?feature=start_interview");
              } else {
                toast({ title: "Could not start interview", description: err?.message, variant: "destructive" });
              }
            }
          }}
        />
      )}

      {confirm && (
        <div
          className="fixed inset-0 flex items-center justify-center z-[100] p-4"
          style={{ background: "rgba(8,6,11,.82)", backdropFilter: "blur(14px)" }}
          onClick={() => { setConfirm(null); setReportReason(""); setReportPhotoId(null); }}
        >
          <div
            className="w-full max-w-[400px] rounded-[20px] border border-vf-line bg-vf-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-serif font-normal text-[20px] text-vf-text mb-1.5">
              {confirm === "block" ? `Block ${currentProfile.displayName || "this person"}?` : `Report ${currentProfile.displayName || "this person"}?`}
            </h2>
            <p className="text-[13.5px] leading-relaxed text-vf-muted mb-4">
              {confirm === "block"
                ? "They won't see you in Discover and you won't see them. You can undo this in Settings."
                : "This sends a record to our team for review. It also blocks them."}
            </p>
            {confirm === "report" && (
              <>
                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="What's going on? (optional)"
                  rows={3}
                  className="w-full mb-3 rounded-[12px] bg-vf-surface2 border border-vf-line p-3 text-[14px] text-vf-text placeholder:text-vf-faint resize-none outline-none focus:border-vf-text/25"
                  data-testid="input-report-reason"
                />
                {galleryPhotos.some((p) => p.id != null) && (
                  <div className="mb-4">
                    <p className="text-[12px] text-vf-faint mb-2">Is it a specific photo? (optional)</p>
                    <div className="flex gap-2 flex-wrap">
                      {galleryPhotos.filter((p) => p.id != null).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setReportPhotoId(reportPhotoId === p.id ? null : p.id!)}
                          className="w-14 h-14 rounded-[10px] overflow-hidden shrink-0"
                          style={{
                            outline: reportPhotoId === p.id ? "2px solid hsl(var(--vf-ember))" : "2px solid transparent",
                            outlineOffset: "2px",
                          }}
                          data-testid={`button-report-photo-${p.id}`}
                        >
                          <img src={p.w800 || p.url} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="flex gap-2.5">
              <button
                onClick={() => { setConfirm(null); setReportReason(""); setReportPhotoId(null); }}
                className="flex-1 h-11 rounded-full border border-vf-text/14 text-[14px] text-vf-muted hover:text-vf-text transition-colors"
                data-testid="button-confirm-cancel"
              >
                Cancel
              </button>
              <button
                onClick={confirm === "block" ? doBlock : doReport}
                className="flex-1 h-11 rounded-full text-[14px] font-semibold bg-vf-ember text-vf-ink hover:bg-[var(--vf-ember-soft)] transition-colors"
                data-testid="button-confirm-action"
              >
                {confirm === "block" ? "Block" : "Send report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {paywall.sheet}
    </LayoutShell>
  );
}
