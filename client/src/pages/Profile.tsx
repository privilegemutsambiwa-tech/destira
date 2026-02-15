import { useState, useRef } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useProfile, useUpdateProfile } from "@/hooks/use-profiles";
import { useSubscription, useGenerateSummary } from "@/hooks/use-interactions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Loader2, Sparkles, MapPin, Shield, Eye, EyeOff,
  Camera, Crown, Wand2, MessageCircle, Trash2, ImagePlus
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

export default function Profile() {
  const { data: profile, isLoading } = useProfile();
  const { data: subscription } = useSubscription();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const updateProfile = useUpdateProfile();
  const generateSummary = useGenerateSummary();
  const [showPhotoDialog, setShowPhotoDialog] = useState(false);

  const { data: photos } = useQuery<any[]>({
    queryKey: ["/api/photos", user?.id],
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

  return (
    <LayoutShell>
      <div className="relative">
        <div className="h-48 md:h-64 rounded-md bg-gradient-to-r from-primary/80 to-secondary/80 relative overflow-hidden">
          {profile.coverPhotoUrl && (
            <>
              <img src={profile.coverPhotoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            className="absolute top-4 right-4 bg-background/80 backdrop-blur btn-press"
            onClick={() => setShowPhotoDialog(true)}
            data-testid="button-add-photo"
          >
            <Camera className="w-4 h-4 mr-1" />
            Photos
          </Button>

          <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
            <div className="flex items-end gap-4">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-md bg-background border-4 border-background flex items-center justify-center overflow-hidden shrink-0">
                {(!profile.isPublic && profile.cartoonPhotoUrl) ? (
                  <img src={profile.cartoonPhotoUrl} alt="avatar" className="w-full h-full object-cover" />
                ) : profile.coverPhotoUrl ? (
                  <img src={profile.coverPhotoUrl} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl md:text-5xl font-bold text-primary/20">
                    {profile.displayName?.[0] || user?.firstName?.[0] || "?"}
                  </span>
                )}
              </div>
              <div className="pb-2">
                <h1 className="text-2xl md:text-3xl font-display font-bold mb-1" data-testid="text-display-name">
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
        </div>

        <div className="mt-8 grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
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
              </CardContent>
            </Card>

            {photos && photos.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">My Photos</CardTitle>
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

            {personalityTraits.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Personality Traits</CardTitle>
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
                <div className="flex items-center gap-2">
                  <div className="p-1.5 gradient-bg rounded-md">
                    <Sparkles className="w-5 h-5 text-white" />
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
                    <div className={`h-full rounded-full transition-all gradient-bg ${profile.onboardingCompleted ? 'w-full' : 'w-0'}`} />
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
                    className="w-full btn-press"
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
                  <Button className="w-full btn-press" variant="outline" onClick={() => setLocation("/billing")} data-testid="button-upgrade">
                    Upgrade Plan
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

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
                    className="h-8 w-8 text-white"
                    onClick={() => handleSetCover(photo.photoUrl)}
                    data-testid={`button-set-cover-${photo.id}`}
                  >
                    <Camera className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-white"
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
