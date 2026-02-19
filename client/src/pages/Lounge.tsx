import { useState } from "react";
import { useLocation } from "wouter";
import { LayoutShell } from "@/components/layout-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { AvatarStack } from "@/components/avatar-stack";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Users, Coffee, Mountain, BookOpen, UtensilsCrossed, Sparkles,
  Loader2, Plus, Search, Lock, Globe, UserPlus, Shield, Crown, MessageCircle
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
  if (diffDay < 7) {
    return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" });
  }
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function Lounge() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { data: groups, isLoading } = useGroups(searchQuery || undefined, activeFilter);
  const [, setLocation] = useLocation();

  const joinedGroups = groups?.filter((g: any) => g.isMember) || [];
  const discoverGroups = groups?.filter((g: any) => !g.isMember) || [];

  return (
    <LayoutShell>
      <div className="text-center mb-8">
        <h1 className="font-display font-bold mb-2" data-testid="text-lounge-title">Serendipity Lounge</h1>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto">
          Connect organically in interest-based groups. Chat anonymously and discover unexpected connections.
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search groups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-groups"
          />
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-group">
              <Plus className="w-4 h-4 mr-2" />
              Create Group
            </Button>
          </DialogTrigger>
          <CreateGroupDialog onClose={() => setShowCreateDialog(false)} />
        </Dialog>
      </div>

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {FILTER_OPTIONS.map((f) => (
          <Badge
            key={f.value}
            variant="outline"
            className={`cursor-pointer toggle-elevate ${activeFilter === f.value ? "toggle-elevated" : ""}`}
            onClick={() => setActiveFilter(f.value)}
            data-testid={`filter-${f.value}`}
          >
            {f.label}
          </Badge>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-8">
          {joinedGroups.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="text-section-joined">
                Your Groups
              </h2>
              <div className="space-y-1">
                {joinedGroups.map((group: any, idx: number) => {
                  const Icon = GROUP_ICONS[group.name] || Users;
                  const privacy = PRIVACY_LABELS[group.privacyMode] || PRIVACY_LABELS["open"];
                  const PrivacyIcon = privacy.icon;
                  return (
                    <motion.div
                      key={group.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                    >
                      <div
                        className="flex items-center gap-3 p-3 rounded-md cursor-pointer hover-elevate"
                        onClick={() => setLocation(`/lounge/group/${group.id}`)}
                        data-testid={`card-group-${group.id}`}
                      >
                        <Avatar className="w-12 h-12 shrink-0">
                          {group.photoUrl ? (
                            <AvatarImage src={group.photoUrl} alt={group.name} />
                          ) : null}
                          <AvatarFallback className="gradient-bg text-white">
                            <Icon className="w-5 h-5" />
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold truncate" data-testid={`text-group-name-${group.id}`}>
                              {group.name}
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0" data-testid={`text-group-time-${group.id}`}>
                              {formatRelativeTime(group.lastMessageAt || group.createdAt)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <p className="text-sm text-muted-foreground truncate" data-testid={`text-group-preview-${group.id}`}>
                              {group.lastMessageNickname && group.lastMessageContent
                                ? `${group.lastMessageNickname}: ${group.lastMessageContent}`
                                : group.description}
                            </p>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {group.unreadCount > 0 && (
                                <Badge variant="default" className="no-default-hover-elevate no-default-active-elevate text-[10px] px-1.5 py-0" data-testid={`badge-unread-${group.id}`}>
                                  {group.unreadCount}
                                </Badge>
                              )}
                              <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate text-[10px]">
                                <PrivacyIcon className="w-3 h-3 mr-0.5" />
                                {privacy.label}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Users className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{group.memberCount} members</span>
                            {group.myRole === "owner" && <Crown className="w-3 h-3 text-muted-foreground" />}
                            {group.myRole === "admin" && <Shield className="w-3 h-3 text-muted-foreground" />}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {discoverGroups.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="text-section-discover">
                Discover Groups
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {discoverGroups.map((group: any, idx: number) => {
                  const Icon = GROUP_ICONS[group.name] || Users;
                  const privacy = PRIVACY_LABELS[group.privacyMode] || PRIVACY_LABELS["open"];
                  const PrivacyIcon = privacy.icon;
                  return (
                    <motion.div
                      key={group.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <Card
                        className="cursor-pointer hover-elevate"
                        onClick={() => setLocation(`/lounge/group/${group.id}`)}
                        data-testid={`card-group-${group.id}`}
                      >
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <Avatar className="w-10 h-10 shrink-0">
                              {group.photoUrl ? (
                                <AvatarImage src={group.photoUrl} alt={group.name} />
                              ) : null}
                              <AvatarFallback className="gradient-bg text-white">
                                <Icon className="w-5 h-5" />
                              </AvatarFallback>
                            </Avatar>
                            <Badge variant="secondary" className="shrink-0">
                              <PrivacyIcon className="w-3 h-3 mr-1" />
                              {privacy.label}
                            </Badge>
                          </div>
                          <h3 className="font-bold mb-1">{group.name}</h3>
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{group.description}</p>

                          {group.categoryTag && (
                            <Badge variant="outline" className="mb-3 text-xs no-default-hover-elevate">{group.categoryTag}</Badge>
                          )}

                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <AvatarStack members={group.members || []} max={4} />
                              <span className="text-xs text-muted-foreground">{group.memberCount} members</span>
                            </div>
                            <Badge className="gradient-bg text-white border-0 shrink-0">
                              {group.privacyMode === "request-to-join" ? "Request" : "Join"}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {groups?.length === 0 && (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-no-groups">
              No groups found. Create one to get started!
            </div>
          )}
        </div>
      )}
    </LayoutShell>
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
    } catch (e) {
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
          <label className="text-sm font-medium mb-1 block">Group Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Photography Enthusiasts"
            data-testid="input-group-name"
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Description</label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this group about?"
            data-testid="input-group-description"
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Privacy</label>
          <Select value={privacyMode} onValueChange={setPrivacyMode}>
            <SelectTrigger data-testid="select-privacy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open - Anyone can join</SelectItem>
              <SelectItem value="request-to-join">Request - Approval needed</SelectItem>
              <SelectItem value="invite-only">Invite Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleCreate} disabled={!name.trim() || createGroup.isPending} data-testid="button-submit-group">
          {createGroup.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Create Group
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
