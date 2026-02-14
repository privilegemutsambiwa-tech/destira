import { useState } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { Button } from "@/components/ui/button";
import { Brain, X, Loader2, MapPin, Heart } from "lucide-react";
import { useDiscoverProfiles, useStartInterview, useCreateMatch } from "@/hooks/use-interactions";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

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
        <div className="text-center py-20 px-6 bg-white rounded-3xl border border-dashed border-purple-200">
          <div className="w-20 h-20 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Brain className="w-10 h-10 text-purple-300" />
          </div>
          <h3 className="text-2xl font-bold font-display mb-2">No one to discover yet</h3>
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
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-bold" data-testid="text-discover-title">Discover</h1>
          <p className="text-muted-foreground">Find people who resonate with your vibe.</p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentIdx}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="relative bg-white rounded-[2.5rem] overflow-hidden shadow-2xl border border-purple-100 flex flex-col"
          >
            <div className="h-64 bg-gradient-to-br from-purple-100 to-pink-100 relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-8xl font-display font-bold text-primary/20">
                  {currentProfile.displayName?.[0] || "?"}
                </span>
              </div>
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
                  <div className="inline-block bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-sm font-medium border border-white/20" data-testid="text-match-score">
                    {matchScore}% Compatibility
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 flex flex-col gap-4 bg-white">
              <div>
                <h3 className="font-bold text-gray-900 mb-2">About</h3>
                <p className="text-gray-600 leading-relaxed" data-testid="text-profile-bio">{currentProfile.bio}</p>
              </div>

              {currentProfile.personalityProfile && typeof currentProfile.personalityProfile === 'object' && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(currentProfile.personalityProfile as Record<string, number>).slice(0, 3).map(([trait, score]) => (
                    <span key={trait} className="text-xs px-3 py-1 rounded-full bg-purple-50 text-purple-700 font-medium capitalize">
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
                  className="h-14 rounded-2xl border-2 px-6"
                  data-testid="button-skip"
                >
                  <X className="w-5 h-5" />
                </Button>

                <Button
                  size="lg"
                  onClick={handleInterview}
                  disabled={startInterview.isPending}
                  className="flex-1 h-14 rounded-2xl bg-gradient-to-r from-primary to-secondary text-lg font-semibold"
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
                  className="h-14 rounded-2xl border-2 border-pink-200 text-pink-600 px-6"
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
