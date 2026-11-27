import { useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Crown, Shield, Loader2, Users, UserPlus, Trash2, Pencil, Image as ImageIcon, Star,
  Search, BellOff, Bell, ChevronRight, Share2, Camera, MoreHorizontal
} from "lucide-react";
import {
  useGroup, useGroupMembers, useGroupMedia, useUpdateGroup,
  useUpdateMemberRole, useRemoveGroupMember, useCreateInviteLink,
  useGroupInviteLink, useLeaveGroup, useDeleteGroup,
  useStarredMessages, useUpdateGroupSettings,
  useToggleMute, useAddGroupMember, useSearchUsers, useSearchGroupMessages
} from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
import { pressable } from "@/lib/a11y";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { avatarColor } from "@/lib/avatar-color";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { PhotoSourceSheet } from "@/components/photo-source-sheet";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { publicOrigin } from "@/lib/app-api";
import { PAUSE_OPTIONS, pauseMember, pausedUntilLabel } from "@/components/room-moderation";
import { type MemberAction, MemberActionDialog } from "@/components/group-info/member-action-dialog";
import { PRIVACY_LABELS, genderLabel, INK, SURFACE2, ELEVATED, LINE, MUTED, FAINT, TEXT, EMBER, MINT, SERIF, MONO, PillAction } from "@/components/group-info/ui";
import { InviteLinksCard, GroupSettingsCard } from "@/components/group-info/admin-cards";
import { AddMemberDialog, SearchMessagesDialog, EditAboutDialog, ShareLinkDialog, LeaveGroupDialog } from "@/components/group-info/dialogs";

