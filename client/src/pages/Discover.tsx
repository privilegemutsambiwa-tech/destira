import { useState, useMemo, useEffect, useCallback } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { ResonanceDial } from "@/components/resonance-dial";
import { ResonanceAxes } from "@/components/resonance-axes";
import { Brain, X, Loader2, MapPin, Heart, Plus, Crown, Check, ArrowRight } from "lucide-react";
import { useDiscoverProfiles, useStartInterview, useCreateMatch, useFeedStories } from "@/hooks/use-interactions";
import { useTwinReadiness, useDismissReminder } from "@/hooks/use-onboarding";
import { LIMITS } from "@shared/entitlements";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { StoryViewer, OwnStoryViewer, AddStoryButton } from "@/components/story-viewer";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
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
// data â€” no invented numbers for the common case.
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

function StoriesCarousel() {
  const { data: stories } = useFeedStories();
  const { user } = useAuth();
  const typedUser = user as User | null;
  const [viewingStory, setViewingStory] = useState<{ stories: any[]; displayName: string; photoUrl: string } | null>(null);
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
    return Object.values(byUser);
  }, [stories]);

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
              <div className="w-full h-full rounded-full overflow-hidden" style={{ background: "#161220" }}>
                <Avatar className="w-full h-full">
                  {myPhotoUrl ? (
                    <AvatarImage src={myPhotoUrl} alt={myName} />
                  ) : (
                    <AvatarFallback style={{ background: "#161220", color: "#F5F0EA", fontSize: "14px" }}>
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
                color: "#A79FB4",
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
              <Plus className="w-5 h-5" style={{ color: "#A79FB4" }} />
            </div>
            <span style={{ fontSize: "11px", color: "#A79FB4" }}>Add</span>
          </button>
        )}

        {grouped.map((u) => (
          <button
            key={u.userId}
            onClick={() => setViewingStory(u)}
            className="flex flex-col items-center gap-1.5 shrink-0"
            data-testid={`story-avatar-${u.userId}`}
          >
            <div className="story-ring-active p-[2.5px] rounded-full" style={{ width: `${STORY_SIZE}px`, height: `${STORY_SIZE}px` }}>
              <div className="w-full h-full rounded-full overflow-hidden" style={{ background: "#161220" }}>
                <Avatar className="w-full h-full">
                  {u.photoUrl ? (
                    <AvatarImage src={u.photoUrl} alt={u.displayName} />
                  ) : (
                    <AvatarFallback style={{ background: "rgba(255,255,255,0.05)", color: "#FFFFFF", fontSize: "14px" }}>
                      {u.displayName[0]}
                    </AvatarFallback>
                  )}
                </Avatar>
              </div>
            </div>
            <span style={{ fontSize: "11px", color: "#A79FB4", maxWidth: "56px", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {u.displayName.split(" ")[0]}
            </span>
          </button>
        ))}
      </div>

      {viewingStory && (
        <StoryViewer
          stories={viewingStory.stories}
          initialIndex={0}
          onClose={() => setViewingStory(null)}
          userName={viewingStory.displayName}
          profileImageUrl={viewingStory.photoUrl}
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

// One read a day, so there is no feed to filter â€” the only scope that has
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
          : "border-vf-line text-vf-soft hover:border-white/25"
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

export default function Discover() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [filter, setFilter] = useState<FilterChip>(getInitialFilter);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [viewingCardStory, setViewingCardStory] = useState<{ stories: any[]; displayName: string; photoUrl: string; userId: string } | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const { data: rawProfiles, isLoading } = useDiscoverProfiles(filter, userLat, userLng);
  const { data: feedStories } = useFeedStories();
  const startInterview = useStartInterview();
  const createMatch = useCreateMatch();
  const [woLocation, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFilter(params.get("filter") === "nearby" ? "nearby" : "all");
    setCurrentIdx(0);
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

  const profiles = useMemo(() => {
    if (!rawProfiles) return [];
    let list = [...rawProfiles];
    if (filter === "nearby") {
      list = list
        .filter((p) => p.distanceKm !== null && p.distanceKm !== undefined)
        .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }
    return list;
  }, [rawProfiles, filter]);

  const handleViewCardStory = useCallback((profile: any) => {
    const userId: string = profile.userId;
    const stories = storiesByUserId[userId];
    if (!stories || stories.length === 0) return;
    setViewingCardStory({
      stories,
      displayName: profile.displayName || "User",
      photoUrl: profile.user?.profileImageUrl || "",
      userId,
    });
  }, [storiesByUserId]);

  if (isLoading) {
    return (
      <LayoutShell>
        <div className="h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-vf-mint" />
        </div>
      </LayoutShell>
    );
  }

  const weekday = new Date().toLocaleDateString(undefined, { weekday: "long" });

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
            <ScopePill active={filter === "nearby"} onToggle={() => { setFilter(filter === "nearby" ? "all" : "nearby"); setCurrentIdx(0); }} />
          </div>
          <StoriesCarousel />
          <div className="text-center py-20 px-6 rounded-[22px] border border-vf-line bg-vf-surface">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 bg-vf-mint/10">
              <Brain className="w-10 h-10 text-vf-mint" />
            </div>
            <h3 className="font-serif text-xl mb-2 text-vf-text">
              {filter === "nearby" ? "Nobody within 20km right now" : "No one to discover yet"}
            </h3>
            <p className="text-sm text-vf-muted">
              {filter === "nearby"
                ? "Widen the scope to see everyone, or check back when people are near you."
                : "Complete your onboarding first, then check back as more people join VibeFlow."}
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

  const currentProfile = profiles[currentIdx % profiles.length];

  const distanceKm: number | null = currentProfile.distanceKm ?? null;
  const nearby: boolean = currentProfile.isNearbyNow ?? false;
  const isVeryClose = distanceKm !== null && distanceKm < 1;
  const cardStories = storiesByUserId[currentProfile.userId] || [];
  const hasCardStories = cardStories.length > 0;
  const resonance = getResonance(currentProfile.personalityProfile);

  const handleNext = () => {
    setCurrentIdx((prev) => (prev + 1) % profiles.length);
  };

  const handleInterview = async () => {
    try {
      const interview = await startInterview.mutateAsync(currentProfile.userId);
      toast({
        title: "Interview Started",
        description: `Chat with ${currentProfile.displayName}'s AI Twin now.`,
      });
      setLocation(`/interviews/${interview.id}/chat`);
    } catch {
      toast({
        title: "Error",
        description: "Could not start interview.",
        variant: "destructive",
      });
    }
  };

  const handlePass = () => handleNext();

  const handleLike = async () => {
    try {
      const limitRes = await fetch("/api/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });
      if (limitRes.status === 403) {
        const limitData = await limitRes.json();
        if (limitData?.upgradeRequired === true) {
          setShowUpgradePrompt(true);
          return;
        }
      }
    } catch {
      // non-critical, continue with like
    }
    try {
      await createMatch.mutateAsync(currentProfile.userId);
      toast({
        title: "Liked!",
        description: `${currentProfile.displayName} will be notified.`,
      });
      handleNext();
    } catch (err) {
      if (err instanceof Error && err.message?.includes("already exists")) {
        toast({ title: "Already Connected", description: "You already have a match request with this person." });
        handleNext();
      } else if (err instanceof Error && err.message?.includes("upgradeRequired")) {
        setShowUpgradePrompt(true);
      } else {
        toast({ title: "Could not like", description: "Something went wrong. Please try again.", variant: "destructive" });
      }
    }
  };

  // Free-text soul-mapping answers (real onboarded users) fall back to a
  // couple of quoted excerpts instead of fake numeric axes â€” see getResonance().
  const textAnswers = !resonance && currentProfile.personalityProfile && typeof currentProfile.personalityProfile === "object"
    ? Object.values(currentProfile.personalityProfile as Record<string, unknown>).filter((v): v is string => typeof v === "string" && v.trim().length > 0).slice(0, 2)
    : [];

  const upcoming = profiles.length > 1
    ? [1, 2].map((offset) => profiles[(currentIdx + offset) % profiles.length]).filter((p, i, arr) => arr.findIndex((x) => x.userId === p.userId) === i && p.userId !== currentProfile.userId)
    : [];

  return (
    <LayoutShell>
      <div className="max-w-3xl mx-auto">
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
            <ScopePill active={filter === "nearby"} onToggle={() => { setFilter(filter === "nearby" ? "all" : "nearby"); setCurrentIdx(0); }} />
          </div>
        </div>

        <ReadinessStrip />

        <StoriesCarousel />

        <AnimatePresence mode="wait">
          <motion.div
            key={currentIdx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-[26px] border border-vf-line bg-vf-surface overflow-hidden grid grid-cols-1 md:grid-cols-2 mb-4"
            data-testid="card-profile"
          >
            {/* Photo pane */}
            <div className="relative min-h-[320px] md:min-h-[440px]">
              {currentProfile.coverPhotoUrl ? (
                <img
                  src={currentProfile.coverPhotoUrl}
                  alt={currentProfile.displayName}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-vf-surface2">
                  <span className="font-serif text-white/25" style={{ fontSize: "96px" }}>
                    {currentProfile.displayName?.[0] || "?"}
                  </span>
                </div>
              )}

              <div
                className="absolute inset-x-0 bottom-0 pointer-events-none bg-gradient-to-t from-vf-ink to-transparent"
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

              {isVeryClose && !nearby && (
                <div
                  className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-md border border-vf-mint/40"
                  style={{ background: "rgba(0,0,0,0.5)" }}
                  data-testid="badge-very-close"
                >
                  <MapPin className="w-3 h-3 text-vf-mint" />
                  <span className="text-[11px] font-semibold text-vf-mint">Under 1km</span>
                </div>
              )}

              {hasCardStories && (
                <button
                  onClick={() => handleViewCardStory(currentProfile)}
                  className="absolute top-3 left-3 w-11 h-11 rounded-full p-[2px] btn-press"
                  style={{ background: "#FF6B4A" }}
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
                      className="inline-flex items-center justify-center rounded-full shrink-0"
                      style={{ width: 22, height: 22, background: "#3B82F6" }}
                    >
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
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

            {/* Resonance pane */}
            <div className="p-6 md:p-8 flex flex-col gap-5 min-w-0">
              {resonance ? (
                <>
                  <div className="flex items-center gap-5 flex-wrap">
                    <ResonanceDial score={resonance.score} />
                    <div className="min-w-0">
                      <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-muted">
                        resonance read
                      </div>
                      {currentProfile.bio && (
                        <p className="text-[15px] leading-relaxed text-vf-text mt-1.5 max-w-[330px]">{currentProfile.bio}</p>
                      )}
                    </div>
                  </div>
                  <ResonanceAxes axes={resonance.axes} />
                </>
              ) : (
                <div>
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-muted mb-2">
                    in their words
                  </div>
                  {textAnswers.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {textAnswers.map((answer, i) => (
                        <p key={i} className="text-[15px] leading-relaxed text-vf-text">"{answer}"</p>
                      ))}
                    </div>
                  ) : currentProfile.bio ? (
                    <p className="text-[15px] leading-relaxed text-vf-text">{currentProfile.bio}</p>
                  ) : (
                    <p className="text-[15px] leading-relaxed text-vf-muted">No soul-mapping answers shared yet.</p>
                  )}
                </div>
              )}

              <div className="flex gap-2.5 flex-wrap mt-auto pt-2">
                <button
                  onClick={handlePass}
                  className="flex items-center justify-center w-12 h-12 rounded-full border border-white/14 text-vf-faint hover:text-vf-text hover:border-white/25 transition-colors btn-press shrink-0"
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
                  disabled={createMatch.isPending}
                  className="flex items-center justify-center w-12 h-12 rounded-full shrink-0 font-semibold btn-press transition-colors bg-vf-ember text-vf-ink hover:bg-[#FF8163]"
                  data-testid="button-like"
                  aria-label="Like"
                >
                  {createMatch.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Heart className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-between px-1 mb-8">
          <p className="text-xs text-vf-faint">
            {(currentIdx % profiles.length) + 1} of {profiles.length} profiles
          </p>
          <button
            onClick={async () => {
              if (!currentProfile?.userId) return;
              try {
                await apiRequest("POST", `/api/users/block/${currentProfile.userId}`, {});
                handleNext();
                toast({ title: "User blocked", description: "They won't appear in your feed anymore." });
              } catch {
                toast({ title: "Could not block user", variant: "destructive" });
              }
            }}
            className="text-xs text-vf-faint underline hover:text-vf-text"
            data-testid="button-block-user"
          >
            Block / Report
          </button>
        </div>

        {upcoming.length > 0 && (
          <div>
            <div className="flex items-baseline justify-between gap-4 mb-3">
              <h2 className="font-serif font-normal text-[22px] text-vf-text">Next up</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
              {upcoming.map((p) => {
                const r = getResonance(p.personalityProfile);
                const idx = profiles.findIndex((x) => x.userId === p.userId);
                return (
                  <button
                    key={p.userId}
                    onClick={() => setCurrentIdx(idx)}
                    className="text-left rounded-[20px] border border-vf-line bg-vf-surface2 p-4 flex gap-3.5 items-center hover:border-white/20 transition-colors"
                    data-testid={`card-upcoming-${p.userId}`}
                  >
                    <div className="w-[58px] h-[72px] rounded-[14px] shrink-0 overflow-hidden bg-vf-surface2 flex items-center justify-center">
                      {p.coverPhotoUrl ? (
                        <img src={p.coverPhotoUrl} alt={p.displayName} className="w-full h-full object-cover" />
                      ) : (
                        <span className="font-serif text-white/40 text-2xl">{p.displayName?.[0] || "?"}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[15px] text-vf-text truncate">
                        {p.displayName}{p.age ? `, ${p.age}` : ""}
                      </div>
                      <div className="text-[12px] text-vf-muted truncate mt-0.5">
                        {p.locationName || p.location || " "}
                      </div>
                      {r && (
                        <div className="font-mono text-[11.5px] text-vf-mint mt-1.5">resonance {r.score}</div>
                      )}
                    </div>
                  </button>
                );
              })}

              <button
                onClick={() => setLocation("/plans")}
                className="text-left rounded-[20px] border border-dashed border-vf-gold/35 bg-vf-gold/5 p-4 flex flex-col justify-center gap-2 hover:bg-vf-gold/[0.08] transition-colors"
                data-testid="card-upgrade-teaser"
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

      {viewingCardStory && (
        <StoryViewer
          stories={viewingCardStory.stories}
          initialIndex={0}
          onClose={() => setViewingCardStory(null)}
          userName={viewingCardStory.displayName}
          profileImageUrl={viewingCardStory.photoUrl}
          onInterviewTwin={async () => {
            try {
              const interview = await startInterview.mutateAsync(viewingCardStory.userId);
              setViewingCardStory(null);
              setLocation(`/interviews/${interview.id}/chat`);
            } catch {
              toast({ title: "Could not start interview", variant: "destructive" });
            }
          }}
        />
      )}

      {showUpgradePrompt && (
        <div
          className="fixed inset-0 flex items-end justify-center z-[100]"
          style={{ background: "rgba(8,6,11,.82)", backdropFilter: "blur(14px)" }}
          onClick={() => setShowUpgradePrompt(false)}
        >
          <div
            className="w-full max-w-[480px] rounded-t-[24px] border border-vf-line bg-vf-surface p-8 pb-12"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-gold text-center mb-3">that's today's reads</div>
            <h2 className="font-serif font-normal text-xl text-center mb-2 text-vf-text">
              {LIMITS.free.dailyLikes} a day on Free.
            </h2>
            <p className="text-sm text-center mb-6 text-vf-muted">
              Your next ones land at midnight. A paid step gives you more room and lets you see who asked to meet you.
            </p>
            <button
              onClick={() => { setShowUpgradePrompt(false); setLocation("/plans"); }}
              className="w-full py-3.5 rounded-full text-sm font-semibold bg-vf-gold text-vf-ink mb-3 hover:bg-[#F3D890] transition-colors"
              data-testid="button-upgrade-prompt"
            >
              See plans
            </button>
            <button
              onClick={() => setShowUpgradePrompt(false)}
              className="w-full py-3 text-sm font-medium text-vf-faint hover:text-vf-text"
              data-testid="button-dismiss-upgrade"
            >
              Maybe later
            </button>
          </div>
        </div>
      )}
    </LayoutShell>
  );
}
