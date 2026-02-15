import { useState, useMemo } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { Button } from "@/components/ui/button";
import { CompatibilityRing } from "@/components/compatibility-ring";
import { Brain, X, Loader2, MapPin, Heart } from "lucide-react";
import { useDiscoverProfiles, useStartInterview, useCreateMatch } from "@/hooks/use-interactions";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import heroCoupleImg1 from "@assets/images/hero-couple_1.jpg";
import heroCoupleImg2 from "@assets/images/hero-couple_2.jpg";
import heroCoupleImg3 from "@assets/images/hero-couple_3.jpg";


const HERO_IMAGES = [heroCoupleImg1, heroCoupleImg2, heroCoupleImg3];

function HeroBanner({ onStartMatching, onInterviewTwin }: { onStartMatching: () => void; onInterviewTwin: () => void }) {
  const heroImg = useMemo(() => HERO_IMAGES[Math.floor(Math.random() * HERO_IMAGES.length)], []);

  return (
    <div className="relative rounded-md overflow-hidden mb-8" data-testid="hero-banner">
      <img
        src={heroImg}
        alt="Couple connecting"
        className="w-full h-64 md:h-80 object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
      <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-8">
        <h2 className="text-white text-2xl md:text-3xl font-display font-bold mb-2">
          Find your perfect vibe
        </h2>
        <p className="text-white/80 text-sm md:text-base mb-5 max-w-lg">
          Discover people who resonate with your personality. Interview their AI Twin before you connect.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={onStartMatching}
            className="gradient-bg text-white btn-press rounded-full px-6"
            data-testid="button-hero-match"
          >
            <Heart className="w-4 h-4 mr-2" />
            Start Matching
          </Button>
          <Button
            variant="outline"
            onClick={onInterviewTwin}
            className="text-white border-white/30 bg-white/10 backdrop-blur-sm btn-press rounded-full px-6"
            data-testid="button-hero-interview"
          >
            <Brain className="w-4 h-4 mr-2" />
            Interview AI Twin
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Discover() {
  const [currentIdx, setCurrentIdx] = useState(0);
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
        <HeroBanner onStartMatching={() => {}} onInterviewTwin={() => {}} />
        <div className="text-center py-20 px-6 bg-card rounded-md border border-dashed">
          <div className="w-20 h-20 bg-accent rounded-full flex items-center justify-center mx-auto mb-6">
            <Brain className="w-10 h-10 text-accent-foreground/50" />
          </div>
          <h3 className="text-2xl font-display font-bold mb-2">No one to discover yet</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Complete your onboarding first, then check back as more people join VibeFlow.
          </p>
        </div>
      </LayoutShell>
    );
  }

  const currentProfile = profiles[currentIdx % profiles.length];
  const matchScore = Math.floor(Math.random() * 15) + 80;

  const handleNext = () => {
    setCurrentIdx(prev => (prev + 1) % profiles.length);
  };

  const handleInterview = async () => {
    try {
      const interview = await startInterview.mutateAsync(currentProfile.userId);
      toast({
        title: "Interview Started",
        description: `Chat with ${currentProfile.displayName}'s AI Twin now.`,
      });
      setLocation(`/interviews/${interview.id}/chat`);
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not start interview.",
        variant: "destructive"
      });
    }
  };

  const handleMatchRequest = async () => {
    try {
      await createMatch.mutateAsync(currentProfile.userId);
      toast({
        title: "Match Request Sent",
        description: `${currentProfile.displayName} will be notified.`,
      });
      handleNext();
    } catch (error: any) {
      if (error.message?.includes("already exists")) {
        toast({ title: "Already Connected", description: "You already have a match request with this person." });
      } else {
        toast({ title: "Error", description: "Could not send match request.", variant: "destructive" });
      }
    }
  };

  return (
    <LayoutShell>
      <div className="max-w-2xl mx-auto">
        <HeroBanner onStartMatching={handleMatchRequest} onInterviewTwin={handleInterview} />

        <AnimatePresence mode="wait">
          <motion.div
            key={currentIdx}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="relative bg-card rounded-md overflow-hidden shadow-lg dark:shadow-none border flex flex-col card-lift"
          >
            <div className="h-56 md:h-64 bg-gradient-to-br from-primary/20 to-secondary/20 relative">
              {currentProfile.coverPhotoUrl && (
                <img src={currentProfile.coverPhotoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
              )}
              {!currentProfile.coverPhotoUrl && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-8xl font-display font-bold text-primary/10">
                    {currentProfile.displayName?.[0] || "?"}
                  </span>
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 pt-16 text-white">
                <h2 className="text-3xl font-display font-bold mb-1" data-testid="text-profile-name">
                  {currentProfile.displayName}{currentProfile.age ? `, ${currentProfile.age}` : ""}
                </h2>
                <div className="flex items-center gap-3 flex-wrap">
                  {currentProfile.location && (
                    <div className="flex items-center gap-1 text-sm text-white/80">
                      <MapPin className="w-3.5 h-3.5" />
                      {currentProfile.location}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-bold mb-2">About</h3>
                  <p className="text-muted-foreground leading-relaxed text-sm" data-testid="text-profile-bio">{currentProfile.bio}</p>
                </div>
                <div className="shrink-0" data-testid="text-match-score">
                  <CompatibilityRing percentage={matchScore} size={64} />
                </div>
              </div>

              {currentProfile.personalityProfile && typeof currentProfile.personalityProfile === 'object' && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(currentProfile.personalityProfile as Record<string, number>).slice(0, 3).map(([trait, score]) => (
                    <span key={trait} className="text-xs px-3 py-1 rounded-full bg-accent text-accent-foreground font-medium capitalize">
                      {trait}: {score}%
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 mt-2">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleNext}
                  className="rounded-md btn-press"
                  data-testid="button-skip"
                >
                  <X className="w-5 h-5" />
                </Button>

                <Button
                  size="lg"
                  onClick={handleInterview}
                  disabled={startInterview.isPending}
                  className="flex-1 gradient-bg text-white text-lg font-semibold rounded-md btn-press"
                  data-testid="button-interview"
                >
                  <Brain className="w-5 h-5 mr-2" />
                  Interview AI Twin
                </Button>

                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleMatchRequest}
                  disabled={createMatch.isPending}
                  className="rounded-md btn-press border-secondary/30 text-secondary"
                  data-testid="button-match-request"
                >
                  <Heart className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </LayoutShell>
  );
}
