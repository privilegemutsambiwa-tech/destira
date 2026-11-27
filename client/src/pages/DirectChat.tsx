import { useState, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDirectMessages, useSendDirectMessage, useMatches, useMarkThreadRead, useUnmatch } from "@/hooks/use-interactions";
import { Video, ArrowUp } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useKeyboardScroll } from "@/hooks/use-keyboard-scroll";
import { useReducedMotion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { SafetyTip } from "@/components/safety-tip";
import { RISK_LABEL } from "@shared/safety";
import { enqueue, enqueueReaction, isConnectionError, newClientId, useOutbox } from "@/lib/outbox";
import { TypingBubble, useTyping } from "@/components/dm-message";
import { MicButton, PhotoButton, RecordingBar, useVoiceNote } from "@/components/dm-composer-extras";
import { Pencil as PencilIcon, X as XIcon } from "lucide-react";
import { DateCheckin, LetsMeetSheet } from "@/components/date-plan";
import type { DmMessageView } from "@shared/dm";
import { OutboxBubbles } from "@/components/outbox-bubbles";
import { usePaywall } from "@/hooks/use-paywall";
import { callApi, deviceCanVideo, openAppDownload } from "@/lib/video-call";
import { IconButton, TwinGlyph, VfAvatar, VfButton } from "@/components/ui-vf";
import { haptic } from "@/lib/haptics";
import { LiveRegion, spokenMessage, useNewMessageAnnouncement } from "@/lib/a11y";
import { ChatSkeleton } from "@/components/ui-vf/skeletons";
import { noteBadMoment } from "@/lib/review-prompt";
import { SharedLoungeStrip } from "@/components/direct-chat/shared-lounge-strip";
import { firstReplySeen, markFirstReplySeen, useSuggestions } from "@/components/direct-chat/chat-utils";
import { ChatHeader } from "@/components/direct-chat/chat-header";
import { MessageRow } from "@/components/direct-chat/message-row";
import { ReplySuggestions } from "@/components/direct-chat/reply-suggestions";
import { ConfirmChatAction, ReportDialog } from "@/components/direct-chat/chat-dialogs";

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
  const paywall = usePaywall();
  const { toast } = useToast();
  const reduce = useReducedMotion();
  const suggestions = useSuggestions(matchId);
  const [calling, setCalling] = useState(false);

  // Video date: the caller pays (paid plans, minutes a day); answering is free.
  const startVideoCall = async () => {
    if (calling) return;
    const can = await deviceCanVideo();
    if (can === "update-app") {
      toast({ title: "Update Destira for video dates", description: "Install the new version, then call again." });
      openAppDownload();
      return;
    }
    if (can === "unsupported") {
      toast({ title: "Video calls need the Destira app or a newer browser" });
      return;
    }
    paywall.guard("video_call", async () => {
      setCalling(true);
      try {
        const { id } = await callApi.start(matchId);
        setLocation(`/call/${id}`);
      } catch (e: any) {
        const msg = String(e?.message || "").replace(/^\d+:\s*/, "");
        toast({ title: "Couldn't start the call", description: msg || "Try again in a moment.", variant: "destructive" });
      } finally {
        setCalling(false);
      }
    });
  };

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
      noteBadMoment();
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
    haptic.send();
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
      noteBadMoment();
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
      <ChatHeader
        matchId={matchId}
        backRoute={backRoute}
        otherUserId={other?.userId}
        otherName={otherName}
        otherFirst={otherFirst}
        otherPhoto={otherPhoto}
        subtitle={typing.theyType ? "typing…" : firstReply ? `${otherFirst} replied` : match?.kind === "friends" ? ["Friends", otherMeta].filter(Boolean).join(" · ") : otherMeta || "Matched"}
        firstReply={firstReply}
        hasMatch={!!match}
        calling={calling}
        onVideoCall={startVideoCall}
        onPlan={() => setPlanning(true)}
        onReport={() => other?.userId && setReportTarget({ userId: other.userId })}
        onConfirm={setConfirm}
      />
      {paywall.sheet}

      <SharedLoungeStrip otherUserId={other?.userId} otherName={otherFirst} />

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2" data-testid="messages-container">
        <div className="max-w-[720px] mx-auto flex flex-col">
          {isLoading ? (
            <ChatSkeleton />
          ) : list.length > 0 ? (
            list.map((msg: any, i: number) => (
              <MessageRow
                key={msg.id}
                msg={msg}
                prev={list[i - 1]}
                next={list[i + 1]}
                myId={user?.id}
                isMyLast={msg.id === myLastId && !msg.pending}
                otherLastReadAt={otherLastReadAt}
                showActions={shownTimeId === msg.id}
                editingThis={editing?.id === msg.id}
                otherFirst={otherFirst}
                reduce={reduce}
                reactions={reactionsFor(msg)}
                onToggleActions={() => setShownTimeId(shownTimeId === msg.id ? null : msg.id)}
                onShowActions={() => setShownTimeId(msg.id)}
                onPlan={() => setPlanning(true)}
                onChanged={() => queryClient.invalidateQueries({ queryKey: ["/api/messages", matchId] })}
                onReact={(e) => react(msg, e)}
                onEdit={() => startEdit(msg)}
                onUnsend={() => unsend(msg)}
                onReport={() => { setReportTarget({ userId: msg.senderId, messageId: msg.id }); setShownTimeId(null); }}
              />
            ))
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
          <ReplySuggestions
            open={!!(suggestions.options || suggestions.error || (suggestions.loading && list.length > 0))}
            loading={suggestions.loading}
            error={suggestions.error}
            options={suggestions.options}
            onClose={suggestions.clear}
            onPick={pickSuggestion}
          />

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

      <ReportDialog
        target={reportTarget}
        otherFirst={otherFirst}
        reason={reportReason}
        busy={reportBusy}
        onReasonChange={setReportReason}
        onClose={() => { setReportTarget(null); setReportReason(""); }}
        onSubmit={submitReport}
      />

      <LetsMeetSheet matchId={matchId} otherFirst={otherFirst} open={planning} onOpenChange={setPlanning} />

      <ConfirmChatAction
        confirm={confirm}
        otherFirst={otherFirst}
        pending={unmatch.isPending}
        onConfirm={confirm === "block" ? doBlock : doUnmatch}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
