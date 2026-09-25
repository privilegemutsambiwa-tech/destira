import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateMatch } from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
import { useKeyboardScroll } from "@/hooks/use-keyboard-scroll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Send, ArrowLeft, Loader2, Check, CheckCheck } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

const SUGGESTED_QUESTIONS = [
  "What are they looking for?",
  "How do they handle conflict?",
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
  };
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
  const createMatch = useCreateMatch();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Entered from the chat list, Discover, a profile, or a proximity alert —
  // each linker passes its own route as ?from so back returns to wherever
  // the user actually came from instead of always landing on /interviews.
  const backRoute = useMemo(() => {
    const from = new URLSearchParams(window.location.search).get("from");
    return from && from.startsWith("/") ? from : "/interviews";
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
        setTargetAvatar(interview.targetProfile?.profileImageUrl || null);

        const possessive = name.toLowerCase() === "their" ? "This twin" : `${name}'s twin`;
        const opener = `${possessive} is here. Ask it what they want in three years, how they argue, or what they won't compromise on — it answers only what they're allowed.`;

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
        } else {
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
      await createMatch.mutateAsync(targetUserId);
      toast({
        title: "Match Request Sent!",
        description: `${targetName} will be notified of your interest.`,
      });
    } catch (error: any) {
      if (error.message?.includes("already exists")) {
        toast({ title: "Already Connected", description: "You already have a connection with this person." });
      } else {
        toast({ title: "Error", description: "Could not send match request.", variant: "destructive" });
      }
    }
  };

  const avatarInitial = targetName?.[0]?.toUpperCase() || "T";
  const twinPossessive = targetName.toLowerCase() === "their" ? "their" : `${targetName}'s`;
  const meetName = targetName.toLowerCase() === "their" ? "them" : targetName;
  const showSuggestions = messages.length <= 1 && !isStreaming && !isTyping;

  return (
    <div className="h-dvh flex flex-col bg-vf-ink text-vf-text" data-testid="interview-chat-page">
      {/* Same tinted-header language as TwinChat.tsx (mint wash, a bigger
          avatar with real presence) — this is still fundamentally "a twin,
          talking" even though it's someone else's, so it earns the same
          weight. The "Ask to meet" CTA stays ember (a human action, not a
          twin one), which is exactly the contrast the header should make
          legible at a glance: mint frame, ember action. */}
      <div
        className="border-b border-vf-mint/[0.16] px-4 py-3.5 flex items-center justify-between gap-2 sticky top-0 z-50"
        style={{ background: "linear-gradient(180deg, hsl(var(--vf-mint) / 0.07), var(--vf-ink) 130%)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation(backRoute)}
            aria-label="Back"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5 text-vf-ember" />
          </Button>
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative w-11 h-11 shrink-0">
              <div
                className="absolute -inset-1 rounded-full animate-[vf-breathe_5s_ease-in-out_infinite]"
                style={{ background: "radial-gradient(circle, hsl(var(--vf-mint) / 0.32), transparent 70%)" }}
                aria-hidden="true"
              />
              <Avatar className="relative w-full h-full ring-2 ring-vf-mint/30">
                {targetAvatar ? (
                  <AvatarImage src={targetAvatar} alt={targetName} />
                ) : null}
                <AvatarFallback className="bg-vf-ink text-vf-text font-serif">
                  {avatarInitial}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="min-w-0">
              <h2 className="font-serif font-normal text-[17px] leading-tight text-vf-text truncate" data-testid="text-twin-name">
                {targetName}
              </h2>
              <p className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-vf-mint shrink-0" style={{ boxShadow: "0 0 6px hsl(var(--vf-mint))" }} />
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.14em] text-vf-mint"
                  data-testid="text-twin-status"
                >
                  {twinPossessive} twin · learning
                </span>
              </p>
            </div>
          </div>
        </div>
        {targetUserId && (
          <button
            onClick={handleRequestMatch}
            disabled={createMatch.isPending}
            className="vf-btn-primary shrink-0 rounded-full bg-vf-ember text-vf-ink font-semibold text-sm px-4 h-10 hover:bg-[var(--vf-ember-soft)] disabled:opacity-50 transition-colors btn-press"
            data-testid="button-request-match"
          >
            Ask to meet {meetName}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="messages-container">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
              data-testid={`message-${msg.sender}-${msg.id}`}
            >
              {msg.sender === "ai" && (
                <Avatar className="h-8 w-8 mr-2 mt-1 shrink-0 ring-1 ring-vf-mint">
                  {targetAvatar ? (
                    <AvatarImage src={targetAvatar} alt={targetName} />
                  ) : null}
                  <AvatarFallback className="bg-vf-ink text-vf-text text-xs font-serif">
                    {avatarInitial}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="flex flex-col gap-1 max-w-[75%]">
                <div
                  className={`px-4 py-3 text-sm leading-relaxed ${
                    msg.sender === "user"
                      ? "rounded-[18px] rounded-br-[6px] bg-vf-ember text-[hsl(var(--vf-ink))] font-medium"
                      : "rounded-[18px] rounded-bl-[6px] border border-vf-mint/[0.22] bg-vf-mint/[0.09] text-vf-text"
                  }`}
                >
                  {msg.text}
                </div>
                {msg.sender === "user" && (
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-vf-faint">
                      {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <StatusIndicator status={msg.status} />
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap gap-2 pl-10"
            data-testid="suggested-questions"
          >
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => handleSend(q)}
                className="rounded-full border border-vf-ember/50 text-vf-ember text-xs px-3 py-1.5 hover:bg-vf-ember/10 transition-colors"
                data-testid={`chip-suggested-${q.slice(0, 12)}`}
              >
                {q}
              </button>
            ))}
          </motion.div>
        )}

        <AnimatePresence>
          {isTyping && (
            <motion.div
              key="typing-indicator"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15 }}
              className="flex justify-start"
              data-testid="typing-indicator"
            >
              <Avatar className="h-8 w-8 mr-2 mt-1 shrink-0 ring-1 ring-vf-mint">
                {targetAvatar ? (
                  <AvatarImage src={targetAvatar} alt={targetName} />
                ) : null}
                <AvatarFallback className="bg-vf-ink text-vf-text text-xs font-serif">
                  {avatarInitial}
                </AvatarFallback>
              </Avatar>
              <div className="rounded-[18px] rounded-bl-[6px] border border-vf-mint/[0.22] bg-vf-mint/[0.09] p-3 flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-vf-mint rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-vf-mint rounded-full animate-bounce [animation-delay:100ms]" />
                  <span className="w-1.5 h-1.5 bg-vf-mint rounded-full animate-bounce [animation-delay:200ms]" />
                </div>
                <span className="text-xs text-vf-muted">Responding…</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-vf-ink border-t border-vf-line">
        <form
          className="flex gap-2 max-w-4xl mx-auto items-center"
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          data-testid="form-send-message"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask about ${meetName}…`}
            className="flex-1 rounded-full bg-vf-text/5 border-vf-line text-vf-text"
            disabled={isStreaming}
            data-testid="input-message"
          />
          <Button
            type="submit"
            size="icon"
            className="rounded-full bg-vf-mint text-vf-ink hover:bg-[var(--vf-mint-vivid)] disabled:opacity-50"
            disabled={!input.trim() || isStreaming}
            data-testid="button-send"
          >
            {isStreaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
