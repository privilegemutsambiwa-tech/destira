import { useState } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { Button } from "@/components/ui/button";
import { Brain, MessageCircle, X } from "lucide-react";
import { useStartInterview } from "@/hooks/use-interactions";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

// Mock data for discovery
const MOCK_PROFILES = [
  { id: "1", name: "Sarah", age: 28, bio: "Artist & Coffee lover. Looking for deep conversations about the universe.", matchScore: 94 },
  { id: "2", name: "James", age: 31, bio: "Tech entrepreneur building the future. Values ambition and kindness.", matchScore: 88 },
  { id: "3", name: "Elena", age: 26, bio: "Nature enthusiast and amateur chef. Let's cook something together.", matchScore: 91 },
];

export default function Discover() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const startInterview = useStartInterview();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const currentProfile = MOCK_PROFILES[currentIdx];

  const handleNext = () => {
      if (currentIdx < MOCK_PROFILES.length - 1) {
          setCurrentIdx(prev => prev + 1);
      } else {
          setCurrentIdx(0); // Loop for demo
      }
  };

  const handleInterview = async () => {
      try {
          await startInterview.mutateAsync(currentProfile.id);
          toast({
              title: "Interview Request Sent",
              description: `You can now chat with ${currentProfile.name}'s AI Twin.`,
          });
          setLocation("/interviews");
      } catch (error) {
          toast({
              title: "Error",
              description: "Could not start interview.",
              variant: "destructive"
          });
      }
  };

  if (!currentProfile) return <div>No more profiles</div>;

  return (
    <LayoutShell>
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
            <h1 className="text-3xl font-display font-bold">Discover</h1>
            <p className="text-muted-foreground">Find people who resonate with your vibe.</p>
        </div>

        <div className="relative bg-white rounded-[2.5rem] overflow-hidden shadow-2xl border border-purple-100 h-[600px] flex flex-col">
            {/* Image Placeholder */}
            <div className="h-3/5 bg-gray-200 relative">
                <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                    <span className="text-8xl font-display font-bold opacity-20">{currentProfile.name[0]}</span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-8 pt-24 text-white">
                    <h2 className="text-4xl font-display font-bold mb-1">{currentProfile.name}, {currentProfile.age}</h2>
                    <div className="inline-block bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-sm font-medium border border-white/20">
                        {currentProfile.matchScore}% Compatibility
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 p-8 flex flex-col justify-between bg-white">
                <div>
                    <h3 className="font-bold text-gray-900 mb-2">About</h3>
                    <p className="text-gray-600 leading-relaxed text-lg">{currentProfile.bio}</p>
                </div>

                <div className="flex items-center gap-4 mt-8">
                    <Button 
                        variant="outline" 
                        size="lg" 
                        onClick={handleNext}
                        className="flex-1 h-14 rounded-2xl border-2 hover:bg-red-50 hover:text-red-500 hover:border-red-200"
                    >
                        <X className="w-6 h-6" />
                    </Button>
                    
                    <Button 
                        size="lg" 
                        onClick={handleInterview}
                        className="flex-[2] h-14 rounded-2xl bg-gradient-to-r from-primary to-secondary hover:shadow-lg hover:shadow-primary/25 hover:scale-[1.02] transition-all text-lg font-semibold"
                    >
                        <Brain className="w-6 h-6 mr-2" />
                        Interview AI Twin
                    </Button>
                </div>
            </div>
        </div>
      </div>
    </LayoutShell>
  );
}
