import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDirectMessages, useSendDirectMessage, useMatches, useMarkThreadRead, useUnmatch } from "@/hooks/use-interactions";
import { useSuggestedLounges } from "@/hooks/use-profiles";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, X, Users, Flag, MoreHorizontal, ArrowUp, UserRound, Ban, HeartOff } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useKeyboardScroll } from "@/hooks/use-keyboard-scroll";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { parseDestiraLink } from "@/lib/link-preview";
import { LinkPreviewCard } from "@/components/link-preview-card";
import { SafetyTip } from "@/components/safety-tip";
import { RISK_LABEL } from "@shared/safety";
import { enqueue, enqueueReaction, isConnectionError, newClientId, useOutbox } from "@/lib/outbox";
import { DmSpecialBody, MessageActions, ReactionChips, TypingBubble, useTyping } from "@/components/dm-message";
import { MicButton, PhotoButton, RecordingBar, useVoiceNote } from "@/components/dm-composer-extras";
import { CalendarHeart, Pencil as PencilIcon, X as XIcon } from "lucide-react";
import { DateCard, DateCheckin, LetsMeetSheet } from "@/components/date-plan";
import type { DmMessageView } from "@shared/dm";
import { OutboxBubbles } from "@/components/outbox-bubbles";
import { IconButton, TwinGlyph, VfAvatar, VfButton, VfSheet } from "@/components/ui-vf";
import { ease } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { LiveRegion, spokenMessage, useNewMessageAnnouncement } from "@/lib/a11y";

// A lower-pressure first step than a cold 1:1 thread: if this pair already
// shares Lounges, point at them; otherwise suggest ones the other person is
// in that overlap the viewer's interests, or a curated one as a last
// resort. Dismissible for this one conversation only (local state).
function SharedLoungeStrip({ otherUserId, otherName }: { otherUserId?: string; otherName: string }) {
  const [, setLocation] = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const { lounges } = useSuggestedLounges(otherUserId);

  if (dismissed || !otherUserId || lounges.length === 0) return null;

  const top = lounges[0];
  const intro =
    top.reason === "mutual" ? (
      lounges.length > 1 ? (
        <>You're both in a few Lounges. Say hi there too.</>
      ) : (
        <>You're both in <span className="text-vf-text">{top.name}</span>. Say hi there too.</>
      )
    ) : top.reason === "their-interest" ? (
      lounges.length > 1 ? (
        <>{otherName} is in a few Lounges that look like your kind of thing.</>
      ) : (
        <>{otherName} is in <span className="text-vf-text">{top.name}</span>. Looks like your kind of thing.</>
      )
    ) : (
      <><span className="text-vf-text">{top.name}</span> could be a good place to meet {otherName} in a group first.</>
    );

  return (
    <div
      className="mx-4 mt-3 rounded-[16px] border border-vf-line bg-vf-surface px-4 py-3 flex items-start justify-between gap-3"
      data-testid="strip-shared-lounge"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <Users className="w-4 h-4 text-vf-faint shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="vf-small text-vf-muted">{intro}</p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {lounges.map((l) => (
              <button
                key={l.id}
                onClick={() => setLocation(`/lounge/group/${l.id}`)}
                className="text-[13px] px-2.5 py-1 rounded-full border border-vf-line text-vf-text hover:border-vf-text/25 transition-colors"
                data-testid={`link-shared-lounge-${l.id}`}
              >
                {l.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-vf-faint hover:text-vf-text transition-colors shrink-0 -mr-1 -mt-0.5 w-8 h-8 flex items-center justify-center"
        aria-label="Dismiss"
        data-testid="button-dismiss-shared-lounge"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** "Today", "Yesterday", "Thursday", or "12 November". */
function dayLabel(d: Date): string {
  const now = new Date();
  if (sameDay(d, now)) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "Yesterday";
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days < 6) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}
/** A message's time, never in the future (a skewed clock would otherwise
 *  label today's messages as "Saturday"). */
function when(msg: { createdAt?: string | null }): Date {
  const t = msg.createdAt ? new Date(msg.createdAt).getTime() : Date.now();
  return new Date(Math.min(Number.isFinite(t) ? t : Date.now(), Date.now()));
}
const timeLabel = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });

