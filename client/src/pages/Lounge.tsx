import { useState } from "react";
import { useLocation } from "wouter";
import { LayoutShell } from "@/components/layout-shell";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Users, Coffee, Mountain, BookOpen, UtensilsCrossed, Sparkles,
  Loader2, Plus, Search, Lock, Globe, UserPlus, Crown, Shield, MessageCircle
} from "lucide-react";
import { useGroups, useCreateGroup } from "@/hooks/use-interactions";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

const GROUP_ICONS: Record<string, any> = {
  "Morning Coffee": Coffee,
  "Adventure Seekers": Mountain,
  "Book Club": BookOpen,
  "Foodies Unite": UtensilsCrossed,
  "Mindfulness & Growth": Sparkles,
};

const GROUP_ICON_COLORS = [
  { bg: "rgba(124,58,237,0.18)", color: "#A78BFA" },
  { bg: "rgba(236,72,153,0.18)", color: "#F472B6" },
  { bg: "rgba(245,158,11,0.18)", color: "#FCD34D" },
  { bg: "rgba(34,197,94,0.18)", color: "#4ADE80" },
  { bg: "rgba(59,130,246,0.18)", color: "#60A5FA" },
];

const PRIVACY_LABELS: Record<string, { icon: any; label: string }> = {
  "open": { icon: Globe, label: "Open" },
  "request-to-join": { icon: UserPlus, label: "Request" },
  "invite-only": { icon: Lock, label: "Invite Only" },
};

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "joined", label: "Joined" },
  { value: "popular", label: "Popular" },
  { value: "new", label: "New" },
];

