import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateMatch, LikeWaitingError } from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
import { useKeyboardScroll } from "@/hooks/use-keyboard-scroll";
import { ArrowLeft, Loader2, Check, CheckCheck, ArrowUp, Heart, Eye } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { IconButton, TwinGlyph, VfAvatar, VfButton } from "@/components/ui-vf";
import { recordPass } from "@/lib/discover-decisions";
import { haptic } from "@/lib/haptics";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

// Questions people actually want answered before a first date, in plain
// words. Shown as chips until the conversation gets going.
const SUGGESTED_QUESTIONS = [
  "What are they looking for right now?",
  "What's a perfect weekend for them?",
  "How do they handle a disagreement?",
  "What are they working on these days?",
  "What would they never compromise on?",
];

type MessageStatus = "sending" | "sent" | "delivered";

interface Message {
  id: number;
  text: string;
  sender: "user" | "ai";
  timestamp: Date;
  status: MessageStatus;
}

interface InterviewData {
  id: number;
  targetProfile?: {
    displayName?: string;
    userId?: string;
    profileImageUrl?: string;
    coverPhotoUrl?: string;
  };
  requesterProfile?: { displayName?: string; userId?: string; coverPhotoUrl?: string } | null;
  viewerRole?: "asker" | "asked";
  targetId?: string;
  transcript?: string;
}

function StatusIndicator({ status }: { status: MessageStatus }) {
  if (status === "sending") {
    return <Loader2 className="w-3 h-3 text-vf-faint animate-spin" />;
  }
  if (status === "sent") {
    return <Check className="w-3 h-3 text-vf-faint" />;
  }
  return <CheckCheck className="w-3 h-3 text-vf-ember" />;
}

