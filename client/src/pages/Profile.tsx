import { useState, useRef } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useProfile, useUpdateProfile } from "@/hooks/use-profiles";
import { useSubscription, useGenerateSummary, useProfileCompletion } from "@/hooks/use-interactions";
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
  CheckCircle2, Zap, Rocket, ArrowRight, Check, X, Pencil
} from "lucide-react";
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
  const [showPhotoDialog, setShowPhotoDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

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
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex flex-col items-center text-center py-8">
            <Avatar className="w-28 h-28 border-4 border-background" data-testid="avatar-profile">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt={profile.displayName || "Profile"} />
              ) : null}
              <AvatarFallback className="text-3xl font-bold">
                {avatarFallbackLetter}
              </AvatarFallback>
            </Avatar>

            <div className="mt-4 flex items-center gap-2">
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

            <div className="flex items-center gap-3 mt-4 flex-wrap justify-center">
              <Button
                variant="outline"
                className="btn-press"
                onClick={() => setShowEditDialog(true)}
                data-testid="button-edit-profile"
              >
                <Pencil className="w-4 h-4 mr-1.5" />
                Edit Profile
              </Button>
              <Button
                variant="outline"
                className="btn-press"
                onClick={() => setShowPhotoDialog(true)}
                data-testid="button-add-photos"
              >
                <ImagePlus className="w-4 h-4 mr-1.5" />
                Add Photos
              </Button>
            </div>
          </div>

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
              onClick={() => setLocation("/billing")}
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
              {!profile.aboutSummary && (
                <Button variant="ghost" size="sm" onClick={handleGenerateSummary} disabled={generateSummary.isPending} className="btn-press" data-testid="button-generate-summary">
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

          {photos && photos.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">My Photos</CardTitle>
                <Badge variant="secondary" className="text-xs">{photos.length}</Badge>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {photos.map((photo: any) => (
                    <div key={photo.id} className="aspect-square rounded-md overflow-hidden bg-muted" data-testid={`photo-${photo.id}`}>
                      <img src={photo.photoUrl} alt="" className="w-full h-full object-cover" />
                    </div>
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
                    onClick={() => setLocation("/billing")}
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
