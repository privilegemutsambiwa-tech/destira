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
  Loader2, Plus, Search, Lock, Globe, UserPlus, BellOff, BadgeCheck, X, ChevronRight, Users
} from "lucide-react";
import { useGroups, useCreateGroup, useJoinGroup } from "@/hooks/use-interactions";
import { useToast } from "@/hooks/use-toast";
import { usePaywall } from "@/hooks/use-paywall";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { avatarColor } from "@/lib/avatar-color";

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

// One-time (dismissible, reappears after a week if closed) line explaining
// what Lounge is: most visitors have never used group-based chat for dating.
function LoungeIntroTip() {
  const qc = useQueryClient();
  const { data } = useQuery<{ dismissed: boolean }>({
    queryKey: ["/api/reminders", "lounge_intro_tip"],
    queryFn: async () => {
      const res = await fetch("/api/reminders/lounge_intro_tip", { credentials: "include" });
      if (!res.ok) return { dismissed: true };
      return res.json();
    },
  });
  if (!data || data.dismissed) return null;
  const dismiss = async () => {
    await fetch("/api/reminders/lounge_intro_tip/dismiss", { method: "POST", credentials: "include" });
    qc.invalidateQueries({ queryKey: ["/api/reminders", "lounge_intro_tip"] });
  };
  return (
    <div className="mb-4 rounded-[14px] bg-vf-mint/10 px-3.5 py-2.5 flex items-center justify-between gap-3" data-testid="strip-lounge-intro">
      <p className="text-[13px] text-vf-text leading-[1.45]">
        Join a group to chat and play games with people who like what you like. The easy way to meet people.
      </p>
      <button onClick={dismiss} className="text-vf-muted hover:text-vf-text shrink-0 p-1 -m-1" aria-label="Dismiss" data-testid="button-dismiss-lounge-intro">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function Lounge() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { data: groups, isLoading } = useGroups(searchQuery || undefined, activeFilter);
  const [, setLocation] = useLocation();

  return (
    <LayoutShell>
      {/* Header: the title, with the one action beside it */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif font-normal text-[clamp(28px,7vw,34px)] leading-[1.05] tracking-[-0.02em] text-vf-text" data-testid="text-lounge-title">
            Lounge
          </h1>
          <p className="mt-1 text-[14px] text-vf-muted">Groups for the things you're into.</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <button
              className="vf-btn-primary flex items-center gap-1.5 font-semibold pl-3 pr-4 h-10 rounded-full btn-press shrink-0 bg-vf-ember text-white hover:bg-[var(--vf-ember-soft)] transition-colors text-[14px] mt-1"
              data-testid="button-create-group"
            >
              <Plus className="w-4 h-4" />
              New group
            </button>
          </DialogTrigger>
          <CreateGroupDialog onClose={() => setShowCreateDialog(false)} />
        </Dialog>
      </div>

      <LoungeIntroTip />

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-vf-faint" />
        <input
          placeholder="Search groups"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-11 pl-10 pr-4 text-[15px] rounded-full bg-vf-surface border border-vf-line text-vf-text placeholder:text-vf-faint focus:outline-none focus:ring-2 focus:ring-vf-ember/40"
          data-testid="input-search-groups"
        />
      </div>

      {/* Filters: one row that scrolls sideways on a phone, never wraps */}
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 mb-5 flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f.value}
            onClick={() => setActiveFilter(f.value)}
            className={`shrink-0 px-4 h-9 text-[13.5px] font-medium rounded-full border transition-colors btn-press ${
              activeFilter === f.value
                ? "bg-vf-text border-transparent text-vf-ink"
                : "bg-vf-surface border-vf-line text-vf-text hover:border-vf-text/25"
            }`}
            data-testid={`filter-${f.value}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-[18px] bg-vf-surface border border-vf-line animate-pulse">
              <div className="w-14 h-14 rounded-[14px] bg-vf-text/10" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-1/2 rounded bg-vf-text/10" />
                <div className="h-3 w-3/4 rounded bg-vf-text/[0.07]" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <GroupList groups={groups || []} onNavigate={(id) => setLocation(`/lounge/group/${id}`)} />
      )}
    </LayoutShell>
  );
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

function JoinCta({ group }: { group: any }) {
  const [status, setStatus] = useState<"idle" | "joined" | "requested">("idle");
  const joinGroup = useJoinGroup();
  const paywall = usePaywall();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const performJoin = () => {
    joinGroup.mutate(group.id, {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries({ queryKey: ["/api/lounge/groups"] });
        if (data?.status === "requested") {
          setStatus("requested");
          toast({ title: "Request sent", description: "You'll be let in once an admin approves." });
        } else {
          setStatus("joined");
        }
      },
      onError: (err: Error) => {
        toast({ title: "Couldn't join", description: err.message, variant: "destructive" });
      },
    });
  };

  if (status === "joined") {
    return (
      <span className="shrink-0 text-[12.5px] font-medium px-3.5 py-1.5 rounded-full border border-vf-line text-vf-soft">
        Joined
      </span>
    );
  }
  if (status === "requested") {
    return (
      <span className="shrink-0 text-[12.5px] font-medium px-3.5 py-1.5 rounded-full border border-vf-line text-vf-soft">
        Requested
      </span>
    );
  }

  return (
    <>
      <button
        onClick={(e) => {
          // The card behind this pill navigates on click — join, don't navigate.
          e.stopPropagation();
          paywall.guard("join_group", performJoin);
        }}
        disabled={joinGroup.isPending}
        className="vf-btn-primary text-[12.5px] font-semibold px-3.5 py-1.5 rounded-full btn-press bg-vf-ember text-vf-ink hover:bg-[var(--vf-ember-soft)] transition-colors shrink-0 disabled:opacity-60"
        data-testid={`button-join-${group.id}`}
      >
        {joinGroup.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (group.privacyMode === "request-to-join" ? "Request" : "Join")}
      </button>
      {paywall.sheet}
    </>
  );
}

function SectionTitle({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-vf-muted" data-testid={testId}>
      {children}
    </h2>
  );
}

const coverOf = (g: any): string | null => g.iconUrl || g.groupPhotoUrl || g.bannerUrl || null;
const bannerOf = (g: any): string | null => g.bannerUrl || g.groupPhotoUrl || null;

// Destira's own Lounges first (always good, always joinable), then the busiest.
function sortForDiscover(list: any[]) {
  return [...list].sort(
    (a, b) => (b.isOfficial ? 1 : 0) - (a.isOfficial ? 1 : 0) || (b.memberCount || 0) - (a.memberCount || 0),
  );
}

function GroupList({ groups, onNavigate }: { groups: any[]; onNavigate: (id: string) => void }) {
  const joined = useMemo(
    () => groups.filter((g) => g.isMember).sort((a, b) => (b.unreadCount || 0) - (a.unreadCount || 0)),
    [groups],
  );
  const discover = useMemo(() => sortForDiscover(groups.filter((g) => !g.isMember)), [groups]);
  // Groups with a real cover photo get the sideways "Featured" row; the rest
  // are compact rows, so a phone shows many groups at once.
  const featured = useMemo(() => discover.filter((g) => bannerOf(g)).slice(0, 6), [discover]);
  const rest = useMemo(() => {
    const ids = new Set(featured.map((g) => g.id));
    return discover.filter((g) => !ids.has(g.id));
  }, [discover, featured]);
  // Fetched into view only when a search or filter came back empty, so a new
  // member always has something to join instead of a dead end.
  const { data: officialFallback } = useGroups(undefined, "official");

  if (groups.length === 0) {
    const suggestions = (officialFallback || []).filter((g: any) => !g.isMember).slice(0, 4);
    return (
      <div className="py-8" data-testid="text-no-groups">
        <div className="text-center mb-6">
          <div className="mx-auto w-12 h-12 rounded-full bg-vf-surface2 flex items-center justify-center mb-3">
            <Users className="w-5 h-5 text-vf-muted" />
          </div>
          <p className="text-[15px] text-vf-text font-medium">No groups match that</p>
          <p className="text-[13.5px] text-vf-muted mt-1">Try another search, or start your own group.</p>
        </div>
        {suggestions.length > 0 && (
          <div className="max-w-2xl mx-auto">
            <SectionTitle>Popular to start with</SectionTitle>
            <div className="space-y-2">
              {suggestions.map((group: any) => (
                <GroupRow key={group.id} group={group} onNavigate={onNavigate} join />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {joined.length > 0 && (
        <section>
          <SectionTitle testId="text-section-joined">Your groups</SectionTitle>
          <div className="rounded-[20px] bg-vf-surface border border-vf-line divide-y divide-vf-line overflow-hidden">
            {joined.map((group) => (
              <GroupRow key={group.id} group={group} onNavigate={onNavigate} flat />
            ))}
          </div>
        </section>
      )}

      {featured.length > 0 && (
        <section>
          <SectionTitle>Featured</SectionTitle>
          <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {featured.map((group) => (
              <FeaturedCard key={group.id} group={group} onNavigate={onNavigate} solo={featured.length === 1} />
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <SectionTitle testId="text-section-discover">{featured.length > 0 ? "More groups" : "Discover groups"}</SectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {rest.map((group) => (
              <GroupRow key={group.id} group={group} onNavigate={onNavigate} join />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** A group's picture: its photo, or a warm tile with its initial (also when
 *  the photo fails to load, so a broken image never shows). */
function GroupThumb({ group, className = "w-14 h-14 rounded-[14px] text-[22px]" }: { group: any; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = coverOf(group);
  if (src && !failed) {
    return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className={`${className} object-cover shrink-0 bg-vf-surface2`} />;
  }
  return (
    <div
      className={`${className} shrink-0 flex items-center justify-center font-serif text-white`}
      style={{ background: `linear-gradient(135deg, ${avatarColor(String(group.id))}, ${avatarColor(group.name)})` }}
      aria-hidden="true"
    >
      {(group.name || "?").trim()[0]?.toUpperCase()}
    </div>
  );
}

/** One group as a compact row: picture, name, what it's about, and the one
 *  thing to do (join it, or open it). */
function GroupRow({ group, onNavigate, join = false, flat = false }: { group: any; onNavigate: (id: string) => void; join?: boolean; flat?: boolean }) {
  const privacy = PRIVACY_LABELS[group.privacyMode] || PRIVACY_LABELS.open;
  const PrivacyIcon = privacy.icon;
  const unread = group.unreadCount > 0 && !group.isMuted ? group.unreadCount : 0;
  const line = group.isMember && group.lastMessage
    ? `${group.lastMessageNickname || "Someone"}: ${group.lastMessage}`
    : group.description || "A new group. Say hello.";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(group.id)}
      onKeyDown={(e) => e.key === "Enter" && onNavigate(group.id)}
      className={`flex items-center gap-3 p-3 cursor-pointer transition-colors active:bg-vf-text/[0.04] hover:bg-vf-text/[0.02] ${
        flat ? "" : "rounded-[18px] bg-vf-surface border border-vf-line"
      }`}
      data-testid={`card-group-${group.id}`}
    >
      <GroupThumb group={group} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-[15.5px] truncate text-vf-text ${unread ? "font-semibold" : "font-medium"}`} data-testid={`text-group-name-${group.id}`}>
            {group.name}
          </span>
          {group.isOfficial && <OfficialBadge />}
          {group.isMuted && group.isMember && <BellOff className="w-3.5 h-3.5 text-vf-faint shrink-0" aria-label="Muted" />}
        </div>
        <p className={`text-[13.5px] truncate mt-0.5 ${unread ? "text-vf-text" : "text-vf-muted"}`} data-testid={`text-group-preview-${group.id}`}>
          {line}
        </p>
        {!group.isMember && (
          <p className="mt-1 flex items-center gap-2.5 text-[12px] text-vf-faint">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {group.memberCount > 0 ? group.memberCount : "New"}
            </span>
            <span className="flex items-center gap-1">
              <PrivacyIcon className="w-3 h-3" />
              {privacy.label}
            </span>
          </p>
        )}
      </div>
      {join ? (
        <JoinCta group={group} />
      ) : unread ? (
        <span className="shrink-0 font-semibold text-[11.5px] rounded-full px-2 py-0.5 min-w-[22px] text-center bg-vf-ember text-white" data-testid={`badge-unread-${group.id}`}>
          {unread > 99 ? "99+" : unread}
        </span>
      ) : (
        <ChevronRight className="w-4 h-4 text-vf-faint shrink-0" />
      )}
    </div>
  );
}

/** Featured: a cover-led card in the sideways row. */
function FeaturedCard({ group, onNavigate, solo = false }: { group: any; onNavigate: (id: string) => void; solo?: boolean }) {
  const [failed, setFailed] = useState(false);
  const banner = bannerOf(group);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(group.id)}
      onKeyDown={(e) => e.key === "Enter" && onNavigate(group.id)}
      className={`snap-start shrink-0 ${solo ? "w-full sm:w-[360px]" : "w-[72%] sm:w-[260px]"} rounded-[20px] overflow-hidden bg-vf-surface border border-vf-line cursor-pointer`}
      data-testid={`card-group-featured-${group.id}`}
    >
      <div className="relative aspect-[16/10]">
        {banner && !failed ? (
          <img src={banner} alt="" loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <GroupThumb group={group} className="absolute inset-0 w-full h-full text-[48px]" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute left-3.5 right-3.5 bottom-3">
          <div className="font-serif text-[21px] leading-tight text-white line-clamp-2">{group.name}</div>
          <div className="mt-1 flex items-center gap-1 text-[12px] text-white/80">
            <Users className="w-3 h-3" /> {group.memberCount ?? 0} members
          </div>
        </div>
        {group.isOfficial && (
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/90 text-black">
            <BadgeCheck className="w-3 h-3" /> Official
          </span>
        )}
      </div>
      <div className="p-3 flex items-center justify-between gap-2">
        <p className="text-[13px] text-vf-muted line-clamp-1 min-w-0">{group.description || "Come say hello."}</p>
        <JoinCta group={group} />
      </div>
    </div>
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
