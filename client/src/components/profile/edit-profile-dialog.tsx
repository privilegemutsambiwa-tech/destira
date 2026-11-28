// Your profile: the edit dialog (split out of pages/Profile.tsx).
import { useState } from "react";
import { useUpdateProfile } from "@/hooks/use-profiles";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { RefineWithAI } from "@/components/refine-with-ai";
import { useToast } from "@/hooks/use-toast";

export function EditProfileDialog({
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
    "bg-vf-text/5 border-vf-line rounded-[12px] text-vf-text focus-visible:ring-2 focus-visible:ring-vf-ember/60 focus-visible:ring-offset-2 focus-visible:ring-offset-vf-surface";

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
      <DialogContent className="sm:max-w-md bg-vf-surface border-vf-line" style={{ borderRadius: "26px" }}>
        <DialogHeader>
          <DialogTitle className="font-serif font-normal text-vf-text text-2xl">Edit profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-display-name" className="text-vf-soft text-[13px]">Display name</Label>
            <Input id="edit-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} data-testid="input-display-name" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-bio" className="text-vf-soft text-[13px]">In your words</Label>
              <span className="font-mono text-[10.5px] text-vf-faint tabular-nums">{bio.length}/{BIO_MAX}</span>
            </div>
            <Textarea
              id="edit-bio"
              value={bio}
              maxLength={BIO_MAX}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
              rows={4}
              className={`${inputClass} resize-none`}
              data-testid="input-bio-dialog"
            />
            <RefineWithAI
              value={bio}
              fieldType="bio"
              onApply={(text) => setBio(text.slice(0, BIO_MAX))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-location" className="text-vf-soft text-[13px]">Location</Label>
            <Input id="edit-location" value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} data-testid="input-location" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <button onClick={() => onOpenChange(false)} className="text-sm font-medium text-vf-muted hover:text-vf-text px-4 h-11 transition-colors" data-testid="button-cancel-edit">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || pristine}
            className="inline-flex items-center justify-center rounded-full bg-vf-ember text-vf-ink font-bold px-6 h-11 text-sm btn-press vf-btn-primary transition-colors hover:bg-[var(--vf-ember-soft)] disabled:opacity-40 disabled:cursor-not-allowed"
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
