import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { FirstDayChip } from "@/components/first-day-card";
import { MatchCelebration } from "@/components/match-celebration";
import { DecisionDock } from "@/components/decision-dock";
import { TonightsThree } from "@/components/tonights-three";
import { TonightSeatStrip } from "@/components/seat-ticket";
import { useMySeats } from "@/hooks/use-events";
import { InstallCard } from "@/components/install-card";
import { requestPushNudge } from "@/lib/engagement-prompts";
import { TwinOrbButton } from "@/components/twin-orb";
import { WhyYouMightClick, type ClickReason } from "@/components/why-click";
import { LocationAskSheet, hasLocationConsent } from "@/components/location-permission-modal";
import { Brain, X, Loader2, MapPin, Heart, Plus, Check, ArrowRight, ChevronLeft, ChevronRight, Flag, Maximize2 } from "lucide-react";
import { useDiscoverProfiles, useDiscoverExpandOptions, useStartInterview, useCreateMatch, useFeedStories, useProfileCompletion, UpgradeRequiredError, LikeWaitingError } from "@/hooks/use-interactions";
import { useTwinReadiness } from "@/hooks/use-onboarding";
import { ScreenNotes, NOTE_PRIORITY, type NoteSpec, EmptyState, VfButton } from "@/components/ui-vf";
import { haptic } from "@/lib/haptics";
import { LIMITS, gateCopy } from "@shared/entitlements";
import { usePaywall } from "@/hooks/use-paywall";
import { useGate, resetLabel } from "@/hooks/use-gate";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { StoryViewer, OwnStoryViewer, AddStoryButton } from "@/components/story-viewer";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { avatarColor } from "@/lib/avatar-color";
import { withFrom } from "@/lib/from-route";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profiles";
import { recordPass, sendWaitingDecisions, undoPass as takeBackPass, useDecidedIds } from "@/lib/discover-decisions";
import type { User } from "@shared/models/auth";

function formatDistance(km: number): string {
  if (km < 1) return "Less than 1km away";
  if (km >= 100) return `${Math.round(km)}km away`;
  return `${km.toFixed(1)}km away`;
}

// There is no resonance score. The old dial averaged a profile's own trait
// numbers (only demo profiles had any) and called it compatibility; that's a
// guess dressed as a fact. The card says why two people might click instead,
// from things that are true (server/click-reasons.ts).

