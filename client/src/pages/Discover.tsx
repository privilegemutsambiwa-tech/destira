import { useState, useRef, useMemo } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { Brain, X, Loader2, MapPin, Heart, Play } from "lucide-react";
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

  if (grouped.length === 0) return null;

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-3 mb-5 scrollbar-hide" data-testid="stories-carousel">
        {grouped.map((u) => (
          <button
            key={u.userId}
            onClick={() => setViewingStory(u)}
            className="flex flex-col items-center gap-1 shrink-0"
            data-testid={`story-avatar-${u.userId}`}
          >
            {/* Amber story ring per spec */}
            <div
              className="w-16 h-16 rounded-full p-0.5 story-ring flex items-center justify-center"
              style={{ border: "2px solid #F59E0B" }}
            >
              <Avatar className="w-full h-full border-2 border-white">
                {u.photoUrl ? (
                  <AvatarImage src={u.photoUrl} alt={u.displayName} />
                ) : (
                  <AvatarFallback className="text-sm">{u.displayName[0]}</AvatarFallback>
                )}
              </Avatar>
            </div>
            <span className="text-[11px] text-[#6B7280] truncate w-16 text-center">{u.displayName.split(" ")[0]}</span>
          </button>
        ))}
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
  const [swipeDir, setSwipeDir] = useState<"left" | "right">("left");
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
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </LayoutShell>
    );
  }

  if (!profiles || profiles.length === 0) {
    return (
      <LayoutShell>
        <div className="max-w-sm mx-auto">
          <div className="text-center py-20 px-6 bg-white rounded-2xl shadow-card border">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: "#EDE9FE" }}>
              <Brain className="w-10 h-10" style={{ color: "#7C3AED" }} />
            </div>
            <h3 className="text-xl font-display font-bold mb-2 text-[#1F2937]">No one to discover yet</h3>
            <p className="text-[#6B7280] max-w-xs mx-auto text-sm">
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

  const handlePass = () => {
    handleNext("left");
  };

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
        {/* Page title */}
        <div className="text-center mb-5">
          <h1 className="font-display font-bold text-[#1F2937] text-xl">Discover</h1>
        </div>

        <StoriesCarousel />

        {/* Profile Card — portrait 1:1.2 aspect ratio */}
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
            className="bg-white rounded-2xl overflow-hidden mb-4"
            style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
            data-testid="card-profile"
          >
            {/* Image area — portrait 1:1.2 */}
            <div className="relative" style={{ paddingBottom: "120%" }}>
              {currentProfile.coverPhotoUrl ? (
                <img
                  src={currentProfile.coverPhotoUrl}
                  alt={currentProfile.displayName}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div
                  className="absolute inset-0 flex items-center justify-center gradient-bg"
                >
                  <span className="text-9xl font-display font-bold text-white/20">
                    {currentProfile.displayName?.[0] || "?"}
                  </span>
                </div>
              )}

              {/* Story ring indicator top-left */}
              <div
                className="absolute top-3 left-3 w-12 h-12 rounded-full flex items-center justify-center bg-black/30 backdrop-blur-sm"
                style={{ border: "2px solid #F59E0B" }}
                data-testid="story-ring-indicator"
              >
                <Play className="w-4 h-4 text-white fill-white" />
              </div>

              {/* Dark gradient overlay at bottom of image */}
              <div
                className="absolute inset-x-0 bottom-0"
                style={{
                  background: "linear-gradient(to top, rgba(31,41,55,0.85) 0%, rgba(31,41,55,0.4) 50%, transparent 100%)",
                  height: "55%",
                }}
              />

              {/* Name / age / location overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                <h2
                  className="font-display font-bold text-white leading-tight mb-1"
                  style={{ fontSize: "28px" }}
                  data-testid="text-profile-name"
                >
                  {currentProfile.displayName}
                  {currentProfile.age ? `, ${currentProfile.age}` : ""}
                </h2>
                {currentProfile.location && (
                  <div className="flex items-center gap-1 text-white/80" style={{ fontSize: "15px" }}>
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span data-testid="text-profile-location">{currentProfile.location}</span>
                  </div>
                )}
              </div>
            </div>

            {/* About section */}
            <div className="bg-white px-6 pt-5 pb-3">
              <h3 className="font-bold text-[#1F2937] mb-2" style={{ fontSize: "16px" }}>About</h3>
              <p
                className="text-[#374151] leading-relaxed"
                style={{ fontSize: "15px", lineHeight: "1.5" }}
                data-testid="text-profile-bio"
              >
                {currentProfile.bio || "No bio yet."}
              </p>
            </div>

            {/* Personality trait pills */}
            {personalityTraits.length > 0 && (
              <div className="px-6 pb-4 flex flex-wrap gap-2">
                {personalityTraits.map(([trait, score]) => (
                  <span
                    key={trait}
                    className="capitalize font-semibold"
                    style={{
                      background: "#EDE9FE",
                      color: "#7C3AED",
                      fontSize: "12px",
                      padding: "4px 12px",
                      borderRadius: "999px",
                    }}
                    data-testid={`badge-trait-${trait}`}
                  >
                    {trait}: {typeof score === "number" ? `${score}%` : score}
                  </span>
                ))}
              </div>
            )}

            {/* Action buttons */}
            <div className="px-6 pb-6 pt-2 flex items-center gap-3">
              {/* Pass — light red */}
              <button
                onClick={handlePass}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold btn-press transition-all"
                style={{
                  background: "#FEE2E2",
                  color: "#EF4444",
                  fontSize: "15px",
                  height: "48px",
                  border: "none",
                  borderRadius: "8px",
                }}
                data-testid="button-pass"
              >
                <X className="w-5 h-5" />
                Pass
              </button>

              {/* Interview AI Twin */}
              <button
                onClick={handleInterview}
                disabled={startInterview.isPending}
                className="flex items-center justify-center btn-press transition-all"
                style={{
                  background: "#7C3AED",
                  color: "#fff",
                  height: "48px",
                  width: "48px",
                  borderRadius: "50%",
                  border: "none",
                  flexShrink: 0,
                }}
                title="Interview AI Twin"
                data-testid="button-interview"
              >
                {startInterview.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Brain className="w-5 h-5" />
                )}
              </button>

              {/* Like — light pink */}
              <button
                onClick={handleLike}
                disabled={createMatch.isPending}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold btn-press transition-all"
                style={{
                  background: "#FCE7F3",
                  color: "#EC4899",
                  fontSize: "15px",
                  height: "48px",
                  border: "none",
                  borderRadius: "8px",
                }}
                data-testid="button-like"
              >
                {createMatch.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Heart className="w-5 h-5" />
                )}
                Like
              </button>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Profile counter */}
        <p className="text-center text-[#9CA3AF] text-xs mb-8">
          {(currentIdx % profiles.length) + 1} of {profiles.length} profiles
        </p>
      </div>
    </LayoutShell>
  );
}
