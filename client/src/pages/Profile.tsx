import { useState } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useProfile, useUpdateProfile } from "@/hooks/use-profiles";
import { useSubscription, useGenerateSummary } from "@/hooks/use-interactions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Loader2, Brain, Sparkles, MapPin, Shield, Eye, EyeOff,
  Camera, Crown, Wand2, MessageCircle
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function Profile() {
  const { data: profile, isLoading } = useProfile();
  const { data: subscription } = useSubscription();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const updateProfile = useUpdateProfile();
  const generateSummary = useGenerateSummary();
  const [showPhotoDialog, setShowPhotoDialog] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");

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
          <Button size="lg" onClick={() => setLocation("/onboarding")} data-testid="button-start-onboarding">
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

  const handleAddPhoto = async () => {
    if (!photoUrl.trim()) return;
    try {
      await fetch("/api/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrl, orderIndex: 0, isMainProfilePhoto: !profile.coverPhotoUrl }),
        credentials: "include",
      });
      if (!profile.coverPhotoUrl) {
        await updateProfile.mutateAsync({
          userId: user!.id,
          data: { coverPhotoUrl: photoUrl },
        });
      }
      toast({ title: "Photo added!" });
      setPhotoUrl("");
      setShowPhotoDialog(false);
    } catch (e) {
      toast({ title: "Error", description: "Failed to add photo.", variant: "destructive" });
    }
  };

  const tierLabel = subscription?.tier === "vip" ? "VIP" : subscription?.tier === "plus" ? "Plus" : "Free";

  return (
    <LayoutShell>
      <div className="relative">
        <div className="h-48 md:h-64 rounded-md bg-gradient-to-r from-primary to-primary/60 p-8 flex items-end relative overflow-hidden">
          {profile.coverPhotoUrl && (
            <>
              <img src={profile.coverPhotoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            className="absolute top-4 right-4 bg-background/80 backdrop-blur"
            onClick={() => setShowPhotoDialog(true)}
            data-testid="button-add-photo"
          >
            <Camera className="w-4 h-4 mr-1" />
            Photo
          </Button>

          <div className="relative z-10 flex items-end gap-4 translate-y-12 px-2">
            <div className="w-28 h-28 md:w-36 md:h-36 rounded-md bg-background border-4 border-background flex items-center justify-center overflow-hidden">
              {profile.cartoonPhotoUrl ? (
                <img src={profile.cartoonPhotoUrl} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl md:text-6xl font-bold text-primary/20">
                  {profile.displayName?.[0] || user?.firstName?.[0] || "?"}
                </span>
              )}
            </div>
            <div className="pb-4 md:pb-6">
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-1" data-testid="text-display-name">
                {profile.displayName || user?.firstName}
              </h1>
              <div className="flex items-center gap-3 flex-wrap">
                {profile.location && (
                  <div className="flex items-center gap-1 text-white/90 text-sm">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{profile.location}</span>
                  </div>
                )}
                <Badge variant="secondary" className="text-xs">
                  <Crown className="w-3 h-3 mr-1" />
                  {tierLabel}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-20 grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">About Me</CardTitle>
                {!profile.aboutSummary && (
                  <Button variant="ghost" size="sm" onClick={handleGenerateSummary} disabled={generateSummary.isPending} data-testid="button-generate-summary">
                    {generateSummary.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Wand2 className="w-3 h-3 mr-1" />}
                    AI Summary
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {profile.aboutSummary && (
                  <p className="text-sm text-primary font-medium mb-3 italic" data-testid="text-about-summary">
                    {profile.aboutSummary}
                  </p>
                )}
                <p className="text-muted-foreground leading-relaxed" data-testid="text-bio">
                  {profile.bio || "No bio yet."}
                </p>
                {profile.personalitySummary && (
                  <p className="text-sm text-muted-foreground mt-3 pt-3 border-t italic" data-testid="text-personality-summary">
                    {profile.personalitySummary}
                  </p>
                )}
              </CardContent>
            </Card>

            {personalityTraits.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Personality Traits (VPP)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {personalityTraits.map(([trait, value]) => (
                      <Badge key={trait} variant="secondary" className="capitalize">
                        {trait}: {typeof value === 'number' ? `${value}%` : String(value).slice(0, 50)}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

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
                        {profile.isPublic ? "Others can see your real profile" : "Others see your AI cartoon avatar"}
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
            <Card className="bg-card">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-primary/10 rounded-md">
                    <Sparkles className="w-5 h-5 text-primary" />
                  </div>
                  <CardTitle className="text-base">AI Twin</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2 text-muted-foreground">
                    <span>Status</span>
                    <span>{profile.onboardingCompleted ? "Active" : "Not Started"}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full bg-primary rounded-full transition-all ${profile.onboardingCompleted ? 'w-full' : 'w-0'}`} />
                  </div>
                </div>

                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${profile.onboardingCompleted ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                    Basic Conversation
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${profile.onboardingCompleted ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                    Value Alignment
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${profile.onboardingCompleted ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                    Memory & Learning
                  </div>
                </div>

                {profile.onboardingCompleted && (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => setLocation("/twin-chat")}
                    data-testid="button-chat-twin"
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Chat with My Twin
                  </Button>
                )}

                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                  <Shield className="w-3.5 h-3.5" />
                  Your data is encrypted and secure
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Subscription</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <Badge variant="secondary">
                    <Crown className="w-3 h-3 mr-1" />
                    {tierLabel}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{subscription?.status || "active"}</span>
                </div>
                {tierLabel === "Free" && (
                  <Button className="w-full" variant="outline" onClick={() => setLocation("/billing")} data-testid="button-upgrade">
                    Upgrade Plan
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={showPhotoDialog} onOpenChange={setShowPhotoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Profile Photo</DialogTitle>
            <DialogDescription>Enter a URL for your profile or cover photo.</DialogDescription>
          </DialogHeader>
          <Input
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder="https://example.com/photo.jpg"
            data-testid="input-photo-url"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPhotoDialog(false)}>Cancel</Button>
            <Button onClick={handleAddPhoto} disabled={!photoUrl.trim()} data-testid="button-submit-photo">
              Add Photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LayoutShell>
  );
}