/** "Good evening", by the member's own clock. */
function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
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
function CardGallery({ photos, initial, seed }: { photos: GalleryPhoto[]; initial: string; seed?: string }) {
  const [idx, setIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
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
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: avatarColor(seed) }}>
        <span className="font-serif text-white/90" style={{ fontSize: "96px" }}>
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

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setLightboxOpen(true); }}
        aria-label="View full photo"
        className="absolute bottom-3 left-3 z-20 w-8 h-8 rounded-full flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
        data-testid="button-expand-photo"
      >
        <Maximize2 className="w-3.5 h-3.5 text-white" />
      </button>

      {lightboxOpen && (
        <PhotoLightbox
          photos={photos.map((ph) => ({ url: ph.w1600 ?? ph.url }))}
          initialIndex={idx}
          onClose={() => setLightboxOpen(false)}
        />
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
    const byUser: Record<string, { userId: string; displayName: string; photoUrl: string; isOfficial: boolean; stories: any[] }> = {};
    stories.forEach((s: any) => {
      if (!byUser[s.userId]) {
        byUser[s.userId] = { userId: s.userId, displayName: s.displayName || "User", photoUrl: s.photoUrl || "", isOfficial: !!s.isOfficial, stories: [] };
      }
      byUser[s.userId].stories.push(s);
    });
    // Destira's own posts play in the order they went out through the day.
    for (const g of Object.values(byUser)) {
      if (g.isOfficial) g.stories.sort((a: any, b: any) => String(a.publishAt).localeCompare(String(b.publishAt)));
    }
    const groups = Object.values(byUser);
    // Anyone with at least one story you haven't opened yet sorts to the
    // front (in the server's newest-first order among themselves); everyone
    // whose stories are all already viewed rotates to the back, in that same
    // relative order. A stable sort (guaranteed by the spec since ES2019)
    // makes this a clean partition rather than a real re-sort.
    const hasUnviewed = (g: { stories: any[] }) => g.stories.some((s) => !s.viewedByMe);
    const sorted = [...groups].sort((a, b) => (hasUnviewed(b) ? 1 : 0) - (hasUnviewed(a) ? 1 : 0));
    // The official Destira status always leads the row.
    return [...sorted.filter((g) => g.isOfficial), ...sorted.filter((g) => !g.isOfficial)];
  }, [stories]);

  const viewingGroup = viewingUserId ? grouped.find((g) => g.userId === viewingUserId) || null : null;

  const STORY_SIZE = 72;

  // Only when there's something new to watch (docs/destira-upgrade-prompt.md
  // §7.4): a row of rings you've already seen just pushes the person down.
  // Adding your own story lives on Profile too. Stays up while a story is
  // open, so watching the last new one doesn't pull the viewer out from
  // under you.
  const anyUnseen = grouped.some((g) => g.stories.some((s: any) => !s.viewedByMe));
  const busy = !!viewingUserId || showOwnStoryViewer || showStoryCreator;
  const [shownOnce, setShownOnce] = useState(false);
  useEffect(() => { if (anyUnseen) setShownOnce(true); }, [anyUnseen]);
  if (!anyUnseen && !busy && !shownOnce) return null;

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-hide" data-testid="stories-carousel">
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
                maxWidth: `${STORY_SIZE}px`,
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
            <span
              className="inline-flex items-center gap-1"
              style={{ fontSize: "11px", color: u.isOfficial ? "hsl(var(--vf-text))" : "var(--vf-muted)", fontWeight: u.isOfficial ? 600 : undefined, maxWidth: `${STORY_SIZE}px`, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {u.displayName.split(" ")[0]}
              {u.isOfficial && (
                <span
                  className="inline-flex items-center justify-center w-3 h-3 rounded-full shrink-0"
                  style={{ background: "#FF6B4A" }}
                  aria-label="Official"
                >
                  <Check className="w-2 h-2" style={{ color: "#0C0910" }} strokeWidth={4} />
                </span>
              )}
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
function DiscoverTopBar({ filter, onScope, name }: { filter: FilterChip; onScope: () => void; name: string | null }) {
  const now = new Date();
  const date = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const { data: seats } = useMySeats();
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
function BackToEveryone({ onBack }: { onBack: () => void }) {
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

/** Discover's notes (docs/destira-upgrade-prompt.md §5.4): one at a time,
 *  below the deck, never above a person. Same server-side dismissals and the
 *  same conditions the three separate strips used to have. */
function DiscoverNotes() {
  const [, navigate] = useLocation();
  const { data: r } = useTwinReadiness();
  const { data: completion } = useProfileCompletion();
  const nextTask = completion?.tasks.find((t: { completed: boolean }) => !t.completed);
  const notes: NoteSpec[] = [
    {
      kind: "twin_disclosure_intro",
      priority: NOTE_PRIORITY.safety,
      tone: "twin",
      eyebrow: "Your twin",
      body: "Your twin talks to people who are deciding about you. You choose what it may say.",
      action: { label: "Set the boundaries", onClick: () => navigate("/twin-disclosure"), testId: "link-disclosure-intro" },
      testId: "strip-disclosure-intro",
    },
    {
      kind: "discover_readiness_strip",
      priority: NOTE_PRIORITY.setup,
      when: !!r && !r.discoverStripDismissed && r.pct < 50,
      tone: "twin",
      eyebrow: "Your twin",
      body: r
        ? `I'm answering interviews with ${r.answeredCount === 1 ? "one answer" : `${r.answeredCount} answers`} to work from. A few more and I can speak for you properly.`
        : null,
      action: { label: "Answer a few more", onClick: () => navigate("/onboarding"), testId: "link-readiness-strip" },
      testId: "strip-readiness",
    },
    {
      kind: "profile_completion_nudge",
      priority: NOTE_PRIORITY.tip,
      when: !!completion && completion.score < 80,
      eyebrow: `Profile ${completion?.score ?? 0}%`,
      body: (
        <>
          A complete profile gets more likes and shows up more
          {nextTask ? <>: {nextTask.benefit.toLowerCase()}.</> : "."}
        </>
      ),
      action: { label: "Finish your profile", onClick: () => navigate("/profile"), testId: "link-profile-completion" },
      testId: "strip-profile-completion",
    },
  ];
  return <ScreenNotes notes={notes} />;
}

// Shown once someone's evaluated everyone their current distance/age
// preferences allow — offers to widen either, with a real count of how many
// more people that would actually surface, so it's never a blind "try
// widening" guess. Applies through the same POST /api/settings/discovery
// Settings already uses, so this is just another entry point into the one
// real preference-update path, not a parallel one.
function ExpandSearchOptions({ userLat, userLng }: { userLat: number | null; userLng: number | null }) {
  const { data, isLoading } = useDiscoverExpandOptions(true, userLat, userLng);
  const qc = useQueryClient();
  const { toast } = useToast();
  const apply = useMutation({
    mutationFn: (body: Record<string, number>) => apiRequest("POST", "/api/settings/discovery", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      qc.invalidateQueries({ queryKey: ["/api/profiles/discover"] });
      qc.invalidateQueries({ queryKey: ["/api/profiles/discover/expand-options"] });
      toast({ title: "Search widened" });
    },
    onError: () => toast({ title: "Couldn't update that", variant: "destructive" }),
  });

  if (isLoading || !data || (!data.distance && !data.age)) return null;

  return (
    <div className="mt-6 pt-6 border-t border-vf-line flex flex-col gap-3">
      <p className="text-[13px] text-vf-muted">Nobody left within your current preferences. Want to see more?</p>
      <div className="flex flex-col gap-2">
        {data.distance?.options.map((o) => (
          <button
            key={`distance-${o.km}`}
            onClick={() => apply.mutate({ maxDistanceKm: o.km })}
            disabled={apply.isPending}
            className="h-11 rounded-full border border-vf-line text-[13.5px] text-vf-text hover:border-vf-text/25 transition-colors disabled:opacity-50"
            data-testid={`button-expand-distance-${o.km}`}
          >
            Extend to {o.km}km away <span className="text-vf-muted">(+{o.additionalCount})</span>
          </button>
        ))}
        {data.age?.options.map((o) => (
          <button
            key={`age-${o.min}-${o.max}`}
            onClick={() => apply.mutate({ ageMinPreference: o.min, ageMaxPreference: o.max })}
            disabled={apply.isPending}
            className="h-11 rounded-full border border-vf-line text-[13.5px] text-vf-text hover:border-vf-text/25 transition-colors disabled:opacity-50"
            data-testid={`button-expand-age-${o.min}-${o.max}`}
          >
            Widen age range to {o.min}–{o.max} <span className="text-vf-muted">(+{o.additionalCount})</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Discover() {
  // Anyone liked or passed leaves the deck the instant you act, and stays out:
  // the device remembers the decision (lib/discover-decisions) until the
  // server has it, and the server excludes them for good after that (a
  // `matches` row for a like, `discover_passes` for a pass). dismissedIds
  // holds what only needs to last while the deck is open, such as a block.
  const { user: me } = useAuth();
  const decidedIds = useDecidedIds(me?.id);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const evaluatedIds = useMemo(() => new Set([...decidedIds, ...dismissedIds]), [decidedIds, dismissedIds]);
  useEffect(() => {
    if (me?.id) void sendWaitingDecisions();
  }, [me?.id]);
  const [filter, setFilterState] = useState<FilterChip>(getInitialFilter);
  // Mirrors the scope into the URL (replace, not push), so coming back from a
  // full profile — which links back with ?from= — lands on the same deck.
  const setFilter = useCallback((f: FilterChip) => {
    setFilterState(f);
    try {
      window.history.replaceState(window.history.state, "", f === "nearby" ? "/discover?filter=nearby" : "/discover");
    } catch {}
  }, []);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [askLocation, setAskLocation] = useState(false);
  const locate = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserLat(pos.coords.latitude); setUserLng(pos.coords.longitude); },
      () => {},
      { timeout: 5000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);
  // Location is asked here, when "Within 20 km" needs it (§8.2), never on
  // arrival.
  const toggleScope = useCallback(() => {
    if (filter === "nearby") return setFilter("all");
    if (!hasLocationConsent()) return setAskLocation(true);
    setFilter("nearby");
  }, [filter, setFilter]);
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
  // Which way the current card leaves: left for a pass, right for a like.
  const [exitDir, setExitDir] = useState<"left" | "right" | null>(null);
  // The last pass, offered back for a few seconds (free, like it should be).
  const [undoPass, setUndoPass] = useState<{ userId: string; name: string } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keyboard shortcuts read the latest handlers through this; it's reset to
  // null every render and only filled in when a card is actually showing.
  const keyActionsRef = useRef<{ pass: () => void; like: () => void; interview: () => void; undo: () => void } | null>(null);
  keyActionsRef.current = null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = keyActionsRef.current;
      if (!a || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      // Never while typing, and never under an open dialog or sheet.
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      const k = e.key.toLowerCase();
      if (k === "arrowleft") { e.preventDefault(); a.pass(); }
      else if (k === "arrowright") { e.preventDefault(); a.like(); }
      else if (k === "i") a.interview();
      else if (k === "z") a.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); }, []);
  // The actual browsing order, as a list of ids — not re-derived from
  // scratch each render. Tapping a "Next up" card must permanently rotate
  // the previous front card out of the immediate preview window (otherwise
  // it lands right back in the next-up slice and two or three people just
  // trade places forever instead of the viewer ever reaching the rest of
  // the deck — this was the actual bug, not the backend candidate list).
  const [deckOrder, setDeckOrder] = useState<string[]>([]);
  const { data: rawProfiles, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useDiscoverProfiles(filter, userLat, userLng);
  const { data: feedStories } = useFeedStories();
  const startInterview = useStartInterview();
  const createMatch = useCreateMatch();
  // Set when a like lands on someone who'd already liked you — the server
  // turns it straight into a match (see POST /api/matches).
  const [celebrating, setCelebrating] = useState<{ matchId: number; otherUserId: string; name: string; photoUrl: string | null } | null>(null);
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
    setFilterState(params.get("filter") === "nearby" ? "nearby" : "all");
  }, [woLocation]);

  useEffect(() => {
    if (hasLocationConsent()) locate();
  }, [locate]);

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
  //
  // "Within 20km" sorts by distance HERE, once, as candidates join the deck —
  // never on every render. Re-sorting the rendered list each time used to
  // snap the nearest person straight back to the front, so tapping a "Next
  // up" card in nearby mode did nothing. A filter change starts a fresh order.
  const deckFilterRef = useRef(filter);
  useEffect(() => {
    let available: any[] = eligibleForFilter.filter((p: any) => !evaluatedIds.has(p.userId));
    if (filter === "nearby") {
      available = [...available].sort((a: any, b: any) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }
    const availableIds: string[] = available.map((p: any) => p.userId as string);
    const availableSet = new Set(availableIds);
    const filterChanged = deckFilterRef.current !== filter;
    deckFilterRef.current = filter;
    setDeckOrder((prev) => {
      const kept = (filterChanged ? [] : prev).filter((id) => availableSet.has(id));
      const keptSet = new Set(kept);
      const added = availableIds.filter((id) => !keptSet.has(id));
      const next = [...kept, ...added];
      const unchanged = next.length === prev.length && next.every((id, i) => id === prev[i]);
      return unchanged ? prev : next;
    });
  }, [eligibleForFilter, evaluatedIds, filter]);

  const profiles = useMemo(() => {
    const byId = new Map<string, any>(eligibleForFilter.map((p: any) => [p.userId as string, p]));
    return deckOrder.map((id) => byId.get(id)).filter((p): p is any => !!p);
  }, [eligibleForFilter, deckOrder]);

  // Always the front of the deck — evaluating a profile removes it from
  // `profiles` above (via evaluatedIds), so there's no index to advance,
  // just a new [0] once the set changes.
  const currentProfile = profiles[0];

  // The server now sends the deck a page at a time (see useDiscoverProfiles)
  // instead of every eligible profile in one shot — so the deck needs to ask
  // for more before it actually runs dry. 5 is comfortably more than the
  // current card + the 2 "next up" previews the UI ever shows at once, so
  // this fires well before someone could out-swipe what's loaded.
  useEffect(() => {
    if (profiles.length <= 5 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [profiles.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

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

  const myFirstName = ((ownProfile as any)?.displayName || (me as any)?.firstName || "").trim().split(/\s+/)[0] || null;
  const topBar = <DiscoverTopBar filter={filter} onScope={toggleScope} name={myFirstName} />;
  const locationSheet = (
    <LocationAskSheet
      open={askLocation}
      onOpenChange={setAskLocation}
      onEnabled={() => { locate(); setFilter("nearby"); }}
    />
  );

  // Likes are the metric, not passes — free tier gets 30/day (80 Spark, 200
  // Flame, unlimited Ember). The moment that's used up, the deck itself
  // stops, not just the Like button: there's no point browsing further
  // today if nothing you tap can turn into a like. Passing stays free and
  // never trips this.
  const celebration = celebrating && (
    <MatchCelebration
      matchId={celebrating.matchId}
      otherUserId={celebrating.otherUserId}
      otherName={celebrating.name}
      otherPhotoUrl={celebrating.photoUrl}
      onClose={() => setCelebrating(null)}
    />
  );

  if (likesGate && !likesGate.ok) {
    const copy = gateCopy("daily_likes", {
      tier: likesGate.tier as any,
      limit: likesGate.limit,
      used: likesGate.used,
      resetLabel: resetLabel(likesGate.resetAt),
    });
    return (
      <LayoutShell>
        <div className="max-w-[640px] mx-auto">
          {topBar}
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
                  onClick={() => setLocation(withFrom(`/plans?feature=daily_likes`, "/discover"))}
                  data-testid="button-discover-likes-upgrade"
                >
                  {likesGate.requiredTierName || copy.requiredTierName ? `See ${likesGate.requiredTierName || copy.requiredTierName}` : "See plans"}
                </VfButton>
              }
            />
          </div>
        </div>
        {locationSheet}
        {celebration}
      </LayoutShell>
    );
  }

  if (!profiles || profiles.length === 0) {
    return (
      <LayoutShell>
        <div className="max-w-[640px] mx-auto">
          {filter === "nearby" && <BackToEveryone onBack={() => setFilter("all")} />}
          {topBar}
          <div className="rounded-[24px] border border-vf-line bg-vf-surface" data-testid="discover-empty">
            <EmptyState
              title={filter === "nearby" ? "Nobody within 20 km right now." : evaluatedIds.size > 0 ? "That's everyone for now." : "No one here yet."}
              body={
                filter === "nearby"
                  ? "See everyone instead, or look again later when people are around."
                  : evaluatedIds.size > 0
                    ? "You've seen everyone who fits right now. New people join every day."
                    : "New people join every day. Finish your profile so they find you too."
              }
              action={
                filter !== "all" ? (
                  <VfButton variant="secondary" onClick={() => setFilter("all")}>See everyone</VfButton>
                ) : undefined
              }
            />
            {filter === "all" && (
              <div className="px-6 pb-8 -mt-4">
                <ExpandSearchOptions userLat={userLat} userLng={userLng} />
              </div>
            )}
          </div>
          <div className="mt-8 space-y-4">
            <DiscoverNotes />
          </div>
        </div>
        {locationSheet}
        {celebration}
      </LayoutShell>
    );
  }

  const distanceKm: number | null = currentProfile.distanceKm ?? null;
  const nearby: boolean = currentProfile.isNearbyNow ?? false;
  const isVeryClose = distanceKm !== null && distanceKm < 1;
  const cardStories = storiesByUserId[currentProfile.userId] || [];
  const hasCardStories = cardStories.length > 0;
  const reasons: ClickReason[] = Array.isArray(currentProfile.reasons) ? currentProfile.reasons : [];

  // The only way a card leaves the deck: mark it evaluated so the `profiles`
  // memo drops it and [0] becomes whoever's next. No index to advance.
  const handleNext = (evaluatedUserId: string) => {
    setDismissedIds((prev) => new Set(prev).add(evaluatedUserId));
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
        setLocation(withFrom("/plans?feature=start_interview", "/discover"));
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
    setExitDir("left");
    haptic.pass();
    handleNext(passedProfile.userId);
    recordPass(passedProfile.userId);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoPass({ userId: passedProfile.userId, name: passedProfile.displayName || "them" });
    undoTimerRef.current = setTimeout(() => setUndoPass(null), 6000);
  };

  // Brings the last passed card back to the front and forgets the pass.
  const handleUndoPass = () => {
    if (!undoPass) return;
    const { userId } = undoPass;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoPass(null);
    setExitDir(null);
    setDismissedIds((prev) => { const next = new Set(prev); next.delete(userId); return next; });
    // Back to the front of the deck, not the end of the line.
    setDeckOrder((prev) => [userId, ...prev.filter((id) => id !== userId)]);
    takeBackPass(userId);
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
      setExitDir("right");
      haptic.like();
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndoPass(null);
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
      const result = await createMatch.mutateAsync(targetProfile.userId);
      // The deck-stops-at-the-cap block above reads this same query — without
      // invalidating it, a like that lands exactly on the limit wouldn't lock
      // the deck until the gate's own 60s staleTime happened to expire.
      qc.invalidateQueries({ queryKey: ["/api/gate", "daily_likes"] });
      requestPushNudge("like");
      if (result?.mutual) {
        setCelebrating({
          matchId: result.id,
          otherUserId: targetProfile.userId,
          name: targetProfile.displayName,
          photoUrl: targetProfile.coverPhotoUrl ?? null,
        });
        return;
      }
      toast({
        title: "Liked!",
        description: `${targetProfile.displayName} will be notified.`,
      });
    } catch (err) {
      if (err instanceof LikeWaitingError) {
        // Saved on the device and sent when the connection is back, so the
        // card stays gone: the like counts, it just hasn't arrived yet.
        toast({ title: "Like saved", description: err.message });
      } else if (err instanceof Error && err.message?.includes("already exists")) {
        toast({ title: "Already Connected", description: "You already have a match request with this person." });
      } else if (err instanceof UpgradeRequiredError) {
        // The like didn't actually happen — bring the card back rather than
        // leaving it removed from the deck until the next reload. The gate is
        // re-read first: the cached copy is what let this tap through.
        setDismissedIds((prev) => { const next = new Set(prev); next.delete(targetProfile.userId); return next; });
        await qc.invalidateQueries({ queryKey: ["/api/gate", "daily_likes"] });
        paywall.guard("daily_likes", () => {});
      } else {
        // Same reasoning — a like the server refused shouldn't silently vanish
        // the profile from the deck for the rest of the session.
        setDismissedIds((prev) => { const next = new Set(prev); next.delete(targetProfile.userId); return next; });
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

  const upcoming = profiles.slice(1, 4);
  keyActionsRef.current = { pass: handlePass, like: handleLike, interview: handleInterview, undo: handleUndoPass };

  return (
    <LayoutShell>
      <div className="max-w-[640px] md:max-w-3xl lg:max-w-5xl mx-auto">
        {filter === "nearby" && <BackToEveryone onBack={() => setFilter("all")} />}
        {topBar}

        {/* The card and its action bar share a box, so the bar only rides the
            bottom of the screen while the card is on it. */}
        <div className="relative">
        <AnimatePresence mode="wait" custom={exitDir}>
          <motion.div
            key={currentProfile.userId}
            custom={exitDir}
            variants={{
              enter: { opacity: 0, y: 10 },
              show: { opacity: 1, y: 0, x: 0, rotate: 0 },
              leave: (dir: "left" | "right" | null) => ({
                opacity: 0,
                x: dir === "left" ? -140 : dir === "right" ? 140 : 0,
                rotate: dir === "left" ? -3 : dir === "right" ? 3 : 0,
              }),
            }}
            initial="enter"
            animate="show"
            exit="leave"
            transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            className="relative rounded-[26px] border border-vf-line bg-vf-surface vf-e2 grid grid-cols-1 md:grid-cols-2 mb-4 overflow-hidden"
            data-testid="card-profile"
          >
            {/* The person first: on a phone the photo fills most of the
                screen before anything else (§7.4). */}
            <div className="relative h-[clamp(380px,calc(100svh-330px),620px)] md:h-auto md:min-h-[min(74vh,660px)] overflow-hidden">
              <CardGallery photos={galleryPhotos} initial={currentProfile.displayName?.[0] || "?"} seed={currentProfile.userId} />

              <div
                className="absolute inset-x-0 bottom-0 pointer-events-none bg-gradient-to-t from-vf-scrim to-transparent"
                style={{ height: "62%" }}
              />

              {/* Badges sit on the photo, so their colours stay the fixed
                  dark-mode shades whatever the theme. */}
              {nearby && (
                <div
                  className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-md"
                  style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(185,216,110,0.4)" }}
                  data-testid="badge-nearby-now"
                >
                  <div className="w-2 h-2 rounded-full" style={{ background: "#B9D86E", boxShadow: "0 0 6px #B9D86E" }} />
                  <span className="text-[11px] font-semibold" style={{ color: "#B9D86E" }}>Nearby now</span>
                </div>
              )}
              {isVeryClose && !nearby && (
                <div
                  className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-md"
                  style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(143,227,199,0.4)" }}
                  data-testid="badge-very-close"
                >
                  <MapPin className="w-3 h-3" style={{ color: "#8FE3C7" }} />
                  <span className="text-[11px] font-semibold" style={{ color: "#8FE3C7" }}>Under 1 km</span>
                </div>
              )}

              {hasCardStories && (
                <button
                  onClick={() => handleViewCardStory(currentProfile)}
                  className="absolute top-3 left-3 w-11 h-11 rounded-full p-[2px] vf-press"
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

              {/* On a phone the decision bar floats over the bottom of the
                  photo, so the name sits above it rather than under it. */}
              <div className="absolute left-5 right-5 bottom-[100px] md:bottom-6 md:left-6 md:right-6 pointer-events-none">
                <h2
                  className="font-display font-normal leading-[1.02] tracking-[-0.01em] mb-1.5 flex items-center gap-2 text-[clamp(32px,9vw,42px)]"
                  style={{ color: "#F5F0EA" }}
                  data-testid="text-profile-name"
                >
                  <span className="truncate">{currentProfile.displayName}{currentProfile.age ? `, ${currentProfile.age}` : ""}</span>
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
                  <div className="flex items-center gap-1.5 text-[14px] text-[#CFC7DA]">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate" data-testid="text-profile-location">
                      {currentProfile.locationName || currentProfile.location}
                      {currentProfile.showDistance !== false && distanceKm !== null ? ` · ${formatDistance(distanceKm)}` : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* The read: why you might click, then their own words. */}
            <div className="relative px-5 py-6 md:px-8 md:py-8 flex flex-col gap-6 min-w-0">
              <WhyYouMightClick name={currentProfile.displayName || ""} reasons={reasons} onAsk={handleInterview} />

              {answers.length > 0 ? (
                <div>
                  <div className="vf-label text-vf-faint mb-1">In their words</div>
                  <div className="flex flex-col">
                    {answers.map((a, i) => (
                      <div
                        key={i}
                        className={`py-3.5 ${i > 0 ? "border-t border-vf-line" : ""}`}
                        data-testid={`profile-answer-${i}`}
                      >
                        <div className="vf-small text-vf-muted mb-1.5">{a.question}</div>
                        <p className="font-display italic text-[22px] leading-[1.35] text-vf-text">"{a.answer}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="vf-label text-vf-faint mb-2">In their words</div>
                  {aboutText ? (
                    <p className="font-display italic text-[22px] leading-[1.35] text-vf-text">"{aboutText}"</p>
                  ) : (
                    <p className="vf-body text-vf-muted">Nothing shared yet. Their twin can tell you more.</p>
                  )}
                </div>
              )}

              {answers.length > 0 && aboutText && (
                <p className="vf-body text-vf-soft">{aboutText}</p>
              )}

              {interests.length > 0 && (
                <div className="flex flex-wrap gap-2" data-testid="profile-interests">
                  {interests.map((tag) => (
                    <span
                      key={tag}
                      className="border border-vf-line rounded-full px-3.5 py-1.5 text-[13.5px] text-vf-soft"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <button
                onClick={() => setLocation(withFrom(`/u/${currentProfile.userId}`, filter === "nearby" ? "/discover?filter=nearby" : "/discover"))}
                className="self-start inline-flex items-center gap-1.5 min-h-[44px] text-[14px] font-medium text-vf-text hover:text-vf-ember transition-colors"
                data-testid="link-full-profile"
              >
                Full profile <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </AnimatePresence>

        <DecisionDock
          name={currentProfile.displayName || ""}
          onPass={handlePass}
          onLike={handleLike}
          onInterview={handleInterview}
          busy={isActing}
          likePending={createMatch.isPending}
          interviewPending={startInterview.isPending}
          undo={undoPass ? { name: undoPass.name, onUndo: handleUndoPass } : null}
        />
        </div>

        <div className="flex items-center justify-between px-1 mt-2 mb-8">
          <p className="vf-small text-vf-faint">
            {eligibleForFilter.length - profiles.length + 1} of {eligibleForFilter.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setConfirm("block")}
              className="vf-small text-vf-faint hover:text-vf-text transition-colors min-h-[36px] px-2"
              data-testid="button-block-user"
            >
              Block
            </button>
            <button
              onClick={() => setConfirm("report")}
              className="vf-small text-vf-faint hover:text-vf-text transition-colors inline-flex items-center gap-1 min-h-[36px] px-2"
              data-testid="button-report-user"
            >
              <Flag className="w-3 h-3" /> Report
            </button>
          </div>
        </div>

        {/* A peek at who's next, not a second feed. Tapping one brings them
            to the front; whoever was there goes to the back of the line, so
            the same two people never just trade places. */}
        {upcoming.length > 0 && (
          <section className="mb-10" data-testid="next-up">
            <div className="vf-label text-vf-faint mb-3">Next up</div>
            <div className="flex gap-3">
              {upcoming.map((p: any) => {
                const handlePin = () => {
                  if (isActingRef.current) return;
                  const pinnedId = p.userId;
                  setDeckOrder((prev) => {
                    const idx = prev.indexOf(pinnedId);
                    if (idx <= 0) return prev;
                    const rest = prev.slice();
                    const [pinned] = rest.splice(idx, 1);
                    const [oldFront] = rest.splice(0, 1);
                    return oldFront ? [pinned, ...rest, oldFront] : [pinned, ...rest];
                  });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                };
                return (
                  <button
                    key={p.userId}
                    type="button"
                    onClick={handlePin}
                    className="vf-press relative w-[104px] h-[138px] rounded-[16px] overflow-hidden border border-vf-line bg-vf-surface2 shrink-0 text-left"
                    aria-label={`Show ${p.displayName || "this person"} now`}
                    data-testid={`card-upcoming-${p.userId}`}
                  >
                    {p.coverPhotoUrl ? (
                      <img src={p.coverPhotoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center" style={{ background: avatarColor(p.userId) }}>
                        <span className="font-display text-white/90 text-4xl">{p.displayName?.[0] || "?"}</span>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-vf-scrim to-transparent pointer-events-none" />
                    <div className="absolute left-2.5 right-2.5 bottom-2 font-display text-[16px] leading-none truncate" style={{ color: "#F5F0EA" }}>
                      {(p.displayName || "").split(/\s+/)[0]}{p.age ? `, ${p.age}` : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Below the deck, never above a person: at most one note, then the
          website's install card. */}
      <div className="mt-10 space-y-4 max-w-[640px]">
        <DiscoverNotes />
        <InstallCard />
      </div>

      {locationSheet}

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
                setLocation(withFrom("/plans?feature=start_interview", "/discover"));
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
      {celebration}
    </LayoutShell>
  );
}