const FIRST_REPLY_KEY = "destira.first-reply.seen";
function firstReplySeen(matchId: number): boolean {
  try {
    return (JSON.parse(localStorage.getItem(FIRST_REPLY_KEY) || "[]") as number[]).includes(matchId);
  } catch {
    return true;
  }
}
function markFirstReplySeen(matchId: number) {
  try {
    const seen = JSON.parse(localStorage.getItem(FIRST_REPLY_KEY) || "[]") as number[];
    if (!seen.includes(matchId)) localStorage.setItem(FIRST_REPLY_KEY, JSON.stringify([...seen, matchId].slice(-200)));
  } catch {}
}

/** Drafts from the member's twin (POST /api/chat/:matchId/suggest). Never
 *  sent on their own: a tap drops one into the composer to edit. */
function useSuggestions(matchId: number) {
  const [state, setState] = useState<{ loading: boolean; options: string[] | null; error: string | null }>({ loading: false, options: null, error: null });
  const ask = useCallback(async () => {
    setState({ loading: true, options: null, error: null });
    try {
      const res = await apiRequest("POST", `/api/chat/${matchId}/suggest`, {});
      const body = await res.json();
      const options: string[] = Array.isArray(body?.options) ? body.options : [];
      setState({ loading: false, options, error: options.length ? null : "Nothing came to mind. Try again in a moment." });
    } catch (e: any) {
      const msg = String(e?.message || "").replace(/^\d+:\s*/, "");
      setState({ loading: false, options: null, error: msg || "Couldn't think of anything just now." });
    }
  }, [matchId]);
  const clear = useCallback(() => setState({ loading: false, options: null, error: null }), []);
  return { ...state, ask, clear };
}

