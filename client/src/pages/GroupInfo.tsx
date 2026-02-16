import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  ArrowLeft, Crown, Shield, Loader2, Users, Globe, Lock, UserPlus,
  Link2, Copy, Check, X, Trash2, Pencil, Image as ImageIcon
} from "lucide-react";
import {
  useGroup, useGroupMembers, useGroupMedia, useUpdateGroup,
  useUpdateMemberRole, useRemoveGroupMember, useCreateInviteLink,
  useGroupInviteLinks, useLeaveGroup, useDeleteGroup
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
  const updateGroup = useUpdateGroup(groupId);
  const updateRole = useUpdateMemberRole(groupId);
  const removeMember = useRemoveGroupMember(groupId);
  const createInvite = useCreateInviteLink(groupId);
  const leaveGroup = useLeaveGroup();
  const deleteGroup = useDeleteGroup();

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPrivacy, setEditPrivacy] = useState("open");
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const isOwner = group?.myRole === "owner";
  const isAdmin = group?.myRole === "owner" || group?.myRole === "admin";

  const sortedMembers = [...(members || [])].sort((a: any, b: any) => {
    const order: Record<string, number> = { owner: 0, admin: 1, member: 2 };
    return (order[a.role] || 2) - (order[b.role] || 2);
  });

  const openEditDialog = () => {
    setEditName(group?.name || "");
    setEditDesc(group?.description || "");
    setEditPrivacy(group?.privacyMode || "open");
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    try {
      await updateGroup.mutateAsync({ name: editName, description: editDesc, privacyMode: editPrivacy });
      toast({ title: "Group updated" });
      setEditOpen(false);
    } catch {
      toast({ title: "Error", description: "Failed to update group.", variant: "destructive" });
    }
  };

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
  const PrivacyIcon = privacy.icon;

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-50 bg-background">
        <Button variant="ghost" size="icon" onClick={() => setLocation(`/lounge/group/${groupId}`)} data-testid="button-back-chat" className="btn-press">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="font-bold text-sm">Group Info</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center p-6 gap-3">
          {group?.groupPhotoUrl ? (
            <img src={group.groupPhotoUrl} alt={group.name} className="w-20 h-20 rounded-md object-cover" data-testid="img-group-photo" />
          ) : (
            <div className="w-20 h-20 rounded-md gradient-bg flex items-center justify-center" data-testid="placeholder-group-photo">
              <Users className="w-8 h-8 text-white" />
            </div>
          )}
          <h2 className="font-bold text-lg" data-testid="text-group-info-name">{group?.name}</h2>
          {group?.description && (
            <p className="text-sm text-muted-foreground text-center max-w-sm" data-testid="text-group-description">{group.description}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary">
              <PrivacyIcon className="w-3 h-3 mr-1" /> {privacy.label}
            </Badge>
            <Badge variant="outline">{group?.memberCount || 0} members</Badge>
          </div>
          {group?.categoryTags?.map((tag: string) => (
            <Badge key={tag} variant="outline" className="text-xs" data-testid={`tag-${tag}`}>{tag}</Badge>
          ))}
        </div>

        <div className="px-4 pb-4 space-y-4 max-w-lg mx-auto">
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Admin Controls</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full justify-start btn-press" onClick={openEditDialog} data-testid="button-edit-group">
                  <Pencil className="w-4 h-4 mr-2" /> Edit Group
                </Button>
                <Button variant="outline" className="w-full justify-start btn-press" onClick={handleCreateInvite} disabled={createInvite.isPending} data-testid="button-create-invite">
                  <Link2 className="w-4 h-4 mr-2" /> Generate Invite Link
                </Button>
                {inviteLinks && inviteLinks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Active Invite Links</p>
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
                {isOwner && (
                  <Button variant="destructive" className="w-full justify-start btn-press" onClick={handleDelete} data-testid="button-delete-group">
                    <Trash2 className="w-4 h-4 mr-2" /> Delete Group
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Members ({sortedMembers.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {sortedMembers.map((member: any) => (
                <div key={member.id} className="flex items-center justify-between gap-2 py-2" data-testid={`member-${member.id}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-accent-foreground shrink-0">
                      {member.nickname?.[0] || "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{member.nickname || "Anonymous"}</p>
                      <div className="flex items-center gap-1 flex-wrap">
                        {member.role === "owner" && <Crown className="w-3 h-3 text-amber-500" />}
                        {member.role === "admin" && <Shield className="w-3 h-3 text-blue-500" />}
                        <span className="text-xs text-muted-foreground capitalize">{member.role}</span>
                      </div>
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

          {media && media.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" /> Shared Media
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  {media.map((item: any, idx: number) => (
                    <div key={idx} className="aspect-square rounded-md overflow-hidden bg-muted" data-testid={`media-${idx}`}>
                      {item.contentType === "video" ? (
                        <video src={item.mediaUrl} className="w-full h-full object-cover" />
                      ) : (
                        <img src={item.mediaUrl} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="pt-2 pb-8">
            <Button variant="outline" className="w-full text-destructive btn-press" onClick={handleLeave} data-testid="button-leave-group">
              Leave Group
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Group</DialogTitle>
            <DialogDescription>Update your group settings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Group Name</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} data-testid="input-edit-name" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} data-testid="input-edit-description" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Privacy</label>
              <Select value={editPrivacy} onValueChange={setEditPrivacy}>
                <SelectTrigger data-testid="select-edit-privacy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="request-to-join">Request to Join</SelectItem>
                  <SelectItem value="invite-only">Invite Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateGroup.isPending} className="btn-press" data-testid="button-save-edit">
              {updateGroup.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}