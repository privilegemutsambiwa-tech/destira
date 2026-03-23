import { useState, useRef } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useProfile, useUpdateProfile } from "@/hooks/use-profiles";
import { useSubscription, useGenerateSummary, useProfileCompletion, useGenerateAboutMe, useGenerateAISummary, useTwinToneProfile, useUpdateTwinToneProfile, useTwinStructuredProfile, useExtractTwinProfile, useTwinMemory } from "@/hooks/use-interactions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Loader2, MapPin,
  Camera, Crown, Wand2, Trash2, ImagePlus,
  CheckCircle2, ArrowRight, Check, X, Pencil,
  Brain, Sparkles, RefreshCw, Plus, LogOut, Settings
} from "lucide-react";
import { AddStoryButton, OwnStoryViewer, type OwnStory } from "@/components/story-viewer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

const CARD_STYLE = {
  background: "#1A1A24",
  borderRadius: "20px",
  border: "1px solid #2E2E42",
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
};

const SURFACE2 = { background: "#242433", borderRadius: "12px", padding: "12px" };

export default function Profile() {
  const { data: profile, isLoading } = useProfile();
  const { data: subscription } = useSubscription();
  const { data: completion } = useProfileCompletion();
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const updateProfile = useUpdateProfile();
  const generateSummary = useGenerateSummary();
  const generateAboutMe = useGenerateAboutMe();
  const generateAISummary = useGenerateAISummary();
  const { data: toneProfile } = useTwinToneProfile();
  const updateTone = useUpdateTwinToneProfile();
  const { data: structuredProfile } = useTwinStructuredProfile();
  const extractProfile = useExtractTwinProfile();
  const { data: twinMemory } = useTwinMemory();
  const [showPhotoDialog, setShowPhotoDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showToneDialog, setShowToneDialog] = useState(false);
  const [aboutMePreview, setAboutMePreview] = useState<string | null>(null);
  const [showOwnStoryViewer, setShowOwnStoryViewer] = useState(false);
  const [showStoryCreator, setShowStoryCreator] = useState(false);
  const [toneValues, setToneValues] = useState({
    tone_style: "supportive",
    verbosity_level: "balanced",
    emoji_usage: "minimal",
    formality_level: "neutral",
  });

  const { data: photos } = useQuery<any[]>({
    queryKey: ["/api/photos", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/photos/${user!.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user?.id,
  });

  const { data: ownStories } = useQuery<any[]>({
    queryKey: ["/api/stories/mine"],
    queryFn: async () => {
      const res = await fetch("/api/stories/mine", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user?.id,
  });

  if (isLoading) {
    return (
      <LayoutShell>
        <div className="h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#7C3AED" }} />
        </div>
      </LayoutShell>
    );
  }

  if (!profile) {
    return (
      <LayoutShell>
        <div className="text-center mt-20">
          <h2 className="text-2xl font-bold text-white">Welcome to VibeFlow!</h2>
          <p className="mt-2 mb-6" style={{ color: "#9090A8" }}>Complete your Soul-Mapping to get started.</p>
          <button
            onClick={() => setLocation("/onboarding")}
            className="font-semibold btn-press px-8 py-3 text-white"
            style={{
              background: "linear-gradient(135deg, #7C3AED, #EC4899)",
              height: "48px",
              borderRadius: "14px",
              border: "none",
              boxShadow: "0 4px 20px rgba(124,58,237,0.4)",
            }}
            data-testid="button-start-onboarding"
          >
            Start Soul-Mapping
          </button>
        </div>
      </LayoutShell>
    );
  }

  const personalityTraits = profile.personalityProfile && typeof profile.personalityProfile === 'object'
    ? Object.values(profile.personalityProfile as Record<string, any>).filter((v): v is string => typeof v === 'string')
    : [];

  const handleGenerateSummary = async () => {
    try {
      await generateSummary.mutateAsync();
      toast({ title: "Summary generated!", description: "AI has created your profile summaries." });
    } catch (e) {
      toast({ title: "Error", description: "Failed to generate summary.", variant: "destructive" });
    }
  };

  const handleGenerateAboutMe = async () => {
    try {
      const result = await generateAboutMe.mutateAsync();
      setAboutMePreview(result.aboutMeText);
    } catch (e) {
      toast({ title: "Error", description: "Failed to generate About Me.", variant: "destructive" });
    }
  };

  const handleApproveAboutMe = async () => {
    if (!aboutMePreview) return;
    try {
      await updateProfile.mutateAsync({ userId: user!.id, data: { bio: aboutMePreview } });
      setAboutMePreview(null);
      toast({ title: "About Me updated!" });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
    } catch (e) {
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    }
  };

  const handleSaveTone = async () => {
    try {
      await updateTone.mutateAsync(toneValues);
      setShowToneDialog(false);
      toast({ title: "Twin tone updated!" });
    } catch (e) {
      toast({ title: "Error", description: "Failed to update tone.", variant: "destructive" });
    }
  };

  const handleExtractProfile = async () => {
    try {
      await extractProfile.mutateAsync();
      toast({ title: "Profile insights extracted!", description: "Your AI Twin now knows you better." });
    } catch (e) {
      toast({ title: "Error", description: "Failed to extract insights.", variant: "destructive" });
    }
  };

  const tierLabel = subscription?.tier === "vip" ? "VIP" : subscription?.tier === "plus" ? "Plus" : "Free";

  const completionScore = completion?.score ?? profile.profileCompletionScore ?? 0;
  const completionTasks: Array<{ key: string; label: string; benefit: string; completed: boolean }> = completion?.tasks ?? [];
  const incompleteTasks = completionTasks.filter(t => !t.completed);

  const handleTaskAction = (key: string) => {
    switch (key) {
      case "bio": setShowEditDialog(true); break;
      case "photos": setShowPhotoDialog(true); break;
      case "onboarding": setLocation("/onboarding"); break;
      case "verify": toast({ title: "Verification coming soon" }); break;
      case "personality": handleGenerateSummary(); break;
      default: break;
    }
  };

  const avatarUrl = (!profile.isPublic && profile.cartoonPhotoUrl)
    ? profile.cartoonPhotoUrl
    : profile.coverPhotoUrl || null;

  const avatarFallbackLetter = profile.displayName?.[0] || user?.firstName?.[0] || "?";
  const highlightChips: string[] = personalityTraits.slice(0, 6);
  const hasStories = (ownStories?.length ?? 0) > 0;

  const planFeatures = {
    free: [
      { label: "5 matches/day", included: true },
      { label: "Basic discovery", included: true },
      { label: "1 group", included: true },
      { label: "Priority discovery", included: false },
      { label: "AI Twin coaching", included: false },
      { label: "Profile boost", included: false },
      { label: "Super Matches", included: false },
    ],
    plus: [
      { label: "Unlimited matches", included: true },
      { label: "Priority discovery", included: true },
      { label: "10 groups", included: true },
      { label: "AI Twin coaching", included: true },
      { label: "Profile boost", included: false },
      { label: "Super Matches", included: false },
      { label: "Priority support", included: false },
    ],
    vip: [
      { label: "Everything in Plus", included: true },
      { label: "Profile boost", included: true },
      { label: "Super Matches", included: true },
      { label: "Unlimited groups", included: true },
      { label: "Priority support", included: true },
    ],
  };

  const currentTierKey = (subscription?.tier || "free") as keyof typeof planFeatures;
  const currentFeatures = planFeatures[currentTierKey] || planFeatures.free;

  return (
    <LayoutShell>
      <div className="space-y-6">

        {/* Hero Section — 200px banner, 96px circular avatar overlapping */}
        <div className="relative">
          <div
            className="overflow-hidden"
            style={{
              height: "200px",
              background: "linear-gradient(135deg, #7C3AED, #EC4899)",
              borderRadius: "20px",
            }}
          >
            {profile.coverPhotoUrl && (
              <img src={profile.coverPhotoUrl} alt="Cover" className="w-full h-full object-cover" />
            )}
          </div>
          {/* 96px circular avatar, overlapping banner by half */}
          <div className="flex flex-col items-center" style={{ marginTop: "-48px" }}>
            <div
              className="relative"
              style={{
                width: "96px",
                height: "96px",
                borderRadius: "50%",
                border: "4px solid #0F0F14",
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                overflow: "hidden",
                background: "#242433",
                zIndex: 10,
              }}
              data-testid="avatar-profile"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={profile.displayName || "Profile"} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-white">{avatarFallbackLetter}</span>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white" data-testid="text-display-name">
                {profile.displayName || user?.firstName}
              </h1>
              {profile.isVerified && (
                <CheckCircle2 className="w-5 h-5" style={{ color: "#60A5FA" }} data-testid="icon-verified" />
              )}
            </div>

            {profile.location && (
              <div className="flex items-center gap-1 text-sm mt-1" style={{ color: "#9090A8" }} data-testid="text-location">
                <MapPin className="w-3.5 h-3.5" />
                <span>{profile.location}</span>
              </div>
            )}

            <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
              <button
                onClick={() => setShowEditDialog(true)}
                className="flex items-center gap-1.5 font-medium text-sm btn-press px-4 py-2"
                style={{
                  background: "#1A1A24",
                  color: "#FFFFFF",
                  borderRadius: "10px",
                  border: "1px solid #2E2E42",
                }}
                data-testid="button-edit-profile"
              >
                <Pencil className="w-4 h-4" />
                Edit Profile
              </button>
              <button
                onClick={() => setShowPhotoDialog(true)}
                className="flex items-center gap-1.5 font-medium text-sm btn-press px-4 py-2"
                style={{
                  background: "#1A1A24",
                  color: "#FFFFFF",
                  borderRadius: "10px",
                  border: "1px solid #2E2E42",
                }}
                data-testid="button-add-photos"
              >
                <ImagePlus className="w-4 h-4" />
                Photos
              </button>
              <button
                onClick={() => setLocation("/settings")}
                className="flex items-center gap-1.5 font-medium text-sm btn-press px-4 py-2"
                style={{
                  background: "#1A1A24",
                  color: "#FFFFFF",
                  borderRadius: "10px",
                  border: "1px solid #2E2E42",
                }}
                data-testid="button-open-settings"
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>
            </div>
          </div>
        </div>

        {/* Story section */}
        <div className="flex items-center gap-4 px-4 py-3" data-testid="section-profile-stories">
          {hasStories ? (
            <>
              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={() => setShowOwnStoryViewer(true)}
                  style={{
                    padding: "2px",
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                    border: "none",
                    cursor: "pointer",
                  }}
                  data-testid="button-view-own-story"
                >
                  <div style={{ padding: "2px", borderRadius: "50%", background: "#0F0F14" }}>
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl"
                      style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)", color: "#FFFFFF" }}
                    >
                      {(profile.displayName || user?.firstName || "U")[0]}
                    </div>
                  </div>
                </button>
                <span
                  className="text-xs font-medium"
                  style={{
                    background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                  data-testid="text-story-active"
                >
                  Story active
                </span>
              </div>
              <AddStoryButton
                onStoryAdded={() => { setShowStoryCreator(false); queryClient.invalidateQueries({ queryKey: ["/api/stories/mine"] }); }}
                open={showStoryCreator}
                onOpenChange={setShowStoryCreator}
              />
            </>
          ) : (
            <AddStoryButton
              onStoryAdded={() => { setShowStoryCreator(false); queryClient.invalidateQueries({ queryKey: ["/api/stories/mine"] }); }}
              open={showStoryCreator}
              onOpenChange={setShowStoryCreator}
            />
          )}
        </div>

        {/* Photo row */}
        <div className="flex gap-3 justify-center overflow-x-auto px-4 scrollbar-hide">
          {photos?.slice(0, 6).map((photo: any) => (
            <div
              key={photo.id}
              className="w-16 h-16 rounded-full overflow-hidden shrink-0"
              style={{ border: "2px solid #2E2E42" }}
              data-testid={`photo-circle-${photo.id}`}
            >
              <img src={photo.photoUrl} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
          {(photos?.length || 0) < 6 && (
            <button
              onClick={() => setShowPhotoDialog(true)}
              className="w-16 h-16 rounded-full flex items-center justify-center shrink-0 cursor-pointer"
              style={{ border: "2px dashed #2E2E42" }}
              data-testid="button-add-photo-circle"
            >
              <Plus className="w-5 h-5" style={{ color: "#9090A8" }} />
            </button>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">

            {/* About Me */}
            <div style={CARD_STYLE} className="p-5">
              <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                <h3 className="font-bold text-white" style={{ fontSize: "16px" }}>About Me</h3>
                <div className="flex gap-1 flex-wrap">
                  <button
                    className="text-xs font-medium flex items-center gap-1 btn-press px-3 py-1.5"
                    style={{
                      background: "rgba(124,58,237,0.15)",
                      color: "#A78BFA",
                      borderRadius: "8px",
                      border: "1px solid rgba(124,58,237,0.3)",
                    }}
                    onClick={handleGenerateAboutMe}
                    disabled={generateAboutMe.isPending}
                    data-testid="button-generate-about-me"
                  >
                    {generateAboutMe.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                    Generate
                  </button>
                  {!profile.aboutSummary && (
                    <button
                      className="text-xs font-medium flex items-center gap-1 btn-press px-3 py-1.5"
                      style={{
                        background: "rgba(124,58,237,0.15)",
                        color: "#A78BFA",
                        borderRadius: "8px",
                        border: "1px solid rgba(124,58,237,0.3)",
                      }}
                      onClick={handleGenerateSummary}
                      disabled={generateSummary.isPending}
                      data-testid="button-generate-summary"
                    >
                      {generateSummary.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Quick Summary
                    </button>
                  )}
                </div>
              </div>

              {aboutMePreview && (
                <div
                  className="mb-4 p-3"
                  style={{ background: "#242433", borderRadius: "12px", border: "1px dashed #2E2E42" }}
                  data-testid="about-me-preview"
                >
                  <p className="text-xs font-medium mb-2" style={{ color: "#9090A8" }}>AI-Generated Preview</p>
                  <p className="text-sm leading-relaxed mb-3 text-white">{aboutMePreview}</p>
                  <div className="flex gap-2">
                    <button
                      className="text-xs font-medium btn-press px-3 py-1.5 text-white"
                      style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)", borderRadius: "8px", border: "none" }}
                      onClick={handleApproveAboutMe}
                      data-testid="button-approve-about-me"
                    >
                      <Check className="w-3 h-3 inline mr-1" /> Use This
                    </button>
                    <button
                      className="text-xs font-medium btn-press px-3 py-1.5"
                      style={{ background: "#1A1A24", color: "#FFFFFF", borderRadius: "8px", border: "1px solid #2E2E42" }}
                      onClick={handleGenerateAboutMe}
                      disabled={generateAboutMe.isPending}
                      data-testid="button-regenerate-about-me"
                    >
                      <RefreshCw className="w-3 h-3 inline mr-1" /> Regenerate
                    </button>
                    <button
                      className="text-xs btn-press px-2 py-1.5"
                      style={{ color: "#9090A8" }}
                      onClick={() => setAboutMePreview(null)}
                      data-testid="button-discard-about-me"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}

              {profile.aboutSummary && (
                <p className="text-sm font-medium mb-3 italic" style={{ color: "#A78BFA" }} data-testid="text-about-summary">
                  {profile.aboutSummary}
                </p>
              )}

              <p className="leading-relaxed" style={{ color: "#9090A8" }} data-testid="text-bio">
                {profile.aboutMe || profile.bio || "No bio yet."}
              </p>

              {highlightChips.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 pt-3" style={{ borderTop: "1px solid #2E2E42" }}>
                  {highlightChips.map((trait) => (
                    <span
                      key={trait}
                      className="capitalize text-xs font-medium px-2 py-0.5"
                      style={{
                        background: "rgba(124,58,237,0.15)",
                        color: "#A78BFA",
                        borderRadius: "100px",
                        border: "1px solid rgba(124,58,237,0.3)",
                      }}
                    >
                      {trait}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Twin Intelligence */}
            <div style={CARD_STYLE} className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: "rgba(124,58,237,0.18)" }}
                >
                  <Brain className="w-4 h-4" style={{ color: "#A78BFA" }} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-white" style={{ fontSize: "16px" }}>Twin Intelligence</h3>
                  <p style={{ fontSize: "12px", color: "#9090A8" }}>Chat with your Twin to train it</p>
                </div>
                <button
                  onClick={handleExtractProfile}
                  disabled={extractProfile.isPending}
                  className="text-xs font-medium hover:opacity-80"
                  style={{ color: "#A78BFA" }}
                  data-testid="button-extract-profile"
                >
                  {extractProfile.isPending ? <Loader2 className="w-3 h-3 animate-spin inline" /> : <Sparkles className="w-3 h-3 inline" />}
                  {" "}Refresh
                </button>
              </div>

              <button
                onClick={() => setLocation("/twin-chat?from=/profile")}
                className="w-full font-semibold text-white py-3 mb-4 btn-press"
                style={{
                  background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                  height: "48px",
                  fontSize: "15px",
                  border: "none",
                  borderRadius: "14px",
                  boxShadow: "0 4px 20px rgba(124,58,237,0.4)",
                }}
                data-testid="button-interview-ai-twin"
              >
                <Brain className="w-4 h-4 inline mr-2" />
                Interview AI Twin
              </button>

              <div className="space-y-3">
                {structuredProfile?.topValues?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: "#9090A8" }}>Core Values</p>
                    <div className="flex flex-wrap gap-1">
                      {structuredProfile.topValues.map((v: string) => (
                        <span
                          key={v}
                          className="text-xs px-2 py-0.5 font-medium capitalize"
                          style={{
                            background: "rgba(124,58,237,0.15)",
                            color: "#A78BFA",
                            borderRadius: "100px",
                            border: "1px solid rgba(124,58,237,0.25)",
                          }}
                        >
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {structuredProfile?.interests?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: "#9090A8" }}>Interests</p>
                    <div className="flex flex-wrap gap-1">
                      {structuredProfile.interests.map((i: string) => (
                        <span
                          key={i}
                          className="text-xs px-2 py-0.5"
                          style={{
                            background: "#242433",
                            color: "#FFFFFF",
                            borderRadius: "100px",
                            border: "1px solid #2E2E42",
                          }}
                        >
                          {i}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {structuredProfile?.communicationStyle && (
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: "#9090A8" }}>Communication Style</p>
                    <p className="text-sm text-white">{structuredProfile.communicationStyle}</p>
                  </div>
                )}
                {(!structuredProfile?.topValues?.length && !structuredProfile?.interests?.length) && (
                  <p className="text-sm text-center py-2" style={{ color: "#9090A8" }}>Answer questions to help your Twin learn about you.</p>
                )}
              </div>

              {(() => {
                const memoryFacts = twinMemory?.facts || [];
                const chatFacts = memoryFacts.filter(f => f.source !== "onboarding").length;
                const onboardingAnswered = profile.twinQuestionsAnswered || 0;
                const totalAnswered = onboardingAnswered + chatFacts;
                const total = 100;
                const pct = Math.min(Math.round((totalAnswered / total) * 100), 100);
                let message = "Just getting started — your onboarding is saved!";
                if (pct >= 100) message = "✦ Twin fully trained — you're getting the best matches!";
                else if (pct >= 76) message = "Your Twin is nearly fully trained!";
                else if (pct >= 51) message = "Your Twin knows you well. Almost there!";
                else if (pct >= 26) message = "Your Twin is learning — keep the conversations going.";
                else if (pct >= 11) message = "Good start! Chat with your Twin to teach it more.";
                return (
                  <div className="pt-3 mt-3" style={{ borderTop: "1px solid #2E2E42" }}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-xs font-medium" style={{ color: "#9090A8" }}>Twin Training Progress</p>
                      <span className="text-xs font-bold" style={{ color: "#A78BFA" }} data-testid="text-twin-progress-count">{totalAnswered} of {total} answered ({pct}%)</span>
                    </div>
                    <div className="w-full rounded-full h-2" style={{ background: "#242433" }}>
                      <div
                        className="h-2 rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                        }}
                        data-testid="progress-questions"
                      />
                    </div>
                    <p className="text-xs mt-2 italic" style={{ color: "#9090A8" }} data-testid="text-progress-message">{message}</p>
                  </div>
                );
              })()}
            </div>

          </div>

          {/* Sidebar — Your Plan */}
          <div className="lg:col-span-1 space-y-6">
            <div style={CARD_STYLE} className="p-5">
              <h3 className="font-bold text-white mb-4" style={{ fontSize: "16px" }}>Your Plan</h3>
              <div className="flex items-center gap-2 mb-4">
                <Crown className="w-5 h-5" style={{ color: "#F59E0B" }} />
                <span
                  className="text-sm font-semibold px-2 py-0.5"
                  style={{
                    background: "rgba(245,158,11,0.15)",
                    color: "#FCD34D",
                    borderRadius: "8px",
                    border: "1px solid rgba(245,158,11,0.3)",
                  }}
                  data-testid="badge-tier"
                >
                  {tierLabel}
                </span>
                <span className="text-xs ml-auto" style={{ color: "#9090A8" }}>{subscription?.status || "active"}</span>
              </div>

              <div className="space-y-2 mb-4">
                {currentFeatures.map((feature) => (
                  <div key={feature.label} className="flex items-center gap-2 text-sm">
                    {feature.included ? (
                      <Check className="w-4 h-4 shrink-0" style={{ color: "#22C55E" }} />
                    ) : (
                      <X className="w-4 h-4 shrink-0" style={{ color: "#9090A8" }} />
                    )}
                    <span style={{ color: feature.included ? "#FFFFFF" : "#9090A8" }}>
                      {feature.label}
                    </span>
                  </div>
                ))}
              </div>

              {currentTierKey !== "vip" && (
                <div className="space-y-2 pt-3" style={{ borderTop: "1px solid #2E2E42" }}>
                  {currentTierKey === "free" && (
                    <p className="text-xs mb-2" style={{ color: "#9090A8" }}>
                      Upgrade to Plus for $9.99/mo or VIP for $19.99/mo
                    </p>
                  )}
                  {currentTierKey === "plus" && (
                    <p className="text-xs mb-2" style={{ color: "#9090A8" }}>
                      Upgrade to VIP for $19.99/mo
                    </p>
                  )}
                  <button
                    className="w-full font-semibold text-white btn-press py-3"
                    style={{
                      background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                      borderRadius: "14px",
                      border: "none",
                      fontSize: "15px",
                      boxShadow: "0 4px 20px rgba(124,58,237,0.4)",
                    }}
                    onClick={() => setLocation("/upgrade")}
                    data-testid="button-upgrade"
                  >
                    Upgrade Now
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile sign out */}
        <div className="md:hidden mt-2">
          <button
            className="w-full flex justify-center items-center gap-2 font-medium btn-press py-3"
            style={{
              background: "transparent",
              color: "#9090A8",
              border: "1px solid #2E2E42",
              borderRadius: "14px",
              fontSize: "14px",
            }}
            onClick={() => logout()}
            data-testid="button-logout-profile"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>

      </div>

      <EditProfileDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        profile={profile}
        userId={user?.id || ""}
      />

      <PhotoManagementDialog
        open={showPhotoDialog}
        onOpenChange={setShowPhotoDialog}
        photos={photos || []}
        profile={profile}
        userId={user?.id || ""}
      />

      <Dialog open={showToneDialog} onOpenChange={setShowToneDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Customize Twin Tone</DialogTitle>
            <DialogDescription>Choose how your AI Twin communicates</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm">Communication Style</Label>
              <Select value={toneValues.tone_style} onValueChange={(v) => setToneValues(prev => ({ ...prev, tone_style: v }))}>
                <SelectTrigger data-testid="select-tone-style"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="supportive">Supportive</SelectItem>
                  <SelectItem value="playful">Playful</SelectItem>
                  <SelectItem value="direct">Direct</SelectItem>
                  <SelectItem value="philosophical">Philosophical</SelectItem>
                  <SelectItem value="motivational">Motivational</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Verbosity</Label>
              <Select value={toneValues.verbosity_level} onValueChange={(v) => setToneValues(prev => ({ ...prev, verbosity_level: v }))}>
                <SelectTrigger data-testid="select-verbosity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="concise">Concise</SelectItem>
                  <SelectItem value="balanced">Balanced</SelectItem>
                  <SelectItem value="detailed">Detailed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Formality</Label>
              <Select value={toneValues.formality_level} onValueChange={(v) => setToneValues(prev => ({ ...prev, formality_level: v }))}>
                <SelectTrigger data-testid="select-formality"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Expression Level</Label>
              <Select value={toneValues.emoji_usage} onValueChange={(v) => setToneValues(prev => ({ ...prev, emoji_usage: v }))}>
                <SelectTrigger data-testid="select-emoji-usage"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Minimal</SelectItem>
                  <SelectItem value="minimal">Some</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowToneDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveTone} disabled={updateTone.isPending} data-testid="button-save-tone">
              {updateTone.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showOwnStoryViewer && hasStories && (
        <OwnStoryViewer
          stories={ownStories as OwnStory[]}
          onClose={() => setShowOwnStoryViewer(false)}
          onAddStory={() => { setShowOwnStoryViewer(false); setShowStoryCreator(true); }}
          userName={profile.displayName || user?.firstName || "You"}
          profileImageUrl={avatarUrl || undefined}
        />
      )}
    </LayoutShell>
  );
}

function EditProfileDialog({
  open,
  onOpenChange,
  profile,
  userId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: any;
  userId: string;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName || "");
  const [bio, setBio] = useState(profile.bio || "");
  const [location, setLocation] = useState(profile.location || "");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const updateProfile = useUpdateProfile();

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile.mutateAsync({
        userId,
        data: { displayName, bio, location },
      });
      toast({ title: "Profile updated!" });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Error", description: "Failed to update profile.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>Update your profile information.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-display-name">Display Name</Label>
            <Input
              id="edit-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              data-testid="input-display-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-bio">Bio</Label>
            <Textarea
              id="edit-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              data-testid="input-bio"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-location">Location</Label>
            <Input
              id="edit-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              data-testid="input-location"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-edit">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="btn-press" data-testid="button-save-profile">
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PhotoManagementDialog({
  open,
  onOpenChange,
  photos,
  profile,
  userId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  photos: any[];
  profile: any;
  userId: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const updateProfile = useUpdateProfile();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum size is 5MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const uploadRes = await fetch("/api/uploads/image", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url } = await uploadRes.json();

      const isFirst = photos.length === 0;
      await fetch("/api/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrl: url, orderIndex: photos.length, isMainProfilePhoto: isFirst }),
        credentials: "include",
      });

      if (isFirst) {
        await updateProfile.mutateAsync({ userId, data: { coverPhotoUrl: url } });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/photos", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      toast({ title: "Photo uploaded!" });
    } catch (e) {
      toast({ title: "Error", description: "Failed to upload photo.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (photoId: number) => {
    try {
      await fetch(`/api/photos/${photoId}`, { method: "DELETE", credentials: "include" });
      queryClient.invalidateQueries({ queryKey: ["/api/photos", userId] });
      toast({ title: "Photo removed" });
    } catch (e) {
      toast({ title: "Error", description: "Failed to remove photo.", variant: "destructive" });
    }
  };

  const handleSetCover = async (photoUrl: string) => {
    try {
      await updateProfile.mutateAsync({ userId, data: { coverPhotoUrl: photoUrl } });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      toast({ title: "Cover photo updated!" });
    } catch (e) {
      toast({ title: "Error", description: "Failed to update cover photo.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Photos</DialogTitle>
          <DialogDescription>Upload up to 6 photos. The first one becomes your cover photo.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          {photos.map((photo: any) => (
            <div key={photo.id} className="aspect-square rounded-xl overflow-hidden relative group" style={{ background: "#242433" }} data-testid={`edit-photo-${photo.id}`}>
              <img src={photo.photoUrl} alt="" className="w-full h-full object-cover" />
              {profile.coverPhotoUrl === photo.photoUrl && (
                <span
                  className="absolute top-1 left-1 text-white font-semibold px-1.5 py-0.5"
                  style={{
                    background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                    borderRadius: "6px",
                    fontSize: "10px",
                  }}
                >
                  Cover
                </span>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {profile.coverPhotoUrl !== photo.photoUrl && (
                  <button
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(255,255,255,0.2)" }}
                    onClick={() => handleSetCover(photo.photoUrl)}
                    data-testid={`button-set-cover-${photo.id}`}
                  >
                    <Camera className="w-4 h-4 text-white" />
                  </button>
                )}
                <button
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(239,68,68,0.3)" }}
                  onClick={() => handleDelete(photo.id)}
                  data-testid={`button-delete-photo-${photo.id}`}
                >
                  <Trash2 className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          ))}

          {photos.length < 6 && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="aspect-square rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
              style={{ border: "2px dashed #2E2E42", color: "#9090A8" }}
              data-testid="button-upload-photo"
            >
              {uploading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <ImagePlus className="w-6 h-6" />
                  <span className="text-xs">Upload</span>
                </>
              )}
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileSelect}
          className="hidden"
          data-testid="input-file-upload"
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