export default function GroupInfoPage({ params }: { params?: { groupId?: string } }) {
  const groupId = Number(params?.groupId);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: group, isLoading: groupLoading } = useGroup(groupId);
  const { data: members } = useGroupMembers(groupId);
  const { data: media } = useGroupMedia(groupId);
  const { data: inviteLink } = useGroupInviteLink(groupId);
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

  const [photoTarget, setPhotoTarget] = useState<"icon" | "banner" | null>(null);
  const [lightbox, setLightbox] = useState<{ photos: { url: string }[]; index: number } | null>(null);
  const [memberAction, setMemberAction] = useState<{ member: any; action: MemberAction | null } | null>(null);
  const [pauseBusy, setPauseBusy] = useState(false);
  const queryClient = useQueryClient();

  const toggleMute = useToggleMute(groupId);
  const addGroupMember = useAddGroupMember(groupId);
  // Debounced — these used to fire a request on every keystroke.
  const debouncedAddMemberQuery = useDebouncedValue(addMemberQuery);
  const debouncedSearchQuery = useDebouncedValue(searchQuery);
  const { data: userSearchResults } = useSearchUsers(debouncedAddMemberQuery);
  const { data: messageSearchResults } = useSearchGroupMessages(groupId, debouncedSearchQuery);

  const isOwner = group?.myRole === "owner";
  const isAdmin = group?.myRole === "owner" || group?.myRole === "admin";

  const bannerPhotoUrl: string | null = group?.bannerUrl || group?.groupPhotoUrl || null;
  // Both the cover and the group picture are viewable; whichever was tapped
  // opens first and the other is a swipe/tap away.
  const openLightbox = (url: string) => {
    const photos = [bannerPhotoUrl, group?.iconUrl].filter((u): u is string => !!u);
    setLightbox({ photos: photos.map((u) => ({ url: u })), index: Math.max(photos.indexOf(url), 0) });
  };

  const currentMember = (members || []).find((m: { userId: string; isMuted?: boolean; role?: string }) => m.userId === user?.id);

  const sortedMembers = [...(members || [])].sort((a: any, b: any) => {
    const order: Record<string, number> = { owner: 0, admin: 1, member: 2 };
    return (order[a.role] ?? 2) - (order[b.role] ?? 2);
  });

  const makeInviteUrl = (token: string) => `${publicOrigin()}/join/${groupId}-${token}`;

  const handleCreateInvite = async () => {
    try {
      const link = await createInvite.mutateAsync();
      const url = makeInviteUrl(link.token);
      await navigator.clipboard.writeText(url);
      toast({ title: "Invite link copied!" });
    } catch (err) {
      console.error("[Invite Error]", err);
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
    // Generate the invite link first, and keep this failure distinct from any
    // navigator.share failure below — otherwise a share-sheet error (e.g. the
    // user dismissing it) gets misreported as "failed to generate" even though
    // the link was created fine.
    let inviteUrl: string;
    try {
      const linkRes = await createInvite.mutateAsync();
      inviteUrl = makeInviteUrl(linkRes.token);
    } catch (err) {
      console.error("[Invite Error]", err);
      toast({ title: "Error", description: "Failed to generate invite link.", variant: "destructive" });
      return;
    }

    const shareData = { title: group?.name || "Group", text: `Join "${group?.name}" on Destira`, url: inviteUrl };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        setShareLink(inviteUrl);
        setShareDialogOpen(true);
      }
    } catch (err) {
      // navigator.share can reject (or, in some browsers, throw synchronously)
      // with AbortError when the user simply dismisses the native share sheet —
      // that's an intentional cancel, not an error, so don't toast for it.
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      console.error("[Invite Error]", err);
      setShareLink(inviteUrl);
      setShareDialogOpen(true);
    }
  };

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      toast({ title: "Invite link copied!" });
    } catch (err) {
      console.error("[Invite Error]", err);
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
      <div className="h-dvh flex items-center justify-center" style={{ background: INK }}>
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
    <div className="h-dvh flex flex-col" style={{ background: INK }}>
      <div
        className="px-4 py-3 flex items-center gap-3 sticky top-0 z-50"
        style={{ background: SURFACE2, borderBottom: `1px solid ${LINE}` }}
      >
        <button aria-label="Back"
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
          <PhotoSourceSheet
            open={photoTarget !== null}
            onClose={() => setPhotoTarget(null)}
            onFile={(file) => {
              if (photoTarget === "banner") handleUploadBanner(file);
              else if (photoTarget === "icon") handleUploadIcon(file);
            }}
            title={photoTarget === "banner" ? "Change cover photo" : "Change group picture"}
          />
          {/* Tapping a photo always opens it full size, for everyone — editing
              (owner/admin only) is its own explicit control, so viewing and
              changing a photo are never the same tap. */}
          <div
            className="relative w-full"
            style={{ aspectRatio: "21 / 9", background: SURFACE2, borderBottom: `1px solid ${LINE}`, cursor: bannerPhotoUrl ? "zoom-in" : isAdmin ? "pointer" : "default" }}
            {...(bannerPhotoUrl || isAdmin
              ? pressable(() => {
                  if (bannerPhotoUrl) openLightbox(bannerPhotoUrl);
                  else setPhotoTarget("banner");
                })
              : {})}
            aria-label={bannerPhotoUrl ? "View the group's cover photo" : isAdmin ? "Add a cover photo" : undefined}
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
              className="absolute inset-0 bg-gradient-to-t from-vf-scrim via-vf-scrim/40 to-transparent"
              aria-hidden="true"
            />
            {/* On the cover photo's own scrim (from-vf-scrim above, always
                dark), not the page — this text stays a fixed light color
                regardless of theme, same reasoning as the "Cover" badge below. */}
            <div className="absolute left-[104px] right-4 bottom-3">
              <h2 style={{ ...SERIF, color: "#F5F0EA", fontSize: "24px", lineHeight: 1.1 }} data-testid="text-group-info-name">
                {group?.name}
              </h2>
              <p style={{ ...MONO, color: "rgba(245,240,234,0.75)", marginTop: "4px" }} data-testid="text-group-subtitle">
                {group?.memberCount || sortedMembers.length} members{privacy.label !== "Open" ? ` · ${privacy.label}` : ""}
              </p>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPhotoTarget("banner"); }}
                className="absolute top-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium btn-press"
                // On the cover photo's own dark scrim, not the page — stays a
                // fixed light color regardless of theme, same as the scrim itself.
                style={{ background: "rgba(0,0,0,0.55)", color: "#F5F0EA" }}
                data-testid="button-edit-cover"
                aria-label="Change cover photo"
              >
                <Pencil className="w-3 h-3" /> Edit cover
              </button>
            )}
            {/* Group profile picture — overlaps the cover. Tap to view full
                size; owner/admin get a separate camera badge to change it. */}
            <div className="absolute left-4 bottom-3 w-[84px] h-[84px]">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (group?.iconUrl) openLightbox(group.iconUrl);
                  else if (isAdmin) setPhotoTarget("icon");
                }}
                className="w-full h-full rounded-full overflow-hidden flex items-center justify-center"
                style={{ background: SURFACE2, border: `3px solid ${INK}`, cursor: group?.iconUrl ? "zoom-in" : isAdmin ? "pointer" : "default" }}
                data-testid="button-group-avatar"
                aria-label="View group picture"
              >
                {group?.iconUrl ? (
                  <img src={group.iconUrl} alt={group.name} className="w-full h-full object-cover" />
                ) : (
                  <span style={{ ...SERIF, color: TEXT, fontSize: "30px" }}>{(group?.name || "G")[0].toUpperCase()}</span>
                )}
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setPhotoTarget("icon"); }}
                  className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center btn-press"
                  style={{ background: EMBER, border: `2px solid ${INK}` }}
                  data-testid="button-edit-group-picture"
                  aria-label="Change group picture"
                >
                  <Camera className="w-3.5 h-3.5" style={{ color: INK }} />
                </button>
              )}
            </div>
          </div>

          {group?.categoryTags && group.categoryTags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap px-4 mt-3">
              {group.categoryTags.map((tag: string) => (
                <span
                  key={tag}
                  style={{
                    background: "hsl(var(--vf-ember) / 0.12)",
                    color: EMBER,
                    fontSize: "12px",
                    padding: "3px 10px",
                    borderRadius: "100px",
                    border: "1px solid hsl(var(--vf-ember) / 0.4)",
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
            style={{ background: "hsl(var(--vf-mint) / 0.05)", border: "1px solid hsl(var(--vf-mint) / 0.22)", borderRadius: "18px", padding: "16px" }}
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
                          <span className="text-xs font-semibold text-foreground">{msg.nickname || "Unknown"}</span>
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
                        style={{ background: avatarColor(member.userId) }}
                      >
                        {member.nickname?.[0]?.toUpperCase() || "?"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-foreground truncate">{member.nickname || "Anonymous"}</p>
                          {member.role === "owner" && <Crown className="w-3.5 h-3.5 shrink-0" style={{ color: TEXT }} />}
                          {member.role === "admin" && <Shield className="w-3.5 h-3.5 shrink-0" style={{ color: MUTED }} />}
                          {genderLabel(member.gender) && (
                            <span
                              className="font-mono uppercase tracking-[0.08em] shrink-0"
                              style={{ fontSize: "9.5px", color: FAINT }}
                              data-testid={`gender-member-${member.id}`}
                            >
                              {genderLabel(member.gender)}
                            </span>
                          )}
                        </div>
                        <span className="text-xs capitalize" style={{ color: MUTED }}>{member.role}</span>
                        {isAdmin && pausedUntilLabel(member.mutedUntil) && (
                          <span className="text-xs ml-1.5" style={{ color: EMBER }} data-testid={`paused-member-${member.userId}`}>· {pausedUntilLabel(member.mutedUntil)}</span>
                        )}
                      </div>
                    </div>
                    {/* One quiet menu button instead of always-visible Admin/Remove
                        buttons — nothing destructive or privilege-changing is a
                        single tap away, and every choice is confirmed first. */}
                    {(isOwner || (isAdmin && member.role === "member")) && member.userId !== user?.id && member.role !== "owner" && (
                      <button
                        onClick={() => setMemberAction({ member, action: null })}
                        className="w-8 h-8 rounded-full flex items-center justify-center btn-press shrink-0 transition-colors hover:brightness-125"
                        style={{ background: ELEVATED, border: `1px solid ${LINE}` }}
                        aria-label={`Manage ${member.nickname || "member"}`}
                        data-testid={`button-manage-${member.id}`}
                      >
                        <MoreHorizontal className="w-4 h-4" style={{ color: MUTED }} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {isAdmin && (
            <InviteLinksCard {...{ createInvite, handleCreateInvite, inviteLink, makeInviteUrl, handleCopyLink, copiedLink }} />
          )}

          {isAdmin && (
            <GroupSettingsCard {...{ setLocation, groupId, group, handleSettingToggle, handleSettingSelect }} />
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
                  border: "1.5px solid var(--vf-danger)",
                  color: "var(--vf-danger)",
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

      <AddMemberDialog {...{ addMemberOpen, setAddMemberOpen, addMemberQuery, setAddMemberQuery, userSearchResults, handleAddMember, addGroupMember }} />

      <SearchMessagesDialog {...{ searchOpen, setSearchOpen, searchQuery, setSearchQuery, messageSearchResults, setLocation, groupId }} />

      <EditAboutDialog {...{ editDescOpen, setEditDescOpen, editDesc, setEditDesc, editRules, setEditRules, handleSaveDescRules, updateGroup, updateSettings }} />

      <ShareLinkDialog {...{ shareDialogOpen, setShareDialogOpen, shareLink, handleCopyShareLink }} />

      <LeaveGroupDialog {...{ leaveConfirmOpen, setLeaveConfirmOpen, group, handleLeave }} />

      {lightbox && (
        <PhotoLightbox photos={lightbox.photos} initialIndex={lightbox.index} onClose={() => setLightbox(null)} />
      )}

      <MemberActionDialog
        target={memberAction}
        busy={updateRole.isPending || removeMember.isPending || pauseBusy}
        canManage={isOwner}
        onPause={async (minutes) => {
          if (!memberAction) return;
          setPauseBusy(true);
          try {
            await pauseMember(groupId, memberAction.member.userId, minutes);
            await queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "members"] });
            const label = PAUSE_OPTIONS.find((o) => o.minutes === minutes)?.label;
            toast({ title: minutes ? `Paused for ${label}. They've been told.` : "They can post again." });
            setMemberAction(null);
          } catch (e: any) {
            toast({ title: e.message, variant: "destructive" });
          } finally {
            setPauseBusy(false);
          }
        }}
        onClose={() => setMemberAction(null)}
        onPick={(action) => setMemberAction((cur) => (cur ? { ...cur, action } : cur))}
        onConfirm={async () => {
          if (!memberAction?.action) return;
          const { member, action } = memberAction;
          if (action === "promote") await handlePromote(member.userId, "admin");
          else if (action === "demote") await handlePromote(member.userId, "member");
          else if (action === "remove") await handleRemove(member.userId);
          else return;
          setMemberAction(null);
        }}
      />
    </div>
  );
}
