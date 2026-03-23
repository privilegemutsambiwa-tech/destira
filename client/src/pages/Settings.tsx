import { useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, User, Brain, Compass, Shield, Bell, Wrench, Crown, HelpCircle,
  AlertTriangle, ChevronRight, LogOut, Trash2, PauseCircle, Eye, EyeOff,
  Volume2, MapPin, MessageSquare, Zap, Check
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useProfile, useUpdateProfile } from "@/hooks/use-profiles";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";

const ROW_STYLE = {
  display: "flex",
  alignItems: "center",
  height: "52px",
  padding: "0 16px",
  cursor: "pointer",
  borderBottom: "1px solid #2E2E42",
};

const SECTION_HEADER_STYLE: React.CSSProperties = {
  fontSize: "11px",
  letterSpacing: "1.5px",
  color: "#9090A8",
  textTransform: "uppercase",
  padding: "20px 16px 8px",
  fontWeight: 600,
};

function ToggleRow({ icon: Icon, label, value, onChange, testId }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}) {
  return (
    <div style={ROW_STYLE} onClick={() => onChange(!value)} data-testid={testId}>
      <Icon className="w-5 h-5 mr-3" style={{ color: "#9090A8" }} />
      <span className="flex-1 text-sm font-medium text-white">{label}</span>
      <div
        className="relative shrink-0"
        style={{
          width: "42px",
          height: "24px",
          borderRadius: "12px",
          background: value ? "linear-gradient(135deg, #7C3AED, #EC4899)" : "#2E2E42",
          transition: "background 0.2s",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "3px",
            left: value ? "21px" : "3px",
            width: "18px",
            height: "18px",
            borderRadius: "50%",
            background: "#FFFFFF",
            transition: "left 0.2s",
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          }}
        />
      </div>
    </div>
  );
}

function ChevronRow({ icon: Icon, label, sublabel, onClick, destructive, testId }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  sublabel?: string;
  onClick: () => void;
  destructive?: boolean;
  testId?: string;
}) {
  return (
    <div style={ROW_STYLE} onClick={onClick} data-testid={testId}>
      <Icon className="w-5 h-5 mr-3" style={{ color: destructive ? "#EF4444" : "#9090A8" }} />
      <div className="flex-1">
        <p className="text-sm font-medium" style={{ color: destructive ? "#EF4444" : "#FFFFFF" }}>{label}</p>
        {sublabel && <p className="text-xs" style={{ color: "#9090A8" }}>{sublabel}</p>}
      </div>
      <ChevronRight className="w-4 h-4" style={{ color: "#9090A8" }} />
    </div>
  );
}

