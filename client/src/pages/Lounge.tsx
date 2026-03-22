import { useState } from "react";
import { useLocation } from "wouter";
import { LayoutShell } from "@/components/layout-shell";
import { Input } from "@/components/ui/input";
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

const GROUP_COLORS: string[] = [
  "#EDE9FE", "#FCE7F3", "#FEF3C7", "#D1FAE5", "#DBEAFE",
];
const GROUP_TEXT_COLORS: string[] = [
  "#7C3AED", "#EC4899", "#D97706", "#059669", "#2563EB",
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
        <h1 className="font-display font-bold text-[#1F2937]" style={{ fontSize: "28px" }} data-testid="text-lounge-title">
          Lounge
        </h1>
        <p className="text-[#6B7280] mt-1" style={{ fontSize: "14px" }}>
          Connect organically in interest-based groups. Chat anonymously and discover unexpected connections.
        </p>
      </div>

      {/* Search + Create */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
          <Input
            placeholder="Search groups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 rounded-lg border-0"
            style={{ background: "#F3F4F6", height: "44px" }}
            data-testid="input-search-groups"
          />
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <button
              className="flex items-center gap-2 font-semibold px-4 py-2 rounded-lg text-white btn-press shrink-0"
              style={{ background: "#7C3AED", height: "44px", fontSize: "14px", border: "none" }}
              data-testid="button-create-group"
            >
              <Plus className="w-4 h-4" />
              Create Group
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
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors btn-press"
            style={
              activeFilter === f.value
                ? { background: "#7C3AED", color: "#fff", border: "none" }
                : { background: "transparent", color: "#6B7280", border: "1px solid #E5E7EB" }
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
      <div className="text-center py-12 text-[#6B7280]" data-testid="text-no-groups">
        No groups found. Create one to get started!
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {joinedGroups.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[#9CA3AF] uppercase tracking-wider mb-3" data-testid="text-section-joined">
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
          <h2 className="text-sm font-semibold text-[#9CA3AF] uppercase tracking-wider mb-3" data-testid="text-section-discover">
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
  const colorIdx = idx % GROUP_COLORS.length;
  const bgColor = GROUP_COLORS[colorIdx];
  const textColor = GROUP_TEXT_COLORS[colorIdx];
  const privacy = PRIVACY_LABELS[group.privacyMode] || PRIVACY_LABELS["open"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04 }}
    >
      <div
        className="flex items-center gap-4 p-4 bg-white rounded-2xl cursor-pointer transition-all"
        style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
        onClick={() => onNavigate(group.id)}
        data-testid={`card-group-${group.id}`}
        onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 8px 16px rgba(0,0,0,0.10)")}
        onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)")}
      >
        {/* Left: colored circle icon */}
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
          style={{ background: bgColor }}
        >
          <Icon className="w-6 h-6" style={{ color: textColor }} />
        </div>

        {/* Middle: name / description / members */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-bold text-[#1F2937] truncate" style={{ fontSize: "16px" }} data-testid={`text-group-name-${group.id}`}>
              {group.name}
            </span>
            {group.myRole === "owner" && <Crown className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />}
            {group.myRole === "admin" && <Shield className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />}
          </div>
          <p className="text-[#6B7280] text-sm truncate line-clamp-1 mb-1" style={{ fontSize: "13px" }} data-testid={`text-group-preview-${group.id}`}>
            {group.lastMessageContent
              ? `${group.lastMessageNickname || ""}: ${group.lastMessageContent}`
              : group.description}
          </p>
          <div className="flex items-center gap-3 text-[#9CA3AF]" style={{ fontSize: "12px" }}>
            <div className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              <span>{group.memberCount} members</span>
            </div>
            <span>{formatRelativeTime(group.lastMessageAt || group.createdAt)}</span>
          </div>
        </div>

        {/* Right: CTA button or unread badge */}
        <div className="shrink-0 flex items-center gap-2">
          {group.unreadCount > 0 && (
            <span
              className="text-xs font-bold text-white rounded-full px-2 py-0.5 min-w-[20px] text-center"
              style={{ background: "#7C3AED", fontSize: "10px" }}
              data-testid={`badge-unread-${group.id}`}
            >
              {group.unreadCount}
            </span>
          )}
          {isJoinCard ? (
            <button
              className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white btn-press"
              style={{ background: "#7C3AED", border: "none", fontSize: "13px" }}
            >
              {group.privacyMode === "request-to-join" ? "Request" : "Join"}
            </button>
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "#F3F4F6" }}
            >
              <MessageCircle className="w-4 h-4 text-[#6B7280]" />
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

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Create a New Group</DialogTitle>
        <DialogDescription>Start a conversation space around a shared interest.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block text-[#1F2937]">Group Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Photography Enthusiasts"
            data-testid="input-group-name"
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block text-[#1F2937]">Description</label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this group about?"
            data-testid="input-group-description"
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block text-[#1F2937]">Privacy</label>
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
          className="px-4 py-2 rounded-lg border text-[#374151] text-sm font-medium hover:bg-[#F3F4F6] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={!name.trim() || createGroup.isPending}
          className="px-4 py-2 rounded-lg text-white text-sm font-semibold btn-press disabled:opacity-50"
          style={{ background: "#7C3AED", border: "none" }}
          data-testid="button-submit-group"
        >
          {createGroup.isPending ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : null}
          Create Group
        </button>
      </DialogFooter>
    </DialogContent>
  );
}
