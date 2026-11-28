import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger
} from "@/components/ui/popover";
import { ArrowLeft, Send, Info, Loader2, Paperclip, BarChart3, Dices, Star, Reply, Copy, Trash2, X, Users, MessageSquarePlus, Crown, Flag, CheckCheck } from "lucide-react";
import { useGroup, useEnrichedGroupMessages, useSendGroupMessage, useAddReaction, useRemoveReaction, useDeleteOwnMessage, useJoinGroup, useStarMessage, useUnstarMessage, useCreateChatRequest, useMarkGroupSeen, useGroups, useGroupMembers } from "@/hooks/use-interactions";
import { MentionPicker } from "@/components/mention-picker";
import { useQueryClient } from "@tanstack/react-query";
import { GameNightBanner } from "@/components/game-nights";
import { RoomVoiceBubble, useRoomVoice } from "@/components/room-voice";
import { MicButton, RecordingBar } from "@/components/dm-composer-extras";
import { PausedNotice, RemoveMessageSheet, RoomRulesCard, SlowModeLine, removedLine, usePostingState, useSlowMode } from "@/components/room-moderation";
import { gameName } from "@/lib/game-names";
import { IconButton } from "@/components/ui-vf";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { LiveRegion, spokenMessage, useNewMessageAnnouncement } from "@/lib/a11y";
import { useKeyboardScroll } from "@/hooks/use-keyboard-scroll";
import { usePaywall } from "@/hooks/use-paywall";
import { apiRequest } from "@/lib/queryClient";
import { parseDestiraLink } from "@/lib/link-preview";
import { LinkPreviewCard } from "@/components/link-preview-card";
import { avatarColor } from "@/lib/avatar-color";
import { PhotoSourceSheet } from "@/components/photo-source-sheet";
import { enqueue, isConnectionError } from "@/lib/outbox";
import { OutboxBubbles } from "@/components/outbox-bubbles";
import { ChatSkeleton } from "@/components/ui-vf/skeletons";
import { haptic } from "@/lib/haptics";
import { type MessageAction, REACTION_ICONS, REACTIONS, INK, SURFACE2, ELEVATED, LINE, MUTED, FAINT, TEXT, EMBER, MINT, SERIF, MONO, genderLabel, withMentions, formatTime, formatDateSeparator, isSameDay } from "@/components/group-chat/chat-utils";
import { PollBubble, PollComposerDialog, GameBubble, MessageInfoDialog } from "@/components/group-chat/chat-bubbles";

