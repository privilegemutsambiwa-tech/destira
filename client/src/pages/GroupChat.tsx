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
  Reply, Copy, Trash2, X, Plus, Users, Image as ImageIcon
} from "lucide-react";
import {
  useGroup, useEnrichedGroupMessages, useSendGroupMessage,
  useCreatePoll, usePollByMessage, useVotePoll,
  useAddReaction, useRemoveReaction, useDeleteOwnMessage,
  useDeleteGroupMessage, useJoinGroup, useLeaveGroup
} from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

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
      <p className="font-medium text-sm">{poll.question}</p>
      {poll.allowMultiple && <p className="text-xs opacity-70">Multiple answers allowed</p>}
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
              className={`w-full text-left rounded-md p-2 text-xs relative overflow-hidden border transition-colors ${
                isVoted ? "border-primary bg-primary/10" : "border-border hover-elevate"
              }`}
              data-testid={`poll-option-${opt.id}`}
            >
              <div
                className="absolute inset-0 bg-primary/10 rounded-md"
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex items-center justify-between gap-2">
                <span className={isVoted ? "font-medium" : ""}>{opt.text}</span>
                <span className="text-muted-foreground shrink-0">{optVotes} ({pct}%)</span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</p>
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
            <label className="text-sm font-medium mb-1 block">Question</label>
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What do you want to ask?"
              data-testid="input-poll-question"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium mb-1 block">Options</label>
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
            <label className="text-sm font-medium">Allow multiple answers</label>
            <Switch checked={allowMultiple} onCheckedChange={setAllowMultiple} data-testid="switch-allow-multiple" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!question.trim() || options.filter((o) => o.trim()).length < 2 || createPoll.isPending}
            className="btn-press"
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

  const { data: group, isLoading: groupLoading } = useGroup(groupId);
  const { data: messages, isLoading: msgsLoading } = useEnrichedGroupMessages(groupId);
  const sendMessage = useSendGroupMessage(groupId);
  const deleteOwnMsg = useDeleteOwnMessage(groupId);
  const deleteGroupMsg = useDeleteGroupMessage(groupId);
  const addReaction = useAddReaction(groupId);
  const removeReaction = useRemoveReaction(groupId);
  const joinGroup = useJoinGroup();

  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<any>(null);
  const [activeMessageId, setActiveMessageId] = useState<number | null>(null);
  const [showPollDialog, setShowPollDialog] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isMember = group?.isMember || hasJoined;
  const isAdmin = group?.myRole === "owner" || group?.myRole === "admin";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    <div className="h-screen flex flex-col bg-background">
      <div className="border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-50 bg-background">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/lounge")} data-testid="button-back-lounge" className="btn-press">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-sm truncate" data-testid="text-group-name">{group?.name || "Group"}</h2>
          <p className="text-xs text-muted-foreground">{group?.memberCount || 0} members</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setLocation(`/lounge/group/${groupId}/info`)} data-testid="button-group-info" className="btn-press">
          <Info className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1" onClick={() => setActiveMessageId(null)}>
        {msgsLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
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

            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="flex justify-center my-3">
                    <Badge variant="secondary" className="text-xs" data-testid={`date-separator-${idx}`}>
                      {formatDateSeparator(msg.createdAt)}
                    </Badge>
                  </div>
                )}
                <div className={`flex ${isMe ? "justify-end" : "justify-start"} mb-1`} data-testid={`message-${msg.id}`}>
                  <div className="max-w-[80%]">
                    {!isMe && (
                      <span className="text-xs text-primary font-medium ml-3 mb-0.5 block" data-testid={`nickname-${msg.id}`}>
                        {msg.nickname || "Anonymous"}
                      </span>
                    )}
                    <Popover open={activeMessageId === msg.id} onOpenChange={(open) => setActiveMessageId(open ? msg.id : null)}>
                      <PopoverTrigger asChild>
                        <div
                          className={`rounded-md px-4 py-2.5 text-sm leading-relaxed cursor-pointer ${
                            isDeleted
                              ? "bg-muted text-muted-foreground italic"
                              : isMe
                                ? "bg-primary text-primary-foreground"
                                : "bg-card border text-card-foreground"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isDeleted) setActiveMessageId(activeMessageId === msg.id ? null : msg.id);
                          }}
                        >
                          {repliedMsg && !isDeleted && (
                            <div className={`text-xs mb-1.5 p-1.5 rounded-md border-l-2 ${
                              isMe ? "bg-primary-foreground/10 border-primary-foreground/40" : "bg-muted border-primary"
                            }`}>
                              <span className="font-medium">{repliedMsg.nickname || "Anonymous"}</span>
                              <p className="truncate opacity-80">{repliedMsg.content}</p>
                            </div>
                          )}
                          {isDeleted ? (
                            "[Message deleted]"
                          ) : msg.contentType === "image" && msg.mediaUrl ? (
                            <img src={msg.mediaUrl} alt="shared" className="rounded-md max-w-[250px] max-h-[300px] object-cover" data-testid={`image-${msg.id}`} />
                          ) : msg.contentType === "video" && msg.mediaUrl ? (
                            <video src={msg.mediaUrl} className="rounded-md max-w-[250px] max-h-[300px]" controls data-testid={`video-${msg.id}`} />
                          ) : msg.contentType === "poll" ? (
                            <PollBubble messageId={msg.id} groupId={groupId} />
                          ) : (
                            msg.content
                          )}
                        </div>
                      </PopoverTrigger>
                      {!isDeleted && (
                        <PopoverContent className="w-auto p-2" side={isMe ? "left" : "right"} align="start">
                          <div className="flex items-center gap-1 mb-2 flex-wrap">
                            {REACTIONS.map(({ key, Icon }) => (
                              <Button
                                key={key}
                                variant="ghost"
                                size="icon"
                                onClick={() => handleReact(msg.id, key)}
                                data-testid={`reaction-${key}-${msg.id}`}
                                className="btn-press"
                              >
                                <Icon className="w-4 h-4" />
                              </Button>
                            ))}
                          </div>
                          <div className="flex flex-col gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="justify-start btn-press"
                              onClick={() => { setReplyTo(msg); setActiveMessageId(null); }}
                              data-testid={`action-reply-${msg.id}`}
                            >
                              <Reply className="w-4 h-4 mr-2" /> Reply
                            </Button>
                            {msg.contentType === "text" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="justify-start btn-press"
                                onClick={() => handleCopy(msg.content)}
                                data-testid={`action-copy-${msg.id}`}
                              >
                                <Copy className="w-4 h-4 mr-2" /> Copy
                              </Button>
                            )}
                            {isMe && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="justify-start text-destructive btn-press"
                                onClick={() => handleDeleteOwn(msg.id)}
                                data-testid={`action-delete-${msg.id}`}
                              >
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                              </Button>
                            )}
                            {isAdmin && !isMe && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="justify-start text-destructive btn-press"
                                onClick={() => handleAdminDelete(msg.id)}
                                data-testid={`action-admin-delete-${msg.id}`}
                              >
                                <Trash2 className="w-4 h-4 mr-2" /> Admin Delete
                              </Button>
                            )}
                          </div>
                        </PopoverContent>
                      )}
                    </Popover>

                    {Object.keys(groupedReactions).length > 0 && (
                      <div className={`flex items-center gap-1 mt-1 flex-wrap ${isMe ? "justify-end" : "justify-start"} px-2`}>
                        {Object.entries(groupedReactions).map(([reaction, count]) => {
                          const RIcon = REACTION_ICONS[reaction];
                          return RIcon ? (
                            <Badge key={reaction} variant="secondary" className="text-xs gap-1 px-1.5" data-testid={`reactions-${reaction}-${msg.id}`}>
                              <RIcon className="w-3 h-3" /> {count}
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    )}

                    <p className={`text-[10px] text-muted-foreground mt-0.5 px-2 ${isMe ? "text-right" : "text-left"}`}>
                      {formatTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium mb-1">Welcome to {group?.name}!</p>
            <p className="text-sm">Be the first to start the conversation.</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t bg-background">
        {replyTo && (
          <div className="px-4 pt-2 flex items-center gap-2">
            <div className="flex-1 min-w-0 bg-muted rounded-md p-2 text-xs">
              <span className="font-medium text-primary">{replyTo.nickname || "Anonymous"}</span>
              <p className="truncate text-muted-foreground">{replyTo.content}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setReplyTo(null)} data-testid="button-cancel-reply" className="btn-press">
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
        <div className="p-3">
          {!isMember ? (
            <Button className="w-full btn-press" onClick={handleJoin} disabled={joinGroup.isPending} data-testid="button-join-group">
              <Users className="w-5 h-5 mr-2" />
              {group?.privacyMode === "request-to-join" ? "Request to Join" : "Join Group to Chat"}
            </Button>
          ) : (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            >
              <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageUpload} data-testid="input-file-upload" />
              <Button type="button" variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} data-testid="button-attach" className="btn-press shrink-0">
                <Paperclip className="w-4 h-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => setShowPollDialog(true)} data-testid="button-poll" className="btn-press shrink-0">
                <BarChart3 className="w-4 h-4" />
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1"
                data-testid="input-group-message"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || sendMessage.isPending}
                className="btn-press shrink-0"
                data-testid="button-send-group"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          )}
        </div>
      </div>

      <PollComposerDialog groupId={groupId} open={showPollDialog} onClose={() => setShowPollDialog(false)} />
    </div>
  );
}