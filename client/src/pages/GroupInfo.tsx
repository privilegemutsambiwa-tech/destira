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
  Search, BellOff, Bell, Settings, ChevronRight, Share2, Camera
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

// vf-* tokens as literals (this file styles inline, not via Tailwind classes)
const INK = "#0C0910";
const SURFACE2 = "#161220";
const ELEVATED = "rgba(255,255,255,0.05)";
const LINE = "rgba(255,255,255,0.09)";
const MUTED = "#A79FB4";
const FAINT = "#7E7690";
const TEXT = "#F5F0EA";
const EMBER = "#FF6B4A";
const MINT = "#8FE3C7";
const SERIF: React.CSSProperties = { fontFamily: '"Instrument Serif", serif', fontWeight: 400 };
const MONO: React.CSSProperties = {
  fontFamily: '"DM Mono", ui-monospace, monospace',
  fontSize: "10.5px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

function PillAction({
  icon: Icon, label, onClick, disabled, active, testId,
}: {
  icon: any; label: string; onClick: () => void; disabled?: boolean; active?: boolean; testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 btn-press rounded-full disabled:opacity-50"
      style={{
        height: "36px", padding: "0 16px",
        border: `1px solid ${active ? "rgba(255,107,74,0.5)" : LINE}`,
        color: active ? EMBER : MUTED,
        background: "transparent",
      }}
      data-testid={testId}
    >
      <Icon className="w-4 h-4" />
      <span style={{ ...MONO }}>{label}</span>
    </button>
  );
}

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
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const iconUploadRef = useRef<HTMLInputElement>(null);
  const bannerUploadRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const toggleMute = useToggleMute(groupId);
  const addGroupMember = useAddGroupMember(groupId);
  const { data: userSearchResults } = useSearchUsers(addMemberQuery);
  const { data: messageSearchResults } = useSearchGroupMessages(groupId, searchQuery);

  const isOwner = group?.myRole === "owner";
  const isAdmin = group?.myRole === "owner" || group?.myRole === "admin";

  const currentMember = (members || []).find((m: { userId: string; isMuted?: boolean; role?: string }) => m.userId === user?.id);
  const actuallyMuted = isMuted !== null ? isMuted : (currentMember?.isMuted ?? false);

  const sortedMembers = [...(members || [])].sort((a: any, b: any) => {
    const order: Record<string, number> = { owner: 0, admin: 1, member: 2 };
    return (order[a.role] || 2) - (order[b.role] || 2);
  });

  const makeInviteUrl = (token: string) => `${window.location.origin}/join/${groupId}-${token}`;

  const handleCreateInvite = async () => {
    try {
      const link = await createInvite.mutateAsync();
      const url = makeInviteUrl(link.token);
      navigator.clipboard.writeText(url);
      toast({ title: "Invite link copied!" });
    } catch {
      toast({ title: "Error", description: "Failed to create invite link.", variant: "destructive" });
    }
  };

  const handleCopyLink = (token: string) => {
    const url = makeInviteUrl(token);
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
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add member.";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleShare = async () => {
    try {
      const linkRes = await createInvite.mutateAsync();
      const inviteUrl = makeInviteUrl(linkRes.token);
      const shareData = { title: group?.name || "Group", text: `Join "${group?.name}" on Destira`, url: inviteUrl };
      if (navigator.share) {
        await navigator.share(shareData).catch(() => {
          setShareLink(inviteUrl);
          setShareDialogOpen(true);
        });
      } else {
        setShareLink(inviteUrl);
        setShareDialogOpen(true);
      }
    } catch {
      toast({ title: "Error", description: "Failed to generate invite link.", variant: "destructive" });
    }
  };

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      toast({ title: "Invite link copied!" });
    } catch {
      toast({ title: "Error", description: "Could not copy link.", variant: "destructive" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      toast({ title: "Group picture updated" });
    } catch {
      toast({ title: "Error", description: "Failed to update the group picture.", variant: "destructive" });
    }
  };

  if (!groupId || isNaN(groupId)) {
    setLocation("/lounge");
    return null;
  }

  if (groupLoading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: INK }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: EMBER }} />
      </div>
    );
  }

  const privacy = PRIVACY_LABELS[group?.privacyMode || "open"] || PRIVACY_LABELS["open"];
  const mediaCount = media?.length || 0;
  const starredCount = starredMessages?.length || 0;
  const canAddMembers = isAdmin || group?.canMembersAddOthers;
  const currentlyMuted = currentMember?.isMuted ?? isMuted;

  return (
    <div className="h-screen flex flex-col" style={{ background: INK }}>
      <div
        className="px-4 py-3 flex items-center gap-3 sticky top-0 z-50"
        style={{ background: SURFACE2, borderBottom: `1px solid ${LINE}` }}
      >
        <button
          onClick={() => setLocation(`/lounge/group/${groupId}`)}
          className="w-9 h-9 flex items-center justify-center btn-press rounded-full"
          style={{ color: TEXT, background: "transparent" }}
          data-testid="button-back-chat"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 style={{ ...SERIF, color: TEXT, fontSize: "18px" }}>Group Info</h2>
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
            className="relative w-full"
            style={{ aspectRatio: "21 / 9", background: SURFACE2, borderBottom: `1px solid ${LINE}`, cursor: isAdmin ? "pointer" : "default" }}
            onClick={() => isAdmin && bannerUploadRef.current?.click()}
            data-testid="banner-area"
          >
            {(group?.bannerUrl || group?.groupPhotoUrl) ? (
              <img
                src={group.bannerUrl || group.groupPhotoUrl}
                alt={group.name}
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span style={{ ...MONO, color: FAINT }}>Cover photo</span>
              </div>
            )}
            <div
              className="absolute inset-0 bg-gradient-to-t from-vf-ink via-vf-ink/40 to-transparent"
              aria-hidden="true"
            />
            <div className="absolute left-[104px] right-4 bottom-3">
              <h2 style={{ ...SERIF, color: TEXT, fontSize: "24px", lineHeight: 1.1 }} data-testid="text-group-info-name">
                {group?.name}
              </h2>
              <p style={{ ...MONO, color: MUTED, marginTop: "4px" }} data-testid="text-group-subtitle">
                {group?.memberCount || sortedMembers.length} members{privacy.label !== "Open" ? ` · ${privacy.label}` : ""}
              </p>
            </div>
            {isAdmin && (
              <div
                className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium"
                style={{ background: "rgba(0,0,0,0.55)", color: TEXT }}
              >
                <Pencil className="w-3 h-3" /> Cover
              </div>
            )}
            {/* Group profile picture — overlaps the cover, editable by owner/admin */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (isAdmin) iconUploadRef.current?.click(); }}
              className="absolute left-4 bottom-3 w-[84px] h-[84px] rounded-full overflow-hidden flex items-center justify-center"
              style={{ background: SURFACE2, border: `3px solid ${INK}`, cursor: isAdmin ? "pointer" : "default" }}
              data-testid="button-group-avatar"
              aria-label={isAdmin ? "Change group picture" : "Group picture"}
            >
              {group?.iconUrl ? (
                <img src={group.iconUrl} alt={group.name} className="w-full h-full object-cover" />
              ) : (
                <span style={{ ...SERIF, color: TEXT, fontSize: "30px" }}>{(group?.name || "G")[0].toUpperCase()}</span>
              )}
              {isAdmin && (
                <span
                  className="absolute bottom-0 right-0 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: EMBER, border: `2px solid ${INK}` }}
                >
                  <Camera className="w-3 h-3" style={{ color: INK }} />
                </span>
              )}
            </button>
          </div>

          {group?.categoryTags && group.categoryTags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap px-4 mt-3">
              {group.categoryTags.map((tag: string) => (
                <span
                  key={tag}
                  style={{
                    background: "rgba(255,107,74,0.12)",
                    color: EMBER,
                    fontSize: "12px",
                    padding: "3px 10px",
                    borderRadius: "100px",
                    border: "1px solid rgba(255,107,74,0.4)",
                  }}
                  data-testid={`tag-${tag}`}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap px-4 py-5">
          {canAddMembers && (
            <PillAction icon={UserPlus} label="Invite" onClick={() => setAddMemberOpen(true)} testId="button-action-add-members" />
          )}
          <PillAction icon={Search} label="Search" onClick={() => setSearchOpen(true)} testId="button-action-search" />
          <PillAction
            icon={currentlyMuted ? BellOff : Bell}
            label={currentlyMuted ? "Unmute" : "Mute"}
            onClick={handleToggleMute}
            disabled={toggleMute.isPending}
            active={currentlyMuted}
            testId="button-action-mute"
          />
          <PillAction icon={Share2} label="Share" onClick={handleShare} testId="button-action-share" />
        </div>

        <div className="px-4 pt-4 pb-4 space-y-3 max-w-lg mx-auto">
          {(group?.description || group?.rulesText || isAdmin) && (
            <div
              style={{ background: SURFACE2, border: `1px solid ${LINE}`, borderRadius: "18px", padding: "16px" }}
              data-testid="card-group-info"
            >
              {group?.description && (
                <p className="text-sm mb-3" style={{ color: TEXT }} data-testid="text-group-description">{group.description}</p>
              )}
              {group?.rulesText && (
                <>
                  {group?.description && <div className="my-3" style={{ height: "1px", background: LINE }} />}
                  <p style={{ ...MONO, color: FAINT, marginBottom: "6px" }}>Group rules</p>
                  <p className="text-sm" style={{ color: MUTED }} data-testid="text-group-rules">
                    {group.rulesText}
                  </p>
                </>
              )}
              {isAdmin && (
                <button
                  onClick={openEditDescDialog}
                  className="mt-3 flex items-center gap-1.5 text-sm btn-press font-medium"
                  style={{ color: EMBER, background: "transparent", border: "none" }}
                  data-testid="button-edit-desc-rules"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              )}
            </div>
          )}

          <div
            style={{ background: "rgba(143,227,199,0.05)", border: "1px solid rgba(143,227,199,0.22)", borderRadius: "18px", padding: "16px" }}
            data-testid="card-twin-in-room"
          >
            <p style={{ ...MONO, color: MINT, marginBottom: "6px" }}>Your twin in this room</p>
            <p className="text-sm" style={{ color: TEXT }}>
              It listens here and learns how you are with your own people.
            </p>
            <button
              onClick={() => setLocation(`/twin-chat?from=/lounge/group/${groupId}`)}
              className="mt-3 text-sm btn-press font-medium"
              style={{ color: MINT, background: "transparent", border: "none" }}
              data-testid="link-twin-learned"
            >
              See what it's learned →
            </button>
          </div>

          {[
            {
              icon: <ImageIcon className="w-5 h-5" />,
              label: "Media",
              count: mediaCount,
              testId: "card-media",
              onClick: () => setMediaExpanded(!mediaExpanded),
              expanded: mediaExpanded,
              content: mediaExpanded ? (
                <div className="mt-3 px-1">
                  {mediaCount > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {media!.map((item: any, idx: number) => (
                        <div key={idx} className="aspect-square rounded-lg overflow-hidden" style={{ background: ELEVATED }} data-testid={`media-${idx}`}>
                          {item.contentType === "video" ? (
                            <video src={item.mediaUrl} className="w-full h-full object-cover" />
                          ) : (
                            <img src={item.mediaUrl} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm" style={{ color: MUTED }}>No shared media yet</p>
                  )}
                </div>
              ) : null,
            },
            {
              icon: <Star className="w-5 h-5" />,
              label: "Starred messages",
              count: starredCount,
              testId: "card-starred",
              onClick: () => setStarredExpanded(!starredExpanded),
              expanded: starredExpanded,
              content: starredExpanded ? (
                <div className="mt-3 space-y-2 px-1">
                  {starredCount > 0 ? (
                    starredMessages!.map((msg: any) => (
                      <div key={msg.id} className="rounded-lg p-3" style={{ background: ELEVATED }} data-testid={`starred-msg-${msg.id}`}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold text-white">{msg.nickname || "Unknown"}</span>
                          <span className="text-xs" style={{ color: MUTED }}>
                            {msg.createdAt ? new Date(msg.createdAt).toLocaleDateString() : ""}
                          </span>
                        </div>
                        <p className="text-sm line-clamp-2" style={{ color: MUTED }}>{msg.content}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm" style={{ color: MUTED }}>No starred messages</p>
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
                background: SURFACE2,
                border: `1px solid ${LINE}`,
                borderRadius: "18px",
                padding: "0 16px",
              }}
              data-testid={row.testId}
            >
              <div className="flex items-center justify-between gap-2" style={{ height: "52px" }}>
                <div className="flex items-center gap-3">
                  <span style={{ color: MUTED }}>{row.icon}</span>
                  <span className="text-sm font-medium" style={{ color: TEXT }}>{row.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ ...MONO, color: FAINT }}>{row.count}</span>
                  <ChevronRight
                    className="w-4 h-4 transition-transform"
                    style={{ color: EMBER, transform: row.expanded ? "rotate(90deg)" : "rotate(0deg)" }}
                  />
                </div>
              </div>
              {row.content}
            </button>
          ))}

          <div
            style={{
              background: SURFACE2,
              border: `1px solid ${LINE}`,
              borderRadius: "18px",
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
                <Users className="w-5 h-5" style={{ color: MUTED }} />
                <span className="text-sm font-medium" style={{ color: TEXT }}>Members</span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ ...MONO, color: FAINT }}>{sortedMembers.length}</span>
                <ChevronRight
                  className="w-4 h-4 transition-transform"
                  style={{ color: EMBER, transform: membersExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                />
              </div>
            </div>
            {membersExpanded && (
              <div className="mb-3 space-y-0">
                {sortedMembers.map((member: any) => (
                  <div key={member.id} className="flex items-center justify-between gap-2 py-2.5" style={{ borderTop: `1px solid ${LINE}` }} data-testid={`member-${member.id}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white"
                        style={{ background: ELEVATED, border: `1px solid ${LINE}` }}
                      >
                        {member.nickname?.[0]?.toUpperCase() || "?"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-white truncate">{member.nickname || "Anonymous"}</p>
                          {member.role === "owner" && <Crown className="w-3.5 h-3.5 shrink-0" style={{ color: TEXT }} />}
                          {member.role === "admin" && <Shield className="w-3.5 h-3.5 shrink-0" style={{ color: MUTED }} />}
                        </div>
                        <span className="text-xs capitalize" style={{ color: MUTED }}>{member.role}</span>
                      </div>
                    </div>
                    {isOwner && member.userId !== user?.id && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {member.role === "member" && (
                          <button
                            onClick={() => handlePromote(member.userId, "admin")}
                            className="px-2 py-1 text-xs rounded btn-press"
                            style={{ background: ELEVATED, color: TEXT, border: `1px solid ${LINE}` }}
                            data-testid={`button-promote-${member.id}`}
                          >
                            <Shield className="w-3 h-3 inline mr-1" />Admin
                          </button>
                        )}
                        {member.role === "admin" && (
                          <button
                            onClick={() => handlePromote(member.userId, "member")}
                            className="px-2 py-1 text-xs rounded btn-press"
                            style={{ background: ELEVATED, color: TEXT, border: `1px solid ${LINE}` }}
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
              style={{ background: SURFACE2, border: `1px solid ${LINE}`, borderRadius: "12px", padding: "16px" }}
              data-testid="card-invite-links"
            >
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="w-4 h-4" style={{ color: MUTED }} />
                <span className="text-sm font-medium text-white">Invite Links</span>
              </div>
              <button
                onClick={handleCreateInvite}
                disabled={createInvite.isPending}
                className="w-full flex items-center justify-center gap-2 text-sm font-medium btn-press"
                style={{
                  height: "40px",
                  borderRadius: "10px",
                  background: ELEVATED,
                  border: `1px solid ${LINE}`,
                  color: TEXT,
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
                        value={makeInviteUrl(link.token)}
                        readOnly
                        className="text-xs flex-1 px-3 py-2 outline-none"
                        style={{ background: ELEVATED, border: `1px solid ${LINE}`, borderRadius: "8px", color: MUTED }}
                        data-testid={`input-invite-${link.id}`}
                      />
                      <button
                        onClick={() => handleCopyLink(link.token)}
                        className="w-9 h-9 flex items-center justify-center rounded-lg btn-press"
                        style={{ background: ELEVATED, border: `1px solid ${LINE}`, color: TEXT }}
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
              style={{ background: SURFACE2, border: `1px solid ${LINE}`, borderRadius: "12px", padding: "16px" }}
              data-testid="card-group-settings"
            >
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4" style={{ color: MUTED }} />
                  <span className="text-sm font-medium text-white">Group Settings</span>
                </div>
                <button
                  onClick={() => setLocation(`/lounge/group/${groupId}/settings`)}
                  className="text-xs font-medium btn-press px-3 py-1 rounded-full"
                  style={{ background: ELEVATED, color: EMBER, border: `1px solid ${LINE}` }}
                  data-testid="button-open-full-settings"
                >
                  Full Settings
                </button>
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
                <div style={{ height: "1px", background: LINE }} />
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm text-white">Posting permission</label>
                  <Select
                    value={group?.postingPermission || "everyone"}
                    onValueChange={(v) => handleSettingSelect("postingPermission", v)}
                  >
                    <SelectTrigger className="w-36" data-testid="select-posting-permission" style={{ background: ELEVATED, border: `1px solid ${LINE}` }}>
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
                    <SelectTrigger className="w-36" data-testid="select-media-permission" style={{ background: ELEVATED, border: `1px solid ${LINE}` }}>
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

          <div className="pt-2 pb-4 space-y-3 flex flex-col items-center">
            <button
              onClick={() => setLeaveConfirmOpen(true)}
              disabled={leaveGroup.isPending}
              className="text-sm font-medium btn-press py-2"
              style={{ color: MUTED, background: "transparent", border: "none" }}
              data-testid="button-leave-group"
            >
              {leaveGroup.isPending ? "Leaving…" : "Leave group"}
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
        <DialogContent style={{ background: SURFACE2, border: `1px solid ${LINE}` }}>
          <DialogHeader>
            <DialogTitle style={{ ...SERIF, color: TEXT }}>Add Member</DialogTitle>
            <DialogDescription style={{ color: MUTED }}>Search for a user to add to the group.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Search by name or nickname..."
            value={addMemberQuery}
            onChange={(e) => setAddMemberQuery(e.target.value)}
            style={{ background: ELEVATED, border: `1px solid ${LINE}`, color: TEXT }}
            data-testid="input-add-member-search"
          />
          <div className="space-y-1 max-h-64 overflow-y-auto mt-1">
            {addMemberQuery.trim().length >= 2 && ((userSearchResults as { userId: string; displayName: string; groupNickname?: string }[]) || []).length === 0 && (
              <p className="text-sm text-center py-4" style={{ color: MUTED }}>No users found</p>
            )}
            {((userSearchResults as { userId: string; displayName: string; groupNickname?: string }[]) || []).map((u) => (
              <div
                key={u.userId}
                className="flex items-center justify-between gap-3 py-2 px-1 rounded-lg"
                data-testid={`result-user-${u.userId}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                    style={{ background: ELEVATED, border: `1px solid ${LINE}` }}
                  >
                    {(u.displayName || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{u.displayName}</p>
                    {u.groupNickname && <p className="text-xs" style={{ color: MUTED }}>@{u.groupNickname}</p>}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleAddMember(u.userId)}
                  disabled={addGroupMember.isPending}
                  style={{ background: EMBER, border: "none", color: INK, height: "32px", fontSize: "12px" }}
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
        <DialogContent style={{ background: SURFACE2, border: `1px solid ${LINE}` }}>
          <DialogHeader>
            <DialogTitle style={{ ...SERIF, color: TEXT }}>Search Messages</DialogTitle>
            <DialogDescription style={{ color: MUTED }}>Find messages in this group.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ background: ELEVATED, border: `1px solid ${LINE}`, color: TEXT }}
            data-testid="input-search-messages"
          />
          <div className="space-y-2 max-h-80 overflow-y-auto mt-1">
            {searchQuery.trim().length > 0 && ((messageSearchResults as { id: number; content: string; nickname?: string; createdAt?: string }[]) || []).length === 0 && (
              <p className="text-sm text-center py-4" style={{ color: MUTED }}>No messages found</p>
            )}
            {((messageSearchResults as { id: number; content: string; nickname?: string; createdAt?: string }[]) || []).map((msg) => (
              <button
                key={msg.id}
                className="w-full text-left rounded-lg p-3 btn-press"
                style={{ background: ELEVATED }}
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQuery("");
                  setLocation(`/lounge/group/${groupId}?msg=${msg.id}`);
                }}
                data-testid={`search-result-${msg.id}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-white">{msg.nickname || "Unknown"}</span>
                  <span className="text-xs" style={{ color: MUTED }}>
                    {msg.createdAt ? new Date(msg.createdAt).toLocaleDateString() : ""}
                  </span>
                </div>
                <p className="text-sm" style={{ color: MUTED }}>{msg.content}</p>
              </button>
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
              style={{ background: EMBER, border: "none", color: INK }}
              data-testid="button-save-desc-rules"
            >
              {(updateGroup.isPending || updateSettings.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent style={{ background: SURFACE2, border: `1px solid ${LINE}` }}>
          <DialogHeader>
            <DialogTitle style={{ ...SERIF, color: TEXT }}>Invite Link</DialogTitle>
            <DialogDescription style={{ color: MUTED }}>Share this link to invite people to the group.</DialogDescription>
          </DialogHeader>
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm break-all"
            style={{ background: ELEVATED, border: `1px solid ${LINE}`, color: MUTED }}
            data-testid="text-share-link"
          >
            {shareLink}
          </div>
          <DialogFooter>
            <Button
              onClick={handleCopyShareLink}
              style={{ background: EMBER, border: "none", color: INK }}
              data-testid="button-copy-share-link"
            >
              Copy Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={leaveConfirmOpen} onOpenChange={setLeaveConfirmOpen}>
        <DialogContent style={{ background: SURFACE2, border: `1px solid ${LINE}` }}>
          <DialogHeader>
            <DialogTitle style={{ ...SERIF, color: TEXT }}>Leave {group?.name || "this group"}?</DialogTitle>
            <DialogDescription style={{ color: MUTED }}>
              You'll stop seeing this room. You can rejoin later if it's open or you're invited back.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button
              className="px-4 py-2 text-sm font-medium"
              style={{ color: MUTED }}
              onClick={() => setLeaveConfirmOpen(false)}
              data-testid="button-cancel-leave"
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 text-sm font-semibold"
              style={{ background: EMBER, color: INK, borderRadius: "10px", border: "none" }}
              onClick={() => { setLeaveConfirmOpen(false); handleLeave(); }}
              data-testid="button-confirm-leave"
            >
              Leave group
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
