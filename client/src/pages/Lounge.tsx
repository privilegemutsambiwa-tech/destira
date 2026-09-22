import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { LayoutShell } from "@/components/layout-shell";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Loader2, Plus, Search, Lock, Globe, UserPlus, Crown, Shield, BellOff, BadgeCheck
} from "lucide-react";
import { useGroups, useGroup, useCreateGroup } from "@/hooks/use-interactions";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { AvatarStack } from "@/components/avatar-stack";

const PRIVACY_LABELS: Record<string, { icon: any; label: string }> = {
  "open": { icon: Globe, label: "Open" },
  "request-to-join": { icon: UserPlus, label: "Request" },
  "invite-only": { icon: Lock, label: "Invite Only" },
};

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "joined", label: "Joined" },
  { value: "official", label: "Official" },
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
        <h1 className="font-serif font-normal text-[clamp(26px,6vw,32px)] leading-[1.05] tracking-[-0.02em] text-vf-text" data-testid="text-lounge-title">
          Lounge
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-vf-muted max-w-lg">
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
              className="vf-btn-primary flex items-center gap-2 font-semibold px-4 h-11 rounded-xl btn-press shrink-0 bg-vf-ember text-vf-ink hover:bg-[var(--vf-ember-soft)] transition-colors text-sm"
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
                : "border-vf-line text-vf-soft hover:border-vf-text/25"
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

// Picks the single most-worth-featuring group out of a section for the
// bento hero slot: unread activity first (that's the group actually asking
// for your attention right now), member count as the tiebreak/fallback for
// sections with no unread state (e.g. Discover, where you have none).
// `preferOfficial` puts curated Destira Lounges ahead of that — used for the
// "Discover Groups" section only, so a browsing (especially brand-new) user
// always lands on a guaranteed-good, guaranteed-joinable room first, not
// whatever happens to have the most members that week.
function pickFeatured(list: any[], preferOfficial = false): { featured: any | null; rest: any[] } {
  if (list.length === 0) return { featured: null, rest: [] };
  const sorted = [...list].sort((a, b) => {
    if (preferOfficial) {
      const officialDiff = (b.isOfficial ? 1 : 0) - (a.isOfficial ? 1 : 0);
      if (officialDiff !== 0) return officialDiff;
    }
    const unreadDiff = (b.unreadCount || 0) - (a.unreadCount || 0);
    if (unreadDiff !== 0) return unreadDiff;
    return (b.memberCount || 0) - (a.memberCount || 0);
  });
  const [featured, ...rest] = sorted;
  return { featured, rest };
}

// A small, neutral badge — deliberately not ember (already means "unread"
// here) or mint (reserved for the AI-twin layer everywhere else in the
// app) — for "this is a Destira-run Lounge, not a member-created one."
function OfficialBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full border border-vf-line text-vf-soft"
      data-testid="badge-official"
    >
      <BadgeCheck className="w-2.5 h-2.5" />
      Official
    </span>
  );
}

