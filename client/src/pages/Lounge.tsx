import { useState } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AvatarStack } from "@/components/avatar-stack";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Users, Coffee, Mountain, BookOpen, UtensilsCrossed, Sparkles,
  Send, ArrowLeft, Loader2, Plus, Search, Lock, Globe, UserPlus,
  Shield, Crown, Trash2, Settings, Link2, Copy, Check, X, LogOut
} from "lucide-react";
import {
  useGroups, useJoinGroup, useGroupMessages, useSendGroupMessage,
  useGroup, useCreateGroup, useLeaveGroup, useDeleteGroupMessage,
  useRemoveGroupMember, useUpdateMemberRole, useCreateInviteLink,
  useDeleteGroup, useUpdateGroup
} from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
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

export default function Lounge() {
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { data: groups, isLoading } = useGroups(searchQuery || undefined);
  const { toast } = useToast();

  if (activeGroupId !== null) {
    return <GroupChat groupId={activeGroupId} onBack={() => setActiveGroupId(null)} />;
  }

  return (
    <LayoutShell>
      <div className="text-center mb-8">
        <h1 className="font-display font-bold mb-2" data-testid="text-lounge-title">Serendipity Lounge</h1>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto">
          Connect organically in interest-based groups. Chat anonymously and discover unexpected connections.
        </p>
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
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
            <Button className="btn-press" data-testid="button-create-group">
              <Plus className="w-4 h-4 mr-2" />
              Create Group
            </Button>
          </DialogTrigger>
          <CreateGroupDialog onClose={() => setShowCreateDialog(false)} />
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups?.map((group: any, idx: number) => {
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
                  className="cursor-pointer card-lift hover-elevate"
                  onClick={() => setActiveGroupId(group.id)}
                  data-testid={`card-group-${group.id}`}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="w-10 h-10 rounded-md gradient-bg flex items-center justify-center text-white shrink-0">
                        <Icon className="w-5 h-5" />
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        <PrivacyIcon className="w-3 h-3 mr-1" />
                        {privacy.label}
                      </Badge>
                    </div>
                    <h3 className="font-bold mb-1">{group.name}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{group.description}</p>

                    {group.categoryTag && (
                      <Badge variant="outline" className="mb-3 text-xs">{group.categoryTag}</Badge>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AvatarStack members={group.members || []} max={4} />
                        <span className="text-xs text-muted-foreground">{group.memberCount} members</span>
                      </div>
                      {group.isMember ? (
                        <Badge variant="outline" className="shrink-0">
                          {group.myRole === "owner" ? <Crown className="w-3 h-3 mr-1" /> : null}
                          {group.myRole === "admin" ? <Shield className="w-3 h-3 mr-1" /> : null}
                          Joined
                        </Badge>
                      ) : (
                        <Badge className="gradient-bg text-white border-0 shrink-0">
                          {group.privacyMode === "request-to-join" ? "Request" : "Join"}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
          {groups?.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
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
        <Button onClick={handleCreate} disabled={!name.trim() || createGroup.isPending} className="btn-press" data-testid="button-submit-group">
          {createGroup.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Create Group
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function GroupChat({ groupId, onBack }: { groupId: number; onBack: () => void }) {
  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const { data: group, isLoading: groupLoading } = useGroup(groupId);
  const { data: messages, isLoading: msgsLoading } = useGroupMessages(groupId);
  const sendMessage = useSendGroupMessage(groupId);
  const deleteMessage = useDeleteGroupMessage(groupId);
  const joinGroup = useJoinGroup();
  const leaveGroup = useLeaveGroup();
  const { user } = useAuth();
  const { toast } = useToast();
  const [hasJoined, setHasJoined] = useState(false);

  const isMember = group?.isMember || hasJoined;
  const isAdmin = group?.myRole === "owner" || group?.myRole === "admin";

  const handleJoin = async () => {
    try {
      const result = await joinGroup.mutateAsync(groupId);
      if (result.status === "requested") {
        toast({ title: "Request Sent", description: "Your join request has been sent to the group admins." });
      } else {
        setHasJoined(true);
        toast({ title: "Joined!", description: `You're now part of ${group?.name}. You got an anonymous nickname!` });
      }
    } catch (e: any) {
      if (e.message?.includes("Already")) {
        setHasJoined(true);
      } else if (e.message?.includes("invite-only")) {
        toast({ title: "Invite Only", description: "This group requires an invite link to join.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: "Failed to join group.", variant: "destructive" });
      }
    }
  };

  const handleLeave = async () => {
    try {
      await leaveGroup.mutateAsync(groupId);
      toast({ title: "Left group", description: "You've left the group." });
      onBack();
    } catch (e) {
      toast({ title: "Error", description: "Failed to leave group.", variant: "destructive" });
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const text = input;
    setInput("");
    try {
      await sendMessage.mutateAsync(text);
    } catch (e) {
      toast({ title: "Error", description: "Must join group first.", variant: "destructive" });
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    try {
      await deleteMessage.mutateAsync(messageId);
      toast({ title: "Message deleted" });
    } catch (e) {
      toast({ title: "Error", description: "Failed to delete message.", variant: "destructive" });
    }
  };

  if (showSettings && group) {
    return <GroupSettings group={group} onBack={() => setShowSettings(false)} onLeave={handleLeave} />;
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10 bg-background">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-lounge">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-sm truncate" data-testid="text-group-name">{group?.name || "Group"}</h2>
          <p className="text-xs text-muted-foreground">{group?.memberCount || 0} members</p>
        </div>
        <div className="flex items-center gap-1">
          {isMember && (
            <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)} data-testid="button-group-settings">
              <Settings className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgsLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : messages && messages.length > 0 ? (
          messages.map((msg: any) => {
            const isMe = msg.userId === user?.id;
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'} group/msg`}
              >
                <div className="max-w-[80%]">
                  {!isMe && (
                    <span className="text-xs text-primary font-medium ml-3 mb-1 block">{msg.nickname || "Anonymous"}</span>
                  )}
                  <div className="relative">
                    <div className={`
                      rounded-md px-4 py-2.5 text-sm leading-relaxed
                      ${msg.isDeletedByAdmin
                        ? 'bg-muted text-muted-foreground italic'
                        : isMe
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-card border text-card-foreground'
                      }
                    `}>
                      {msg.isDeletedByAdmin ? "This message was removed by an admin." : msg.content}
                    </div>
                    {isAdmin && !isMe && !msg.isDeletedByAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="invisible group-hover/msg:visible absolute -right-8 top-0 h-6 w-6"
                        onClick={() => handleDeleteMessage(msg.id)}
                        data-testid={`button-delete-msg-${msg.id}`}
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg font-medium mb-2">Welcome to {group?.name}!</p>
            <p className="text-sm">Be the first to start the conversation.</p>
          </div>
        )}
      </div>

      <div className="p-4 border-t bg-background">
        {!isMember ? (
          <Button
            className="w-full btn-press"
            onClick={handleJoin}
            disabled={joinGroup.isPending}
            data-testid="button-join-group"
          >
            <Users className="w-5 h-5 mr-2" />
            {group?.privacyMode === "request-to-join" ? "Request to Join" : "Join Group to Chat"}
          </Button>
        ) : (
          <form
            className="flex gap-2 max-w-4xl mx-auto"
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Say something nice..."
              className="flex-1"
              data-testid="input-group-message"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || sendMessage.isPending}
              className="btn-press"
              data-testid="button-send-group"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

function GroupSettings({ group, onBack, onLeave }: { group: any; onBack: () => void; onLeave: () => void }) {
  const isOwner = group.myRole === "owner";
  const isAdmin = group.myRole === "owner" || group.myRole === "admin";
  const removeMember = useRemoveGroupMember(group.id);
  const updateRole = useUpdateMemberRole(group.id);
  const createInvite = useCreateInviteLink(group.id);
  const deleteGroup = useDeleteGroup();
  const { toast } = useToast();
  const { user } = useAuth();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreateInvite = async () => {
    try {
      const link = await createInvite.mutateAsync();
      const url = `${window.location.origin}/join/${link.token}`;
      setInviteLink(url);
    } catch (e) {
      toast({ title: "Error", description: "Failed to create invite link.", variant: "destructive" });
    }
  };

  const handleCopy = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    try {
      await removeMember.mutateAsync(targetUserId);
      toast({ title: "Member removed" });
    } catch (e) {
      toast({ title: "Error", description: "Failed to remove member.", variant: "destructive" });
    }
  };

  const handlePromote = async (targetUserId: string, role: string) => {
    try {
      await updateRole.mutateAsync({ targetUserId, role });
      toast({ title: `Role updated to ${role}` });
    } catch (e) {
      toast({ title: "Error", description: "Failed to update role.", variant: "destructive" });
    }
  };

  const handleDeleteGroup = async () => {
    try {
      await deleteGroup.mutateAsync(group.id);
      toast({ title: "Group deleted" });
      onBack();
    } catch (e) {
      toast({ title: "Error", description: "Failed to delete group.", variant: "destructive" });
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10 bg-background">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-settings">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="font-bold">Group Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Group Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Name</span>
              <span className="text-sm font-medium">{group.name}</span>
            </div>
            <div className="flex justify-between gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Privacy</span>
              <span className="text-sm font-medium capitalize">{group.privacyMode?.replace("-", " ") || "Open"}</span>
            </div>
            <div className="flex justify-between gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Members</span>
              <span className="text-sm font-medium">{group.memberCount}</span>
            </div>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invite Link</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {inviteLink ? (
                <div className="flex items-center gap-2">
                  <Input value={inviteLink} readOnly className="text-xs" data-testid="input-invite-link" />
                  <Button size="icon" variant="outline" onClick={handleCopy} data-testid="button-copy-invite">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              ) : (
                <Button onClick={handleCreateInvite} disabled={createInvite.isPending} className="btn-press" data-testid="button-create-invite">
                  <Link2 className="w-4 h-4 mr-2" />
                  Generate Invite Link
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Members ({group.members?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {group.members?.map((member: any) => (
              <div key={member.id} className="flex items-center justify-between gap-2 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-accent-foreground">
                    {member.nickname?.[0] || "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{member.nickname || "Anonymous"}</p>
                    <div className="flex items-center gap-1">
                      {member.role === "owner" && <Crown className="w-3 h-3 text-amber-500" />}
                      {member.role === "admin" && <Shield className="w-3 h-3 text-blue-500" />}
                      <span className="text-xs text-muted-foreground capitalize">{member.role}</span>
                    </div>
                  </div>
                </div>
                {isOwner && member.userId !== user?.id && (
                  <div className="flex items-center gap-1">
                    {member.role === "member" && (
                      <Button variant="ghost" size="sm" onClick={() => handlePromote(member.userId, "admin")} data-testid={`button-promote-${member.id}`}>
                        <Shield className="w-3 h-3 mr-1" />
                        Admin
                      </Button>
                    )}
                    {member.role === "admin" && (
                      <Button variant="ghost" size="sm" onClick={() => handlePromote(member.userId, "member")} data-testid={`button-demote-${member.id}`}>
                        Demote
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => handleRemoveMember(member.userId)} data-testid={`button-remove-${member.id}`}>
                      <X className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Button variant="outline" className="w-full btn-press" onClick={onLeave} data-testid="button-leave-group">
            <LogOut className="w-4 h-4 mr-2" />
            Leave Group
          </Button>
          {isOwner && (
            <Button variant="destructive" className="w-full btn-press" onClick={handleDeleteGroup} data-testid="button-delete-group">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Group
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
