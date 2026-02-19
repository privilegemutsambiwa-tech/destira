import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  ArrowLeft, Crown, Shield, Loader2, Users, Globe, Lock, UserPlus,
  Link2, Copy, Check, X, Trash2, Pencil, Image as ImageIcon, Star,
  Search, BellOff, Settings, ChevronRight
} from "lucide-react";
import {
  useGroup, useGroupMembers, useGroupMedia, useUpdateGroup,
  useUpdateMemberRole, useRemoveGroupMember, useCreateInviteLink,
  useGroupInviteLinks, useLeaveGroup, useDeleteGroup,
  useStarredMessages, useUpdateGroupSettings
} from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

const PRIVACY_LABELS: Record<string, { icon: any; label: string }> = {
  "open": { icon: Globe, label: "Open" },
  "request-to-join": { icon: UserPlus, label: "Request to Join" },
  "invite-only": { icon: Lock, label: "Invite Only" },
};

export default function GroupInfoPage({ params }: { params?: { groupId?: string } }) {
  const groupId = Number(params?.groupId);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: group, isLoading: groupLoading } = useGroup(groupId);
  const { data: members } = useGroupMembers(groupId);
  const { data: media } = useGroupMedia(groupId);
  const { data: inviteLinks } = useGroupInviteLinks(groupId);
  const { data: starredMessages } = useStarredMessages(groupId);
  const updateGroup = useUpdateGroup(groupId);
  const updateSettings = useUpdateGroupSettings(groupId);
  const updateRole = useUpdateMemberRole(groupId);
  const removeMember = useRemoveGroupMember(groupId);
  const createInvite = useCreateInviteLink(groupId);
  const leaveGroup = useLeaveGroup();
  const deleteGroup = useDeleteGroup();

  const [editDescOpen, setEditDescOpen] = useState(false);
  const [editDesc, setEditDesc] = useState("");
  const [editRules, setEditRules] = useState("");
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [mediaExpanded, setMediaExpanded] = useState(false);
  const [starredExpanded, setStarredExpanded] = useState(false);

  const isOwner = group?.myRole === "owner";
  const isAdmin = group?.myRole === "owner" || group?.myRole === "admin";

  const sortedMembers = [...(members || [])].sort((a: any, b: any) => {
    const order: Record<string, number> = { owner: 0, admin: 1, member: 2 };
    return (order[a.role] || 2) - (order[b.role] || 2);
  });

  const handleCreateInvite = async () => {
    try {
      const link = await createInvite.mutateAsync();
      const url = `${window.location.origin}/join/${link.token}`;
      navigator.clipboard.writeText(url);
      toast({ title: "Invite link copied!" });
    } catch {
      toast({ title: "Error", description: "Failed to create invite link.", variant: "destructive" });
    }
  };

  const handleCopyLink = (token: string) => {
    const url = `${window.location.origin}/join/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(token);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const handlePromote = async (targetUserId: string, role: string) => {
    try {
      await updateRole.mutateAsync({ targetUserId, role });
      toast({ title: `Role updated to ${role}` });
    } catch {
      toast({ title: "Error", description: "Failed to update role.", variant: "destructive" });
    }
  };

  const handleRemove = async (targetUserId: string) => {
    try {
      await removeMember.mutateAsync(targetUserId);
      toast({ title: "Member removed" });
    } catch {
      toast({ title: "Error", description: "Failed to remove member.", variant: "destructive" });
    }
  };

  const handleLeave = async () => {
    try {
      await leaveGroup.mutateAsync(groupId);
      toast({ title: "Left group" });
      setLocation("/lounge");
    } catch {
      toast({ title: "Error", description: "Failed to leave group.", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteGroup.mutateAsync(groupId);
      toast({ title: "Group deleted" });
      setLocation("/lounge");
    } catch {
      toast({ title: "Error", description: "Failed to delete group.", variant: "destructive" });
    }
  };

  const openEditDescDialog = () => {
    setEditDesc(group?.description || "");
    setEditRules(group?.rulesText || "");
    setEditDescOpen(true);
  };

  const handleSaveDescRules = async () => {
    try {
      await updateGroup.mutateAsync({ description: editDesc });
      await updateSettings.mutateAsync({ rulesText: editRules });
      toast({ title: "Updated successfully" });
      setEditDescOpen(false);
    } catch {
      toast({ title: "Error", description: "Failed to save changes.", variant: "destructive" });
    }
  };

  const handleSettingToggle = async (key: string, value: boolean) => {
    try {
      await updateSettings.mutateAsync({ [key]: value });
    } catch {
      toast({ title: "Error", description: "Failed to update setting.", variant: "destructive" });
    }
  };

  const handleSettingSelect = async (key: string, value: string) => {
    try {
      await updateSettings.mutateAsync({ [key]: value });
    } catch {
      toast({ title: "Error", description: "Failed to update setting.", variant: "destructive" });
    }
  };

  if (!groupId || isNaN(groupId)) {
    setLocation("/lounge");
    return null;
  }

  if (groupLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const privacy = PRIVACY_LABELS[group?.privacyMode || "open"] || PRIVACY_LABELS["open"];
  const mediaCount = media?.length || 0;
  const starredCount = starredMessages?.length || 0;
  const canAddMembers = isAdmin || group?.canMembersAddOthers;

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-50 bg-background">
        <Button variant="ghost" size="icon" onClick={() => setLocation(`/lounge/group/${groupId}`)} data-testid="button-back-chat">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="font-bold text-sm">Group Info</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center p-6 gap-3">
          {group?.groupPhotoUrl ? (
            <img src={group.groupPhotoUrl} alt={group.name} className="w-24 h-24 rounded-full object-cover" data-testid="img-group-photo" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/60 to-primary flex items-center justify-center" data-testid="placeholder-group-photo">
              <Users className="w-10 h-10 text-primary-foreground" />
            </div>
          )}
          <h2 className="font-bold text-xl text-center" data-testid="text-group-info-name">{group?.name}</h2>
          <p className="text-sm text-muted-foreground text-center" data-testid="text-group-subtitle">
            {group?.memberCount || sortedMembers.length} Members {privacy.label !== "Open" ? `- ${privacy.label}` : ""}
          </p>
          {group?.categoryTags && group.categoryTags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {group.categoryTags.map((tag: string) => (
                <Badge key={tag} variant="secondary" className="text-xs" data-testid={`tag-${tag}`}>{tag}</Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-6 pb-4">
          {canAddMembers && (
            <button
              className="flex flex-col items-center gap-1 text-primary"
              onClick={handleCreateInvite}
              data-testid="button-action-add-members"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <UserPlus className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium">Add</span>
            </button>
          )}
          <button
            className="flex flex-col items-center gap-1 text-primary"
            onClick={() => toast({ title: "Search coming soon" })}
            data-testid="button-action-search"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Search className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium">Search</span>
          </button>
          <button
            className="flex flex-col items-center gap-1 text-primary"
            onClick={() => toast({ title: "Mute coming soon" })}
            data-testid="button-action-mute"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <BellOff className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium">Mute</span>
          </button>
        </div>

        <div className="px-4 pb-4 space-y-4 max-w-lg mx-auto">
          {(group?.description || group?.rulesText || isAdmin) && (
            <Card>
              <CardContent className="p-4 space-y-3">
                {group?.description && (
                  <p className="text-sm" data-testid="text-group-description">{group.description}</p>
                )}
                {(group?.description && (group?.rulesText || isAdmin)) && <Separator />}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Group Rules</p>
                  <p className="text-sm" data-testid="text-group-rules">
                    {group?.rulesText || "No rules set"}
                  </p>
                </div>
                {isAdmin && (
                  <Button variant="ghost" size="sm" onClick={openEditDescDialog} data-testid="button-edit-desc-rules">
                    <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="hover-elevate cursor-pointer" onClick={() => setMediaExpanded(!mediaExpanded)} data-testid="card-media">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <ImageIcon className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm font-medium">{mediaCount} Media</span>
                </div>
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${mediaExpanded ? "rotate-90" : ""}`} />
              </div>
              {mediaExpanded && (
                <div className="mt-3">
                  {mediaCount > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {media!.map((item: any, idx: number) => (
                        <div key={idx} className="aspect-square rounded-md overflow-hidden bg-muted" data-testid={`media-${idx}`}>
                          {item.contentType === "video" ? (
                            <video src={item.mediaUrl} className="w-full h-full object-cover" />
                          ) : (
                            <img src={item.mediaUrl} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No shared media yet</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="hover-elevate cursor-pointer" onClick={() => setStarredExpanded(!starredExpanded)} data-testid="card-starred">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Star className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm font-medium">Starred Messages ({starredCount})</span>
                </div>
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${starredExpanded ? "rotate-90" : ""}`} />
              </div>
              {starredExpanded && (
                <div className="mt-3 space-y-2">
                  {starredCount > 0 ? (
                    starredMessages!.map((msg: any) => (
                      <div key={msg.id} className="rounded-md bg-muted p-3" data-testid={`starred-msg-${msg.id}`}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold">{msg.nickname || "Unknown"}</span>
                          <span className="text-xs text-muted-foreground">
                            {msg.createdAt ? new Date(msg.createdAt).toLocaleDateString() : ""}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{msg.content}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No starred messages</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {isAdmin && (
            <Card data-testid="card-group-settings">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="w-4 h-4" /> Group Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-2 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm">Members can send messages</label>
                  <Switch
                    checked={group?.canMembersSendMessages ?? true}
                    onCheckedChange={(v) => handleSettingToggle("canMembersSendMessages", v)}
                    data-testid="switch-send-messages"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm">Members can edit group info</label>
                  <Switch
                    checked={group?.canMembersEditInfo ?? true}
                    onCheckedChange={(v) => handleSettingToggle("canMembersEditInfo", v)}
                    data-testid="switch-edit-info"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm">Members can add others</label>
                  <Switch
                    checked={group?.canMembersAddOthers ?? true}
                    onCheckedChange={(v) => handleSettingToggle("canMembersAddOthers", v)}
                    data-testid="switch-add-others"
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm">Posting permission</label>
                  <Select
                    value={group?.postingPermission || "everyone"}
                    onValueChange={(v) => handleSettingSelect("postingPermission", v)}
                  >
                    <SelectTrigger className="w-36" data-testid="select-posting-permission">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="everyone">Everyone</SelectItem>
                      <SelectItem value="admins_only">Admins Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm">Media permission</label>
                  <Select
                    value={group?.mediaPermission || "everyone"}
                    onValueChange={(v) => handleSettingSelect("mediaPermission", v)}
                  >
                    <SelectTrigger className="w-36" data-testid="select-media-permission">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="everyone">Everyone</SelectItem>
                      <SelectItem value="admin_only">Admin Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          <Card data-testid="card-members">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" /> Members ({sortedMembers.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-1">
              {sortedMembers.map((member: any) => (
                <div key={member.id} className="flex items-center justify-between gap-2 py-2" data-testid={`member-${member.id}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="w-9 h-9">
                      <AvatarFallback className="text-xs font-bold">
                        {member.nickname?.[0]?.toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{member.nickname || "Anonymous"}</p>
                        {member.role === "owner" && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                        {member.role === "admin" && <Shield className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                      </div>
                      <span className="text-xs text-muted-foreground capitalize">{member.role}</span>
                    </div>
                  </div>
                  {isOwner && member.userId !== user?.id && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {member.role === "member" && (
                        <Button variant="ghost" size="sm" onClick={() => handlePromote(member.userId, "admin")} data-testid={`button-promote-${member.id}`}>
                          <Shield className="w-3 h-3 mr-1" /> Admin
                        </Button>
                      )}
                      {member.role === "admin" && (
                        <Button variant="ghost" size="sm" onClick={() => handlePromote(member.userId, "member")} data-testid={`button-demote-${member.id}`}>
                          Demote
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => handleRemove(member.userId)} data-testid={`button-remove-${member.id}`}>
                        <X className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {isAdmin && (
            <Card data-testid="card-invite-links">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="w-4 h-4" /> Invite Links
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-2 space-y-3">
                <Button variant="outline" className="w-full" onClick={handleCreateInvite} disabled={createInvite.isPending} data-testid="button-create-invite">
                  {createInvite.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Link2 className="w-4 h-4 mr-2" />}
                  Generate Invite Link
                </Button>
                {inviteLinks && inviteLinks.filter((l: any) => l.isActive).length > 0 && (
                  <div className="space-y-2">
                    {inviteLinks.filter((l: any) => l.isActive).map((link: any) => (
                      <div key={link.id} className="flex items-center gap-2">
                        <Input
                          value={`${window.location.origin}/join/${link.token}`}
                          readOnly
                          className="text-xs flex-1"
                          data-testid={`input-invite-${link.id}`}
                        />
                        <Button size="icon" variant="outline" onClick={() => handleCopyLink(link.token)} data-testid={`button-copy-invite-${link.id}`}>
                          {copiedLink === link.token ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="pt-2 pb-4 space-y-3">
            <Button variant="destructive" className="w-full" onClick={handleLeave} data-testid="button-leave-group">
              Leave Group
            </Button>
            {isOwner && (
              <Button variant="destructive" className="w-full" onClick={handleDelete} data-testid="button-delete-group">
                <Trash2 className="w-4 h-4 mr-2" /> Delete Group
              </Button>
            )}
          </div>

          <div className="pb-8" />
        </div>
      </div>

      <Dialog open={editDescOpen} onOpenChange={setEditDescOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Description & Rules</DialogTitle>
            <DialogDescription>Update your group description and rules.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="resize-none"
                rows={3}
                data-testid="input-edit-description"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Rules</label>
              <Textarea
                value={editRules}
                onChange={(e) => setEditRules(e.target.value)}
                className="resize-none"
                rows={4}
                data-testid="input-edit-rules"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDescOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveDescRules} disabled={updateGroup.isPending || updateSettings.isPending} data-testid="button-save-desc-rules">
              {(updateGroup.isPending || updateSettings.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
