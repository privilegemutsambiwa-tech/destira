import { useState, useRef } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useProfile, useUpdateProfile } from "@/hooks/use-profiles";
import { useSubscription, useGenerateSummary, useProfileCompletion, useTwinToneProfile, useUpdateTwinToneProfile, useTwinStructuredProfile, useExtractTwinProfile, useTwinMemory } from "@/hooks/use-interactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Loader2, MapPin,
  Camera, Crown, Trash2, ImagePlus,
  CheckCircle2, Check, X, Pencil,
  Brain, Sparkles, Plus, LogOut, Settings
} from "lucide-react";
import { AddStoryButton, OwnStoryViewer, type OwnStory } from "@/components/story-viewer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

const CARD = "rounded-[20px] border border-vf-line bg-vf-surface";

const NUDGE_KEY = "vf_referral_nudge_dismissed";

/** Shown once the user is clearly enjoying it (readiness > 60) and hasn't
 *  referred anyone yet. Dismissal persists. */
function ReferralNudge({ completionScore }: { completionScore: number }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(NUDGE_KEY) === "1"; } catch { return false; }
  });
  const { data } = useQuery<{ url: string; counts: { pending: number; qualified: number; rewarded: number } }>({
    queryKey: ["/api/referrals/me"],
  });

  const joined = data ? data.counts.pending + data.counts.qualified + data.counts.rewarded : 0;
  if (dismissed || completionScore <= 60 || joined > 0 || !data) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(NUDGE_KEY, "1"); } catch { /* noop */ }
  };
  const copy = () => { navigator.clipboard?.writeText(data.url).catch(() => {}); };

  return (
    <div
      className="relative rounded-[18px] border border-vf-line bg-vf-surface2 p-4 pr-10"
      data-testid="referral-nudge"
    >
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 text-vf-faint hover:text-vf-text transition-colors"
        data-testid="button-dismiss-nudge"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">Bring your people</div>
      <p className="text-[14px] text-vf-text mt-1.5 leading-[1.5]">
        Every friend who joins gets you five more profile views. Your daily read stays one a day.
      </p>
      <button
        onClick={copy}
        className="mt-3 inline-flex items-center rounded-full bg-vf-ember text-vf-ink font-bold px-4 h-9 text-[13px] btn-press hover:bg-[#FF8163] transition-colors"
        data-testid="button-nudge-copy"
      >
        Copy invite link
      </button>
    </div>
  );
}

function myEventStatusChip(status: string): { label: string; cls: string } | null {
  if (status === "pending_review") return { label: "In review", cls: "text-vf-gold border-vf-gold/30 bg-vf-gold/10" };
  if (status === "cancelled") return { label: "Called off", cls: "text-vf-faint border-vf-line" };
  if (status === "draft") return { label: "Draft", cls: "text-vf-faint border-vf-line" };
  return null;
}