function GroupList({ groups, onNavigate }: { groups: any[]; onNavigate: (id: string) => void }) {
  const joined = useMemo(() => pickFeatured(groups.filter((g) => g.isMember)), [groups]);
  const discover = useMemo(() => pickFeatured(groups.filter((g) => !g.isMember), true), [groups]);
  // Only fetched into view when the list above is actually empty (a search
  // or filter came back with nothing) — the curated set a new user always
  // has something to join from, instead of a bare "create one" dead end.
  const { data: officialFallback } = useGroups(undefined, "official");

  if (groups.length === 0) {
    const suggestions = (officialFallback || []).filter((g: any) => !g.isMember).slice(0, 4);
    return (
      <div className="text-center py-12" data-testid="text-no-groups">
        <p className="text-vf-muted mb-6">No groups found. Create one to get started!</p>
        {suggestions.length > 0 && (
          <div className="max-w-2xl mx-auto text-left">
            <h2 className="mb-3 font-mono uppercase tracking-[0.14em] text-[10.5px] text-vf-faint text-center">
              Start with one of these
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {suggestions.map((group: any, idx: number) => (
                <GroupCard key={group.id} group={group} idx={idx} onNavigate={onNavigate} isJoinCard />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {joined.featured && (
        <div>
          <h2
            className="mb-3 font-mono uppercase tracking-[0.14em] text-[10.5px] text-vf-faint"
            data-testid="text-section-joined"
          >
            Your Groups
          </h2>
          <div className="flex flex-col gap-4">
            <FeaturedGroupCard group={joined.featured} onNavigate={onNavigate} />
            {joined.rest.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {joined.rest.map((group, idx) => (
                  <GroupCard key={group.id} group={group} idx={idx} onNavigate={onNavigate} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {discover.featured && (
        <div>
          <h2
            className="mb-3 font-mono uppercase tracking-[0.14em] text-[10.5px] text-vf-faint"
            data-testid="text-section-discover"
          >
            Discover Groups
          </h2>
          <div className="flex flex-col gap-4">
            <FeaturedGroupCard group={discover.featured} onNavigate={onNavigate} isJoinCard />
            {discover.rest.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {discover.rest.map((group, idx) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    idx={idx}
                    onNavigate={onNavigate}
                    isJoinCard
                    // Bento rhythm: every third discover card breaks the grid
                    // and runs wide, so the section doesn't read as a flat,
                    // uniform stack — harmless on a single mobile column,
                    // it only asserts itself once there's a row to break.
                    wide={idx % 3 === 2}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Shared "no photo" treatment — the same serif-initial-on-surface2 language
// Discover's card gallery and Profile's avatar fallback already use, so a
// group without a banner reads as "on brand", not "broken image".
function CoverFallback({ name, size = "text-5xl" }: { name: string; size?: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-vf-surface2">
      <span className={`font-serif text-vf-text/20 ${size}`}>{(name || "?")[0]?.toUpperCase()}</span>
    </div>
  );
}

function RoleBadge({ role }: { role?: string }) {
  if (role !== "owner" && role !== "admin") return null;
  return (
    <span className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center bg-black/50 backdrop-blur-sm">
      {role === "owner" ? (
        <Crown className="w-3.5 h-3.5 text-vf-gold" />
      ) : (
        <Shield className="w-3.5 h-3.5 text-vf-soft" />
      )}
    </span>
  );
}

function JoinCta({ group }: { group: any }) {
  return (
    <button className="vf-btn-primary text-[12.5px] font-semibold px-3.5 py-1.5 rounded-full btn-press bg-vf-ember text-vf-ink hover:bg-[var(--vf-ember-soft)] transition-colors shrink-0">
      {group.privacyMode === "request-to-join" ? "Request" : "Join"}
    </button>
  );
}

// The bento hero: a wide, cover-led card with the room name overlapping the
// photo's bottom edge — the same overlap language Profile uses for its own
// portrait-over-cover header, so the "most active room" reads as a real
// place, not another list row. Only fetches member avatars for this one
// card (not the whole list) — a real photo, when there is one, always gets
// the fixed-dark legibility scrim regardless of theme (matches Discover /
// Profile); the no-photo fallback stays fully theme-aware since there's no
// photo for a dark scrim to sit on top of.
function FeaturedGroupCard({ group, onNavigate, isJoinCard = false }: {
  group: any;
  onNavigate: (id: string) => void;
  isJoinCard?: boolean;
}) {
  const { data: full } = useGroup(group.id);
  const members = Array.isArray(full?.members) ? full.members : [];
  const cover = group.bannerUrl || group.groupPhotoUrl;
  const privacy = PRIVACY_LABELS[group.privacyMode] || PRIVACY_LABELS.open;
  const PrivacyIcon = privacy.icon;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div
        className="vf-card vf-row rounded-[24px] border border-vf-line bg-vf-surface overflow-hidden cursor-pointer transition-colors duration-150 hover:border-vf-text/20"
        onClick={() => onNavigate(group.id)}
        data-testid={`card-group-featured-${group.id}`}
      >
        <div className="relative h-[190px]">
          {cover ? (
            <>
              <img src={cover} alt={group.name} className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-vf-scrim to-transparent pointer-events-none" />
            </>
          ) : (
            <CoverFallback name={group.name} size="text-7xl" />
          )}

          <RoleBadge role={group.myRole} />

          <div className="absolute left-5 right-5 bottom-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div
                className="font-serif font-normal text-[26px] leading-none truncate"
                style={cover ? { color: "#F5F0EA" } : { color: "hsl(var(--vf-text))" }}
                data-testid={`text-group-name-${group.id}`}
              >
                {group.name}
              </div>
              <div className="mt-2.5 flex items-center gap-2.5">
                {members.length > 0 && <AvatarStack members={members} max={4} size="w-6 h-6" />}
                <span
                  className="text-[12px]"
                  style={cover ? { color: "rgba(245,240,234,.75)" } : { color: "var(--vf-muted)" }}
                >
                  {group.memberCount} members
                </span>
              </div>
            </div>
            {group.unreadCount > 0 && !group.isMuted && (
              <span
                className="shrink-0 font-mono text-[11px] rounded-full px-2 py-0.5 min-w-[20px] text-center bg-vf-ember text-vf-ink"
                data-testid={`badge-unread-${group.id}`}
              >
                {group.unreadCount}
              </span>
            )}
          </div>
        </div>

        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-vf-muted line-clamp-1" data-testid={`text-group-preview-${group.id}`}>
              {group.lastMessage ? `${group.lastMessageNickname || "Someone"}: ${group.lastMessage}` : (group.description || "No description yet")}
            </p>
            <span className="mt-1.5 flex items-center gap-2 font-mono text-[10.5px] text-vf-faint">
              <span className="flex items-center gap-1">
                <PrivacyIcon className="w-3 h-3" />
                {privacy.label}
              </span>
              {group.isOfficial && <OfficialBadge />}
            </span>
          </div>
          {isJoinCard ? <JoinCta group={group} /> : (
            <span className="shrink-0 text-[12.5px] font-medium px-3.5 py-1.5 rounded-full border border-vf-line text-vf-soft">
              Joined
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function GroupCard({ group, idx, onNavigate, isJoinCard = false, wide = false }: {
  group: any;
  idx: number;
  onNavigate: (id: string) => void;
  isJoinCard?: boolean;
  wide?: boolean;
}) {
  const privacy = PRIVACY_LABELS[group.privacyMode] || PRIVACY_LABELS.open;
  const PrivacyIcon = privacy.icon;
  const preview = group.lastMessage
    ? `${group.lastMessageNickname || "Someone"}: ${group.lastMessage}`
    : group.description || "No description yet";
  const cover = group.iconUrl || group.bannerUrl || group.groupPhotoUrl;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04 }}
      className={wide ? "sm:col-span-2" : undefined}
    >
      <div
        className={`vf-card vf-row rounded-[22px] border border-vf-line bg-vf-surface overflow-hidden cursor-pointer transition-colors duration-150 hover:border-vf-text/20 ${wide ? "sm:flex sm:items-stretch" : ""}`}
        onClick={() => onNavigate(group.id)}
        data-testid={`card-group-${group.id}`}
      >
        {/* Cover */}
        <div className={`relative bg-vf-surface2 ${wide ? "h-[140px] sm:h-auto sm:w-[180px] shrink-0" : "h-[140px]"}`}>
          {cover ? (
            <img
              src={cover}
              alt={group.name}
              className="w-full h-full object-cover"
              data-testid={`img-group-icon-${group.id}`}
            />
          ) : (
            <CoverFallback name={group.name} />
          )}
          <RoleBadge role={group.myRole} />
        </div>

        {/* Body */}
        <div className="p-4 min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[16px] text-vf-text truncate flex-1" data-testid={`text-group-name-${group.id}`}>
              {group.name}
            </span>
            {group.isOfficial && <OfficialBadge />}
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
            {isJoinCard ? <JoinCta group={group} /> : (
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
    } catch (err) {
      const description = err instanceof Error ? err.message : "Failed to create group.";
      toast({ title: "Error", description, variant: "destructive" });
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-serif font-normal text-2xl leading-tight tracking-normal text-vf-text">Create a New Group</DialogTitle>
        <DialogDescription className="text-vf-muted">Start a conversation space around a shared interest.</DialogDescription>
      </DialogHeader>
      <div className="space-y-5">
        <div>
          <label className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint mb-2 block">Group Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Photography Enthusiasts"
            className="w-full px-3.5 py-2.5 text-sm rounded-[10px] bg-vf-ink border border-vf-line text-vf-text outline-none focus:ring-1 focus:ring-vf-ember/50 transition-shadow duration-150"
            data-testid="input-group-name"
          />
        </div>
        <div>
          <label className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint mb-2 block">Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this group about?"
            className="w-full px-3.5 py-2.5 text-sm rounded-[10px] bg-vf-ink border border-vf-line text-vf-text outline-none focus:ring-1 focus:ring-vf-ember/50 transition-shadow duration-150"
            data-testid="input-group-description"
          />
        </div>
        <div>
          <label className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint mb-2 block">Privacy</label>
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
          className="px-4 py-2 text-sm font-medium rounded-[10px] border border-vf-line text-vf-muted hover:text-vf-text hover:bg-[var(--vf-elevated)] transition-colors duration-150"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={!name.trim() || createGroup.isPending}
          className="vf-btn-primary px-4 py-2 text-sm font-semibold rounded-[10px] btn-press disabled:opacity-50 bg-vf-ember text-vf-ink hover:bg-[var(--vf-ember-soft)] transition-colors"
          data-testid="button-submit-group"
        >
          {createGroup.isPending ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : null}
          Create Group
        </button>
      </DialogFooter>
    </DialogContent>
  );
}
