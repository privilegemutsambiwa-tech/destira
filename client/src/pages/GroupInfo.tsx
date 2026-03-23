import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  ArrowLeft, Crown, Shield, Loader2, Users, Globe, Lock, UserPlus,
  Link2, Copy, Check, X, Trash2, Pencil, Image as ImageIcon, Star,
  Search, BellOff, Bell, Settings, ChevronRight, Share2
} from "lucide-react";
import {
  useGroup, useGroupMembers, useGroupMedia, useUpdateGroup,
  useUpdateMemberRole, useRemoveGroupMember, useCreateInviteLink,
  useGroupInviteLinks, useLeaveGroup, useDeleteGroup,
  useStarredMessages, useUpdateGroupSettings,
  useToggleMute, useAddGroupMember, useSearchUsers, useSearchGroupMessages
} from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

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
  const [membersExpanded, setMembersExpanded] = useState(false);

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberQuery, setAddMemberQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMuted, setIsMuted] = useState(false);

  const iconUploadRef = useRef<HTMLInputElement>(null);
  const bannerUploadRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const toggleMute = useToggleMute(groupId);
  const addGroupMember = useAddGroupMember(groupId);
  const { data: userSearchResults } = useSearchUsers(addMemberQuery);
  const { data: messageSearchResults } = useSearchGroupMessages(groupId, searchQuery);

  const isOwner = group?.myRole === "owner";
  const isAdmin = group?.myRole === "owner" || group?.myRole === "admin";

  const currentMember = (members as any[])?.find((m: any) => m.userId === user?.id);
  const actuallyMuted = isMuted !== null ? isMuted : (currentMember?.isMuted ?? false);

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

  const handleToggleMute = async () => {
    try {
      const result = await toggleMute.mutateAsync();
      setIsMuted(result.isMuted);
      toast({ title: result.isMuted ? "Notifications muted" : "Notifications unmuted" });
    } catch {
      toast({ title: "Error", description: "Failed to toggle mute.", variant: "destructive" });
    }
  };

  const handleAddMember = async (targetUserId: string) => {
    try {
      await addGroupMember.mutateAsync(targetUserId);
      toast({ title: "Member added successfully" });
      setAddMemberOpen(false);
      setAddMemberQuery("");
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to add member.", variant: "destructive" });
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/lounge`;
    const shareData = { title: group?.name || "Group", text: `Join "${group?.name}" on VibeFlow`, url };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied to clipboard" });
      }
    } catch {
      toast({ title: "Share cancelled" });
    }
  };

  const handleUploadBanner = async (file: File) => {
    const formData = new FormData();
    formData.append("image", file);
    try {
      const res = await fetch(`/api/groups/${groupId}/upload-banner`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      toast({ title: "Banner updated" });
    } catch {
      toast({ title: "Error", description: "Failed to upload banner.", variant: "destructive" });
    }
  };

  const handleUploadIcon = async (file: File) => {
    const formData = new FormData();
    formData.append("image", file);
    try {
      const res = await fetch(`/api/groups/${groupId}/upload-icon`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      toast({ title: "Icon updated" });
    } catch {
      toast({ title: "Error", description: "Failed to upload icon.", variant: "destructive" });
    }
  };

  if (!groupId || isNaN(groupId)) {
    setLocation("/lounge");
    return null;
  }

  if (groupLoading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: "#0F0F14" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#7C3AED" }} />
      </div>
    );
  }

  const privacy = PRIVACY_LABELS[group?.privacyMode || "open"] || PRIVACY_LABELS["open"];
  const mediaCount = media?.length || 0;
  const starredCount = starredMessages?.length || 0;
  const canAddMembers = isAdmin || group?.canMembersAddOthers;
  const currentlyMuted = currentMember?.isMuted ?? isMuted;

  return (
    <div className="h-screen flex flex-col" style={{ background: "#0F0F14" }}>
      <div
        className="px-4 py-3 flex items-center gap-3 sticky top-0 z-50"
        style={{ background: "#1A1A24", borderBottom: "1px solid #2E2E42" }}
      >
        <button
          onClick={() => setLocation(`/lounge/group/${groupId}`)}
          className="w-9 h-9 flex items-center justify-center btn-press rounded-full"
          style={{ color: "#FFFFFF", background: "transparent" }}
          data-testid="button-back-chat"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="font-bold text-white" style={{ fontSize: "15px" }}>Group Info</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="relative">
          <input
            ref={bannerUploadRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleUploadBanner(e.target.files[0]); }}
          />
          <input
            ref={iconUploadRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleUploadIcon(e.target.files[0]); }}
          />
          <div
            style={{
              height: "160px",
              background: group?.bannerUrl ? `url(${group.bannerUrl}) center/cover` : "linear-gradient(135deg, #7C3AED, #EC4899)",
              position: "relative",
              cursor: isAdmin ? "pointer" : "default",
            }}
            onClick={() => isAdmin && bannerUploadRef.current?.click()}
            data-testid="banner-area"
          >
            {group?.groupPhotoUrl && !group?.bannerUrl && (
              <img
                src={group.groupPhotoUrl}
                alt={group.name}
                className="w-full h-full object-cover"
              />
            )}
            {isAdmin && (
              <div
                className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium"
                style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
              >
                <Pencil className="w-3 h-3" /> Edit Banner
              </div>
            )}
          </div>
          <div className="flex flex-col items-center">
            <div
              className="flex items-center justify-center"
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                border: "3px solid #0F0F14",
                background: "#242433",
                marginTop: "-32px",
                zIndex: 10,
                overflow: "hidden",
                cursor: isAdmin ? "pointer" : "default",
                position: "relative",
              }}
              onClick={() => isAdmin && iconUploadRef.current?.click()}
              data-testid="placeholder-group-photo"
            >
              {(group?.iconUrl || group?.groupPhotoUrl) ? (
                <img src={group.iconUrl || group.groupPhotoUrl} alt={group.name} className="w-full h-full object-cover" data-testid="img-group-photo" />
              ) : (
                <Users className="w-8 h-8" style={{ color: "#9090A8" }} />
              )}
            </div>

            <h2
              className="font-bold text-white text-center mt-3"
              style={{ fontSize: "22px", letterSpacing: "-0.5px" }}
              data-testid="text-group-info-name"
            >
              {group?.name}
            </h2>
            <p className="text-center mt-0.5" style={{ fontSize: "13px", color: "#9090A8" }} data-testid="text-group-subtitle">
              {group?.memberCount || sortedMembers.length} Members{privacy.label !== "Open" ? ` · ${privacy.label}` : ""}
            </p>

            {group?.categoryTags && group.categoryTags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap justify-center mt-2">
                {group.categoryTags.map((tag: string) => (
                  <span
                    key={tag}
                    style={{
                      background: "rgba(124,58,237,0.15)",
                      color: "#A78BFA",
                      fontSize: "12px",
                      padding: "3px 10px",
                      borderRadius: "100px",
                      border: "1px solid rgba(124,58,237,0.3)",
                    }}
                    data-testid={`tag-${tag}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center gap-5 py-5 mt-2">
          <button
            className="flex flex-col items-center gap-1.5 btn-press"
            onClick={canAddMembers ? () => setAddMemberOpen(true) : undefined}
            disabled={!canAddMembers}
            data-testid="button-action-add-members"
            style={{ opacity: canAddMembers ? 1 : 0.4 }}
          >
            <div
              className="flex items-center justify-center"
              style={{
                width: "52px",
                height: "52px",
                borderRadius: "50%",
                background: "#1A1A24",
                border: "1px solid #2E2E42",
              }}
            >
              <UserPlus className="w-5 h-5 text-white" />
            </div>
            <span style={{ fontSize: "11px", color: "#9090A8", fontWeight: 500 }}>Add</span>
          </button>
          <button
            className="flex flex-col items-center gap-1.5 btn-press"
            onClick={() => setSearchOpen(true)}
            data-testid="button-action-search"
          >
            <div
              className="flex items-center justify-center"
              style={{
                width: "52px",
                height: "52px",
                borderRadius: "50%",
                background: "#1A1A24",
                border: "1px solid #2E2E42",
              }}
            >
              <Search className="w-5 h-5 text-white" />
            </div>
            <span style={{ fontSize: "11px", color: "#9090A8", fontWeight: 500 }}>Search</span>
          </button>
          <button
            className="flex flex-col items-center gap-1.5 btn-press"
            onClick={handleToggleMute}
            disabled={toggleMute.isPending}
            data-testid="button-action-mute"
          >
            <div
              className="flex items-center justify-center"
              style={{
                width: "52px",
                height: "52px",
                borderRadius: "50%",
                background: currentlyMuted ? "rgba(124,58,237,0.15)" : "#1A1A24",
                border: currentlyMuted ? "1px solid rgba(124,58,237,0.5)" : "1px solid #2E2E42",
              }}
            >
              {currentlyMuted ? <BellOff className="w-5 h-5" style={{ color: "#A78BFA" }} /> : <Bell className="w-5 h-5 text-white" />}
            </div>
            <span style={{ fontSize: "11px", color: currentlyMuted ? "#A78BFA" : "#9090A8", fontWeight: 500 }}>
              {currentlyMuted ? "Unmute" : "Mute"}
            </span>
          </button>
          <button
            className="flex flex-col items-center gap-1.5 btn-press"
            onClick={handleShare}
            data-testid="button-action-share"
          >
            <div
              className="flex items-center justify-center"
              style={{
                width: "52px",
                height: "52px",
                borderRadius: "50%",
                background: "#1A1A24",
                border: "1px solid #2E2E42",
              }}
            >
              <Share2 className="w-5 h-5 text-white" />
            </div>
            <span style={{ fontSize: "11px", color: "#9090A8", fontWeight: 500 }}>Share</span>
          </button>
        </div>

        <div className="px-4 pb-4 space-y-3 max-w-lg mx-auto">
          {(group?.description || group?.rulesText || isAdmin) && (
            <div
              style={{ background: "#1A1A24", border: "1px solid #2E2E42", borderRadius: "12px", padding: "16px" }}
              data-testid="card-group-info"
            >
              {group?.description && (
                <p className="text-sm text-white mb-3" data-testid="text-group-description">{group.description}</p>
              )}
              {(group?.description && (group?.rulesText || isAdmin)) && (
                <div className="my-3" style={{ height: "1px", background: "#2E2E42" }} />
              )}
              <p className="font-semibold mb-1" style={{ fontSize: "11px", color: "#9090A8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Group Rules
              </p>
              <p className="text-sm text-white/80" data-testid="text-group-rules">
                {group?.rulesText || "No rules set"}
              </p>
              {isAdmin && (
                <button
                  onClick={openEditDescDialog}
                  className="mt-3 flex items-center gap-1.5 text-sm btn-press font-medium"
                  style={{ color: "#A78BFA", background: "transparent", border: "none" }}
                  data-testid="button-edit-desc-rules"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              )}
            </div>
          )}

          {[
            {
              icon: <ImageIcon className="w-5 h-5" />,
              label: `${mediaCount} Media`,
              testId: "card-media",
              onClick: () => setMediaExpanded(!mediaExpanded),
              expanded: mediaExpanded,
              content: mediaExpanded ? (
                <div className="mt-3 px-1">
                  {mediaCount > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {media!.map((item: any, idx: number) => (
                        <div key={idx} className="aspect-square rounded-lg overflow-hidden" style={{ background: "#242433" }} data-testid={`media-${idx}`}>
                          {item.contentType === "video" ? (
                            <video src={item.mediaUrl} className="w-full h-full object-cover" />
                          ) : (
                            <img src={item.mediaUrl} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm" style={{ color: "#9090A8" }}>No shared media yet</p>
                  )}
                </div>
              ) : null,
            },
            {
              icon: <Star className="w-5 h-5" />,
              label: `Starred Messages (${starredCount})`,
              testId: "card-starred",
              onClick: () => setStarredExpanded(!starredExpanded),
              expanded: starredExpanded,
              content: starredExpanded ? (
                <div className="mt-3 space-y-2 px-1">
                  {starredCount > 0 ? (
                    starredMessages!.map((msg: any) => (
                      <div key={msg.id} className="rounded-lg p-3" style={{ background: "#242433" }} data-testid={`starred-msg-${msg.id}`}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold text-white">{msg.nickname || "Unknown"}</span>
                          <span className="text-xs" style={{ color: "#9090A8" }}>
                            {msg.createdAt ? new Date(msg.createdAt).toLocaleDateString() : ""}
                          </span>
                        </div>
                        <p className="text-sm line-clamp-2" style={{ color: "#9090A8" }}>{msg.content}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm" style={{ color: "#9090A8" }}>No starred messages</p>
                  )}
                </div>
              ) : null,
            },
          ].map((row) => (
            <button
              key={row.testId}
              onClick={row.onClick}
              className="w-full text-left"
              style={{
                background: "#1A1A24",
                border: "1px solid #2E2E42",
                borderRadius: "12px",
                padding: "0 16px",
              }}
              data-testid={row.testId}
            >
              <div className="flex items-center justify-between gap-2" style={{ height: "52px" }}>
                <div className="flex items-center gap-3">
                  <span style={{ color: "#9090A8" }}>{row.icon}</span>
                  <span className="text-sm font-medium text-white">{row.label}</span>
                </div>
                <ChevronRight
                  className="w-4 h-4 transition-transform"
                  style={{ color: "#9090A8", transform: row.expanded ? "rotate(90deg)" : "rotate(0deg)" }}
                />
              </div>
              {row.content}
            </button>
          ))}

          <div
            style={{
              background: "#1A1A24",
              border: "1px solid #2E2E42",
              borderRadius: "12px",
              padding: "0 16px",
            }}
            data-testid="card-members"
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => setMembersExpanded(!membersExpanded)}
              onKeyDown={(e) => e.key === "Enter" && setMembersExpanded(!membersExpanded)}
              className="flex items-center justify-between gap-2 cursor-pointer"
              style={{ height: "52px" }}
            >
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5" style={{ color: "#9090A8" }} />
                <span className="text-sm font-medium text-white">Members ({sortedMembers.length})</span>
              </div>
              <ChevronRight
                className="w-4 h-4 transition-transform"
                style={{ color: "#9090A8", transform: membersExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
              />
            </div>
            {membersExpanded && (
              <div className="mb-3 space-y-0">
                {sortedMembers.map((member: any) => (
                  <div key={member.id} className="flex items-center justify-between gap-2 py-2.5" style={{ borderTop: "1px solid #2E2E42" }} data-testid={`member-${member.id}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white"
                        style={{ background: "#242433", border: "1px solid #2E2E42" }}
                      >
                        {member.nickname?.[0]?.toUpperCase() || "?"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-white truncate">{member.nickname || "Anonymous"}</p>
                          {member.role === "owner" && <Crown className="w-3.5 h-3.5 shrink-0" style={{ color: "#F59E0B" }} />}
                          {member.role === "admin" && <Shield className="w-3.5 h-3.5 shrink-0" style={{ color: "#60A5FA" }} />}
                        </div>
                        <span className="text-xs capitalize" style={{ color: "#9090A8" }}>{member.role}</span>
                      </div>
                    </div>
                    {isOwner && member.userId !== user?.id && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {member.role === "member" && (
                          <button
                            onClick={() => handlePromote(member.userId, "admin")}
                            className="px-2 py-1 text-xs rounded btn-press"
                            style={{ background: "#242433", color: "#FFFFFF", border: "1px solid #2E2E42" }}
                            data-testid={`button-promote-${member.id}`}
                          >
                            <Shield className="w-3 h-3 inline mr-1" />Admin
                          </button>
                        )}
                        {member.role === "admin" && (
                          <button
                            onClick={() => handlePromote(member.userId, "member")}
                            className="px-2 py-1 text-xs rounded btn-press"
                            style={{ background: "#242433", color: "#FFFFFF", border: "1px solid #2E2E42" }}
                            data-testid={`button-demote-${member.id}`}
                          >
                            Demote
                          </button>
                        )}
                        <button
                          onClick={() => handleRemove(member.userId)}
                          className="w-7 h-7 rounded-full flex items-center justify-center btn-press"
                          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}
                          data-testid={`button-remove-${member.id}`}
                        >
                          <X className="w-4 h-4" style={{ color: "#EF4444" }} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {isAdmin && (
            <div
              style={{ background: "#1A1A24", border: "1px solid #2E2E42", borderRadius: "12px", padding: "16px" }}
              data-testid="card-invite-links"
            >
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="w-4 h-4" style={{ color: "#9090A8" }} />
                <span className="text-sm font-medium text-white">Invite Links</span>
              </div>
              <button
                onClick={handleCreateInvite}
                disabled={createInvite.isPending}
                className="w-full flex items-center justify-center gap-2 text-sm font-medium btn-press"
                style={{
                  height: "40px",
                  borderRadius: "10px",
                  background: "#242433",
                  border: "1px solid #2E2E42",
                  color: "#FFFFFF",
                }}
                data-testid="button-create-invite"
              >
                {createInvite.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                Generate Invite Link
              </button>
              {inviteLinks && inviteLinks.filter((l: any) => l.isActive).length > 0 && (
                <div className="space-y-2 mt-3">
                  {inviteLinks.filter((l: any) => l.isActive).map((link: any) => (
                    <div key={link.id} className="flex items-center gap-2">
                      <input
                        value={`${window.location.origin}/join/${link.token}`}
                        readOnly
                        className="text-xs flex-1 px-3 py-2 outline-none"
                        style={{ background: "#242433", border: "1px solid #2E2E42", borderRadius: "8px", color: "#9090A8" }}
                        data-testid={`input-invite-${link.id}`}
                      />
                      <button
                        onClick={() => handleCopyLink(link.token)}
                        className="w-9 h-9 flex items-center justify-center rounded-lg btn-press"
                        style={{ background: "#242433", border: "1px solid #2E2E42", color: "#FFFFFF" }}
                        data-testid={`button-copy-invite-${link.id}`}
                      >
                        {copiedLink === link.token ? <Check className="w-4 h-4" style={{ color: "#22C55E" }} /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isAdmin && (
            <div
              style={{ background: "#1A1A24", border: "1px solid #2E2E42", borderRadius: "12px", padding: "16px" }}
              data-testid="card-group-settings"
            >
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-4 h-4" style={{ color: "#9090A8" }} />
                <span className="text-sm font-medium text-white">Group Settings</span>
              </div>
              <div className="space-y-4">
                {[
                  { label: "Members can send messages", key: "canMembersSendMessages", value: group?.canMembersSendMessages ?? true, testId: "switch-send-messages" },
                  { label: "Members can edit group info", key: "canMembersEditInfo", value: group?.canMembersEditInfo ?? true, testId: "switch-edit-info" },
                  { label: "Members can add others", key: "canMembersAddOthers", value: group?.canMembersAddOthers ?? true, testId: "switch-add-others" },
                ].map((setting) => (
                  <div key={setting.key} className="flex items-center justify-between gap-2">
                    <label className="text-sm text-white">{setting.label}</label>
                    <Switch
                      checked={setting.value}
                      onCheckedChange={(v) => handleSettingToggle(setting.key, v)}
                      data-testid={setting.testId}
                    />
                  </div>
                ))}
                <div style={{ height: "1px", background: "#2E2E42" }} />
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm text-white">Posting permission</label>
                  <Select
                    value={group?.postingPermission || "everyone"}
                    onValueChange={(v) => handleSettingSelect("postingPermission", v)}
                  >
                    <SelectTrigger className="w-36" data-testid="select-posting-permission" style={{ background: "#242433", border: "1px solid #2E2E42" }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="everyone">Everyone</SelectItem>
                      <SelectItem value="admins_only">Admins Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm text-white">Media permission</label>
                  <Select
                    value={group?.mediaPermission || "everyone"}
                    onValueChange={(v) => handleSettingSelect("mediaPermission", v)}
                  >
                    <SelectTrigger className="w-36" data-testid="select-media-permission" style={{ background: "#242433", border: "1px solid #2E2E42" }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="everyone">Everyone</SelectItem>
                      <SelectItem value="admin_only">Admin Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <div className="pt-2 pb-4 space-y-3">
            <button
              onClick={handleLeave}
              disabled={leaveGroup.isPending}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold btn-press"
              style={{
                height: "48px",
                borderRadius: "12px",
                background: "rgba(239,68,68,0.1)",
                border: "1.5px solid #EF4444",
                color: "#EF4444",
              }}
              data-testid="button-leave-group"
            >
              {leaveGroup.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Leave Group
            </button>
            {isOwner && (
              <button
                onClick={handleDelete}
                disabled={deleteGroup.isPending}
                className="w-full flex items-center justify-center gap-2 text-sm font-semibold btn-press"
                style={{
                  height: "48px",
                  borderRadius: "12px",
                  background: "rgba(239,68,68,0.15)",
                  border: "1.5px solid #EF4444",
                  color: "#EF4444",
                }}
                data-testid="button-delete-group"
              >
                {deleteGroup.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete Group
              </button>
            )}
          </div>

          <div className="pb-8" />
        </div>
      </div>

      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent style={{ background: "#1A1A24", border: "1px solid #2E2E42" }}>
          <DialogHeader>
            <DialogTitle className="text-white">Add Member</DialogTitle>
            <DialogDescription style={{ color: "#9090A8" }}>Search for a user to add to the group.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Search by name or nickname..."
            value={addMemberQuery}
            onChange={(e) => setAddMemberQuery(e.target.value)}
            style={{ background: "#242433", border: "1px solid #2E2E42", color: "#FFFFFF" }}
            data-testid="input-add-member-search"
          />
          <div className="space-y-1 max-h-64 overflow-y-auto mt-1">
            {addMemberQuery.trim().length >= 2 && (userSearchResults as any[] || []).length === 0 && (
              <p className="text-sm text-center py-4" style={{ color: "#9090A8" }}>No users found</p>
            )}
            {(userSearchResults as any[] || []).map((u: any) => (
              <div
                key={u.userId}
                className="flex items-center justify-between gap-3 py-2 px-1 rounded-lg"
                data-testid={`result-user-${u.userId}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                    style={{ background: "#242433", border: "1px solid #2E2E42" }}
                  >
                    {(u.displayName || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{u.displayName}</p>
                    {u.groupNickname && <p className="text-xs" style={{ color: "#9090A8" }}>@{u.groupNickname}</p>}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleAddMember(u.userId)}
                  disabled={addGroupMember.isPending}
                  style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)", border: "none", color: "#fff", height: "32px", fontSize: "12px" }}
                  data-testid={`button-add-user-${u.userId}`}
                >
                  Add
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={searchOpen} onOpenChange={(open) => { setSearchOpen(open); if (!open) setSearchQuery(""); }}>
        <DialogContent style={{ background: "#1A1A24", border: "1px solid #2E2E42" }}>
          <DialogHeader>
            <DialogTitle className="text-white">Search Messages</DialogTitle>
            <DialogDescription style={{ color: "#9090A8" }}>Find messages in this group.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ background: "#242433", border: "1px solid #2E2E42", color: "#FFFFFF" }}
            data-testid="input-search-messages"
          />
          <div className="space-y-2 max-h-80 overflow-y-auto mt-1">
            {searchQuery.trim().length > 0 && (messageSearchResults as any[] || []).length === 0 && (
              <p className="text-sm text-center py-4" style={{ color: "#9090A8" }}>No messages found</p>
            )}
            {(messageSearchResults as any[] || []).map((msg: any) => (
              <div
                key={msg.id}
                className="rounded-lg p-3"
                style={{ background: "#242433" }}
                data-testid={`search-result-${msg.id}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-white">{msg.nickname || "Unknown"}</span>
                  <span className="text-xs" style={{ color: "#9090A8" }}>
                    {msg.createdAt ? new Date(msg.createdAt).toLocaleDateString() : ""}
                  </span>
                </div>
                <p className="text-sm" style={{ color: "#9090A8" }}>{msg.content}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

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
            <Button
              onClick={handleSaveDescRules}
              disabled={updateGroup.isPending || updateSettings.isPending}
              style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)", border: "none", color: "#fff" }}
              data-testid="button-save-desc-rules"
            >
              {(updateGroup.isPending || updateSettings.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