function YourEventsCard() {
  const [, setLocation] = useLocation();
  const { data } = useQuery<any[]>({
    queryKey: ["/api/events/mine"],
    queryFn: async () => {
      const r = await fetch("/api/events/mine", { credentials: "include" });
      return r.ok ? r.json() : [];
    },
  });
  const events = data ?? [];
  const shown = events
    .filter((e) => e.status === "cancelled" || new Date(e.startsAt).getTime() > Date.now())
    .slice(0, 4);

  return (
    <div className="rounded-[20px] border border-vf-line bg-vf-surface2 p-5" data-testid="section-your-events">
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">Your events</div>
        <button
          onClick={() => setLocation("/events/host")}
          className="text-[12px] text-vf-ember hover:text-[#FF8163] transition-colors"
          data-testid="button-host-from-profile"
        >
          Host one
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="text-[13px] text-vf-muted leading-[1.5]">
          Nothing you're hosting yet. Put on the thing you'd want to be invited to.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {shown.map((e) => {
            const chip = myEventStatusChip(e.status);
            return (
              <button
                key={e.id}
                onClick={() => setLocation(`/events/${e.id}`)}
                className="text-left group"
                data-testid={`my-event-${e.id}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] text-vf-text truncate group-hover:text-white">{e.title}</span>
                  {chip && (
                    <span
                      className={`shrink-0 font-mono text-[9.5px] uppercase tracking-[0.12em] border rounded-full px-1.5 py-0.5 ${chip.cls}`}
                    >
                      {chip.label}
                    </span>
                  )}
                </div>
                <div className="text-[11.5px] text-vf-faint mt-0.5">
                  {new Date(e.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {e.goingCount}{" "}
                  going
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Profile() {
  const { data: profile, isLoading } = useProfile();
  const { data: subscription } = useSubscription();
  const { data: completion } = useProfileCompletion();
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const updateProfile = useUpdateProfile();
  const generateSummary = useGenerateSummary();
  const { data: toneProfile } = useTwinToneProfile();
  const updateTone = useUpdateTwinToneProfile();
  const { data: structuredProfile } = useTwinStructuredProfile();
  const extractProfile = useExtractTwinProfile();
  const { data: twinMemory } = useTwinMemory();
  const [showPhotoDialog, setShowPhotoDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showToneDialog, setShowToneDialog] = useState(false);
  const [bioEditorOpen, setBioEditorOpen] = useState(false);
  const [bioEditorValue, setBioEditorValue] = useState("");
  const [polishingBio, setPolishingBio] = useState(false);
  const [polishedPreview, setPolishedPreview] = useState<string | null>(null);
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
          <Loader2 className="w-8 h-8 animate-spin text-vf-mint" />
        </div>
      </LayoutShell>
    );
  }

  if (!profile) {
    return (
      <LayoutShell>
        <div className="text-center mt-20">
          <h2 className="font-serif text-2xl text-vf-text">Welcome to VibeFlow!</h2>
          <p className="mt-2 mb-6 text-vf-muted">Complete your Soul-Mapping to get started.</p>
          <button
            onClick={() => setLocation("/onboarding")}
            className="font-semibold btn-press px-8 h-12 rounded-full bg-vf-ember text-vf-ink hover:bg-[#FF8163] transition-colors"
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

  const handleOpenBioEditor = () => {
    setBioEditorValue(profile.aboutMe || profile.bio || "");
    setBioEditorOpen(true);
  };

  const handleSaveBioAsIs = async () => {
    try {
      await updateProfile.mutateAsync({ userId: user!.id, data: { aboutMe: bioEditorValue, bio: bioEditorValue } });
      setBioEditorOpen(false);
      toast({ title: "Bio saved!" });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
    } catch {
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    }
  };

  const handlePolishBio = async () => {
    if (!bioEditorValue.trim()) return;
    setPolishingBio(true);
    setPolishedPreview(null);
    try {
      const res = await fetch("/api/profile/polish-bio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio: bioEditorValue }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to polish");
      const data = await res.json();
      setPolishedPreview(data.polished);
    } catch {
      toast({ title: "Error", description: "Failed to polish bio.", variant: "destructive" });
    } finally {
      setPolishingBio(false);
    }
  };

  const handleAcceptPolished = () => {
    if (!polishedPreview) return;
    setBioEditorValue(polishedPreview);
    setPolishedPreview(null);
    toast({ title: "Bio polished!", description: "AI refinement applied. Save when ready." });
  };

  const tierLabel = subscription?.tier === "vip" ? "VIP" : subscription?.tier === "plus" ? "Plus" : "Free";

  const completionScore = completion?.score ?? profile.profileCompletionScore ?? 0;
  const completionTasks: Array<{ key: string; label: string; benefit: string; completed: boolean }> = completion?.tasks ?? [];
  const nextTask = completionTasks.find(t => !t.completed);

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
  const highlightChips: string[] = personalityTraits.filter(t => t.length < 20).slice(0, 6);
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

        <ReferralNudge completionScore={completionScore} />

        {/* Hero */}
        <div className="relative">
          <div className="overflow-hidden rounded-[20px]" style={{ height: "200px" }}>
            {profile.coverPhotoUrl ? (
              <img src={profile.coverPhotoUrl} alt="Cover" className="w-full h-full object-cover" />
            ) : (
              <div
                className="w-full h-full"
                style={{ background: "radial-gradient(120% 140% at 50% 0%, rgba(143,227,199,.14), transparent 60%), var(--vf-surface2)" }}
              />
            )}
          </div>
          <div className="flex flex-col items-center" style={{ marginTop: "-48px" }}>
            <div
              className="relative rounded-full overflow-hidden bg-vf-surface2"
              style={{ width: "96px", height: "96px", border: "4px solid var(--vf-ink)", zIndex: 10 }}
              data-testid="avatar-profile"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={profile.displayName || "Profile"} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="font-serif text-2xl text-vf-text">{avatarFallbackLetter}</span>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <h1 className="font-serif text-2xl text-vf-text" data-testid="text-display-name">
                {profile.displayName || user?.firstName}
              </h1>
              {profile.isVerified && (
                <CheckCircle2 className="w-5 h-5 text-[#60A5FA]" data-testid="icon-verified" />
              )}
            </div>

            {profile.location && (
              <div className="flex items-center gap-1 text-sm mt-1 text-vf-muted" data-testid="text-location">
                <MapPin className="w-3.5 h-3.5" />
                <span>{profile.location}</span>
              </div>
            )}

            <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
              <button
                onClick={() => setShowEditDialog(true)}
                className="flex items-center gap-1.5 font-medium text-sm btn-press px-4 py-2 rounded-[10px] border border-vf-line text-vf-text hover:border-white/25 transition-colors"
                data-testid="button-edit-profile"
              >
                <Pencil className="w-4 h-4" />
                Edit Profile
              </button>
              <button
                onClick={() => setShowPhotoDialog(true)}
                className="flex items-center gap-1.5 font-medium text-sm btn-press px-4 py-2 rounded-[10px] border border-vf-line text-vf-text hover:border-white/25 transition-colors"
                data-testid="button-add-photos"
              >
                <ImagePlus className="w-4 h-4" />
                Photos
              </button>
              <button
                onClick={() => setLocation("/settings")}
                className="flex items-center gap-1.5 font-medium text-sm btn-press px-4 py-2 rounded-[10px] border border-vf-line text-vf-text hover:border-white/25 transition-colors"
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
                  className="p-[2px] rounded-full border-2 border-vf-ember cursor-pointer"
                  data-testid="button-view-own-story"
                >
                  <div className="p-[2px] rounded-full bg-vf-ink">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center font-serif text-xl bg-vf-surface2 text-vf-text">
                      {(profile.displayName || user?.firstName || "U")[0]}
                    </div>
                  </div>
                </button>
                <span className="text-xs font-medium text-vf-ember" data-testid="text-story-active">
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
              className="w-16 h-16 rounded-full overflow-hidden shrink-0 border-2 border-vf-line"
              data-testid={`photo-circle-${photo.id}`}
            >
              <img src={photo.photoUrl} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
          {(photos?.length || 0) < 6 && (
            <button
              onClick={() => setShowPhotoDialog(true)}
              className="w-16 h-16 rounded-full flex items-center justify-center shrink-0 cursor-pointer border-2 border-dashed border-vf-line hover:border-white/25 transition-colors"
              data-testid="button-add-photo-circle"
            >
              <Plus className="w-5 h-5 text-vf-faint" />
            </button>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">

            {/* About Me */}
            <div className={`${CARD} p-5`}>
              <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <h3 className="font-serif text-lg text-vf-text">About Me</h3>
                  <button
                    onClick={handleOpenBioEditor}
                    className="btn-press p-1 rounded-md text-vf-faint hover:text-vf-text"
                    data-testid="button-edit-bio-inline"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button
                  className="text-xs font-medium flex items-center gap-1.5 btn-press px-3 py-1.5 rounded-lg border border-vf-mint/30 bg-vf-mint/10 text-vf-mint hover:bg-vf-mint/15 transition-colors"
                  onClick={handleGenerateSummary}
                  disabled={generateSummary.isPending}
                  data-testid="button-generate-summary"
                >
                  {generateSummary.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  Refresh Summary
                </button>
              </div>

              {bioEditorOpen && (
                <div className="mb-4 p-3 rounded-xl border border-vf-line bg-vf-surface2" data-testid="bio-editor">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-vf-muted">Edit your bio</p>
                    <span className={`text-xs ${bioEditorValue.length > 280 ? "text-vf-ember" : "text-vf-muted"}`}>
                      {bioEditorValue.length}/300
                    </span>
                  </div>
                  <Textarea
                    value={bioEditorValue}
                    onChange={e => setBioEditorValue(e.target.value.slice(0, 300))}
                    placeholder="Tell people about yourself..."
                    rows={4}
                    className="text-sm text-vf-text mb-3 resize-none bg-vf-ink border-vf-line rounded-[10px]"
                    data-testid="input-bio-editor"
                  />
                  <div className="flex gap-2 flex-wrap">
                    <button
                      className="text-xs font-medium btn-press px-3 py-1.5 rounded-lg border border-vf-line text-vf-text hover:border-white/25 transition-colors"
                      onClick={handleSaveBioAsIs}
                      disabled={updateProfile.isPending}
                      data-testid="button-save-bio-as-is"
                    >
                      {updateProfile.isPending ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : <Check className="w-3 h-3 inline mr-1" />}
                      Save as is
                    </button>
                    <button
                      className="text-xs font-medium btn-press px-3 py-1.5 rounded-lg bg-vf-mint/10 border border-vf-mint/30 text-vf-mint hover:bg-vf-mint/15 transition-colors"
                      onClick={handlePolishBio}
                      disabled={polishingBio || !bioEditorValue.trim()}
                      data-testid="button-polish-bio"
                    >
                      {polishingBio ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : <Sparkles className="w-3 h-3 inline mr-1" />}
                      Polish with AI
                    </button>
                    <button
                      className="text-xs btn-press px-2 py-1.5 text-vf-faint hover:text-vf-text"
                      onClick={() => { setBioEditorOpen(false); setPolishedPreview(null); }}
                      data-testid="button-close-bio-editor"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  {polishedPreview && (
                    <div className="mt-3 p-3 rounded-[10px] border border-dashed border-vf-mint/40 bg-vf-mint/5" data-testid="polished-bio-preview">
                      <p className="text-xs font-medium mb-2 text-vf-mint">AI-polished version</p>
                      <p className="text-sm text-vf-text leading-relaxed mb-3">{polishedPreview}</p>
                      <div className="flex gap-2">
                        <button
                          className="text-xs font-medium btn-press px-3 py-1.5 rounded-lg bg-vf-mint text-vf-ink hover:bg-[#A9EDD6] transition-colors"
                          onClick={handleAcceptPolished}
                          data-testid="button-accept-polished"
                        >
                          <Check className="w-3 h-3 inline mr-1" /> Use this
                        </button>
                        <button
                          className="text-xs btn-press px-3 py-1.5 rounded-lg border border-vf-line text-vf-muted hover:text-vf-text transition-colors"
                          onClick={() => setPolishedPreview(null)}
                          data-testid="button-discard-polished"
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {profile.aboutSummary && (
                <p className="text-sm font-medium mb-3 italic text-vf-mint" data-testid="text-about-summary">
                  {profile.aboutSummary}
                </p>
              )}

              <p className="leading-relaxed text-vf-muted" data-testid="text-bio">
                {profile.aboutMe || profile.bio || "No bio yet."}
              </p>

              {highlightChips.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-vf-line">
                  {highlightChips.map((trait) => (
                    <span
                      key={trait}
                      className="capitalize text-xs font-medium px-2.5 py-1 rounded-full border border-vf-line text-vf-soft"
                    >
                      {trait}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Twin Intelligence */}
            <div className={`${CARD} p-5`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-vf-mint/12">
                  <Brain className="w-4 h-4 text-vf-mint" />
                </div>
                <div className="flex-1">
                  <h3 className="font-serif text-lg text-vf-text">Twin Intelligence</h3>
                  <p className="text-xs text-vf-muted">Chat with your Twin to train it</p>
                </div>
                <button
                  onClick={handleExtractProfile}
                  disabled={extractProfile.isPending}
                  className="text-xs font-medium text-vf-mint hover:text-vf-text transition-colors"
                  data-testid="button-extract-profile"
                >
                  {extractProfile.isPending ? <Loader2 className="w-3 h-3 animate-spin inline" /> : <Sparkles className="w-3 h-3 inline" />}
                  {" "}Refresh
                </button>
              </div>

              <button
                onClick={() => setLocation("/twin-chat?from=/profile")}
                className="w-full font-medium py-3 mb-4 btn-press rounded-full border border-vf-mint/35 bg-vf-mint/10 text-vf-mint hover:bg-vf-mint/15 transition-colors"
                style={{ height: "48px", fontSize: "15px" }}
                data-testid="button-interview-ai-twin"
              >
                <Brain className="w-4 h-4 inline mr-2" />
                Chat with My Twin
              </button>

              <div className="space-y-3">
                {structuredProfile?.topValues?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1 text-vf-muted">Core Values</p>
                    <div className="flex flex-wrap gap-1.5">
                      {structuredProfile.topValues.map((v: string) => (
                        <span
                          key={v}
                          className="text-xs px-2.5 py-1 font-medium capitalize rounded-full border border-vf-mint/25 bg-vf-mint/10 text-vf-mint"
                        >
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {structuredProfile?.interests?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1 text-vf-muted">Interests</p>
                    <div className="flex flex-wrap gap-1.5">
                      {structuredProfile.interests.map((i: string) => (
                        <span
                          key={i}
                          className="text-xs px-2.5 py-1 rounded-full border border-vf-line text-vf-soft"
                        >
                          {i}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {structuredProfile?.communicationStyle && (
                  <div>
                    <p className="text-xs font-medium mb-1 text-vf-muted">Communication Style</p>
                    <p className="text-sm text-vf-text">{structuredProfile.communicationStyle}</p>
                  </div>
                )}
                {(!structuredProfile?.topValues?.length && !structuredProfile?.interests?.length) && (
                  <p className="text-sm text-center py-2 text-vf-faint">Answer questions to help your Twin learn about you.</p>
                )}
              </div>

              {(() => {
                const memoryFacts = twinMemory?.facts || [];
                const chatFacts = memoryFacts.filter((f: any) => f.source !== "onboarding").length;
                const onboardingAnswered = profile.twinQuestionsAnswered || 0;
                const totalAnswered = onboardingAnswered + chatFacts;
                const total = 100;
                const pct = Math.min(Math.round((totalAnswered / total) * 100), 100);
                let message = "Just getting started — your onboarding is saved!";
                if (pct >= 100) message = "Twin fully trained — you're getting the best matches!";
                else if (pct >= 76) message = "Your Twin is nearly fully trained!";
                else if (pct >= 51) message = "Your Twin knows you well. Almost there!";
                else if (pct >= 26) message = "Your Twin is learning — keep the conversations going.";
                else if (pct >= 11) message = "Good start! Chat with your Twin to teach it more.";
                return (
                  <div className="pt-3 mt-3 border-t border-vf-line">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-xs font-medium text-vf-muted">Twin Training Progress</p>
                      <span className="font-mono text-xs text-vf-mint" data-testid="text-twin-progress-count">{totalAnswered} of {total} answered ({pct}%)</span>
                    </div>
                    <div className="w-full rounded-full h-1.5 bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-vf-mint transition-all duration-500"
                        style={{ width: `${pct}%` }}
                        data-testid="progress-questions"
                      />
                    </div>
                    <p className="text-xs mt-2 italic text-vf-muted" data-testid="text-progress-message">{message}</p>
                  </div>
                );
              })()}
            </div>

          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <YourEventsCard />
            {nextTask && (
              <div className="rounded-[20px] border border-dashed border-vf-line bg-vf-surface2 p-5">
                <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-vf-faint mb-2">
                  profile completion · {completionScore}%
                </div>
                <div className="h-1 rounded-full bg-white/10 overflow-hidden mb-3">
                  <div className="h-full bg-vf-ember" style={{ width: `${completionScore}%` }} />
                </div>
                <p className="text-sm text-vf-text mb-1">{nextTask.label}</p>
                <p className="text-xs text-vf-muted mb-3">{nextTask.benefit}</p>
                <button
                  onClick={() => handleTaskAction(nextTask.key)}
                  className="text-xs font-medium text-vf-ember hover:text-[#FF8163] transition-colors"
                  data-testid="button-next-task"
                >
                  Do this now →
                </button>
              </div>
            )}

            <div className="rounded-[22px] border border-vf-gold/30 p-5" style={{ background: "linear-gradient(150deg, rgba(233,196,106,.11), rgba(233,196,106,.02))" }}>
              <div className="flex items-center gap-2 mb-4">
                <Crown className="w-5 h-5 text-vf-gold" />
                <span
                  className="text-sm font-semibold px-2.5 py-0.5 rounded-lg border border-vf-gold/30 bg-vf-gold/15 text-vf-gold"
                  data-testid="badge-tier"
                >
                  {tierLabel}
                </span>
                <span className="text-xs ml-auto text-vf-muted">{subscription?.status || "active"}</span>
              </div>

              <div className="space-y-2 mb-4">
                {currentFeatures.map((feature) => (
                  <div key={feature.label} className="flex items-center gap-2 text-sm">
                    {feature.included ? (
                      <Check className="w-4 h-4 shrink-0 text-vf-mint" />
                    ) : (
                      <X className="w-4 h-4 shrink-0 text-vf-faint" />
                    )}
                    <span className={feature.included ? "text-vf-text" : "text-vf-faint"}>
                      {feature.label}
                    </span>
                  </div>
                ))}
              </div>

              {currentTierKey !== "vip" && (
                <div className="space-y-2 pt-3 border-t border-vf-gold/20">
                  {currentTierKey === "free" && (
                    <p className="text-xs mb-2 text-vf-muted">
                      Upgrade to Plus for $9.99/mo or VIP for $19.99/mo
                    </p>
                  )}
                  {currentTierKey === "plus" && (
                    <p className="text-xs mb-2 text-vf-muted">
                      Upgrade to VIP for $19.99/mo
                    </p>
                  )}
                  <button
                    className="w-full font-semibold btn-press py-3 rounded-full bg-vf-gold text-vf-ink hover:bg-[#F3D890] transition-colors"
                    style={{ fontSize: "15px" }}
                    onClick={() => setLocation("/billing")}
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
            className="w-full flex justify-center items-center gap-2 font-medium btn-press py-3 rounded-2xl border border-vf-line text-vf-faint hover:text-vf-text transition-colors"
            style={{ fontSize: "14px" }}
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
  const initialName = profile.displayName || "";
  const initialBio = profile.bio || "";
  const initialLocation = profile.location || "";

  const [displayName, setDisplayName] = useState(initialName);
  const [bio, setBio] = useState(initialBio);
  const [location, setLocation] = useState(initialLocation);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const updateProfile = useUpdateProfile();

  const BIO_MAX = 240;
  const pristine =
    displayName === initialName &&
    bio === initialBio &&
    location === initialLocation;

  const inputClass =
    "bg-white/5 border-vf-line rounded-[12px] text-vf-text focus-visible:ring-2 focus-visible:ring-vf-ember/60 focus-visible:ring-offset-2 focus-visible:ring-offset-vf-surface";

  const handleSave = async () => {
    if (pristine) return;
    setSaving(true);
    try {
      await updateProfile.mutateAsync({
        userId,
        data: { displayName, bio: bio.slice(0, BIO_MAX), location },
      });
      toast({ title: "Profile updated" });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Error", description: "Failed to update profile.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md bg-vf-surface border-vf-line"
        style={{ borderRadius: "26px" }}
      >
        <DialogHeader>
          <DialogTitle className="font-serif font-normal text-vf-text text-2xl">Edit profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-display-name" className="text-vf-soft text-[13px]">Display name</Label>
            <Input
              id="edit-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClass}
              data-testid="input-display-name"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-bio" className="text-vf-soft text-[13px]">In your words</Label>
              <span className="font-mono text-[10.5px] text-vf-faint tabular-nums">
                {bio.length}/{BIO_MAX}
              </span>
            </div>
            <Textarea
              id="edit-bio"
              value={bio}
              maxLength={BIO_MAX}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
              rows={4}
              className={`${inputClass} resize-none`}
              data-testid="input-bio"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-location" className="text-vf-soft text-[13px]">Location</Label>
            <Input
              id="edit-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={inputClass}
              data-testid="input-location"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="text-sm font-medium text-vf-muted hover:text-vf-text px-4 h-11 transition-colors"
            data-testid="button-cancel-edit"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || pristine}
            className="inline-flex items-center justify-center rounded-full bg-vf-ember text-vf-ink font-bold px-6 h-11 text-sm btn-press transition-colors hover:bg-[#FF8163] disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="button-save-profile"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
            Save
          </button>
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
            <div key={photo.id} className="aspect-square rounded-xl overflow-hidden relative group bg-vf-surface2" data-testid={`edit-photo-${photo.id}`}>
              <img src={photo.photoUrl} alt="" className="w-full h-full object-cover" />
              {profile.coverPhotoUrl === photo.photoUrl && (
                <span className="absolute top-1 left-1 font-semibold px-1.5 py-0.5 rounded-md bg-vf-ember text-vf-ink" style={{ fontSize: "10px" }}>
                  Cover
                </span>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {profile.coverPhotoUrl !== photo.photoUrl && (
                  <button
                    className="w-8 h-8 rounded-full flex items-center justify-center bg-white/20"
                    onClick={() => handleSetCover(photo.photoUrl)}
                    data-testid={`button-set-cover-${photo.id}`}
                  >
                    <Camera className="w-4 h-4 text-white" />
                  </button>
                )}
                <button
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-red-500/30"
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
              className="aspect-square rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors border-2 border-dashed border-vf-line text-vf-faint hover:border-white/25"
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
