import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useGenerateTwin, useCreateProfile } from "@/hooks/use-profiles";
import { useCheckNickname } from "@/hooks/use-interactions";
import { Loader2, ArrowRight, Shield, Eye, EyeOff, Check, X, AtSign } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const QUESTIONS = [
  "What are the top 3 values you live by? (e.g., honesty, adventure, family)",
  "Describe your ideal Sunday. What are you doing, who are you with, and how does it feel?",
  "How do you handle conflict in relationships? Give an example if you can.",
  "What's a life goal you're actively working towards right now?",
  "What does emotional intimacy mean to you?",
  "What's a deal-breaker for you in a relationship?",
  "How do you show love and appreciation to people you care about?",
  "What's something surprising about you that most people don't know?",
  "Describe the kind of partner energy you're looking for (e.g., calm, adventurous, intellectual).",
  "What would you want your partner to say about you after a year together?",
];

const TOTAL_STEPS = QUESTIONS.length + 1;
const NICKNAME_STEP = QUESTIONS.length;

function NicknameStep({
  value,
  onChange,
  onNext,
  onBack,
}: {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { data: nicknameCheck, isFetching } = useCheckNickname(value);
  const [touched, setTouched] = useState(false);

  const isValidFormat = /^[a-zA-Z0-9_]{3,20}$/.test(value);
  const isAvailable = nicknameCheck?.available === true;
  const showError = touched && value.length > 0 && !isValidFormat;
  const showTaken = touched && isValidFormat && !isFetching && !isAvailable;
  const showOk = isValidFormat && !isFetching && isAvailable;

  return (
    <div className="bg-card rounded-md p-8 md:p-12 shadow-xl border backdrop-blur-sm">
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)" }}
        >
          <AtSign className="w-5 h-5 text-white" />
        </div>
        <h2 className="text-2xl md:text-3xl font-display font-bold leading-tight" data-testid="text-nickname-title">
          Choose your Group Nickname
        </h2>
      </div>
      <p className="text-muted-foreground mb-8 text-base">
        This is how you'll appear in Lounge groups. It's unique, short, and stays with you.
      </p>

      <div className="relative mb-2">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
        <Input
          value={value}
          onChange={(e) => { onChange(e.target.value.replace(/[^a-zA-Z0-9_]/g, "")); setTouched(true); }}
          placeholder="cool_nickname"
          className="pl-8 text-lg h-12"
          style={{ letterSpacing: "0.02em" }}
          maxLength={20}
          autoFocus
          data-testid="input-nickname"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {isFetching && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          {!isFetching && showOk && <Check className="w-4 h-4" style={{ color: "#22C55E" }} />}
          {!isFetching && showTaken && <X className="w-4 h-4" style={{ color: "#EF4444" }} />}
        </div>
      </div>
      <p className="text-xs mb-8" style={{
        color: showError ? "#EF4444" : showTaken ? "#EF4444" : showOk ? "#22C55E" : "#9090A8"
      }}>
        {showError ? "3-20 characters. Letters, numbers, and underscores only." :
          showTaken ? "This nickname is already taken." :
          showOk ? "Looks great! This nickname is available." :
          "3-20 characters. Letters, numbers, and underscores only."}
      </p>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack} data-testid="button-back-nickname">
          Back
        </Button>
        <Button
          size="lg"
          onClick={onNext}
          disabled={!showOk}
          className="rounded-full px-8 h-12 text-base font-semibold shadow-lg btn-press"
          data-testid="button-next-nickname"
        >
          Create My AI Twin
        </Button>
      </div>
    </div>
  );
}

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [nickname, setNickname] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const generateTwin = useGenerateTwin();
  const createProfile = useCreateProfile();

  const handleNext = () => {
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else if (step === QUESTIONS.length - 1) {
      setStep(NICKNAME_STEP);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleComplete = async () => {
    setIsGenerating(true);
    try {
      const twinRes = await generateTwin.mutateAsync(Object.values(answers));

      await createProfile.mutateAsync({
        displayName: user?.firstName || "User",
        bio: answers[7] || answers[3] || "New to VibeFlow",
        personalityProfile: answers,
        twinPersona: twinRes.twinPersona,
        onboardingCompleted: true,
        isPublic: !privacyMode,
        groupNickname: nickname || undefined,
      } as any);

      setLocation("/discover");
    } catch (error) {
      console.error("Onboarding failed:", error);
      setIsGenerating(false);
    }
  };

  const isNicknameStep = step === NICKNAME_STEP;
  const progressPct = Math.round(((step + 1) / TOTAL_STEPS) * 100);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-primary/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-secondary/10 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-2xl">
        <div className="mb-8">
          <div className="flex justify-between items-center text-sm font-medium text-muted-foreground mb-4">
            <span>Soul-Mapping in progress</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-secondary"
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <div className="flex justify-between items-center mt-4">
            <span className="text-xs text-muted-foreground">
              {isNicknameStep ? "Final step" : `Question ${step + 1} of ${QUESTIONS.length}`}
            </span>
            <button
              onClick={() => setPrivacyMode(!privacyMode)}
              className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-1.5 rounded-full border transition-colors"
              data-testid="button-privacy-toggle"
            >
              {privacyMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <Shield className="w-3.5 h-3.5" />
              {privacyMode ? "Private Mode ON" : "Public Profile"}
            </button>
          </div>
        </div>

        <div className="relative min-h-[400px]">
          <AnimatePresence mode="wait">
            {!isGenerating ? (
              isNicknameStep ? (
                <motion.div
                  key="nickname"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <NicknameStep
                    value={nickname}
                    onChange={setNickname}
                    onNext={handleComplete}
                    onBack={handleBack}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="bg-card rounded-md p-8 md:p-12 shadow-xl border backdrop-blur-sm"
                >
                  <h2 className="text-2xl md:text-3xl font-display font-bold mb-8 leading-tight" data-testid="text-question">
                    {QUESTIONS[step]}
                  </h2>
                  <Textarea
                    value={answers[step] || ""}
                    onChange={(e) => setAnswers({ ...answers, [step]: e.target.value })}
                    placeholder="Type your answer honestly..."
                    className="min-h-[150px] text-lg bg-transparent border-0 border-b-2 border-border rounded-none focus-visible:ring-0 focus-visible:border-primary px-0 resize-none placeholder:text-muted-foreground/50 mb-8"
                    autoFocus
                    data-testid="input-answer"
                  />

                  <div className="flex justify-between">
                    <Button
                      variant="ghost"
                      onClick={handleBack}
                      disabled={step === 0}
                      data-testid="button-back"
                    >
                      Back
                    </Button>
                    <Button
                      size="lg"
                      onClick={handleNext}
                      disabled={!answers[step]?.trim()}
                      className="rounded-full px-8 h-12 text-base font-semibold shadow-lg shadow-primary/20 btn-press"
                      data-testid="button-next"
                    >
                      {step === QUESTIONS.length - 1 ? "Continue" : "Next Question"}
                      <ArrowRight className="ml-2 w-4 h-4" />
                    </Button>
                  </div>
                </motion.div>
              )
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center text-center h-full pt-12"
              >
                <div className="relative mb-8">
                  <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
                  <div className="relative bg-card p-6 rounded-md shadow-xl">
                    <Loader2 className="w-12 h-12 text-primary animate-spin" />
                  </div>
                </div>
                <h2 className="text-3xl font-display font-bold mb-4" data-testid="text-generating">Initializing AI Twin</h2>
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
