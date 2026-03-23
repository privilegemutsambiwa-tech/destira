import { useState, useMemo, useEffect, useCallback } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { Brain, X, Loader2, MapPin, Heart, Play, Plus, Crown } from "lucide-react";
import { useDiscoverProfiles, useStartInterview, useCreateMatch, useFeedStories } from "@/hooks/use-interactions";
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
              <div className="w-full h-full rounded-full overflow-hidden" style={{ background: "#1A1A24" }}>
                <Avatar className="w-full h-full">
                  {myPhotoUrl ? (
                    <AvatarImage src={myPhotoUrl} alt={myName} />
                  ) : (
                    <AvatarFallback style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)", color: "#FFFFFF", fontSize: "14px" }}>
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
                background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
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
                border: "2px dashed #9090A8",
                background: "transparent",
              }}
            >
              <Plus className="w-5 h-5" style={{ color: "#9090A8" }} />
            </div>
            <span style={{ fontSize: "11px", color: "#9090A8" }}>Add</span>
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
              <div className="w-full h-full rounded-full overflow-hidden" style={{ background: "#1A1A24" }}>
                <Avatar className="w-full h-full">
                  {u.photoUrl ? (
                    <AvatarImage src={u.photoUrl} alt={u.displayName} />
                  ) : (
                    <AvatarFallback style={{ background: "#242433", color: "#FFFFFF", fontSize: "14px" }}>
                      {u.displayName[0]}
                    </AvatarFallback>
                  )}
                </Avatar>
              </div>
            </div>
            <span style={{ fontSize: "11px", color: "#9090A8", maxWidth: "56px", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

type FilterChip = "all" | "nearby" | "new" | "online";

const CHIP_LABELS: { key: FilterChip; label: string }[] = [
  { key: "all", label: "All" },
  { key: "nearby", label: "Nearby 📍" },
  { key: "new", label: "New" },
  { key: "online", label: "Online" },
];

function getInitialFilter(): FilterChip {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const f = params.get("filter");
    if (f === "nearby" || f === "new" || f === "online") return f;
  }
  return "all";
}

export default function Discover() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [swipeDir, setSwipeDir] = useState<"left" | "right" | null>(null);
  const [isExiting, setIsExiting] = useState(false);
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
    const f = params.get("filter");
    const next = (f === "nearby" || f === "new" || f === "online") ? f : "all";
    setFilter(next as FilterChip);
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
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#7C3AED" }} />
        </div>
      </LayoutShell>
    );
  }

  if (!profiles || profiles.length === 0) {
    return (
      <LayoutShell>
        <div className="max-w-sm mx-auto">
          <div className="text-center mb-4">
            <h1 className="font-bold text-white" style={{ fontSize: "22px", letterSpacing: "-0.5px" }}>Discover</h1>
          </div>
          <div className="flex gap-2 mb-5 overflow-x-auto scrollbar-hide" data-testid="filter-chips">
            {CHIP_LABELS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setFilter(key); setCurrentIdx(0); }}
                className="shrink-0 text-sm font-medium"
                style={{
                  padding: "6px 16px",
                  borderRadius: "100px",
                  border: "1px solid",
                  borderColor: filter === key ? "transparent" : "#2E2E42",
                  background: filter === key ? "linear-gradient(135deg, #7C3AED, #EC4899)" : "transparent",
                  color: filter === key ? "#FFFFFF" : "#9090A8",
                  transition: "all 0.15s",
                }}
                data-testid={`chip-${key}`}
              >
                {label}
              </button>
            ))}
          </div>
          <StoriesCarousel />
          <div
            className="text-center py-20 px-6 rounded-2xl"
            style={{ background: "#1A1A24", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", border: "1px solid #2E2E42" }}
          >
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: "rgba(124,58,237,0.15)" }}
            >
              <Brain className="w-10 h-10" style={{ color: "#7C3AED" }} />
            </div>
            <h3 className="text-xl font-bold mb-2 text-white">
              {filter === "nearby" ? "Nobody nearby right now" : filter === "online" ? "Nobody online right now" : "No one to discover yet"}
            </h3>
            <p className="text-sm" style={{ color: "#9090A8" }}>
              {filter === "nearby"
                ? "Try All to see everyone, or check back when people are near you."
                : filter === "online"
                ? "Check back in a bit to see who's active."
                : "Complete your onboarding first, then check back as more people join VibeFlow."}
            </p>
            {filter !== "all" && (
              <button
                onClick={() => setFilter("all")}
                className="mt-4 text-sm font-medium"
                style={{ color: "#7C3AED", background: "none", border: "none" }}
              >
                Show all profiles
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

  const handleNext = (direction: "left" | "right") => {
    setSwipeDir(direction);
    setIsExiting(true);
    setTimeout(() => {
      setIsExiting(false);
      setSwipeDir(null);
      setCurrentIdx(prev => (prev + 1) % profiles.length);
    }, 300);
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

  const handlePass = () => handleNext("left");

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
        if (limitData?.error === "upgradeRequired") {
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
      handleNext("right");
    } catch (err) {
      if (err instanceof Error && err.message?.includes("already exists")) {
        toast({ title: "Already Connected", description: "You already have a match request with this person." });
        handleNext("right");
      } else if (err instanceof Error && err.message?.includes("upgradeRequired")) {
        setShowUpgradePrompt(true);
      } else {
        toast({ title: "Could not like", description: "Something went wrong. Please try again.", variant: "destructive" });
      }
    }
  };

  const personalityTraits = currentProfile.personalityProfile && typeof currentProfile.personalityProfile === "object"
    ? Object.entries(currentProfile.personalityProfile as Record<string, number>).slice(0, 4)
    : [];

  return (
    <LayoutShell>
      <div className="max-w-sm mx-auto">
        <div className="text-center mb-4">
          <h1 className="font-bold text-white" style={{ fontSize: "22px", letterSpacing: "-0.5px" }}>Discover</h1>
        </div>

        <div className="flex gap-2 mb-5 overflow-x-auto scrollbar-hide" data-testid="filter-chips">
          {CHIP_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setFilter(key); setCurrentIdx(0); }}
              className="shrink-0 text-sm font-medium"
              style={{
                padding: "6px 16px",
                borderRadius: "100px",
                border: "1px solid",
                borderColor: filter === key ? "transparent" : "#2E2E42",
                background: filter === key ? "linear-gradient(135deg, #7C3AED, #EC4899)" : "transparent",
                color: filter === key ? "#FFFFFF" : "#9090A8",
                transition: "all 0.15s",
              }}
              data-testid={`chip-${key}`}
            >
              {label}
            </button>
          ))}
        </div>

        <StoriesCarousel />

        <AnimatePresence mode="popLayout">
          <motion.div
            key={currentIdx}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={
              isExiting
                ? { opacity: 0, x: swipeDir === "left" ? -280 : 280, rotate: swipeDir === "left" ? -10 : 10 }
                : { opacity: 1, scale: 1, x: 0, y: 0, rotate: 0 }
            }
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeInOut" }}
            className="overflow-hidden mb-4 relative"
            style={{
              background: "#1A1A24",
              borderRadius: "20px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              border: "1px solid #2E2E42",
            }}
            data-testid="card-profile"
          >
            {isExiting && swipeDir === "left" && (
              <div
                className="absolute inset-0 z-30 flex items-center justify-center"
                style={{ pointerEvents: "none" }}
              >
                <div
                  className="font-black tracking-widest"
                  style={{
                    color: "#EF4444",
                    fontSize: "48px",
                    border: "4px solid #EF4444",
                    borderRadius: "12px",
                    padding: "4px 20px",
                    opacity: 0.9,
                    transform: "rotate(-15deg)",
                    textShadow: "0 0 20px rgba(239,68,68,0.5)",
                  }}
                >
                  PASS
                </div>
              </div>
            )}
            {isExiting && swipeDir === "right" && (
              <div
                className="absolute inset-0 z-30 flex items-center justify-center"
                style={{ pointerEvents: "none" }}
              >
                <div
                  className="font-black tracking-widest"
                  style={{
                    color: "#22C55E",
                    fontSize: "48px",
                    border: "4px solid #22C55E",
                    borderRadius: "12px",
                    padding: "4px 20px",
                    opacity: 0.9,
                    transform: "rotate(15deg)",
                    textShadow: "0 0 20px rgba(34,197,94,0.5)",
                  }}
                >
                  LIKE
                </div>
              </div>
            )}

            <div className="relative" style={{ paddingBottom: "120%" }}>
              {currentProfile.coverPhotoUrl ? (
                <img
                  src={currentProfile.coverPhotoUrl}
                  alt={currentProfile.displayName}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)" }}
                >
                  <span className="font-bold text-white/20" style={{ fontSize: "96px" }}>
                    {currentProfile.displayName?.[0] || "?"}
                  </span>
                </div>
              )}

              {nearby && (
                <div
                  className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                  style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", border: "1px solid rgba(34,197,94,0.4)" }}
                  data-testid="badge-nearby-now"
                >
                  <div className="w-2 h-2 rounded-full" style={{ background: "#22C55E", boxShadow: "0 0 6px #22C55E" }} />
                  <span style={{ color: "#22C55E", fontSize: "11px", fontWeight: 600 }}>Nearby now</span>
                </div>
              )}

              {isVeryClose && !nearby && (
                <div
                  className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                  style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", border: "1px solid rgba(124,58,237,0.4)" }}
                  data-testid="badge-very-close"
                >
                  <MapPin className="w-3 h-3" style={{ color: "#A78BFA" }} />
                  <span style={{ color: "#A78BFA", fontSize: "11px", fontWeight: 600 }}>Under 1km</span>
                </div>
              )}

              {hasCardStories ? (
                <button
                  onClick={() => handleViewCardStory(currentProfile)}
                  className="absolute top-3 left-3 w-11 h-11 rounded-full flex items-center justify-center p-[2px]"
                  style={{
                    background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                    animation: "pulse 2s infinite",
                  }}
                  data-testid="story-ring-indicator"
                  aria-label="View story"
                >
                  <div className="w-full h-full rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(8px)" }}>
                    <Play className="w-4 h-4 text-white fill-white" />
                  </div>
                </button>
              ) : (
                <div
                  className="absolute top-3 left-3 w-11 h-11 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(8px)", border: "1.5px solid rgba(255,255,255,0.2)" }}
                  data-testid="story-ring-indicator"
                >
                  <Play className="w-4 h-4 text-white fill-white" />
                </div>
              )}

              <div
                className="absolute inset-x-0 bottom-0 p-5"
                style={{
                  background: "rgba(0,0,0,0.5)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                }}
              >
                <h2
                  className="font-bold text-white leading-tight mb-0.5"
                  style={{ fontSize: "26px", letterSpacing: "-0.5px" }}
                  data-testid="text-profile-name"
                >
                  {currentProfile.displayName}
                  {currentProfile.age ? `, ${currentProfile.age}` : ""}
                </h2>

                {currentProfile.locationName && currentProfile.showDistance === false ? (
                  <div className="flex items-center gap-1 mb-1.5" style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px" }}>
                    <span data-testid="text-profile-location">📍 {currentProfile.locationName}</span>
                  </div>
                ) : currentProfile.locationName && distanceKm !== null ? (
                  <div className="flex items-center gap-1 mb-1.5" style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px" }}>
                    <span data-testid="text-profile-location">
                      📍 {currentProfile.locationName} · {formatDistance(distanceKm)}
                    </span>
                  </div>
                ) : currentProfile.locationName ? (
                  <div className="flex items-center gap-1 mb-1.5" style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px" }}>
                    <span data-testid="text-profile-location">📍 {currentProfile.locationName}</span>
                  </div>
                ) : currentProfile.location ? (
                  <div className="flex items-center gap-1 mb-1.5" style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span data-testid="text-profile-location">{currentProfile.location}</span>
                  </div>
                ) : null}

                {currentProfile.bio && (
                  <p
                    className="text-sm leading-snug"
                    style={{ color: "rgba(255,255,255,0.75)", fontSize: "13px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                    data-testid="text-profile-bio"
                  >
                    {currentProfile.bio}
                  </p>
                )}
              </div>
            </div>

            {personalityTraits.length > 0 && (
              <div className="px-4 py-3 flex flex-wrap gap-2" style={{ background: "#1A1A24" }}>
                {personalityTraits.map(([trait, score]) => (
                  <span
                    key={trait}
                    className="capitalize font-semibold"
                    style={{
                      background: "rgba(124,58,237,0.15)",
                      color: "#A78BFA",
                      fontSize: "12px",
                      padding: "4px 12px",
                      borderRadius: "100px",
                      border: "1px solid rgba(124,58,237,0.3)",
                    }}
                    data-testid={`badge-trait-${trait}`}
                  >
                    {trait}: {typeof score === "number" ? `${score}%` : score}
                  </span>
                ))}
              </div>
            )}

            <div className="px-5 pb-5 pt-2 flex items-center justify-center gap-4" style={{ background: "#1A1A24" }}>
              <button
                onClick={handlePass}
                className="flex items-center justify-center btn-press transition-all"
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  background: "transparent",
                  border: "2px solid #EF4444",
                  color: "#EF4444",
                  flexShrink: 0,
                }}
                data-testid="button-pass"
              >
                <X className="w-6 h-6" />
              </button>

              <button
                onClick={handleInterview}
                disabled={startInterview.isPending}
                className="flex items-center justify-center gap-2 font-semibold btn-press transition-all flex-1"
                style={{
                  background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                  color: "#FFFFFF",
                  height: "52px",
                  borderRadius: "14px",
                  border: "none",
                  fontSize: "14px",
                  boxShadow: "0 4px 20px rgba(124,58,237,0.4)",
                }}
                data-testid="button-interview"
              >
                {startInterview.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Brain className="w-4 h-4" />
                    Interview Twin
                  </>
                )}
              </button>

              <button
                onClick={handleLike}
                disabled={createMatch.isPending}
                className="flex items-center justify-center btn-press transition-all"
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  background: "transparent",
                  border: "2px solid #EC4899",
                  color: "#EC4899",
                  flexShrink: 0,
                }}
                data-testid="button-like"
              >
                {createMatch.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Heart className="w-6 h-6" />
                )}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>

        <p className="text-center text-xs mb-8" style={{ color: "#9090A8" }}>
          {(currentIdx % profiles.length) + 1} of {profiles.length} profiles
        </p>
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
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100,
          }}
          onClick={() => setShowUpgradePrompt(false)}
        >
          <div
            style={{
              background: "#1A1A24", borderRadius: "24px 24px 0 0",
              padding: "32px 24px 48px", width: "100%", maxWidth: "480px",
              border: "1px solid #2E2E42",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              width: "60px", height: "60px", borderRadius: "50%",
              background: "linear-gradient(135deg, #7C3AED, #EC4899)",
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
            }}>
              <Crown className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white text-center mb-2">You've reached your daily limit</h2>
            <p className="text-sm text-center mb-6" style={{ color: "#9090A8" }}>
              Free accounts get 5 likes per day. Upgrade to VibeFlow Plus for 50 likes/day, or go VIP for unlimited.
            </p>
            <button
              onClick={() => { setShowUpgradePrompt(false); setLocation("/billing"); }}
              className="w-full py-3 text-sm font-semibold text-white mb-3"
              style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)", borderRadius: "14px", border: "none", cursor: "pointer" }}
              data-testid="button-upgrade-prompt"
            >
              Upgrade Now
            </button>
            <button
              onClick={() => setShowUpgradePrompt(false)}
              className="w-full py-3 text-sm font-medium"
              style={{ background: "none", border: "none", color: "#9090A8", cursor: "pointer" }}
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
