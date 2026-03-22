import { useState, useMemo } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { Brain, X, Loader2, MapPin, Heart, Play, Plus } from "lucide-react";
import { useDiscoverProfiles, useStartInterview, useCreateMatch, useFeedStories } from "@/hooks/use-interactions";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { StoryViewer } from "@/components/story-viewer";

function StoriesCarousel() {
  const { data: stories } = useFeedStories();
  const [viewingStory, setViewingStory] = useState<any>(null);

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
        {grouped.map((u) => (
          <button
            key={u.userId}
            onClick={() => setViewingStory(u)}
            className="flex flex-col items-center gap-1.5 shrink-0"
            data-testid={`story-avatar-${u.userId}`}
          >
            {/* Animated gradient ring for active story */}
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

        {/* Empty add-story slot — dashed ring + plus icon */}
        <button
          className="flex flex-col items-center gap-1.5 shrink-0"
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
      </div>

      {viewingStory && (
        <StoryViewer
          stories={viewingStory.stories}
          initialIndex={0}
          onClose={() => setViewingStory(null)}
        />
      )}
    </>
  );
}

export default function Discover() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [swipeDir, setSwipeDir] = useState<"left" | "right" | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const { data: profiles, isLoading } = useDiscoverProfiles();
  const startInterview = useStartInterview();
  const createMatch = useCreateMatch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

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
            <h3 className="text-xl font-bold mb-2 text-white">No one to discover yet</h3>
            <p className="text-sm" style={{ color: "#9090A8" }}>
              Complete your onboarding first, then check back as more people join VibeFlow.
            </p>
          </div>
        </div>
      </LayoutShell>
    );
  }

  const currentProfile = profiles[currentIdx % profiles.length];

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
      await createMatch.mutateAsync(currentProfile.userId);
      toast({
        title: "Liked!",
        description: `${currentProfile.displayName} will be notified.`,
      });
      handleNext("right");
    } catch (error: any) {
      if (error.message?.includes("already exists")) {
        toast({ title: "Already Connected", description: "You already have a match request with this person." });
        handleNext("right");
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
        <div className="text-center mb-5">
          <h1 className="font-bold text-white" style={{ fontSize: "22px", letterSpacing: "-0.5px" }}>Discover</h1>
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
            {/* Directional swipe stamp overlays */}
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

            {/* Image — portrait 1:1.2 */}
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

              {/* Story play indicator */}
              <div
                className="absolute top-3 left-3 w-11 h-11 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(8px)", border: "1.5px solid rgba(255,255,255,0.2)" }}
                data-testid="story-ring-indicator"
              >
                <Play className="w-4 h-4 text-white fill-white" />
              </div>

              {/* Frosted glass info overlay — spec: backdrop-blur 20px */}
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
                {currentProfile.location && (
                  <div className="flex items-center gap-1 mb-1.5" style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span data-testid="text-profile-location">{currentProfile.location}</span>
                  </div>
                )}
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

            {/* Personality trait pills */}
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

            {/* 3-button action row */}
            <div className="px-5 pb-5 pt-2 flex items-center justify-center gap-4" style={{ background: "#1A1A24" }}>
              {/* Pass — circle with red border */}
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

              {/* Interview AI Twin — gradient rect CTA */}
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

              {/* Like — circle with pink border */}
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

        {/* Counter */}
        <p className="text-center text-xs mb-8" style={{ color: "#9090A8" }}>
          {(currentIdx % profiles.length) + 1} of {profiles.length} profiles
        </p>
      </div>
    </LayoutShell>
  );
}
