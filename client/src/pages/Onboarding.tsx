import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useGenerateTwin, useCreateProfile } from "@/hooks/use-profiles";
import { Loader2, ArrowRight, Check } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const QUESTIONS = [
  "What are your core values in a relationship? Be as specific as possible about trust, communication, and growth.",
  "Describe your ideal Sunday. What are you doing, who are you with, and how does it feel?",
  "How do you handle conflict? Give an example of a disagreement you resolved constructively.",
  "What is a long-term goal you are currently working towards, and why does it matter to you?",
  "What is one thing about you that surprises people when they get to know you?"
];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const generateTwin = useGenerateTwin();
  const createProfile = useCreateProfile();

  const handleNext = () => {
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    setIsGenerating(true);
    try {
      // 1. Generate the Twin Persona
      const twinRes = await generateTwin.mutateAsync(Object.values(answers));
      
      // 2. Create the Profile
      await createProfile.mutateAsync({
        userId: user?.id!, // ID from auth
        displayName: user?.firstName || "User",
        bio: answers[4] || "New to VibeFlow", // Simple default
        personalityProfile: answers,
        twinPersona: twinRes.twinPersona,
        onboardingCompleted: true,
        isPublic: true,
      });

      // 3. Redirect
      setLocation("/profile");
    } catch (error) {
      console.error("Onboarding failed:", error);
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-primary/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-secondary/10 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-2xl">
        {/* Progress Bar */}
        <div className="mb-12">
          <div className="flex justify-between text-sm font-medium text-muted-foreground mb-4">
            <span>Soul-Mapping in progress</span>
            <span>{Math.round(((step + 1) / QUESTIONS.length) * 100)}%</span>
          </div>
          <div className="h-2 bg-purple-100 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-gradient-to-r from-primary to-secondary"
              initial={{ width: 0 }}
              animate={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        {/* Question Card */}
        <div className="relative min-h-[400px]">
          <AnimatePresence mode="wait">
            {!isGenerating ? (
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="bg-white rounded-3xl p-8 md:p-12 shadow-xl border border-white/50 backdrop-blur-sm"
              >
                <h2 className="text-3xl font-display font-bold mb-8 leading-tight">
                  {QUESTIONS[step]}
                </h2>
                <Textarea
                  value={answers[step] || ""}
                  onChange={(e) => setAnswers({ ...answers, [step]: e.target.value })}
                  placeholder="Type your answer honestly..."
                  className="min-h-[150px] text-lg bg-transparent border-0 border-b-2 border-purple-100 rounded-none focus-visible:ring-0 focus-visible:border-primary px-0 resize-none placeholder:text-muted-foreground/50 mb-8"
                  autoFocus
                />
                
                <div className="flex justify-end">
                  <Button 
                    size="lg" 
                    onClick={handleNext}
                    disabled={!answers[step]?.trim()}
                    className="rounded-full px-8 h-12 text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30"
                  >
                    {step === QUESTIONS.length - 1 ? "Complete Profile" : "Next Question"}
                    {step !== QUESTIONS.length - 1 && <ArrowRight className="ml-2 w-4 h-4" />}
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center text-center h-full pt-12"
              >
                <div className="relative mb-8">
                  <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
                  <div className="relative bg-white p-6 rounded-2xl shadow-xl">
                    <Loader2 className="w-12 h-12 text-primary animate-spin" />
                  </div>
                </div>
                <h2 className="text-3xl font-display font-bold mb-4">Initializing AI Twin</h2>
                <p className="text-lg text-muted-foreground max-w-md mx-auto">
                  We are analyzing your responses to create a digital persona that truly represents you. This takes just a moment.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
