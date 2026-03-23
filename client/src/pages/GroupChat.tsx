import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft, Send, Info, Loader2, Paperclip, BarChart3,
  Heart, ThumbsUp, ThumbsDown, Laugh, Flame, Star,
  Reply, Copy, Trash2, X, Plus, Users, Image as ImageIcon,
  MessageSquarePlus, Crown
} from "lucide-react";
import {
  useGroup, useEnrichedGroupMessages, useSendGroupMessage,
  useCreatePoll, usePollByMessage, useVotePoll,
  useAddReaction, useRemoveReaction, useDeleteOwnMessage,
  useDeleteGroupMessage, useJoinGroup, useLeaveGroup,
  useStarMessage, useUnstarMessage, useCreateChatRequest
} from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

interface MessageAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  testId: string;
  danger?: boolean;
}

const REACTION_ICONS: Record<string, any> = {
  heart: Heart,
  thumbsup: ThumbsUp,
  thumbsdown: ThumbsDown,
  laugh: Laugh,
  flame: Flame,
  star: Star,
};

const REACTIONS = [
  { key: "heart", Icon: Heart },
  { key: "thumbsup", Icon: ThumbsUp },
  { key: "thumbsdown", Icon: ThumbsDown },
  { key: "laugh", Icon: Laugh },
  { key: "flame", Icon: Flame },
  { key: "star", Icon: Star },
];

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateSeparator(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = today.getTime() - msgDate.getTime();
  if (diff === 0) return "Today";
  if (diff === 86400000) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function isSameDay(a: string, b: string) {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function PollBubble({ messageId, groupId }: { messageId: number; groupId: number }) {
  const { data: pollData, isLoading } = usePollByMessage(messageId);
  const votePoll = useVotePoll(groupId);
  const { user } = useAuth();

  if (isLoading) return <Loader2 className="w-4 h-4 animate-spin" />;
  if (!pollData || !pollData.poll) return null;

  const { poll, options, votes } = pollData;
  const totalVotes = votes?.length || 0;
  const userVotes = votes?.filter((v: any) => v.userId === user?.id).map((v: any) => v.optionId) || [];

  const handleVote = async (optionId: number) => {
    try {
      await votePoll.mutateAsync({ pollId: poll.id, optionId, messageId });
    } catch {}
  };

  return (
    <div className="space-y-2 min-w-[200px]" data-testid={`poll-bubble-${messageId}`}>
      <p className="font-medium text-sm text-white">{poll.question}</p>
      {poll.allowMultiple && <p className="text-xs" style={{ color: "#9090A8" }}>Multiple answers allowed</p>}
      <div className="space-y-1.5">
        {options?.map((opt: any) => {
          const optVotes = votes?.filter((v: any) => v.optionId === opt.id).length || 0;
          const pct = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
          const isVoted = userVotes.includes(opt.id);
          return (
            <button
              key={opt.id}
              onClick={() => handleVote(opt.id)}
              disabled={votePoll.isPending}
              className="w-full text-left p-2 text-xs relative overflow-hidden transition-colors"
              style={{
                borderRadius: "8px",
                border: isVoted ? "1px solid rgba(124,58,237,0.6)" : "1px solid #2E2E42",
                background: isVoted ? "rgba(124,58,237,0.12)" : "#1A1A24",
              }}
              data-testid={`poll-option-${opt.id}`}
            >
              <div
                className="absolute inset-0 rounded-md"
                style={{ width: `${pct}%`, background: "rgba(124,58,237,0.1)" }}
              />
              <div className="relative flex items-center justify-between gap-2">
                <span className={isVoted ? "font-medium text-white" : "text-white/80"}>{opt.text}</span>
                <span style={{ color: "#9090A8" }}>{optVotes} ({pct}%)</span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-xs" style={{ color: "#9090A8" }}>{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</p>
    </div>
  );
}

function PollComposerDialog({ groupId, open, onClose }: { groupId: number; open: boolean; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const createPoll = useCreatePoll(groupId);
  const { toast } = useToast();

  const addOption = () => {
    if (options.length < 12) setOptions([...options, ""]);
  };

  const updateOption = (idx: number, val: string) => {
    const updated = [...options];
    updated[idx] = val;
    setOptions(updated);
  };

  const removeOption = (idx: number) => {
    if (options.length > 2) setOptions(options.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    const validOptions = options.filter((o) => o.trim());
    if (!question.trim() || validOptions.length < 2) return;
    try {
      await createPoll.mutateAsync({ question, options: validOptions, allowMultiple });
      toast({ title: "Poll created" });
      setQuestion("");
      setOptions(["", ""]);
      setAllowMultiple(false);
      onClose();
    } catch {
      toast({ title: "Error", description: "Failed to create poll.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a Poll</DialogTitle>
          <DialogDescription>Ask a question and add options for the group to vote on.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block text-white">Question</label>
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What do you want to ask?"
              data-testid="input-poll-question"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium mb-1 block text-white">Options</label>
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={opt}
                  onChange={(e) => updateOption(idx, e.target.value)}
                  placeholder={`Option ${idx + 1}`}
                  data-testid={`input-poll-option-${idx}`}
                />
                {options.length > 2 && (
                  <Button variant="ghost" size="icon" onClick={() => removeOption(idx)} data-testid={`button-remove-option-${idx}`}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
            {options.length < 12 && (
              <Button variant="outline" size="sm" onClick={addOption} data-testid="button-add-poll-option">
                <Plus className="w-4 h-4 mr-1" /> Add Option
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="text-sm font-medium text-white">Allow multiple answers</label>
            <Switch checked={allowMultiple} onCheckedChange={setAllowMultiple} data-testid="switch-allow-multiple" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!question.trim() || options.filter((o) => o.trim()).length < 2 || createPoll.isPending}
            className="btn-press"
            style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)", border: "none", color: "#fff" }}
            data-testid="button-submit-poll"
          >
            {createPoll.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Create Poll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
  const sendMessage = useSendGroupMessage(groupId);
  const deleteOwnMsg = useDeleteOwnMessage(groupId);
  const deleteGroupMsg = useDeleteGroupMessage(groupId);
  const addReaction = useAddReaction(groupId);
  const removeReaction = useRemoveReaction(groupId);
  const joinGroup = useJoinGroup();
  const starMessage = useStarMessage(groupId);
  const unstarMessage = useUnstarMessage(groupId);
  const createChatRequest = useCreateChatRequest();

  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<any>(null);
  const [activeMessageId, setActiveMessageId] = useState<number | null>(null);
  const [showPollDialog, setShowPollDialog] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState<number | null>(highlightMsgId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isMember = group?.isMember || hasJoined;
  const isAdmin = group?.myRole === "owner" || group?.myRole === "admin";

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

  const messagesMap = useMemo(() => {
    const map: Record<number, any> = {};
    messages?.forEach((m: any) => { map[m.id] = m; });
    return map;
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const text = input;
    setInput("");
    const payload: any = { content: text, contentType: "text" };
    if (replyTo) {
      payload.replyToMessageId = replyTo.id;
      setReplyTo(null);
    }
    try {
      await sendMessage.mutateAsync(payload);
    } catch {
      toast({ title: "Error", description: "Must join group first.", variant: "destructive" });
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
    } catch (e: any) {
      if (e.message?.includes("Already")) {
        setHasJoined(true);
      } else {
        toast({ title: "Error", description: e.message || "Failed to join.", variant: "destructive" });
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleReact = async (messageId: number, reaction: string) => {
    try {
      await addReaction.mutateAsync({ messageId, reaction });
    } catch {}
    setActiveMessageId(null);
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

  const handleAdminDelete = async (messageId: number) => {
    try {
      await deleteGroupMsg.mutateAsync(messageId);
      toast({ title: "Message deleted by admin" });
    } catch {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    }
    setActiveMessageId(null);
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
    <div className="h-screen flex flex-col" style={{ background: "#0F0F14" }}>
      <div
        className="px-4 py-3 flex items-center gap-3 sticky top-0 z-50"
        style={{
          background: "#1A1A24",
          borderBottom: "1px solid #2E2E42",
        }}
      >
        <button
          onClick={() => setLocation("/lounge")}
          className="w-9 h-9 flex items-center justify-center btn-press rounded-full transition-colors"
          style={{ color: "#FFFFFF", background: "transparent" }}
          data-testid="button-back-lounge"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-white truncate" style={{ fontSize: "15px" }} data-testid="text-group-name">
            {group?.name || "Group"}
          </h2>
          <p style={{ fontSize: "12px", color: "#9090A8" }}>
            {group?.memberCount || 0} members
          </p>
        </div>
        <button
          onClick={() => setLocation(`/lounge/group/${groupId}/info`)}
          className="w-9 h-9 flex items-center justify-center btn-press rounded-full transition-colors"
          style={{ color: "#FFFFFF", background: "transparent" }}
          data-testid="button-group-info"
        >
          <Info className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1" onClick={() => setActiveMessageId(null)}>
        {msgsLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#7C3AED" }} />
          </div>
        ) : messages && messages.length > 0 ? (
          messages.map((msg: any, idx: number) => {
            const isMe = msg.userId === user?.id;
            const showDate = idx === 0 || !isSameDay(messages[idx - 1].createdAt, msg.createdAt);
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
                        color: "#9090A8",
                        background: "#1A1A24",
                        borderRadius: "100px",
                        padding: "2px 12px",
                        border: "1px solid #2E2E42",
                      }}
                      data-testid={`date-separator-${idx}`}
                    >
                      {formatDateSeparator(msg.createdAt)}
                    </span>
                  </div>
                )}

                <div
                  id={`msg-${msg.id}`}
                  className={`flex ${isMe ? "justify-end" : "justify-start"} mb-2 transition-all duration-500`}
                  style={highlightedMsgId === msg.id ? { background: "rgba(124,58,237,0.12)", borderRadius: "12px", marginLeft: "-8px", marginRight: "-8px", paddingLeft: "8px", paddingRight: "8px" } : undefined}
                  data-testid={`message-${msg.id}`}
                >
                  {!isMe && (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mr-2 self-end"
                      style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)", fontSize: "12px", fontWeight: 700, color: "#fff" }}
                    >
                      {initials}
                    </div>
                  )}

                  <div className="max-w-[75%]">
                    {!isMe && (
                      <span
                        className="flex items-center gap-1 ml-1 mb-0.5"
                        style={{ fontSize: "11px", color: "#9090A8", fontWeight: 600 }}
                        data-testid={`nickname-${msg.id}`}
                      >
                        {msg.nickname || "Anonymous"}
                        {msg.subscriptionTier === "vip" && (
                          <Crown className="w-3 h-3 shrink-0" style={{ color: "#F59E0B" }} />
                        )}
                      </span>
                    )}

                    <Popover open={activeMessageId === msg.id} onOpenChange={(open) => setActiveMessageId(open ? msg.id : null)}>
                      <PopoverTrigger asChild>
                        <div
                          className="px-4 py-2.5 text-sm leading-relaxed cursor-pointer"
                          style={{
                            borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                            ...(isDeleted
                              ? { background: "#242433", color: "#9090A8", fontStyle: "italic" }
                              : isMe
                                ? {
                                    background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                                    color: "#FFFFFF",
                                    boxShadow: "0 2px 12px rgba(124,58,237,0.3)",
                                  }
                                : {
                                    background: "#1A1A24",
                                    color: "#FFFFFF",
                                    border: "1px solid #2E2E42",
                                  }),
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isDeleted) setActiveMessageId(activeMessageId === msg.id ? null : msg.id);
                          }}
                        >
                          {repliedMsg && !isDeleted && (
                            <div
                              className="mb-1.5 p-1.5"
                              style={{
                                borderRadius: "6px",
                                borderLeft: isMe ? "2px solid rgba(255,255,255,0.4)" : "2px solid #7C3AED",
                                background: isMe ? "rgba(255,255,255,0.1)" : "rgba(124,58,237,0.12)",
                                fontSize: "12px",
                              }}
                            >
                              <span className="font-medium" style={{ color: isMe ? "rgba(255,255,255,0.9)" : "#A78BFA" }}>
                                {repliedMsg.nickname || "Anonymous"}
                              </span>
                              <p className="truncate" style={{ color: isMe ? "rgba(255,255,255,0.7)" : "#9090A8" }}>
                                {repliedMsg.content}
                              </p>
                            </div>
                          )}
                          {isDeleted ? (
                            "[Message deleted]"
                          ) : msg.contentType === "image" && msg.mediaUrl ? (
                            <img src={msg.mediaUrl} alt="shared" className="rounded-lg max-w-[250px] max-h-[300px] object-cover" data-testid={`image-${msg.id}`} />
                          ) : msg.contentType === "video" && msg.mediaUrl ? (
                            <video src={msg.mediaUrl} className="rounded-lg max-w-[250px] max-h-[300px]" controls data-testid={`video-${msg.id}`} />
                          ) : msg.contentType === "poll" ? (
                            <PollBubble messageId={msg.id} groupId={groupId} />
                          ) : (
                            msg.content
                          )}
                        </div>
                      </PopoverTrigger>
                      {!isDeleted && (
                        <PopoverContent
                          className="w-auto p-2"
                          side={isMe ? "left" : "right"}
                          align="start"
                          style={{ background: "#1A1A24", border: "1px solid #2E2E42" }}
                        >
                          <div className="flex items-center gap-1 mb-2 flex-wrap">
                            {REACTIONS.map(({ key, Icon }) => (
                              <button
                                key={key}
                                onClick={() => handleReact(msg.id, key)}
                                className="w-8 h-8 rounded-full flex items-center justify-center btn-press transition-colors"
                                style={{ color: "#9090A8" }}
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
                                  try {
                                    if (msg.isStarred) {
                                      await unstarMessage.mutateAsync({ messageId: msg.id });
                                      toast({ title: "Message unstarred" });
                                    } else {
                                      await starMessage.mutateAsync({ messageId: msg.id });
                                      toast({ title: "Message starred" });
                                    }
                                  } catch {}
                                  setActiveMessageId(null);
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
                                icon: <Trash2 className="w-4 h-4 mr-2" />,
                                label: "Delete",
                                onClick: () => handleDeleteOwn(msg.id),
                                testId: `action-delete-${msg.id}`,
                                danger: true,
                              }] : []),
                              ...(!isMe ? [{
                                icon: <MessageSquarePlus className="w-4 h-4 mr-2" />,
                                label: "Request Private Chat",
                                onClick: async () => {
                                  try {
                                    const result = await createChatRequest.mutateAsync({ targetId: msg.userId, groupId });
                                    if (result.status === "matched" || result.status === "already_matched") {
                                      toast({ title: "You can now chat privately!" });
                                    } else {
                                      toast({ title: "Request sent!", description: "They'll be notified of your request." });
                                    }
                                  } catch (e: any) {
                                    toast({ title: "Error", description: e.message || "Failed to send request.", variant: "destructive" });
                                  }
                                  setActiveMessageId(null);
                                },
                                testId: `action-chat-request-${msg.id}`,
                              }] : []),
                              ...(isAdmin && !isMe ? [{
                                icon: <Trash2 className="w-4 h-4 mr-2" />,
                                label: "Admin Delete",
                                onClick: () => handleAdminDelete(msg.id),
                                testId: `action-admin-delete-${msg.id}`,
                                danger: true,
                              }] : []),
                            ])().map((action) => (
                              <button
                                key={action.testId}
                                onClick={action.onClick}
                                className="flex items-center w-full px-3 py-1.5 text-sm rounded-md btn-press transition-colors text-left"
                                style={{
                                  color: action.danger ? "#EF4444" : "#FFFFFF",
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
                              style={{ background: "#242433", borderRadius: "100px", border: "1px solid #2E2E42", color: "#9090A8" }}
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
                      style={{ fontSize: "10px", color: "#9090A8" }}
                    >
                      {formatTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-12">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" style={{ color: "#9090A8" }} />
            <p className="font-medium mb-1 text-white">Welcome to {group?.name}!</p>
            <p className="text-sm" style={{ color: "#9090A8" }}>Be the first to start the conversation.</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ background: "#1A1A24", borderTop: "1px solid #2E2E42" }}>
        {replyTo && (
          <div className="px-4 pt-2 flex items-center gap-2">
            <div
              className="flex-1 min-w-0 p-2 text-xs"
              style={{ background: "#242433", borderRadius: "8px", borderLeft: "2px solid #7C3AED" }}
            >
              <span className="font-medium" style={{ color: "#A78BFA" }}>{replyTo.nickname || "Anonymous"}</span>
              <p className="truncate" style={{ color: "#9090A8" }}>{replyTo.content}</p>
            </div>
            <button
              className="w-7 h-7 flex items-center justify-center btn-press rounded-full"
              style={{ color: "#9090A8", background: "transparent" }}
              onClick={() => setReplyTo(null)}
              data-testid="button-cancel-reply"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="p-3">
          {!isMember ? (
            <button
              className="w-full flex items-center justify-center gap-2 font-semibold btn-press"
              onClick={handleJoin}
              disabled={joinGroup.isPending}
              style={{
                background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                color: "#FFFFFF",
                height: "48px",
                borderRadius: "14px",
                border: "none",
                boxShadow: "0 4px 20px rgba(124,58,237,0.4)",
              }}
              data-testid="button-join-group"
            >
              {joinGroup.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Users className="w-5 h-5" />}
              {group?.privacyMode === "request-to-join" ? "Request to Join" : "Join Group to Chat"}
            </button>
          ) : (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            >
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
                data-testid="input-file-upload"
              />
              <button
                type="button"
                className="w-9 h-9 flex items-center justify-center btn-press rounded-full"
                style={{ color: "#9090A8", background: "transparent" }}
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-attach"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                type="button"
                className="w-9 h-9 flex items-center justify-center btn-press rounded-full"
                style={{ color: "#9090A8", background: "transparent" }}
                onClick={() => setShowPollDialog(true)}
                data-testid="button-poll"
              >
                <BarChart3 className="w-4 h-4" />
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 text-sm outline-none"
                style={{
                  background: "#242433",
                  borderRadius: "100px",
                  border: "1px solid #2E2E42",
                  color: "#FFFFFF",
                  height: "40px",
                }}
                data-testid="input-group-message"
              />
              <button
                type="submit"
                disabled={!input.trim() || sendMessage.isPending}
                className="flex items-center justify-center btn-press shrink-0"
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  background: input.trim() ? "linear-gradient(135deg, #7C3AED, #EC4899)" : "#242433",
                  border: "none",
                  color: "#FFFFFF",
                  boxShadow: input.trim() ? "0 2px 12px rgba(124,58,237,0.4)" : "none",
                  transition: "all 0.2s ease",
                }}
                data-testid="button-send-group"
              >
                {sendMessage.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </form>
          )}
        </div>
      </div>

      <PollComposerDialog groupId={groupId} open={showPollDialog} onClose={() => setShowPollDialog(false)} />
    </div>
  );
}