export default function GroupChatPage({ params }: { params?: { groupId?: string } }) {
  const groupId = Number(params?.groupId);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const highlightMsgId = (() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const match = search.match(/[?&]msg=(\d+)/);
    return match ? parseInt(match[1]) : null;
  })();

  const { data: group, isLoading: groupLoading } = useGroup(groupId);
  const { data: messages, isLoading: msgsLoading } = useEnrichedGroupMessages(groupId);
  // Screen readers hear new messages from others as they arrive (K6).
  const announcement = useNewMessageAnnouncement(messages as any[] | undefined, {
    key: (m) => m.id,
    mine: (m) => m.userId === user?.id,
    say: (m) => `${m.nickname || "Someone"}: ${spokenMessage(m)}`,
  });
  const sendMessage = useSendGroupMessage(groupId);
  const deleteOwnMsg = useDeleteOwnMessage(groupId);
  const queryClient = useQueryClient();
  const addReaction = useAddReaction(groupId);
  const removeReaction = useRemoveReaction(groupId);
  const joinGroup = useJoinGroup();
  const starMessage = useStarMessage(groupId);
  const unstarMessage = useUnstarMessage(groupId);
  const createChatRequest = useCreateChatRequest();
  const paywall = usePaywall();
  const markSeen = useMarkGroupSeen(groupId);

  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<any>(null);
  const [activeMessageId, setActiveMessageId] = useState<number | null>(null);
  const [showPollDialog, setShowPollDialog] = useState(false);
  const [messageInfoId, setMessageInfoId] = useState<number | null>(null);
  const [reportTarget, setReportTarget] = useState<{ userId: string; messageId: number } | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState<number | null>(highlightMsgId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showPhotoSource, setShowPhotoSource] = useState(false);

  const isMember = group?.isMember || hasJoined;
  // A live game shows as a banner under the header (§7.13). The rooms list
  // already carries it, and is usually cached from the Lounge.
  const { data: rooms } = useGroups(undefined, "all");
  const liveGame = (rooms as any[] | undefined)?.find((r) => r.id === groupId)?.liveGame as
    | { id: number; kind: string; playing: number }
    | null
    | undefined;
  const isAdmin = group?.myRole === "owner" || group?.myRole === "admin";
  const { data: roomMembers } = useGroupMembers(groupId);
  const { data: posting } = usePostingState(groupId, !!isMember);
  const slow = useSlowMode(posting);
  const [removeTarget, setRemoveTarget] = useState<any>(null);
  const voice = useRoomVoice(groupId, () => replyTo?.id ?? null, () => { setReplyTo(null); slow.sent(); });
  const mediaAllowed = isAdmin || group?.mediaPermission !== "admin_only";

  useEffect(() => {
    if (highlightMsgId && messages) {
      const el = document.getElementById(`msg-${highlightMsgId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => setHighlightedMsgId(null), 3000);
      }
    } else if (!highlightMsgId) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, highlightMsgId]);
  useKeyboardScroll(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }));

  // Advances this viewer's own read watermark once they've actually been
  // shown the latest message — mirrors the read-marking-on-real-view
  // reasoning already used for stories, just for "message info" read counts
  // instead of a view counter.
  // Not a message still on its way (those have a temporary negative id).
  const latestMessageId = messages?.filter((m: any) => m.id > 0).slice(-1)[0]?.id ?? null;
  useEffect(() => {
    if (isMember && latestMessageId !== null) markSeen.mutate(latestMessageId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMember, latestMessageId]);

  const messagesMap = useMemo(() => {
    const map: Record<number, any> = {};
    messages?.forEach((m: any) => { map[m.id] = m; });
    return map;
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || slow.left > 0) return;
    const text = input;
    setInput("");
    haptic.send();
    const payload: any = { content: text, contentType: "text" };
    if (replyTo) {
      payload.replyToMessageId = replyTo.id;
      setReplyTo(null);
    }
    // No connection: it waits in the outbox and sends itself later.
    if (navigator.onLine === false) {
      enqueue("group", groupId, text, payload.replyToMessageId);
      return;
    }
    try {
      await sendMessage.mutateAsync(payload);
      slow.sent();
    } catch (error: any) {
      if (isConnectionError(error)) {
        enqueue("group", groupId, text, payload.replyToMessageId);
        return;
      }
      // Not sent (slow mode, a pause, the rules): keep what they wrote.
      setInput((cur) => cur || text);
      queryClient.invalidateQueries({ queryKey: [`/api/groups/${groupId}/posting`] });
      toast({ title: "Couldn't send that", description: error?.message || "Must join group first.", variant: "destructive" });
    }
  };

  const handleJoin = async () => {
    try {
      const result = await joinGroup.mutateAsync(groupId);
      if (result.status === "requested") {
        toast({ title: "Request Sent", description: "Your join request has been sent." });
      } else {
        setHasJoined(true);
        toast({ title: "Joined!", description: `You're now part of ${group?.name}.` });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "";
      if (errMsg.includes("Already")) {
        setHasJoined(true);
      } else {
        toast({ title: "Error", description: errMsg || "Failed to join.", variant: "destructive" });
      }
    }
  };

  const handleImageUpload = async (file: File) => {
    const formData = new FormData();
    formData.append("image", file);
    try {
      const res = await fetch("/api/uploads/image", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      await sendMessage.mutateAsync({ content: "", contentType: "image", mediaUrl: data.url || data.imageUrl });
    } catch {
      toast({ title: "Error", description: "Failed to upload image.", variant: "destructive" });
    }
  };

  // Shows on the message straight away; undone if the server refuses.
  const handleReact = (messageId: number, reaction: string) => {
    setActiveMessageId(null);
    addReaction.mutate({ messageId, reaction });
  };

  const handleDeleteOwn = async (messageId: number) => {
    try {
      await deleteOwnMsg.mutateAsync(messageId);
      toast({ title: "Message deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    }
    setActiveMessageId(null);
  };

  const submitReport = async () => {
    if (!reportTarget) return;
    setReportBusy(true);
    try {
      await apiRequest("POST", `/api/users/${reportTarget.userId}/report`, {
        reason: reportReason.trim(),
        evidence: [{ type: "group_message", id: reportTarget.messageId }],
      });
      toast({ title: "Report sent", description: "Our team will review it." });
      setReportTarget(null);
      setReportReason("");
    } catch {
      toast({ title: "Could not send report", variant: "destructive" });
    } finally {
      setReportBusy(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
    setActiveMessageId(null);
  };

  if (!groupId || isNaN(groupId)) {
    setLocation("/lounge");
    return null;
  }

  return (
    <div className="h-dvh flex flex-col" style={{ background: INK }}>
      <div
        className="px-4 py-3 flex items-center gap-3 sticky top-0 z-50"
        style={{
          background: SURFACE2,
          borderBottom: `1px solid ${LINE}`,
        }}
      >
        <IconButton label="Back to the Lounge" onClick={() => setLocation("/lounge")} className="-ml-2" data-testid="button-back-lounge">
          <ArrowLeft className="w-5 h-5" />
        </IconButton>
        <button
          onClick={() => setLocation(`/lounge/group/${groupId}/info`)}
          className="w-10 h-10 rounded-[12px] overflow-hidden shrink-0 flex items-center justify-center"
          style={{ background: group ? `linear-gradient(135deg, ${avatarColor(String(groupId))}, ${avatarColor(group.name || "")})` : SURFACE2, border: `1px solid ${LINE}` }}
          data-testid="img-group-avatar"
        >
          {group?.iconUrl || group?.groupPhotoUrl ? (
            <img src={group.iconUrl || group.groupPhotoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span style={{ ...SERIF, color: "#FFFFFF", fontSize: "17px" }}>{(group?.name || "G")[0].toUpperCase()}</span>
          )}
        </button>
        <button
          onClick={() => setLocation(`/lounge/group/${groupId}/info`)}
          className="flex-1 min-w-0 text-left"
          data-testid="button-open-group-header"
        >
          <h2 className="truncate font-display text-vf-text text-[19px] leading-tight" data-testid="text-group-name">
            {group?.name || "Room"}
          </h2>
          <p className="vf-label text-vf-faint mt-0.5">
            {group?.memberCount || 0} member{group?.memberCount === 1 ? "" : "s"}
          </p>
        </button>
        <IconButton label="Room info" onClick={() => setLocation(`/lounge/group/${groupId}/info`)} className="-mr-2" data-testid="button-group-info">
          <Info className="w-5 h-5" />
        </IconButton>
      </div>

      {liveGame && isMember && (
        <button
          onClick={() => setLocation(`/lounge/group/${groupId}/games/${liveGame.id}`)}
          className="vf-press flex items-center gap-3 px-4 py-2.5 text-left border-b border-vf-ember/25 bg-vf-ember/[0.08]"
          data-testid="banner-live-game"
        >
          <span className="relative flex w-2.5 h-2.5 shrink-0">
            <span className="absolute inset-0 rounded-full bg-vf-ember motion-safe:animate-ping opacity-60" />
            <span className="relative w-2.5 h-2.5 rounded-full bg-vf-ember" />
          </span>
          <span className="flex-1 min-w-0 text-[14px] text-vf-text truncate">
            {gameName(liveGame.kind)} live{liveGame.playing > 0 ? ` · ${liveGame.playing} playing` : ""}
          </span>
          <span className="text-[14px] font-semibold text-vf-ember shrink-0">Join</span>
        </button>
      )}

      {isMember && <GameNightBanner groupId={groupId} liveGameShown={!!liveGame} />}

      <div className="flex-1 overflow-y-auto p-4 space-y-1" onClick={() => setActiveMessageId(null)}>
        {msgsLoading ? (
          <ChatSkeleton />
        ) : messages && messages.length > 0 ? (
          messages.map((msg: any, idx: number) => {
            const isMe = msg.userId === user?.id;
            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const showDate = idx === 0 || !isSameDay(prevMsg!.createdAt, msg.createdAt);
            const groupedWithPrev = !!prevMsg && !showDate && prevMsg.userId === msg.userId && isSameDay(prevMsg.createdAt, msg.createdAt);
            const isDeleted = msg.isDeletedByAdmin || msg.deletedForEveryone;
            const repliedMsg = msg.replyToMessageId ? messagesMap[msg.replyToMessageId] : null;

            const groupedReactions: Record<string, number> = {};
            msg.reactions?.forEach((r: any) => {
              groupedReactions[r.reaction] = (groupedReactions[r.reaction] || 0) + 1;
            });

            const initials = (msg.nickname || "?")[0]?.toUpperCase();

            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="flex justify-center my-4">
                    <span
                      style={{
                        fontSize: "11px",
                        color: MUTED,
                        background: SURFACE2,
                        borderRadius: "100px",
                        padding: "2px 12px",
                        border: `1px solid ${LINE}`,
                      }}
                      data-testid={`date-separator-${idx}`}
                    >
                      {formatDateSeparator(msg.createdAt)}
                    </span>
                  </div>
                )}

                <div
                  id={`msg-${msg.id}`}
                  className={`flex ${isMe ? "justify-end" : "justify-start"} ${groupedWithPrev ? "mb-0.5" : "mb-2"} transition-all duration-500`}
                  style={highlightedMsgId === msg.id ? { background: "hsl(var(--vf-ember) / 0.12)", borderRadius: "12px", marginLeft: "-8px", marginRight: "-8px", paddingLeft: "8px", paddingRight: "8px" } : undefined}
                  data-testid={`message-${msg.id}`}
                >
                  {!isMe && (
                    groupedWithPrev ? (
                      <div className="w-8 mr-2 shrink-0" />
                    ) : (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mr-2 self-end"
                        style={{ background: avatarColor(msg.userId), fontSize: "12px", fontWeight: 600, color: "#FFFFFF" }}
                      >
                        {initials}
                      </div>
                    )
                  )}

                  <div className="max-w-[75%]">
                    {!isMe && !groupedWithPrev && (
                      <span
                        className="flex items-center gap-1 ml-1 mb-0.5"
                        style={{ fontSize: "12.5px", color: MUTED, fontWeight: 500 }}
                        data-testid={`nickname-${msg.id}`}
                      >
                        {msg.nickname || "Anonymous"}
                        {msg.subscriptionTier === "vip" && (
                          <Crown className="w-3 h-3 shrink-0" style={{ color: TEXT }} />
                        )}
                        {genderLabel(msg.gender) && (
                          <span
                            className="font-mono uppercase tracking-[0.08em]"
                            style={{ fontSize: "9.5px", color: FAINT }}
                            data-testid={`gender-${msg.id}`}
                          >
                            · {genderLabel(msg.gender)}
                          </span>
                        )}
                      </span>
                    )}

                    <Popover
                      open={activeMessageId === msg.id && !isDeleted}
                      onOpenChange={(open) => {
                        if (!isDeleted && !msg.pending) setActiveMessageId(open ? msg.id : null);
                      }}
                    >
                      <PopoverTrigger asChild>
                        <div
                          role={isDeleted ? undefined : "button"}
                          tabIndex={isDeleted ? undefined : 0}
                          onKeyDown={(e) => {
                            if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                              e.preventDefault();
                              (e.currentTarget as HTMLElement).click();
                            }
                          }}
                          className={`px-4 py-2.5 text-sm leading-relaxed break-words ${isDeleted ? "" : "cursor-pointer"}`}
                          style={{
                            borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                            opacity: msg.pending ? 0.7 : 1,
                            ...(isDeleted
                              ? { background: ELEVATED, color: MUTED, fontStyle: "italic" }
                                : isMe
                                ? {
                                    background: "hsl(var(--vf-ember) / 0.16)",
                                    border: "1px solid hsl(var(--vf-ember) / 0.25)",
                                    color: TEXT,
                                  }
                                : {
                                    background: ELEVATED,
                                    color: TEXT,
                                  }),
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isDeleted && !msg.pending) setActiveMessageId(activeMessageId === msg.id ? null : msg.id);
                          }}
                        >
                          {repliedMsg && !isDeleted && (
                            <div
                              className="mb-1.5 p-1.5"
                              style={{
                                borderRadius: "6px",
                                borderLeft: "2px solid hsl(var(--vf-ember))",
                                background: isMe ? "hsl(var(--vf-ember) / 0.10)" : "hsl(var(--vf-ember) / 0.12)",
                                fontSize: "12px",
                              }}
                            >
                              <span className="font-medium" style={{ color: EMBER }}>
                                {repliedMsg.nickname || "Anonymous"}
                              </span>
                              <p className="truncate" style={{ color: MUTED }}>
                                {repliedMsg.content}
                              </p>
                            </div>
                          )}
                          {isDeleted ? (
                            removedLine(msg)
                          ) : msg.contentType === "image" && msg.mediaUrl ? (
                            <img src={msg.mediaUrl} alt="shared" className="rounded-lg max-w-[250px] max-h-[300px] object-cover" data-testid={`image-${msg.id}`} />
                          ) : msg.contentType === "video" && msg.mediaUrl ? (
                            <video src={msg.mediaUrl} className="rounded-lg max-w-[250px] max-h-[300px]" controls data-testid={`video-${msg.id}`} />
                          ) : msg.contentType === "poll" ? (
                            <PollBubble messageId={msg.id} groupId={groupId} />
                          ) : msg.contentType === "game" ? (
                            <GameBubble messageId={msg.id} groupId={groupId} />
                          ) : msg.contentType === "voice" ? (
                            <RoomVoiceBubble msg={msg} isMe={isMe} />
                          ) : parseDestiraLink(msg.content) ? (
                            <LinkPreviewCard content={msg.content} />
                          ) : (
                            withMentions(msg.content)
                          )}
                        </div>
                      </PopoverTrigger>
                      {!isDeleted && (
                        <PopoverContent
                          className="w-auto p-2"
                          side="bottom"
                          align={isMe ? "end" : "start"}
                          collisionPadding={12}
                          style={{ background: SURFACE2, border: `1px solid ${LINE}` }}
                        >
                          <div className="flex items-center gap-1 mb-2 flex-wrap">
                            {REACTIONS.map(({ key, Icon }) => (
                              <button aria-label={`React with ${key}`}
                                key={key}
                                onClick={() => handleReact(msg.id, key)}
                                className="w-8 h-8 rounded-full flex items-center justify-center btn-press transition-colors"
                                style={{ color: MUTED }}
                                data-testid={`reaction-${key}-${msg.id}`}
                              >
                                <Icon className="w-4 h-4" />
                              </button>
                            ))}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            {((): MessageAction[] => [
                              {
                                icon: <Reply className="w-4 h-4 mr-2" />,
                                label: "Reply",
                                onClick: () => { setReplyTo(msg); setActiveMessageId(null); },
                                testId: `action-reply-${msg.id}`,
                              },
                              {
                                icon: <Star className={`w-4 h-4 mr-2 ${msg.isStarred ? "fill-yellow-400 text-yellow-400" : ""}`} />,
                                label: msg.isStarred ? "Unstar" : "Star",
                                onClick: async () => {
                                  setActiveMessageId(null);
                                  try {
                                    if (msg.isStarred) {
                                      await unstarMessage.mutateAsync({ messageId: msg.id });
                                      toast({ title: "Message unstarred" });
                                    } else {
                                      await starMessage.mutateAsync({ messageId: msg.id });
                                      toast({ title: "Message starred" });
                                    }
                                  } catch {}
                                },
                                testId: `action-star-${msg.id}`,
                              },
                              ...(msg.contentType === "text" ? [{
                                icon: <Copy className="w-4 h-4 mr-2" />,
                                label: "Copy",
                                onClick: () => handleCopy(msg.content),
                                testId: `action-copy-${msg.id}`,
                              }] : []),
                              ...(isMe ? [{
                                icon: <CheckCheck className="w-4 h-4 mr-2" />,
                                label: "Message info",
                                onClick: () => { setMessageInfoId(msg.id); setActiveMessageId(null); },
                                testId: `action-message-info-${msg.id}`,
                              }] : []),
                              ...(isMe ? [{
                                icon: <Trash2 className="w-4 h-4 mr-2" />,
                                label: "Delete",
                                onClick: () => handleDeleteOwn(msg.id),
                                testId: `action-delete-${msg.id}`,
                                danger: true,
                              }] : []),
                              ...(!isMe ? [{
                                icon: <MessageSquarePlus className="w-4 h-4 mr-2" />,
                                label: "Request Private Chat",
                                onClick: () => {
                                  paywall.guard("group_chat_request", async () => {
                                    try {
                                      const result = await createChatRequest.mutateAsync({ targetId: msg.userId, groupId });
                                      if (result.status === "matched" || result.status === "already_matched") {
                                        const matchId = result.match?.id;
                                        if (matchId) {
                                          setLocation(`/chat/${matchId}?from=/lounge/group/${groupId}`);
                                        } else {
                                          toast({ title: "You can now chat privately!" });
                                        }
                                      } else {
                                        toast({ title: "Request sent!", description: "They'll be notified of your request." });
                                      }
                                    } catch (err) {
                                      const msg = err instanceof Error ? err.message : "Failed to send request.";
                                      toast({ title: "Error", description: msg, variant: "destructive" });
                                    }
                                  });
                                  setActiveMessageId(null);
                                },
                                testId: `action-chat-request-${msg.id}`,
                              }] : []),
                              ...(!isMe ? [{
                                icon: <Flag className="w-4 h-4 mr-2" />,
                                label: "Report",
                                onClick: () => {
                                  setReportTarget({ userId: msg.userId, messageId: msg.id });
                                  setActiveMessageId(null);
                                },
                                testId: `action-report-${msg.id}`,
                                danger: true,
                              }] : []),
                              ...(isAdmin && !isMe ? [{
                                icon: <Trash2 className="w-4 h-4 mr-2" />,
                                label: "Remove with a reason",
                                onClick: () => { setRemoveTarget(msg); setActiveMessageId(null); },
                                testId: `action-admin-delete-${msg.id}`,
                                danger: true,
                              }] : []),
                            ])().map((action) => (
                              <button
                                key={action.testId}
                                onClick={action.onClick}
                                className="flex items-center w-full px-3 py-1.5 text-sm rounded-md btn-press transition-colors text-left"
                                style={{
                                  color: action.danger ? "var(--vf-danger)" : TEXT,
                                  background: "transparent",
                                }}
                                data-testid={action.testId}
                              >
                                {action.icon}
                                {action.label}
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      )}
                    </Popover>

                    {Object.keys(groupedReactions).length > 0 && (
                      <div className={`flex items-center gap-1 mt-1 flex-wrap ${isMe ? "justify-end" : "justify-start"} px-2`}>
                        {Object.entries(groupedReactions).map(([reaction, count]) => {
                          const RIcon = REACTION_ICONS[reaction];
                          return RIcon ? (
                            <span
                              key={reaction}
                              className="text-xs gap-1 px-1.5 py-0.5 flex items-center"
                              style={{ background: ELEVATED, borderRadius: "100px", border: `1px solid ${LINE}`, color: MUTED }}
                              data-testid={`reactions-${reaction}-${msg.id}`}
                            >
                              <RIcon className="w-3 h-3" /> {count}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}

                    <p
                      className={`mt-0.5 px-2 ${isMe ? "text-right" : "text-left"}`}
                      style={{ fontSize: "10px", color: MUTED }}
                    >
                      {formatTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-16 max-w-sm mx-auto">
            <p className="mb-2" style={{ ...SERIF, color: TEXT, fontSize: "22px" }}>Nothing here yet.</p>
            <p className="text-sm" style={{ color: MUTED }}>
              Say the first thing. Your twin learns most from how you are with your own people.
            </p>
          </div>
        )}
        <OutboxBubbles kind="group" targetId={groupId} />
        <div ref={messagesEndRef} />
        <LiveRegion text={announcement} />
      </div>

      <div style={{ background: SURFACE2, borderTop: `1px solid ${LINE}` }}>
        {isMember && (
          <div className="px-4 pt-2.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: MINT }} />
            <span style={{ ...MONO, color: MINT }}>Your twin is listening in this room</span>
          </div>
        )}
        {replyTo && (
          <div className="px-4 pt-2 flex items-center gap-2">
            <div
              className="flex-1 min-w-0 p-2 text-xs"
              style={{ background: ELEVATED, borderRadius: "8px", borderLeft: `2px solid ${EMBER}` }}
            >
              <span className="font-medium" style={{ color: EMBER }}>{replyTo.nickname || "Anonymous"}</span>
              <p className="truncate" style={{ color: MUTED }}>{replyTo.content}</p>
            </div>
            <button aria-label="Cancel reply"
              className="w-7 h-7 flex items-center justify-center btn-press rounded-full"
              style={{ color: MUTED, background: "transparent" }}
              onClick={() => setReplyTo(null)}
              data-testid="button-cancel-reply"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {isMember && <MentionPicker members={roomMembers as any} meId={user?.id} input={input} onPick={setInput} />}
        {isMember && posting?.rulesAccepted && !posting.mutedUntil && <SlowModeLine seconds={slow.seconds} left={slow.left} />}
        <div className="p-3">
          {groupLoading ? (
            // Group membership hasn't loaded yet — showing the join button
            // here (isMember defaults false pre-load) would flash "Join
            // Group to Chat" at existing members for a moment on every
            // visit, so this stays neutral until the real answer is in.
            <div className="w-full flex items-center justify-center" style={{ height: "48px" }}>
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: MUTED }} />
            </div>
          ) : !isMember ? (
            <button
              className="w-full flex items-center justify-center gap-2 font-semibold btn-press"
              onClick={handleJoin}
              disabled={joinGroup.isPending}
              style={{
                background: EMBER,
                color: "hsl(var(--vf-ink))",
                height: "48px",
                borderRadius: "12px",
                border: "none",
              }}
              data-testid="button-join-group"
            >
              {joinGroup.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Users className="w-5 h-5" />}
              {group?.privacyMode === "request-to-join" ? "Request to Join" : "Join Group to Chat"}
            </button>
          ) : posting && !posting.rulesAccepted && posting.rulesText ? (
            <RoomRulesCard groupId={groupId} rules={posting.rulesText} />
          ) : posting?.mutedUntil ? (
            <PausedNotice until={posting.mutedUntil} />
          ) : voice.state !== "idle" ? (
            <RecordingBar elapsed={voice.elapsed} onCancel={voice.cancel} onSend={voice.stop} />
          ) : (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            >
              <button aria-label="Attach a photo"
                type="button"
                className="w-9 h-9 flex items-center justify-center btn-press rounded-full"
                style={{ color: MUTED, background: "transparent" }}
                onClick={() => setShowPhotoSource(true)}
                data-testid="button-attach"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button aria-label="Start a poll"
                type="button"
                className="w-9 h-9 flex items-center justify-center btn-press rounded-full"
                style={{ color: MUTED, background: "transparent" }}
                onClick={() => setShowPollDialog(true)}
                data-testid="button-poll"
              >
                <BarChart3 className="w-4 h-4" />
              </button>
              <button aria-label="Start a game"
                type="button"
                className="w-9 h-9 flex items-center justify-center btn-press rounded-full"
                style={{ color: MUTED, background: "transparent" }}
                onClick={() => setLocation(`/lounge/group/${groupId}/games`)}
                data-testid="button-game"
              >
                <Dices className="w-4 h-4" />
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 text-sm outline-none"
                style={{
                  background: ELEVATED,
                  borderRadius: "100px",
                  border: `1px solid ${LINE}`,
                  color: TEXT,
                  height: "40px",
                }}
                data-testid="input-group-message"
              />
              {!input.trim() && voice.available && mediaAllowed ? (
                <MicButton onStart={voice.start} disabled={voice.sending || slow.left > 0} />
              ) : (
              <button
                type="submit"
                disabled={!input.trim() || sendMessage.isPending || slow.left > 0}
                className="flex items-center justify-center btn-press shrink-0"
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  background: input.trim() && !slow.left ? EMBER : ELEVATED,
                  border: "none",
                  color: input.trim() && !slow.left ? "hsl(var(--vf-ink))" : MUTED,
                  transition: "all 0.2s ease",
                }}
                aria-label="Send"
                data-testid="button-send-group"
              >
                {sendMessage.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
              )}
            </form>
          )}
        </div>
      </div>

      <PhotoSourceSheet open={showPhotoSource} onClose={() => setShowPhotoSource(false)} onFile={handleImageUpload} title="Send a photo" />
      <PollComposerDialog groupId={groupId} open={showPollDialog} onClose={() => setShowPollDialog(false)} />
      <MessageInfoDialog groupId={groupId} messageId={messageInfoId} onClose={() => setMessageInfoId(null)} />
      <RemoveMessageSheet groupId={groupId} message={removeTarget} onClose={() => setRemoveTarget(null)} />
      {paywall.sheet}

      <Dialog open={!!reportTarget} onOpenChange={(v) => { if (!v) { setReportTarget(null); setReportReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this message</DialogTitle>
            <DialogDescription>This sends a record to our team for review, citing this exact message.</DialogDescription>
          </DialogHeader>
          <textarea
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            placeholder="What's going on? (optional)"
            rows={3}
            className="w-full rounded-[12px] border p-3 text-sm outline-none resize-none"
            style={{ background: ELEVATED, borderColor: LINE, color: TEXT }}
            data-testid="input-group-report-reason"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setReportTarget(null); setReportReason(""); }} data-testid="button-cancel-group-report">
              Cancel
            </Button>
            <Button onClick={submitReport} disabled={reportBusy} data-testid="button-submit-group-report">
              {reportBusy ? "Sending…" : "Send report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