export default function Settings() {
  const [, setLocation] = useLocation();
  const { logout } = useAuth();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const { toast } = useToast();

  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const [notifMatches, setNotifMatches] = useState(() => localStorage.getItem("notif_matches") !== "false");
  const [notifMessages, setNotifMessages] = useState(() => localStorage.getItem("notif_messages") !== "false");
  const [notifStories, setNotifStories] = useState(() => localStorage.getItem("notif_stories") !== "false");
  const [notifInterviews, setNotifInterviews] = useState(() => localStorage.getItem("notif_interviews") !== "false");
  const [discoverable, setDiscoverable] = useState(() => localStorage.getItem("discoverable") !== "false");
  const [showDistance, setShowDistance] = useState(() => profile?.showDistance ?? localStorage.getItem("show_distance") !== "false");

  const handleTogglePublic = async () => {
    if (!profile) return;
    try {
      await updateProfile.mutateAsync({ userId: profile.userId, data: { isPublic: !profile.isPublic } });
      toast({ title: profile.isPublic ? "Profile set to private" : "Profile set to public" });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  function saveNotif(key: string, value: boolean) {
    localStorage.setItem(key, String(value));
  }

  const handleToggleShowDistance = async (v: boolean) => {
    setShowDistance(v);
    localStorage.setItem("show_distance", String(v));
    if (!profile) return;
    try {
      await updateProfile.mutateAsync({ userId: profile.userId, data: { showDistance: v } });
    } catch {
      toast({ title: "Error saving preference", variant: "destructive" });
    }
  };

  const handleComing = (label: string) => {
    toast({ title: `${label}`, description: "Coming soon" });
  };

  return (
    <div
      className="min-h-screen"
      style={{ background: "#0F0F14", color: "#FFFFFF", fontFamily: "'Inter', sans-serif" }}
      data-testid="page-settings"
    >
      <div
        className="sticky top-0 z-10 flex items-center gap-3 px-4"
        style={{ height: "56px", background: "#0F0F14", borderBottom: "1px solid #2E2E42" }}
      >
        <button
          onClick={() => setLocation("/profile")}
          className="w-8 h-8 flex items-center justify-center"
          data-testid="button-settings-back"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="font-bold text-white" style={{ fontSize: "17px" }}>Settings</h1>
      </div>

      <div style={{ maxWidth: "480px", margin: "0 auto", paddingBottom: "40px" }}>

        <div style={SECTION_HEADER_STYLE}>Account</div>
        <div style={{ background: "#1A1A24", margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ChevronRow icon={User} label="Edit Profile" onClick={() => setLocation("/profile")} testId="row-edit-profile" />
          <ChevronRow icon={User} label="Change Email" sublabel="Coming soon" onClick={() => handleComing("Change Email")} testId="row-change-email" />
          <ChevronRow icon={User} label="Change Password" sublabel="Coming soon" onClick={() => handleComing("Change Password")} testId="row-change-password" />
        </div>

        <div style={SECTION_HEADER_STYLE}>Twin Settings</div>
        <div style={{ background: "#1A1A24", margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ChevronRow icon={Brain} label="Interview AI Twin" onClick={() => setLocation("/twin-chat")} testId="row-twin-chat" />
          <ChevronRow icon={Volume2} label="Customize Twin Tone" sublabel="Style, verbosity, formality" onClick={() => { setLocation("/profile"); }} testId="row-twin-tone" />
          <ChevronRow icon={Brain} label="Clear Twin Memory" sublabel="Coming soon" onClick={() => handleComing("Clear Twin Memory")} testId="row-clear-memory" />
        </div>

        <div style={SECTION_HEADER_STYLE}>Discovery</div>
        <div style={{ background: "#1A1A24", margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ToggleRow icon={Compass} label="Discoverable" value={discoverable} onChange={(v) => { setDiscoverable(v); saveNotif("discoverable", v); }} testId="toggle-discoverable" />
          <ToggleRow icon={MapPin} label="Show Distance" value={showDistance} onChange={handleToggleShowDistance} testId="toggle-show-distance" />
          <ChevronRow icon={MapPin} label="Location Preferences" sublabel="Coming soon" onClick={() => handleComing("Location")} testId="row-location" />
          <ChevronRow icon={Compass} label="Age Range" sublabel="Coming soon" onClick={() => handleComing("Age Range")} testId="row-age-range" />
        </div>

        <div style={SECTION_HEADER_STYLE}>Privacy</div>
        <div style={{ background: "#1A1A24", margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ToggleRow
            icon={profile?.isPublic ? Eye : EyeOff}
            label="Public Profile"
            value={profile?.isPublic ?? false}
            onChange={handleTogglePublic}
            testId="toggle-public-profile"
          />
          <ChevronRow icon={Shield} label="Block List" sublabel="Coming soon" onClick={() => handleComing("Block List")} testId="row-block-list" />
          <ChevronRow icon={Shield} label="Data & Privacy" sublabel="Coming soon" onClick={() => handleComing("Data & Privacy")} testId="row-data-privacy" />
        </div>

        <div style={SECTION_HEADER_STYLE}>Notifications</div>
        <div style={{ background: "#1A1A24", margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ToggleRow icon={Zap} label="New Matches" value={notifMatches} onChange={(v) => { setNotifMatches(v); saveNotif("notif_matches", v); }} testId="toggle-notif-matches" />
          <ToggleRow icon={MessageSquare} label="Messages" value={notifMessages} onChange={(v) => { setNotifMessages(v); saveNotif("notif_messages", v); }} testId="toggle-notif-messages" />
          <ToggleRow icon={Bell} label="Stories" value={notifStories} onChange={(v) => { setNotifStories(v); saveNotif("notif_stories", v); }} testId="toggle-notif-stories" />
          <ToggleRow icon={Brain} label="Interview Requests" value={notifInterviews} onChange={(v) => { setNotifInterviews(v); saveNotif("notif_interviews", v); }} testId="toggle-notif-interviews" />
        </div>

        <div style={SECTION_HEADER_STYLE}>Profile Tools</div>
        <div style={{ background: "#1A1A24", margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ChevronRow icon={Wrench} label="Generate AI Summary" onClick={() => { setLocation("/profile"); }} testId="row-ai-summary" />
          <ChevronRow icon={Check} label="Verify Profile" sublabel="Coming soon" onClick={() => handleComing("Verify Profile")} testId="row-verify" />
          <ChevronRow icon={Wrench} label="Manage Photos" onClick={() => { setLocation("/profile"); }} testId="row-manage-photos" />
        </div>

        <div style={SECTION_HEADER_STYLE}>Subscription</div>
        <div style={{ background: "#1A1A24", margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ChevronRow icon={Crown} label="Upgrade Plan" sublabel="Get VIP access" onClick={() => setLocation("/upgrade")} testId="row-upgrade" />
          <ChevronRow icon={Crown} label="Manage Billing" sublabel="Coming soon" onClick={() => handleComing("Billing")} testId="row-billing" />
        </div>

        <div style={SECTION_HEADER_STYLE}>Support</div>
        <div style={{ background: "#1A1A24", margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ChevronRow icon={HelpCircle} label="Help Center" sublabel="Coming soon" onClick={() => handleComing("Help Center")} testId="row-help" />
          <ChevronRow icon={HelpCircle} label="Contact Us" sublabel="Coming soon" onClick={() => handleComing("Contact Us")} testId="row-contact" />
          <ChevronRow icon={HelpCircle} label="Terms of Service" onClick={() => handleComing("Terms")} testId="row-terms" />
          <ChevronRow icon={HelpCircle} label="Privacy Policy" onClick={() => handleComing("Privacy Policy")} testId="row-privacy-policy" />
        </div>

        <div style={SECTION_HEADER_STYLE}>Danger Zone</div>
        <div style={{ background: "#1A1A24", margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ChevronRow icon={LogOut} label="Sign Out" onClick={() => logout()} testId="row-sign-out" />
          <ChevronRow icon={PauseCircle} label="Pause Account" sublabel="Hide your profile temporarily" onClick={() => setShowPauseDialog(true)} destructive testId="row-pause-account" />
          <ChevronRow icon={Trash2} label="Delete Account" sublabel="Permanently remove your data" onClick={() => setShowDeleteDialog(true)} destructive testId="row-delete-account" />
        </div>
      </div>

      <Dialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pause Account</DialogTitle>
            <DialogDescription>Your profile will be hidden from discovery. You can reactivate anytime.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              className="px-4 py-2 text-sm font-medium"
              style={{ color: "#9090A8" }}
              onClick={() => setShowPauseDialog(false)}
              data-testid="button-cancel-pause"
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 text-sm font-semibold text-white"
              style={{ background: "#EF4444", borderRadius: "10px", border: "none" }}
              onClick={() => { setShowPauseDialog(false); toast({ title: "Account paused", description: "Your profile is now hidden." }); }}
              data-testid="button-confirm-pause"
            >
              Pause Account
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>This will permanently delete your profile, matches, and all data. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              className="px-4 py-2 text-sm font-medium"
              style={{ color: "#9090A8" }}
              onClick={() => setShowDeleteDialog(false)}
              data-testid="button-cancel-delete"
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 text-sm font-semibold text-white"
              style={{ background: "#EF4444", borderRadius: "10px", border: "none" }}
              onClick={() => { setShowDeleteDialog(false); toast({ title: "Coming soon", description: "Account deletion is not yet available." }); }}
              data-testid="button-confirm-delete"
            >
              Delete Account
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
