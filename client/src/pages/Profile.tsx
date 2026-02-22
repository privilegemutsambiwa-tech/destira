import { useState, useRef } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useProfile, useUpdateProfile } from "@/hooks/use-profiles";
import { useSubscription, useGenerateSummary, useProfileCompletion, useGenerateAboutMe, useGenerateAISummary, useTwinToneProfile, useUpdateTwinToneProfile, useTwinStructuredProfile, useExtractTwinProfile, useQuestionsProgress } from "@/hooks/use-interactions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Loader2, MapPin, Eye, EyeOff,
  Camera, Crown, Wand2, Trash2, ImagePlus,
  CheckCircle2, Zap, Rocket, ArrowRight, Check, X, Pencil,
  Brain, Sparkles, RefreshCw, Shield, MessageSquare, Volume2, Plus
} from "lucide-react";
import { AddStoryButton } from "@/components/story-viewer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

export default function Profile() {
  const { data: profile, isLoading } = useProfile();
  const { data: subscription } = useSubscription();
  const { data: completion } = useProfileCompletion();
  const { user } = useAuth();
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
  const { data: questionsProgress } = useQuestionsProgress();
  const [showPhotoDialog, setShowPhotoDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showToneDialog, setShowToneDialog] = useState(false);
  const [aboutMePreview, setAboutMePreview] = useState<string | null>(null);
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

  if (isLoading) {
    return (
      <LayoutShell>
        <div className="h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </LayoutShell>
    );
  }

  if (!profile) {
    return (
      <LayoutShell>
        <div className="text-center mt-20">
          <h2 className="text-2xl font-bold">Welcome to VibeFlow!</h2>
          <p className="text-muted-foreground mt-2 mb-6">Complete your Soul-Mapping to get started.</p>
          <Button size="lg" onClick={() => setLocation("/onboarding")} className="btn-press" data-testid="button-start-onboarding">
            Start Soul-Mapping
          </Button>
        </div>
      </LayoutShell>
    );
  }

  const personalityTraits = profile.personalityProfile && typeof profile.personalityProfile === 'object'
    ? Object.entries(profile.personalityProfile as Record<string, any>)
    : [];

  const handleToggleVisibility = async () => {
    try {
      await updateProfile.mutateAsync({
        userId: user!.id,
        data: { isPublic: !profile.isPublic },
      });
      toast({ title: profile.isPublic ? "Profile set to private" : "Profile set to public" });
    } catch (e) {
      toast({ title: "Error", description: "Failed to update visibility.", variant: "destructive" });
    }
  };

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
      case "bio":
        setShowEditDialog(true);
        break;
      case "photos":
        setShowPhotoDialog(true);
        break;
      case "onboarding":
        setLocation("/onboarding");
        break;
      case "verify":
        toast({ title: "Verification coming soon" });
        break;
      case "personality":
        handleGenerateSummary();
        break;
      default:
        break;
    }
  };

  const avatarUrl = (!profile.isPublic && profile.cartoonPhotoUrl)
    ? profile.cartoonPhotoUrl
    : profile.coverPhotoUrl || null;

  const avatarFallbackLetter = profile.displayName?.[0] || user?.firstName?.[0] || "?";

  const highlightChips = personalityTraits.slice(0, 6);

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
        <div className="relative">
          <div className="h-48 md:h-56 rounded-md overflow-hidden bg-gradient-to-r from-primary/30 to-secondary/30">
            {profile.coverPhotoUrl && (
              <img src={profile.coverPhotoUrl} alt="Cover" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="flex flex-col items-center -mt-16 relative z-10">
            <Avatar className="w-32 h-32 border-4 border-background shadow-lg" data-testid="avatar-profile">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt={profile.displayName || "Profile"} />
              ) : null}
              <AvatarFallback className="text-3xl font-bold">
                {avatarFallbackLetter}
              </AvatarFallback>
            </Avatar>

            <div className="mt-3 flex items-center gap-2">
              <h1 className="text-2xl font-bold" data-testid="text-display-name">
                {profile.displayName || user?.firstName}
              </h1>
              {profile.isVerified && (
                <CheckCircle2 className="w-5 h-5 text-blue-500" data-testid="icon-verified" />
              )}
            </div>

            {profile.location && (
              <div className="flex items-center gap-1 text-muted-foreground text-sm mt-1" data-testid="text-location">
                <MapPin className="w-3.5 h-3.5" />
                <span>{profile.location}</span>
              </div>
            )}

            <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
              <Button
                variant="outline"
                onClick={() => setShowEditDialog(true)}
                data-testid="button-edit-profile"
              >
                <Pencil className="w-4 h-4 mr-1.5" />
                Edit Profile
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowPhotoDialog(true)}
                data-testid="button-add-photos"
              >
                <ImagePlus className="w-4 h-4 mr-1.5" />
                Photos
              </Button>
              <AddStoryButton />
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-center overflow-x-auto px-4">
          {photos?.slice(0, 6).map((photo: any) => (
            <div key={photo.id} className="w-16 h-16 rounded-full overflow-hidden border-2 border-muted shrink-0" data-testid={`photo-circle-${photo.id}`}>
              <img src={photo.photoUrl} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
          {(photos?.length || 0) < 6 && (
            <button
              onClick={() => setShowPhotoDialog(true)}
              className="w-16 h-16 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center shrink-0 cursor-pointer"
              data-testid="button-add-photo-circle"
            >
              <Plus className="w-5 h-5 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {completionScore < 100 && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-semibold" data-testid="text-completion-score">
                    {completionScore}% Complete
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Complete your profile to be seen by more people
                </p>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full gradient-bg transition-all duration-500"
                    style={{ width: `${completionScore}%` }}
                    data-testid="progress-completion"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {incompleteTasks.length > 0 && (
            <div className="space-y-3">
              {incompleteTasks.map((task) => (
                <Card
                  key={task.key}
                  className="cursor-pointer hover-elevate"
                  onClick={() => handleTaskAction(task.key)}
                  data-testid={`task-card-${task.key}`}
                >
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div>
                      <p className="text-sm font-medium">{task.label}</p>
                      <p className="text-xs text-muted-foreground">{task.benefit}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Card className="text-center" data-testid="tile-super-matches">
              <CardContent className="pt-6 pb-4">
                <Zap className="w-5 h-5 mx-auto mb-1 text-amber-500" />
                <p className="text-xl font-bold">{profile.superMatchesRemaining || 0}</p>
                <p className="text-xs text-muted-foreground">Super Matches</p>
              </CardContent>
            </Card>
            <Card className="text-center" data-testid="tile-boosts">
              <CardContent className="pt-6 pb-4">
                <Rocket className="w-5 h-5 mx-auto mb-1 text-blue-500" />
                <p className="text-xl font-bold">{profile.boostsRemaining || 0}</p>
                <p className="text-xs text-muted-foreground">Boosts</p>
              </CardContent>
            </Card>
            <Card
              className="text-center cursor-pointer hover-elevate"
              onClick={() => setLocation("/upgrade")}
              data-testid="tile-subscription"
            >
              <CardContent className="pt-6 pb-4">
                <Crown className="w-5 h-5 mx-auto mb-1 text-yellow-500" />
                <p className="text-xl font-bold">{tierLabel}</p>
                <p className="text-xs text-muted-foreground">Subscription</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">About Me</CardTitle>
              <div className="flex gap-1 flex-wrap">
                <Button variant="ghost" size="sm" onClick={handleGenerateAboutMe} disabled={generateAboutMe.isPending} data-testid="button-generate-about-me">
                  {generateAboutMe.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Wand2 className="w-3 h-3 mr-1" />}
                  Generate
                </Button>
                {!profile.aboutSummary && (
                  <Button variant="ghost" size="sm" onClick={handleGenerateSummary} disabled={generateSummary.isPending} data-testid="button-generate-summary">
                    {generateSummary.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
                    Quick Summary
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {aboutMePreview && (
                <div className="mb-4 p-3 rounded-md bg-muted border border-dashed" data-testid="about-me-preview">
                  <p className="text-xs text-muted-foreground mb-2 font-medium">AI-Generated Preview</p>
                  <p className="text-sm leading-relaxed mb-3">{aboutMePreview}</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleApproveAboutMe} data-testid="button-approve-about-me">
                      <Check className="w-3 h-3 mr-1" /> Use This
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleGenerateAboutMe} disabled={generateAboutMe.isPending} data-testid="button-regenerate-about-me">
                      <RefreshCw className="w-3 h-3 mr-1" /> Regenerate
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAboutMePreview(null)} data-testid="button-discard-about-me">
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}
              {profile.aboutSummary && (
                <p className="text-sm text-primary font-medium mb-3 italic" data-testid="text-about-summary">
                  {profile.aboutSummary}
                </p>
              )}
              <p className="text-muted-foreground leading-relaxed" data-testid="text-bio">
                {profile.aboutMe || profile.bio || "No bio yet."}
              </p>
              {highlightChips.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t">
                  {highlightChips.map(([trait]) => (
                    <Badge key={trait} variant="secondary" className="capitalize text-xs">
                      {trait}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2"><Brain className="w-4 h-4" /> Twin Intelligence</CardTitle>
              <Button variant="ghost" size="sm" onClick={handleExtractProfile} disabled={extractProfile.isPending} data-testid="button-extract-profile">
                {extractProfile.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {structuredProfile?.topValues?.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Core Values</p>
                    <div className="flex flex-wrap gap-1">
                      {structuredProfile.topValues.map((v: string) => (
                        <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {structuredProfile?.interests?.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Interests</p>
                    <div className="flex flex-wrap gap-1">
                      {structuredProfile.interests.map((i: string) => (
                        <Badge key={i} variant="outline" className="text-xs">{i}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {structuredProfile?.communicationStyle && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Communication Style</p>
                    <p className="text-sm">{structuredProfile.communicationStyle}</p>
                  </div>
                )}
                {structuredProfile?.relationshipGoals && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Relationship Goals</p>
                    <p className="text-sm">{structuredProfile.relationshipGoals}</p>
                  </div>
                )}
                {(!structuredProfile?.topValues?.length && !structuredProfile?.interests?.length) && (
                  <div className="text-center py-4">
                    <Brain className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Chat with your Twin or answer questions to build your profile</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => setLocation("/twin-chat")} data-testid="button-goto-twin-chat">
                      <MessageSquare className="w-3 h-3 mr-1" /> Chat with Twin
                    </Button>
                  </div>
                )}
                {questionsProgress && (() => {
                  const answered = questionsProgress.totalAnswered || 0;
                  const total = 100;
                  const pct = Math.min(Math.round((answered / total) * 100), 100);
                  let message = "Just getting started! Keep answering to help your Twin learn.";
                  if (pct > 75) message = "Amazing! Your Twin knows you deeply.";
                  else if (pct > 50) message = "Great work! Your Twin understands you well.";
                  else if (pct > 25) message = "Making progress! Your Twin is getting smarter.";
                  return (
                    <div className="pt-3 border-t">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-xs text-muted-foreground font-medium">Questions Progress</p>
                        <span className="text-xs font-semibold">{pct}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2.5">
                        <div className="gradient-bg h-2.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} data-testid="progress-questions" />
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1.5">
                        <p className="text-xs text-muted-foreground">{answered} of {total} answered</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 italic" data-testid="text-progress-message">{message}</p>
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2"><Volume2 className="w-4 h-4" /> Twin Tone</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => { if (toneProfile) setToneValues(toneProfile); setShowToneDialog(true); }} data-testid="button-edit-tone">
                <Pencil className="w-3 h-3 mr-1" /> Edit
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Style</p>
                  <p className="text-sm capitalize">{toneProfile?.tone_style || "supportive"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Verbosity</p>
                  <p className="text-sm capitalize">{toneProfile?.verbosity_level || "balanced"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Formality</p>
                  <p className="text-sm capitalize">{toneProfile?.formality_level || "neutral"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Expression</p>
                  <p className="text-sm capitalize">{toneProfile?.emoji_usage || "minimal"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Privacy Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  {profile.isPublic ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  <div>
                    <p className="text-sm font-medium">{profile.isPublic ? "Public Profile" : "Private Profile"}</p>
                    <p className="text-xs text-muted-foreground">
                      {profile.isPublic ? "Others can see your real photos" : "Others see your AI cartoon avatar instead"}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={profile.isPublic}
                  onCheckedChange={handleToggleVisibility}
                  data-testid="switch-visibility"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your Plan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-4">
                <Crown className="w-5 h-5 text-yellow-500" />
                <Badge variant="secondary" data-testid="badge-tier">{tierLabel}</Badge>
                <span className="text-xs text-muted-foreground ml-auto">{subscription?.status || "active"}</span>
              </div>

              <div className="space-y-2 mb-4">
                {currentFeatures.map((feature) => (
                  <div key={feature.label} className="flex items-center gap-2 text-sm">
                    {feature.included ? (
                      <Check className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                      <X className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                    )}
                    <span className={feature.included ? "" : "text-muted-foreground/60"}>
                      {feature.label}
                    </span>
                  </div>
                ))}
              </div>

              {currentTierKey !== "vip" && (
                <div className="space-y-2 pt-3 border-t">
                  {currentTierKey === "free" && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Upgrade to Plus for $9.99/mo or VIP for $19.99/mo
                    </p>
                  )}
                  {currentTierKey === "plus" && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Upgrade to VIP for $19.99/mo
                    </p>
                  )}
                  <Button
                    className="w-full btn-press"
                    onClick={() => setLocation("/upgrade")}
                    data-testid="button-upgrade"
                  >
                    Upgrade Now
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
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
            <div key={photo.id} className="aspect-square rounded-md overflow-hidden bg-muted relative group" data-testid={`edit-photo-${photo.id}`}>
              <img src={photo.photoUrl} alt="" className="w-full h-full object-cover" />
              {profile.coverPhotoUrl === photo.photoUrl && (
                <Badge className="absolute top-1 left-1 text-[10px] gradient-bg text-white border-0">Cover</Badge>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {profile.coverPhotoUrl !== photo.photoUrl && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleSetCover(photo.photoUrl)}
                    data-testid={`button-set-cover-${photo.id}`}
                  >
                    <Camera className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDelete(photo.id)}
                  data-testid={`button-delete-photo-${photo.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}

          {photos.length < 6 && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="aspect-square rounded-md border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 text-muted-foreground cursor-pointer transition-colors"
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