export default function InterviewChat({ params }: { params: { id: string } }) {
  const interviewId = Number(params.id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [targetName, setTargetName] = useState("Their");
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [targetAvatar, setTargetAvatar] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  // "asked": someone else asked the viewer's twin. They can read it, never post.
  const [viewerRole, setViewerRole] = useState<"asker" | "asked">("asker");
  const [askerName, setAskerName] = useState<string | null>(null);
  const [askerPhoto, setAskerPhoto] = useState<string | null>(null);
  const [decided, setDecided] = useState<"liked" | "passed" | null>(null);
  const createMatch = useCreateMatch();
  const reduce = useReducedMotion();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Entered from the chat list, Discover, a profile, or a proximity alert —
  // each linker passes its own route as ?from so back returns to wherever
  // the user actually came from instead of always landing on /chats.
  const backRoute = useMemo(() => {
    const from = new URLSearchParams(window.location.search).get("from");
    return from && from.startsWith("/") ? from : "/chats";
  }, []);

  // The chat list's preview card is a separate query (/api/chat/threads) —
  // refresh it on the way out so it doesn't keep showing a stale preview.
  useEffect(() => {
    return () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/threads"] });
    };
  }, [queryClient]);

  useEffect(() => {
    fetch(`/api/interviews`, { credentials: "include" })
      .then(r => r.json())
      .then((interviews: InterviewData[]) => {
        const interview = interviews.find((i) => i.id === interviewId);
        if (!interview) return;

        const name = interview.targetProfile?.displayName || "Their";
        setTargetName(name);
        setTargetUserId(interview.targetProfile?.userId || interview.targetId || null);
        setTargetAvatar(interview.targetProfile?.coverPhotoUrl || interview.targetProfile?.profileImageUrl || null);
        const role = interview.viewerRole === "asked" ? "asked" : "asker";
        setViewerRole(role);
        if (role === "asked") {
          setAskerName(interview.requesterProfile?.displayName || "Someone");
          setAskerPhoto(interview.requesterProfile?.coverPhotoUrl || null);
        }

        const possessive = name.toLowerCase() === "their" ? "This twin" : `${name}'s twin`;
        const opener = `${possessive} here. Ask me anything about ${name.toLowerCase() === "their" ? "them" : name}. I answer from what they've told me, and only what they've let me share.`;

        if (interview.transcript) {
          try {
            const history: { role: string; content: string; ts?: string }[] = JSON.parse(interview.transcript);
            const restored: Message[] = history.map((h, idx) => ({
              id: idx + 1,
              text: h.content,
              sender: h.role === "user" ? "user" as const : "ai" as const,
              // Older transcripts predate per-turn timestamps — fall back to
              // now rather than fabricate a false history for those.
              timestamp: h.ts ? new Date(h.ts) : new Date(),
              status: "delivered" as const,
            }));
            setMessages(restored);
          } catch {
            setMessages([{
              id: 1,
              text: opener,
              sender: "ai",
              timestamp: new Date(),
              status: "delivered",
            }]);
          }
        } else if (role === "asker") {
          setMessages([{
            id: 1,
            text: opener,
            sender: "ai",
            timestamp: new Date(),
            status: "delivered",
          }]);
        }
      })
      .catch(() => {});
  }, [interviewId]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(scrollToBottom, [messages, isTyping, scrollToBottom]);
  useKeyboardScroll(scrollToBottom);

  const handleSend = async (textArg?: string) => {
    const text = (textArg ?? input).trim();
    if (!text || isStreaming) return;

    const userMsg: Message = {
      id: Date.now(),
      text,
      sender: "user",
      timestamp: new Date(),
      status: "sending",
    };

    setMessages(prev => [...prev, userMsg]);
    const currentInput = text;
    setInput("");
    setIsStreaming(true);

    setTimeout(() => {
      setMessages(prev =>
        prev.map(m => m.id === userMsg.id ? { ...m, status: "sent" as const } : m)
      );
    }, 300);

    try {
      const res = await fetch(`/api/interviews/${interviewId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: currentInput, stream: true }),
        credentials: "include",
      });

      setMessages(prev =>
        prev.map(m => m.id === userMsg.id ? { ...m, status: "delivered" as const } : m)
      );

      if (!res.ok) {
        throw new Error("Failed to send message");
      }

      const contentType = res.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream") || contentType.includes("text/plain")) {
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No reader available");

        const decoder = new TextDecoder();
        let buffer = "";
        const aiMsgId = Date.now() + 1;
        let aiMessageAdded = false;
        let accumulatedContent = "";

        setIsTyping(true);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;

            try {
              const data = JSON.parse(trimmed.slice(6));

              if (data.type === "typing") {
                setIsTyping(true);
              } else if (data.type === "delta" && data.content) {
                setIsTyping(false);
                accumulatedContent += data.content;

                if (!aiMessageAdded) {
                  aiMessageAdded = true;
                  setMessages(prev => [...prev, {
                    id: aiMsgId,
                    text: accumulatedContent,
                    sender: "ai",
                    timestamp: new Date(),
                    status: "delivered",
                  }]);
                } else {
                  const currentContent = accumulatedContent;
                  setMessages(prev =>
                    prev.map(m => m.id === aiMsgId ? { ...m, text: currentContent } : m)
                  );
                }
              } else if (data.type === "done") {
                setIsTyping(false);
                const finalContent = data.content || accumulatedContent;
                if (!aiMessageAdded) {
                  setMessages(prev => [...prev, {
                    id: aiMsgId,
                    text: finalContent,
                    sender: "ai",
                    timestamp: new Date(),
                    status: "delivered",
                  }]);
                } else {
                  setMessages(prev =>
                    prev.map(m => m.id === aiMsgId ? { ...m, text: finalContent } : m)
                  );
                }
                // A real outage still gets a reply (a generic, honest one —
                // never fabricated), but silently treating it as a normal
                // answer hides the outage from the user and from support.
                if (data.error) {
                  toast({
                    title: "Having trouble connecting",
                    description: "That reply is a placeholder — the twin couldn't actually respond just now. Try again in a moment.",
                  });
                }
              }
            } catch {
              // skip malformed JSON
            }
          }
        }

        setIsTyping(false);
      } else {
        const data = await res.json();
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          text: data.response,
          sender: "ai",
          timestamp: new Date(),
          status: "delivered",
        }]);
        if (data.error) {
          toast({
            title: "Having trouble connecting",
            description: "That reply is a placeholder — the twin couldn't actually respond just now. Try again in a moment.",
          });
        }
      }
    } catch (error) {
      console.error("Chat failed", error);
      toast({
        title: "Message failed",
        description: "Could not send your message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsStreaming(false);
      setIsTyping(false);
    }
  };

  const handleRequestMatch = async () => {
    if (!targetUserId) return;
    try {
      const result: any = await createMatch.mutateAsync(targetUserId);
      setDecided("liked");
      haptic.like();
      if (result?.mutual && result?.id) {
        haptic.match();
        toast({ title: "It's mutual", description: `You and ${targetName} both said yes.` });
        setLocation(`/chat/${result.id}?from=/chats`);
        return;
      }
      toast({ title: "Liked", description: `${targetName} will see it in Likes.` });
    } catch (error: any) {
      if (error instanceof LikeWaitingError) {
        toast({ title: "Saved", description: error.message });
      } else if (error.message?.includes("already exists")) {
        toast({ title: "Already Connected", description: "You already have a connection with this person." });
      } else {
        toast({ title: "Couldn't like", description: "Something went wrong. Please try again.", variant: "destructive" });
      }
    }
  };

  const twinPossessive = targetName.toLowerCase() === "their" ? "their" : `${targetName}'s`;
  const meetName = targetName.toLowerCase() === "their" ? "them" : targetName;
  const first = meetName.split(/\s+/)[0];
  const readOnly = viewerRole === "asked";
  const answers = messages.filter((m) => m.sender === "ai").length;
  const asked = messages.filter((m) => m.sender === "user").length;
  const showSuggestions = !readOnly && asked < 2 && !isStreaming && !isTyping;
  // After a real exchange, one clear next step (§7.7).
  const showDecision = !readOnly && !!targetUserId && asked >= 3 && !isStreaming && !isTyping && decided !== "passed";

  const twinAvatar = (size: number) => (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <VfAvatar size={size} name={targetName} seed={targetUserId ?? undefined} src={readOnly ? undefined : targetAvatar ?? undefined} />
      <span className="absolute inset-0 rounded-full ring-2 ring-vf-mint/45" aria-hidden="true" />
    </span>
  );

  return (
    <div className="h-dvh flex flex-col bg-vf-ink text-vf-text" data-testid="interview-chat-page">
      {/* A conversation with a twin, not the person: mint frame. The human
          action (Like) stays ember. */}
      <header
        className="border-b border-vf-mint/[0.18] px-2 py-2 flex items-center gap-1 sticky top-0 z-50"
        style={{ background: "linear-gradient(180deg, hsl(var(--vf-mint) / 0.08), var(--vf-ink) 140%)" }}
      >
        <IconButton label="Back" onClick={() => setLocation(backRoute)} data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </IconButton>
        <button
          type="button"
          onClick={() => {
            const id = readOnly ? null : targetUserId;
            if (id) setLocation(`/u/${id}?from=/interviews/${interviewId}/chat`);
          }}
          className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-[14px] px-1.5 py-1"
          data-testid="button-twin-profile"
        >
          {readOnly ? (
            <VfAvatar size={40} name={askerName ?? "Someone"} src={askerPhoto ?? undefined} />
          ) : (
            twinAvatar(40)
          )}
          <span className="min-w-0">
            <span className="block font-display text-[20px] leading-tight text-vf-text truncate" data-testid="text-twin-name">
              {readOnly ? `${askerName ?? "Someone"} asked your twin` : `${targetName}'s twin`}
            </span>
            <span className="flex items-center gap-1.5 mt-0.5 vf-label text-vf-mint truncate" data-testid="text-twin-status">
              <TwinGlyph size={13} /> {readOnly ? "You can read this" : "Answers for them"}
            </span>
          </span>
        </button>
        {!readOnly && targetUserId && decided !== "liked" && (
          <VfButton
            size="sm"
            className="shrink-0 mr-1"
            loading={createMatch.isPending}
            leading={<Heart className="w-4 h-4" fill="currentColor" strokeWidth={0} />}
            onClick={handleRequestMatch}
            data-testid="button-request-match"
          >
            Like
          </VfButton>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-2" data-testid="messages-container">
        <div className="max-w-[720px] mx-auto flex flex-col gap-3">
          {/* The real rule, said plainly (§7.7). */}
          <div className="flex items-start gap-2.5 rounded-[16px] border border-vf-mint/20 bg-vf-mint/[0.05] px-4 py-3 vf-small text-vf-muted" data-testid="interview-rule">
            <Eye className="w-4 h-4 text-vf-mint shrink-0 mt-0.5" />
            {readOnly ? (
              <span>
                Only {askerName ?? "they"} can ask. This is what your twin told them, from what you've shared and what you let it say.
                {" "}<button onClick={() => setLocation("/twin-disclosure")} className="text-vf-mint underline underline-offset-2">Change what it may say</button>
              </span>
            ) : (
              <span>
                {first === "them" ? "They're" : `${first} is`} told you're asking, and can read this conversation. The twin answers from what they've shared, and only what they allow.
              </span>
            )}
          </div>

          {readOnly && messages.length === 0 && (
            <p className="vf-small text-vf-faint text-center py-8">Nothing asked yet.</p>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg) => {
              const mine = msg.sender === "user";
              return (
                <motion.div
                  key={msg.id}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className={`flex ${mine ? "justify-end" : "justify-start"} gap-2`}
                  data-testid={`message-${msg.sender}-${msg.id}`}
                >
                  {!mine && <div className="mt-1">{twinAvatar(28)}</div>}
                  <div className={`flex flex-col gap-1 max-w-[80%] ${mine ? "items-end" : "items-start"}`}>
                    <div
                      className={`px-4 py-2.5 text-[15px] leading-[1.5] whitespace-pre-wrap break-words ${
                        mine
                          ? "rounded-[20px] rounded-br-[6px] bg-vf-ember/[0.16] border border-vf-ember/25 text-vf-text"
                          : "rounded-[20px] rounded-bl-[6px] border border-vf-mint/[0.22] bg-vf-mint/[0.08] text-vf-text"
                      }`}
                    >
                      {msg.text}
                    </div>
                    {mine && !readOnly && (
                      <div className="flex items-center justify-end gap-1 px-1">
                        <span className="font-mono text-[11px] text-vf-faint">
                          {msg.timestamp.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </span>
                        <StatusIndicator status={msg.status} />
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          <AnimatePresence>
            {isTyping && (
              <motion.div
                key="typing-indicator"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex justify-start gap-2"
                data-testid="typing-indicator"
              >
                <div className="mt-1">{twinAvatar(28)}</div>
                <div className="rounded-[20px] rounded-bl-[6px] border border-vf-mint/[0.22] bg-vf-mint/[0.08] px-4 py-3 flex items-center gap-2">
                  <span className="relative block w-3 h-3" aria-hidden="true">
                    <span className="absolute inset-0 rounded-full bg-vf-mint motion-safe:animate-[vf-breathe_1.6s_ease-in-out_infinite]" />
                  </span>
                  <span className="vf-small text-vf-muted">Thinking…</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {showDecision && (
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 rounded-[20px] border border-vf-line bg-vf-surface p-5 text-center"
              data-testid="card-ready-to-like"
            >
              {decided === "liked" ? (
                <>
                  <p className="vf-h3 text-vf-text">You liked {first}.</p>
                  <p className="vf-small text-vf-muted mt-1">If they like you back, you can talk to them, not just their twin.</p>
                </>
              ) : (
                <>
                  <p className="vf-h3 text-vf-text">Ready to like {first}?</p>
                  <p className="vf-small text-vf-muted mt-1">Or keep asking. Their twin isn't going anywhere.</p>
                  <div className="flex gap-2 mt-4">
                    <VfButton
                      variant="secondary"
                      className="flex-1"
                      onClick={() => {
                        if (!targetUserId) return;
                        recordPass(targetUserId);
                        haptic.pass();
                        setDecided("passed");
                        toast({ title: "Not for you", description: `${first} won't come up in Discover again.` });
                        setLocation(backRoute);
                      }}
                      data-testid="button-not-for-me"
                    >
                      Not for me
                    </VfButton>
                    <VfButton
                      className="flex-1"
                      loading={createMatch.isPending}
                      leading={<Heart className="w-4 h-4" fill="currentColor" strokeWidth={0} />}
                      onClick={handleRequestMatch}
                      data-testid="button-like-from-interview"
                    >
                      Like
                    </VfButton>
                  </div>
                </>
              )}
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {!readOnly && (
        <div className="border-t border-vf-line bg-vf-ink px-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="max-w-[720px] mx-auto">
            {showSuggestions && (
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 -mx-3 px-3" data-testid="suggested-questions">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    className="shrink-0 rounded-full border border-vf-mint/30 bg-vf-mint/[0.06] text-vf-mint text-[13.5px] px-3.5 h-9 hover:bg-vf-mint/10 transition-colors"
                    data-testid={`chip-suggested-${q.slice(0, 12)}`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            <form
              className="flex gap-2 items-end"
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              data-testid="form-send-message"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Ask about ${first}`}
                className="flex-1 h-11 rounded-full px-4 text-[16px] bg-vf-surface border border-vf-line text-vf-text placeholder:text-vf-faint outline-none focus:border-vf-mint/40"
                disabled={isStreaming}
                data-testid="input-message"
              />
              <button
                type="submit"
                className="vf-press shrink-0 w-11 h-11 rounded-full flex items-center justify-center bg-vf-mint text-vf-ink disabled:opacity-40"
                disabled={!input.trim() || isStreaming}
                aria-label="Ask"
                data-testid="button-send"
              >
                {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-5 h-5" strokeWidth={2.25} />}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