export default function DirectChat({ params }: { params: { matchId: string } }) {
  const matchId = Number(params.matchId);
  const [input, setInput] = useState("");
  const { data: messages, isLoading } = useDirectMessages(matchId);
  const sendMessage = useSendDirectMessage(matchId);
  const { data: matches, refetch: refetchMatches } = useMatches();
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const markThreadRead = useMarkThreadRead();
  const unmatch = useUnmatch();
  const { toast } = useToast();
  const reduce = useReducedMotion();
  const suggestions = useSuggestions(matchId);
  const [shownTimeId, setShownTimeId] = useState<number | null>(null);
  const [reportTarget, setReportTarget] = useState<{ userId: string; messageId?: number } | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [confirm, setConfirm] = useState<"block" | "unmatch" | null>(null);
  // Editing one of my messages: the composer holds its text until saved.
  const [editing, setEditing] = useState<DmMessageView | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const voice = useVoiceNote(matchId);
  const queued = useOutbox("direct", matchId);
  const [planning, setPlanning] = useState(false);

  const submitReport = async () => {
    if (!reportTarget) return;
    setReportBusy(true);
    try {
      await apiRequest("POST", `/api/users/${reportTarget.userId}/report`, {
        reason: reportReason.trim(),
        evidence: reportTarget.messageId != null ? [{ type: "direct_message", id: reportTarget.messageId }] : undefined,
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

  // Opening the thread is what counts as "read".
  useEffect(() => {
    markThreadRead.mutate(matchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // Each linker passes its own route as ?from so back returns there.
  const backRoute = useMemo(() => {
    const from = new URLSearchParams(window.location.search).get("from");
    return from && from.startsWith("/") ? from : "/chats";
  }, []);

  // The chat list's preview is a separate query: refresh it on the way out.
  useEffect(() => {
    return () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/threads"] });
    };
  }, [queryClient]);

  const match = matches?.find((m: any) => m.id === matchId);
  const other = match?.otherProfile;
  const otherName: string = other?.displayName || "Match";
  const otherFirst = otherName.trim().split(/\s+/)[0] || otherName;
  const otherPhoto: string | null = other?.coverPhotoUrl || null;
  const otherMeta = [other?.age ? String(other.age) : null, other?.locationName || other?.location || null].filter(Boolean).join(" · ");
  // When the other person last opened this thread: drives "Seen".
  const otherLastReadAt: Date | null = match
    ? (() => {
        const v = match.user1Id === user?.id ? match.user2LastReadAt : match.user1LastReadAt;
        return v ? new Date(v) : null;
      })()
    : null;

  const list: any[] = Array.isArray(messages) ? messages : [];
  // Screen readers hear their new messages as they arrive (K6).
  const announcement = useNewMessageAnnouncement(list, {
    key: (m) => m.id,
    mine: (m) => m.senderId === user?.id,
    say: (m) => `${otherName}: ${spokenMessage(m)}`,
  });
  const typing = useTyping(matchId, input, !!match && !editing);
  // A reaction still in the outbox shows on its message straight away.
  const reactionsFor = (msg: DmMessageView) => {
    const waiting = queued.find((q) => q.op === "react" && q.messageId === msg.id);
    const base = (msg.reactions ?? []).filter((r) => !(waiting && r.userId === user?.id));
    return waiting?.emoji && user?.id ? [...base, { userId: user.id, emoji: waiting.emoji }] : base;
  };
  const react = (msg: DmMessageView, emoji: string | null) => {
    enqueueReaction(matchId, msg.id, emoji);
    setShownTimeId(null);
  };
  const unsend = async (msg: DmMessageView) => {
    setShownTimeId(null);
    try {
      await apiRequest("DELETE", `/api/dm/${msg.id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/messages", matchId] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/threads"] });
    } catch (e: any) {
      const m = String(e?.message || "").replace(/^\d+:\s*/, "");
      toast({ title: "Couldn't unsend", description: m || "Check your connection and try again.", variant: "destructive" });
    }
  };
  // A tapped message's actions can sit under the composer: bring them up.
  useEffect(() => {
    if (shownTimeId == null) return;
    requestAnimationFrame(() =>
      document.querySelector(`[data-testid="message-${shownTimeId}"]`)?.parentElement?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" }),
    );
  }, [shownTimeId, reduce]);
  const startEdit = (msg: DmMessageView) => {
    setShownTimeId(null);
    setEditing(msg);
    setInput(msg.content);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const cancelEdit = () => {
    setEditing(null);
    setInput("");
  };
  // "Seen" moves as they read: re-read the match when new messages land.
  useEffect(() => {
    if (list.length) refetchMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);

  // The first reply (§5.6): the first time they answer a conversation you
  // started, the header draws a warm line under their name. Once per match.
  const [firstReply, setFirstReply] = useState(false);
  useEffect(() => {
    if (!user?.id || list.length < 2) return;
    const theirs = list.filter((m) => m.senderId !== user.id);
    if (list[0].senderId === user.id && theirs.length === 1 && !firstReplySeen(matchId)) {
      setFirstReply(true);
      markFirstReplySeen(matchId);
      haptic.success();
    }
  }, [list, user?.id, matchId]);

  // An empty chat: three openers from their profile, without asking.
  const askedOpeners = useRef(false);
  useEffect(() => {
    if (isLoading || !match || list.length > 0 || askedOpeners.current || suggestions.options || suggestions.loading) return;
    askedOpeners.current = true;
    void suggestions.ask();
  }, [isLoading, match, list.length, suggestions]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(scrollToBottom, [messages, suggestions.options]);
  useKeyboardScroll(scrollToBottom);

  // The composer grows with what's typed, up to five lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 5 * 22 + 20)}px`;
  }, [input]);

  const saveEdit = async () => {
    if (!editing || !input.trim()) return;
    if (input.trim() === editing.content.trim()) return cancelEdit();
    setSavingEdit(true);
    try {
      await apiRequest("PATCH", `/api/dm/${editing.id}`, { content: input });
      cancelEdit();
      queryClient.invalidateQueries({ queryKey: ["/api/messages", matchId] });
    } catch (e: any) {
      const m = String(e?.message || "").replace(/^\d+:\s*/, "");
      toast({ title: "Couldn't save the edit", description: m || "Check your connection and try again.", variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSend = async () => {
    if (editing) return saveEdit();
    if (!input.trim()) return;
    const text = input;
    // The same id for the first try and any outbox retry.
    const clientId = newClientId();
    setInput("");
    suggestions.clear();
    typing.sent();
    // No connection: it waits in the outbox and sends itself later.
    if (navigator.onLine === false) {
      enqueue("direct", matchId, text, undefined, clientId);
      return;
    }
    try {
      await sendMessage.mutateAsync({ content: text, clientId });
    } catch (error) {
      if (isConnectionError(error)) {
        enqueue("direct", matchId, text, undefined, clientId);
        return;
      }
      console.error("Failed to send:", error);
      // Restore the draft instead of silently losing it.
      setInput((current) => current || text);
      toast({ title: "Message didn't send", description: "Check your connection and try again.", variant: "destructive" });
    }
  };

  const pickSuggestion = (text: string) => {
    setInput(text);
    suggestions.clear();
    haptic.tick();
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(text.length, text.length);
    });
  };

  const doBlock = async () => {
    if (!other?.userId) return;
    setConfirm(null);
    try {
      await apiRequest("POST", `/api/users/block/${other.userId}`, {});
      toast({ title: `${otherFirst} blocked` });
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      setLocation("/chats");
    } catch {
      toast({ title: "Couldn't block", variant: "destructive" });
    }
  };
  const doUnmatch = () => {
    setConfirm(null);
    unmatch.mutate(matchId, {
      onSuccess: () => { toast({ title: `Unmatched with ${otherFirst}` }); setLocation("/chats"); },
      onError: () => toast({ title: "Couldn't unmatch", variant: "destructive" }),
    });
  };

  const myLastId = [...list].reverse().find((m) => m.senderId === user?.id)?.id;

  return (
    <div className="h-dvh flex flex-col bg-vf-ink">
      <header className="border-b border-vf-line px-2 py-2 flex items-center gap-1 sticky top-0 z-10 bg-vf-ink/95 backdrop-blur-md">
        <IconButton label="Back" onClick={() => setLocation(backRoute)} data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </IconButton>
        <button
          type="button"
          onClick={() => other?.userId && setLocation(`/u/${other.userId}?from=/chat/${matchId}`)}
          className="flex items-center gap-3 min-w-0 text-left flex-1 rounded-[14px] px-1.5 py-1 hover:bg-vf-surface/60 transition-colors"
          aria-label={`Open ${otherName}'s profile`}
          data-testid="button-chat-profile"
        >
          <VfAvatar size={40} name={otherName} seed={other?.userId} src={otherPhoto ?? undefined} />
          <span className="min-w-0">
            <span className="relative inline-block max-w-full">
              <span className="block font-display text-[20px] leading-tight text-vf-text truncate" data-testid="text-chat-name">{otherName}</span>
              {firstReply && (
                <motion.span
                  aria-hidden="true"
                  className="absolute left-0 right-0 -bottom-0.5 h-[2px] rounded-full bg-vf-ember origin-left"
                  initial={reduce ? { opacity: 0 } : { scaleX: 0 }}
                  animate={reduce ? { opacity: 1 } : { scaleX: 1 }}
                  transition={{ duration: 0.75, ease: ease.standard, delay: 0.2 }}
                  data-testid="first-reply-underline"
                />
              )}
            </span>
            <span className="block vf-label text-vf-faint truncate mt-0.5">
              {typing.theyType ? "typing…" : firstReply ? `${otherFirst} replied` : match?.kind === "friends" ? ["Friends", otherMeta].filter(Boolean).join(" · ") : otherMeta || "Matched"}
            </span>
          </span>
        </button>
        <IconButton label={`Plan a date with ${otherFirst}`} onClick={() => setPlanning(true)} disabled={!match} data-testid="button-lets-meet">
          <CalendarHeart className="w-5 h-5" />
        </IconButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label="More" data-testid="button-chat-menu">
              <MoreHorizontal className="w-5 h-5" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            <DropdownMenuItem onSelect={() => other?.userId && setLocation(`/u/${other.userId}?from=/chat/${matchId}`)}>
              <UserRound className="w-4 h-4 mr-2" /> View profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => other?.userId && setReportTarget({ userId: other.userId })} data-testid="menu-report">
              <Flag className="w-4 h-4 mr-2" /> Report {otherFirst}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setConfirm("block")} data-testid="menu-block">
              <Ban className="w-4 h-4 mr-2" /> Block
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setConfirm("unmatch")} data-testid="menu-unmatch">
              <HeartOff className="w-4 h-4 mr-2" /> Unmatch
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <SharedLoungeStrip otherUserId={other?.userId} otherName={otherFirst} />

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2" data-testid="messages-container">
        <div className="max-w-[720px] mx-auto flex flex-col">
          {isLoading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="w-6 h-6 animate-spin text-vf-muted" />
            </div>
          ) : list.length > 0 ? (
            list.map((msg: any, i: number) => {
              const isMe = msg.senderId === user?.id;
              const at = when(msg);
              const prev = list[i - 1];
              const next = list[i + 1];
              const prevAt = prev ? when(prev) : null;
              const nextAt = next ? when(next) : null;
              const newDay = !prevAt || !sameDay(prevAt, at);
              // Grouped: same sender, same day, within five minutes.
              const joinsPrev = !!prev && !newDay && prev.senderId === msg.senderId && at.getTime() - prevAt!.getTime() < 5 * 60_000;
              const joinsNext = !!next && nextAt && sameDay(at, nextAt) && next.senderId === msg.senderId && nextAt.getTime() - at.getTime() < 5 * 60_000;
              const link = parseDestiraLink(msg.content);
              const showTime = shownTimeId === msg.id;
              const isMyLast = msg.id === myLastId && !msg.pending;
              const seen = isMyLast && otherLastReadAt && otherLastReadAt.getTime() >= at.getTime();
              const corner = isMe
                ? `rounded-[20px] ${joinsPrev ? "rounded-tr-[6px]" : ""} ${joinsNext ? "rounded-br-[6px]" : ""}`
                : `rounded-[20px] ${joinsPrev ? "rounded-tl-[6px]" : ""} ${joinsNext ? "rounded-bl-[6px]" : ""}`;
              return (
                <Fragment key={msg.id}>
                  {newDay && (
                    <div className="vf-label text-vf-faint text-center my-4" data-testid="day-separator">{dayLabel(at)}</div>
                  )}
                  <motion.div
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    className={`flex flex-col ${isMe ? "items-end" : "items-start"} ${joinsPrev ? "mt-0.5" : newDay ? "" : "mt-3"}`}
                  >
                    {msg.unsentAt || (msg.contentType && msg.contentType !== "text") ? (
                      <div
                        className={`max-w-[80%] ${msg.pending ? "opacity-70" : ""}`}
                        // Tapping the bubble (not its play button or photo) shows the actions;
                        // a long press works on a photo too.
                        onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) setShownTimeId(showTime ? null : msg.id); }}
                        onContextMenu={(e) => { e.preventDefault(); setShownTimeId(msg.id); }}
                        data-testid={`message-${msg.id}`}
                      >
                        {msg.contentType === "date" && msg.plan ? (
                          <DateCard plan={msg.plan} isMe={isMe} otherFirst={otherFirst} onSuggestAnother={() => setPlanning(true)} />
                        ) : (
                          <DmSpecialBody
                            msg={msg}
                            isMe={isMe}
                            corner={corner}
                            onChanged={() => queryClient.invalidateQueries({ queryKey: ["/api/messages", matchId] })}
                          />
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShownTimeId(showTime ? null : msg.id)}
                        className={`text-left max-w-[80%] px-4 py-2.5 text-[15px] leading-[1.45] break-words whitespace-pre-wrap ${corner} ${msg.pending ? "opacity-70" : ""} ${
                          isMe
                            ? "bg-vf-ember/[0.16] border border-vf-ember/25 text-vf-text"
                            : "bg-vf-surface border border-vf-line text-vf-text"
                        } ${editing?.id === msg.id ? "ring-2 ring-vf-ember/50" : ""}`}
                        data-testid={`message-${msg.id}`}
                      >
                        {link ? <LinkPreviewCard content={msg.content} /> : msg.content}
                      </button>
                    )}
                    {!msg.pending && (
                      <ReactionChips
                        reactions={reactionsFor(msg)}
                        myId={user?.id}
                        isMe={isMe}
                        onTap={(e) => react(msg, reactionsFor(msg).some((r) => r.userId === user?.id && r.emoji === e) ? null : e)}
                      />
                    )}
                    {showTime && !msg.pending ? (
                      <MessageActions
                        msg={msg}
                        isMe={isMe}
                        myReaction={reactionsFor(msg).find((r) => r.userId === user?.id)?.emoji}
                        onReact={(e) => react(msg, e)}
                        onEdit={() => startEdit(msg)}
                        onUnsend={() => unsend(msg)}
                        onReport={() => { setReportTarget({ userId: msg.senderId, messageId: msg.id }); setShownTimeId(null); }}
                      >
                        <span>{timeLabel(at)}</span>
                        {msg.editedAt && !msg.unsentAt && <span data-testid={`edited-${msg.id}`}>Edited</span>}
                        {isMyLast && <span data-testid="message-state">{seen ? "Seen" : "Sent"}</span>}
                      </MessageActions>
                    ) : (isMyLast || (msg.editedAt && !msg.unsentAt)) && (
                      <div className={`flex items-center gap-2 mt-1 px-1 font-mono text-[11px] text-vf-faint ${isMe ? "justify-end" : ""}`}>
                        {msg.editedAt && !msg.unsentAt && <span data-testid={`edited-${msg.id}`}>Edited</span>}
                        {isMyLast && <span data-testid="message-state">{seen ? "Seen" : "Sent"}</span>}
                      </div>
                    )}
                  </motion.div>
                </Fragment>
              );
            })
          ) : (
            <div className="text-center py-10 px-4" data-testid="chat-empty">
              <div className="flex justify-center mb-4">
                <VfAvatar size={72} name={otherName} seed={other?.userId} src={otherPhoto ?? undefined} />
              </div>
              <p className="vf-h2 text-vf-text">Say hello to {otherFirst}.</p>
              <p className="vf-small text-vf-muted mt-1.5 max-w-[34ch] mx-auto">
                {(match as any)?.originNote ? `${(match as any).originNote}. ` : "You both said yes. "}Keep the first message short and about them.
              </p>
              {!suggestions.options && (
                <VfButton
                  variant="twin"
                  size="sm"
                  className="mt-5"
                  loading={suggestions.loading}
                  leading={<TwinGlyph size={16} />}
                  onClick={suggestions.ask}
                  data-testid="button-openers"
                >
                  Ideas for a first message
                </VfButton>
              )}
            </div>
          )}
          <SafetyTip
            matchId={matchId}
            myId={user?.id}
            messages={list}
            onReport={(messageId, kind) => {
              if (!other?.userId) return;
              setReportReason(RISK_LABEL[kind]);
              setReportTarget({ userId: other.userId, messageId });
            }}
          />
          {match && (
            <DateCheckin
              matchId={matchId}
              otherFirst={otherFirst}
              onReport={() => {
                if (!other?.userId) return;
                setReportReason("About our date: ");
                setReportTarget({ userId: other.userId });
              }}
            />
          )}
          <div className="mt-3 flex flex-col gap-1">
            <OutboxBubbles kind="direct" targetId={matchId} />
          </div>
          {typing.theyType && <TypingBubble />}
          <div ref={messagesEndRef} />
          <LiveRegion text={announcement} />
        </div>
      </div>

      <div className="border-t border-vf-line bg-vf-ink px-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="max-w-[720px] mx-auto">
          <AnimatePresence>
            {(suggestions.options || suggestions.error || (suggestions.loading && list.length > 0)) && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.18 }}
                className="mb-2 rounded-[18px] border border-vf-mint/25 bg-vf-mint/[0.06] p-2"
                data-testid="reply-suggestions"
              >
                <div className="flex items-center justify-between px-2 pt-1 pb-1.5">
                  <span className="vf-label text-vf-mint">From your twin · tap one to edit</span>
                  <button onClick={suggestions.clear} className="w-8 h-8 -mr-1 flex items-center justify-center text-vf-faint hover:text-vf-text" aria-label="Close ideas">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {suggestions.loading ? (
                  <div className="flex items-center gap-2 px-2 pb-2 vf-small text-vf-muted">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…
                  </div>
                ) : suggestions.error ? (
                  <p className="px-2 pb-2 vf-small text-vf-muted">{suggestions.error}</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {suggestions.options!.map((o, i) => (
                      <button
                        key={i}
                        onClick={() => pickSuggestion(o)}
                        className="text-left rounded-[14px] bg-vf-surface border border-vf-line px-3.5 py-2.5 text-[14.5px] leading-[1.4] text-vf-text hover:border-vf-mint/40 transition-colors"
                        data-testid={`suggestion-${i}`}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {editing && (
            <div className="mb-2 flex items-center gap-2 rounded-[14px] border border-vf-line bg-vf-surface px-3 py-2" data-testid="editing-banner">
              <PencilIcon className="w-3.5 h-3.5 text-vf-ember shrink-0" />
              <span className="vf-small text-vf-muted flex-1 truncate">Editing: {editing.content}</span>
              <button type="button" onClick={cancelEdit} className="w-8 h-8 -mr-1 flex items-center justify-center text-vf-faint hover:text-vf-text" aria-label="Stop editing" data-testid="button-cancel-edit">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          )}
          {voice.state === "recording" ? (
            <RecordingBar elapsed={voice.elapsed} onCancel={voice.cancel} onSend={voice.stop} />
          ) : (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          >
            {!editing && <PhotoButton matchId={matchId} otherFirst={otherFirst} disabled={!match} />}
            {list.length > 0 && !editing && (
              <IconButton
                label="Help me reply"
                variant="twin"
                onClick={() => (suggestions.options ? suggestions.clear() : suggestions.ask())}
                disabled={suggestions.loading}
                data-testid="button-help-reply"
              >
                <TwinGlyph size={20} />
              </IconButton>
            )}
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends on a keyboard; on a phone it's a new line.
                if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              aria-label={`Message ${otherFirst}`}
              placeholder={`Message ${otherFirst}`}
              className="flex-1 min-h-[44px] resize-none rounded-[22px] px-4 py-[11px] text-[16px] leading-[22px] bg-vf-surface border border-vf-line text-vf-text placeholder:text-vf-faint outline-none focus:border-vf-text/25"
              data-testid="input-message"
            />
            {!input.trim() && !editing && voice.available ? (
              <MicButton onStart={voice.start} disabled={!match || voice.state !== "idle"} />
            ) : (
            <button
              type="submit"
              disabled={!input.trim() || sendMessage.isPending || savingEdit}
              className="vf-press shrink-0 w-11 h-11 rounded-full flex items-center justify-center bg-vf-ember text-vf-ink hover:bg-[var(--vf-ember-soft)] disabled:opacity-40 transition-colors"
              aria-label={editing ? "Save edit" : "Send"}
              data-testid="button-send"
            >
              <ArrowUp className="w-5 h-5" strokeWidth={2.25} />
            </button>
            )}
          </form>
          )}
        </div>
      </div>

      <Dialog open={!!reportTarget} onOpenChange={(v) => { if (!v) { setReportTarget(null); setReportReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reportTarget?.messageId != null ? "Report this message" : `Report ${otherFirst}`}</DialogTitle>
            <DialogDescription>
              {reportTarget?.messageId != null
                ? "This sends a record to our team for review, citing this exact message."
                : "This sends a record to our team for review."}
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            placeholder="What's going on? (optional)"
            rows={3}
            className="w-full rounded-[12px] border border-vf-line bg-vf-surface2 p-3 text-sm text-vf-text outline-none resize-none"
            data-testid="input-dm-report-reason"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setReportTarget(null); setReportReason(""); }} data-testid="button-cancel-dm-report">
              Cancel
            </Button>
            <Button onClick={submitReport} disabled={reportBusy} data-testid="button-submit-dm-report">
              {reportBusy ? "Sending…" : "Send report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LetsMeetSheet matchId={matchId} otherFirst={otherFirst} open={planning} onOpenChange={setPlanning} />

      <VfSheet
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "block" ? `Block ${otherFirst}?` : `Unmatch with ${otherFirst}?`}
        description={
          confirm === "block"
            ? "They won't be able to message you or see you on Destira."
            : "This chat closes and they leave your matches."
        }
        footer={
          <div className="flex flex-col gap-2">
            <VfButton
              variant="destructive"
              fullWidth
              loading={unmatch.isPending}
              onClick={confirm === "block" ? doBlock : doUnmatch}
              data-testid="button-confirm-chat-action"
            >
              {confirm === "block" ? "Block" : "Unmatch"}
            </VfButton>
            <VfButton variant="quiet" size="sm" fullWidth onClick={() => setConfirm(null)}>Cancel</VfButton>
          </div>
        }
      />
    </div>
  );
}