function formatRelativeTime(dateStr: string | undefined): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return "now";
  if (diffHr < 1) return `${diffMin}m`;
  if (diffDay < 1) return `${diffHr}h`;
  if (diffDay < 7) return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" });
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function Lounge() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { data: groups, isLoading } = useGroups(searchQuery || undefined, activeFilter);
  const [, setLocation] = useLocation();

  return (
    <LayoutShell>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-bold text-white" style={{ fontSize: "28px", letterSpacing: "-0.5px" }} data-testid="text-lounge-title">
          Lounge
        </h1>
        <p className="mt-1" style={{ fontSize: "14px", color: "#9090A8" }}>
          Connect organically in interest-based groups. Chat anonymously and discover unexpected connections.
        </p>
      </div>

      {/* Search + Create */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#9090A8" }} />
          <input
            placeholder="Search groups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 text-white focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
            style={{
              background: "#1A1A24",
              border: "1px solid #2E2E42",
              borderRadius: "12px",
              height: "44px",
              fontSize: "14px",
            }}
            data-testid="input-search-groups"
          />
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <button
              className="flex items-center gap-2 font-semibold px-4 py-2 text-white btn-press shrink-0"
              style={{
                background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                height: "44px",
                fontSize: "14px",
                borderRadius: "12px",
                border: "none",
                boxShadow: "0 4px 20px rgba(124,58,237,0.35)",
              }}
              data-testid="button-create-group"
            >
              <Plus className="w-4 h-4" />
              Create
            </button>
          </DialogTrigger>
          <CreateGroupDialog onClose={() => setShowCreateDialog(false)} />
        </Dialog>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f.value}
            onClick={() => setActiveFilter(f.value)}
            className="px-4 py-1.5 text-sm font-medium transition-colors btn-press"
            style={
              activeFilter === f.value
                ? {
                    background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                    color: "#FFFFFF",
                    borderRadius: "100px",
                    border: "none",
                  }
                : {
                    background: "transparent",
                    color: "#9090A8",
                    borderRadius: "100px",
                    border: "1px solid #2E2E42",
                  }
            }
            data-testid={`filter-${f.value}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#7C3AED" }} />
        </div>
      ) : (
        <GroupList groups={groups || []} onNavigate={(id) => setLocation(`/lounge/group/${id}`)} />
      )}
    </LayoutShell>
  );
}

function GroupList({ groups, onNavigate }: { groups: any[]; onNavigate: (id: string) => void }) {
  const joinedGroups = groups.filter((g) => g.isMember);
  const discoverGroups = groups.filter((g) => !g.isMember);

  if (groups.length === 0) {
    return (
      <div className="text-center py-12" style={{ color: "#9090A8" }} data-testid="text-no-groups">
        No groups found. Create one to get started!
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {joinedGroups.length > 0 && (
        <div>
          <h2
            className="mb-3 font-semibold uppercase tracking-wider"
            style={{ fontSize: "11px", color: "#9090A8", letterSpacing: "1px" }}
            data-testid="text-section-joined"
          >
            Your Groups
          </h2>
          <div className="space-y-2">
            {joinedGroups.map((group, idx) => (
              <GroupCard key={group.id} group={group} idx={idx} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      )}
      {discoverGroups.length > 0 && (
        <div>
          <h2
            className="mb-3 font-semibold uppercase tracking-wider"
            style={{ fontSize: "11px", color: "#9090A8", letterSpacing: "1px" }}
            data-testid="text-section-discover"
          >
            Discover Groups
          </h2>
          <div className="space-y-2">
            {discoverGroups.map((group, idx) => (
              <GroupCard key={group.id} group={group} idx={idx} onNavigate={onNavigate} isJoinCard />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GroupCard({ group, idx, onNavigate, isJoinCard = false }: {
  group: any;
  idx: number;
  onNavigate: (id: string) => void;
  isJoinCard?: boolean;
}) {
  const Icon = GROUP_ICONS[group.name] || Users;
  const colorSet = GROUP_ICON_COLORS[idx % GROUP_ICON_COLORS.length];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04 }}
    >
      <div
        className="flex items-center gap-4 p-4 cursor-pointer transition-all card-lift"
        style={{
          background: "#1A1A24",
          borderRadius: "16px",
          border: "1px solid #2E2E42",
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        }}
        onClick={() => onNavigate(group.id)}
        data-testid={`card-group-${group.id}`}
      >
        {/* Icon */}
        {group.iconUrl ? (
          <img
            src={group.iconUrl}
            alt={group.name}
            className="w-12 h-12 rounded-full shrink-0 object-cover"
            data-testid={`img-group-icon-${group.id}`}
          />
        ) : (
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
            style={{ background: colorSet.bg }}
          >
            <Icon className="w-6 h-6" style={{ color: colorSet.color }} />
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-bold text-white truncate" style={{ fontSize: "15px" }} data-testid={`text-group-name-${group.id}`}>
              {group.name}
            </span>
            {group.myRole === "owner" && <Crown className="w-3.5 h-3.5 shrink-0" style={{ color: "#F59E0B" }} />}
            {group.myRole === "admin" && <Shield className="w-3.5 h-3.5 shrink-0" style={{ color: "#9090A8" }} />}
          </div>
          <p
            className="truncate line-clamp-1 mb-1"
            style={{ fontSize: "13px", color: "#9090A8" }}
            data-testid={`text-group-preview-${group.id}`}
          >
            {group.lastMessageContent
              ? `${group.lastMessageNickname || ""}: ${group.lastMessageContent}`
              : group.description}
          </p>
          <div className="flex items-center gap-3" style={{ fontSize: "12px", color: "#9090A8" }}>
            <div className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              <span>{group.memberCount} members</span>
            </div>
            <span>{formatRelativeTime(group.lastMessageAt || group.createdAt)}</span>
          </div>
        </div>

        {/* Right CTA / unread */}
        <div className="shrink-0 flex items-center gap-2">
          {group.unreadCount > 0 && (
            <span
              className="text-xs font-bold text-white rounded-full px-2 py-0.5 min-w-[20px] text-center"
              style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)", fontSize: "10px" }}
              data-testid={`badge-unread-${group.id}`}
            >
              {group.unreadCount}
            </span>
          )}
          {isJoinCard ? (
            <button
              className="text-sm font-semibold px-3 py-1.5 text-white btn-press"
              style={{
                background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                border: "none",
                fontSize: "13px",
                borderRadius: "10px",
              }}
            >
              {group.privacyMode === "request-to-join" ? "Request" : "Join"}
            </button>
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "#242433" }}
            >
              <MessageCircle className="w-4 h-4" style={{ color: "#9090A8" }} />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function CreateGroupDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [privacyMode, setPrivacyMode] = useState("open");
  const createGroup = useCreateGroup();
  const { toast } = useToast();

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      await createGroup.mutateAsync({ name, description, privacyMode });
      toast({ title: "Group created!", description: `"${name}" is ready for conversations.` });
      onClose();
    } catch {
      toast({ title: "Error", description: "Failed to create group.", variant: "destructive" });
    }
  };

  const inputStyle = {
    background: "#1A1A24",
    border: "1px solid #2E2E42",
    borderRadius: "10px",
    color: "#FFFFFF",
    padding: "10px 14px",
    fontSize: "14px",
    width: "100%",
    outline: "none",
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Create a New Group</DialogTitle>
        <DialogDescription>Start a conversation space around a shared interest.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block" style={{ color: "#9090A8" }}>Group Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Photography Enthusiasts"
            style={inputStyle}
            data-testid="input-group-name"
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block" style={{ color: "#9090A8" }}>Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this group about?"
            style={inputStyle}
            data-testid="input-group-description"
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block" style={{ color: "#9090A8" }}>Privacy</label>
          <Select value={privacyMode} onValueChange={setPrivacyMode}>
            <SelectTrigger data-testid="select-privacy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open — Anyone can join</SelectItem>
              <SelectItem value="request-to-join">Request — Approval needed</SelectItem>
              <SelectItem value="invite-only">Invite Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium transition-colors"
          style={{ borderRadius: "10px", border: "1px solid #2E2E42", color: "#9090A8", background: "transparent" }}
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={!name.trim() || createGroup.isPending}
          className="px-4 py-2 text-sm font-semibold text-white btn-press disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, #7C3AED, #EC4899)",
            border: "none",
            borderRadius: "10px",
          }}
          data-testid="button-submit-group"
        >
          {createGroup.isPending ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : null}
          Create Group
        </button>
      </DialogFooter>
    </DialogContent>
  );
}
