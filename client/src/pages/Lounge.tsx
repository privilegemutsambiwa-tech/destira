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
  Loader2, Plus, Search, Lock, Globe, UserPlus, Crown, Shield, BellOff
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
        <h1 className="font-serif font-normal text-[32px] text-vf-text" data-testid="text-lounge-title">
          Lounge
        </h1>
        <p className="mt-1 text-sm text-vf-muted max-w-lg">
          Connect organically in interest-based groups. Chat anonymously and discover unexpected connections.
        </p>
      </div>

      {/* Search + Create */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vf-faint" />
          <input
            placeholder="Search groups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-9 pr-4 text-sm rounded-xl bg-vf-surface border border-vf-line text-vf-text placeholder:text-vf-faint focus:outline-none focus:ring-1 focus:ring-vf-ember/50"
            data-testid="input-search-groups"
          />
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <button
              className="flex items-center gap-2 font-semibold px-4 h-11 rounded-xl btn-press shrink-0 bg-vf-ember text-vf-ink hover:bg-[#FF8163] transition-colors text-sm"
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
            className={`px-4 py-1.5 text-sm font-medium rounded-full border transition-colors btn-press ${
              activeFilter === f.value
                ? "bg-vf-ember border-transparent text-vf-ink"
                : "border-vf-line text-vf-soft hover:border-white/25"
            }`}
            data-testid={`filter-${f.value}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-vf-mint" />
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
      <div className="text-center py-12 text-vf-muted" data-testid="text-no-groups">
        No groups found. Create one to get started!
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {joinedGroups.length > 0 && (
        <div>
          <h2
            className="mb-3 font-mono uppercase tracking-[0.14em] text-[10.5px] text-vf-faint"
            data-testid="text-section-joined"
          >
            Your Groups
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {joinedGroups.map((group, idx) => (
              <GroupCard key={group.id} group={group} idx={idx} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      )}
      {discoverGroups.length > 0 && (
        <div>
          <h2
            className="mb-3 font-mono uppercase tracking-[0.14em] text-[10.5px] text-vf-faint"
            data-testid="text-section-discover"
          >
            Discover Groups
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
  const privacy = PRIVACY_LABELS[group.privacyMode] || PRIVACY_LABELS.open;
  const PrivacyIcon = privacy.icon;
  const preview = group.lastMessageContent
    ? `${group.lastMessageNickname || ""}: ${group.lastMessageContent}`
    : group.description || "No description yet";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04 }}
    >
      <div
        className="rounded-[22px] border border-vf-line bg-vf-surface overflow-hidden cursor-pointer transition-colors hover:border-white/20"
        onClick={() => onNavigate(group.id)}
        data-testid={`card-group-${group.id}`}
      >
        {/* Cover */}
        <div className="h-[140px] relative bg-vf-surface2">
          {group.iconUrl ? (
            <img
              src={group.iconUrl}
              alt={group.name}
              className="w-full h-full object-cover"
              data-testid={`img-group-icon-${group.id}`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Icon className="w-9 h-9 text-vf-faint" />
            </div>
          )}
          {(group.myRole === "owner" || group.myRole === "admin") && (
            <span className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center bg-black/50 backdrop-blur-sm">
              {group.myRole === "owner" ? (
                <Crown className="w-3.5 h-3.5 text-vf-gold" />
              ) : (
                <Shield className="w-3.5 h-3.5 text-vf-soft" />
              )}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[16px] text-vf-text truncate flex-1" data-testid={`text-group-name-${group.id}`}>
              {group.name}
            </span>
            {group.unreadCount > 0 && !group.isMuted && (
              <span
                className="shrink-0 font-mono text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center bg-vf-ember text-vf-ink"
                data-testid={`badge-unread-${group.id}`}
              >
                {group.unreadCount}
              </span>
            )}
            {group.isMuted && group.isMember && (
              <span title="Muted" data-testid={`badge-muted-${group.id}`}>
                <BellOff className="w-3.5 h-3.5 text-vf-faint shrink-0" />
              </span>
            )}
          </div>
          <p className="text-[13px] text-vf-muted mb-4 line-clamp-2 min-h-[2.4em]" data-testid={`text-group-preview-${group.id}`}>
            {group.memberCount} members · {preview}
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 font-mono text-[11px] text-vf-faint">
              <PrivacyIcon className="w-3 h-3" />
              {privacy.label}
            </span>
            {isJoinCard ? (
              <button className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-full btn-press bg-vf-ember text-vf-ink hover:bg-[#FF8163] transition-colors">
                {group.privacyMode === "request-to-join" ? "Request" : "Join"}
              </button>
            ) : (
              <span className="text-[12.5px] font-medium px-3.5 py-1.5 rounded-full border border-vf-line text-vf-soft">
                Joined
              </span>
            )}
          </div>
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
          <label className="text-sm font-medium mb-1 block text-vf-muted">Group Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Photography Enthusiasts"
            className="w-full px-3.5 py-2.5 text-sm rounded-[10px] bg-vf-ink border border-vf-line text-vf-text outline-none focus:ring-1 focus:ring-vf-ember/50"
            data-testid="input-group-name"
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block text-vf-muted">Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this group about?"
            className="w-full px-3.5 py-2.5 text-sm rounded-[10px] bg-vf-ink border border-vf-line text-vf-text outline-none focus:ring-1 focus:ring-vf-ember/50"
            data-testid="input-group-description"
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block text-vf-muted">Privacy</label>
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
          className="px-4 py-2 text-sm font-medium rounded-[10px] border border-vf-line text-vf-muted hover:text-vf-text transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={!name.trim() || createGroup.isPending}
          className="px-4 py-2 text-sm font-semibold rounded-[10px] btn-press disabled:opacity-50 bg-vf-ember text-vf-ink hover:bg-[#FF8163] transition-colors"
          data-testid="button-submit-group"
        >
          {createGroup.isPending ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : null}
          Create Group
        </button>
      </DialogFooter>
    </DialogContent>
  );
}
