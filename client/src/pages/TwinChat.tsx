import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Sparkles,
  Send,
  Brain,
  Shield,
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
  CheckCheck,
  MessageCircle,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { useTwinMemory, useTwinStructuredProfile, useExtractTwinProfile } from "@/hooks/use-interactions";
import { useKeyboardScroll } from "@/hooks/use-keyboard-scroll";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";

type MessageStatus = "sending" | "sent" | "delivered";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: MessageStatus;
  timestamp: Date;
  quickReplies?: string[];
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function StatusIndicator({ status }: { status: MessageStatus }) {
  if (status === "sending") {
    return <Loader2 className="w-3 h-3 animate-spin text-vf-faint" />;
  }
  if (status === "sent") {
    return <Check className="w-3 h-3 text-vf-faint" />;
  }
  return <CheckCheck className="w-3 h-3 text-vf-ember" />;
}

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex justify-start"
      data-testid="typing-indicator"
    >
      <div className="max-w-[80%]">
        <div className="flex items-center gap-1 ml-3 mb-1">
          <Brain className="w-3 h-3 text-vf-mint" />
          <span className="text-xs text-vf-mint font-medium">Your Twin</span>
        </div>
        <div className="rounded-[18px] rounded-bl-[6px] border border-vf-mint/25 bg-vf-mint/10 px-4 py-3 flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <motion.span
              className="w-1.5 h-1.5 rounded-full bg-vf-mint"
              animate={{ opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0 }}
            />
            <motion.span
              className="w-1.5 h-1.5 rounded-full bg-vf-mint"
              animate={{ opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
            />
            <motion.span
              className="w-1.5 h-1.5 rounded-full bg-vf-mint"
              animate={{ opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
            />
          </div>
          <span className="text-xs text-vf-muted">Twin is thinking...</span>
        </div>
      </div>
    </motion.div>
  );
}

// Right-column "trust surface". Two things the redesign brief asks for here
// (per-fact suppress toggles, three boolean boundary switches) have no
// backend behind them yet — twin_memory_facts has no visibility flag, and
// `boundaries` is one AI-extracted sentence, not three togglable topics.
// Rather than ship controls that look functional but do nothing, this shows
// the real facts/boundaries read-only, with the one real action available
// today (re-run extraction) and a link to the real, safely-gated bulk clear
// in Settings instead of a fake per-fact switch.
function TwinTrustPanel({
  memoryFacts,
  memorySummary,
  trainingOptOut,
  onTrainingOptOutChange,
}: {
  memoryFacts: any[];
  memorySummary: string | null;
  trainingOptOut: boolean;
  onTrainingOptOutChange: (v: boolean) => void;
}) {
  const { data: structured } = useTwinStructuredProfile();
  const extractProfile = useExtractTwinProfile();

  const structuredLines: { label: string; value: string }[] = [];
  if (structured?.relationshipGoals) structuredLines.push({ label: "Looking for", value: structured.relationshipGoals });
  if (structured?.boundaries) structuredLines.push({ label: "Boundaries", value: structured.boundaries });
  if (structured?.communicationStyle) structuredLines.push({ label: "Communication style", value: structured.communicationStyle });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[20px] border border-vf-line bg-vf-surface2 p-5">
        <h2 className="font-serif text-xl text-vf-text mb-1">What your twin remembers</h2>
        <p className="text-[13px] text-vf-muted leading-relaxed mb-4">
          Facts your twin has picked up from your conversations.
        </p>
        <div className="flex flex-wrap gap-2">
          {memoryFacts.length > 0 ? (
            memoryFacts.slice(0, 12).map((fact: any, i: number) => (
              <span
                key={i}
                className="text-[13px] px-3 py-1.5 rounded-full border border-vf-mint/30 bg-vf-mint/10 text-vf-mint"
                data-testid={`memory-fact-${i}`}
              >
                {typeof fact === "string" ? fact : fact.content || fact.fact || fact.factText || ""}
              </span>
            ))
          ) : (
            <p className="text-[13px] text-vf-faint">Nothing learned yet — keep chatting.</p>
          )}
        </div>
        {memorySummary && (
          <p className="text-[12.5px] text-vf-muted leading-relaxed mt-4 pt-4 border-t border-vf-line" data-testid="text-memory-summary">
            {memorySummary}
          </p>
        )}
        <Link href="/settings">
          <a className="inline-block text-[12.5px] text-vf-faint hover:text-vf-text underline mt-4" data-testid="link-manage-memory">
            Manage or clear this memory →
          </a>
        </Link>
      </div>

      <div className="rounded-[20px] border border-vf-line bg-vf-surface2 p-5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="font-serif text-xl text-vf-text">About your twin</h2>
          <button
            onClick={() => extractProfile.mutate()}
            disabled={extractProfile.isPending}
            className="flex items-center gap-1.5 text-[12px] text-vf-mint hover:text-vf-text disabled:opacity-50"
            data-testid="button-reextract-profile"
          >
            {extractProfile.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
        </div>
        {structuredLines.length > 0 ? (
          <div className="flex flex-col gap-3 mt-3">
            {structuredLines.map((line) => (
              <div key={line.label}>
                <div className="text-[11px] uppercase tracking-[0.1em] text-vf-faint mb-1">{line.label}</div>
                <p className="text-[13.5px] text-vf-text leading-relaxed">{line.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-vf-faint mt-3">
            Chat a bit more, then hit Refresh to have your twin summarize what it's picked up.
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-vf-line">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-vf-faint" />
            <span className="text-[12.5px] text-vf-muted">Training opt-out</span>
          </div>
          <Switch
            checked={trainingOptOut}
            onCheckedChange={onTrainingOptOutChange}
            data-testid="switch-training-optout"
          />
        </div>
      </div>
    </div>
  );
}

export default function TwinChat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [trainingOptOut, setTrainingOptOut] = useState(false);
  const { data: memory } = useTwinMemory();
  const [woLocation, setLocation] = useLocation();

  const backRoute = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from");
    if (from && from.startsWith("/")) return from;
    return "/matches";
  }, [woLocation]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [initialized, setInitialized] = useState(false);
  const streamingMsgRef = useRef<string>("");
  const abortRef = useRef<AbortController | null>(null);

  const memoryData = memory as any;
  const memoryMessages = memoryData?.messages || (Array.isArray(memory) ? memory : []);
  const memoryFacts = memoryData?.facts || [];
  const memorySummary = memoryData?.summary || null;

  useEffect(() => {
    if (memoryMessages.length > 0 && !initialized) {
      const hist: ChatMessage[] = [...memoryMessages].reverse().map((m: any, i: number) => ({
        id: `hist-${i}`,
        role: m.role === "user" ? "user" as const : "assistant" as const,
        content: m.message || m.content || "",
        status: "delivered" as MessageStatus,
        timestamp: new Date(m.createdAt || Date.now() - (memoryMessages.length - i) * 60000),
      }));
      setMessages(hist);
      setInitialized(true);
    }
  }, [memoryMessages, initialized]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);
  useKeyboardScroll(scrollToBottom);

  const handleSend = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;
    setInput("");
    setQuickReplies([]);

    const userMsgId = `user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: "user",
      content: text.trim(),
      status: "sending",
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    const assistantMsgId = `assistant-${Date.now()}`;
    streamingMsgRef.current = "";

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch("/api/twin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), stream: true }),
        credentials: "include",
        signal: controller.signal,
      });

      if (!res.ok) throw new Error("Failed to chat");

      setMessages(prev =>
        prev.map(m => m.id === userMsgId ? { ...m, status: "sent" as MessageStatus } : m)
      );

      const contentType = res.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream") || contentType.includes("text/plain")) {
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No reader");

        const decoder = new TextDecoder();
        let buffer = "";
        let firstDelta = true;

        setIsTyping(true);

        let assistantAdded = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const jsonStr = trimmed.slice(6);
            if (jsonStr === "[DONE]") continue;

            try {
              const event = JSON.parse(jsonStr);

              if (event.type === "typing") {
                setIsTyping(true);
              } else if (event.type === "delta" && event.content) {
                if (firstDelta) {
                  setIsTyping(false);
                  firstDelta = false;
                }
                streamingMsgRef.current += event.content;
                const currentContent = streamingMsgRef.current;

                if (!assistantAdded) {
                  assistantAdded = true;
                  setMessages(prev => [
                    ...prev,
                    {
                      id: assistantMsgId,
                      role: "assistant",
                      content: currentContent,
                      status: "sent",
                      timestamp: new Date(),
                    },
                  ]);
                } else {
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === assistantMsgId ? { ...m, content: currentContent } : m
                    )
                  );
                }
              } else if (event.type === "done") {
                setIsTyping(false);
                const finalContent = event.content || streamingMsgRef.current;
                if (!assistantAdded) {
                  setMessages(prev => [
                    ...prev,
                    {
                      id: assistantMsgId,
                      role: "assistant",
                      content: finalContent,
                      status: "delivered",
                      timestamp: new Date(),
                    },
                  ]);
                } else {
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === assistantMsgId
                        ? { ...m, content: finalContent, status: "delivered" as MessageStatus }
                        : m
                    )
                  );
                }
                setMessages(prev =>
                  prev.map(m =>
                    m.id === userMsgId ? { ...m, status: "delivered" as MessageStatus } : m
                  )
                );
              } else if (event.type === "quick_replies" && event.replies) {
                const uniqueReplies = Array.from(new Set(event.replies as string[]));
                setQuickReplies(uniqueReplies);
                if (assistantAdded) {
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === assistantMsgId ? { ...m, quickReplies: event.replies } : m
                    )
                  );
                }
              }
            } catch {
              // skip malformed JSON
            }
          }
        }

        if (!assistantAdded && streamingMsgRef.current) {
          setMessages(prev => [
            ...prev,
            {
              id: assistantMsgId,
              role: "assistant",
              content: streamingMsgRef.current,
              status: "delivered",
              timestamp: new Date(),
            },
          ]);
        }
      } else {
        const data = await res.json();
        setIsTyping(false);
        setMessages(prev => [
          ...prev,
          {
            id: assistantMsgId,
            role: "assistant",
            content: data.response || data.content || "I'm here for you.",
            status: "delivered",
            timestamp: new Date(),
          },
        ]);
        setMessages(prev =>
          prev.map(m =>
            m.id === userMsgId ? { ...m, status: "delivered" as MessageStatus } : m
          )
        );
        if (data.quickReplies) {
          setQuickReplies(Array.from(new Set(data.quickReplies as string[])));
        }
      }
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setIsTyping(false);
      setMessages(prev => [
        ...prev,
        {
          id: assistantMsgId,
          role: "assistant",
          content: "I'm here for you. Let's try again.",
          status: "delivered",
          timestamp: new Date(),
        },
      ]);
      setMessages(prev =>
        prev.map(m =>
          m.id === userMsgId ? { ...m, status: "delivered" as MessageStatus } : m
        )
      );
    } finally {
      setIsStreaming(false);
      setIsTyping(false);
      abortRef.current = null;
    }
  }, [isStreaming]);

  const handleQuickReply = (reply: string) => {
    handleSend(reply);
  };

  return (
    <div className="h-dvh flex flex-col bg-vf-ink">
      <div className="border-b border-vf-line px-4 py-3 flex items-center gap-3 sticky top-0 z-10 bg-vf-ink shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation(backRoute)}
          data-testid="button-back-twin"
        >
          <ArrowLeft className="w-5 h-5 text-vf-text" />
        </Button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative w-9 h-9 shrink-0">
            <div
              className="absolute inset-0 rounded-full animate-[vf-breathe_5s_ease-in-out_infinite]"
              style={{ background: "radial-gradient(circle at 35% 30%, var(--vf-mint-vivid), #2E7F6B)" }}
            />
          </div>
          <div className="min-w-0">
            <h2 className="font-serif text-base text-vf-text truncate" data-testid="text-twin-title">
              Your Twin
            </h2>
            <p className="text-xs text-vf-mint">Self-reflection &amp; growth</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMemoryOpen(!memoryOpen)}
          data-testid="button-toggle-memory"
        >
          {memoryOpen ? <ChevronUp className="w-4 h-4 text-vf-text" /> : <ChevronDown className="w-4 h-4 text-vf-text" />}
        </Button>
      </div>

      <AnimatePresence>
        {memoryOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-vf-line md:hidden shrink-0"
          >
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              <TwinTrustPanel
                memoryFacts={memoryFacts}
                memorySummary={memorySummary}
                trainingOptOut={trainingOptOut}
                onTrainingOptOutChange={setTrainingOptOut}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && !isTyping && (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-vf-mint/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-vf-mint" />
                </div>
                <h3 className="font-serif text-lg mb-2 text-vf-text" data-testid="text-empty-title">
                  Your AI Twin is ready
                </h3>
                <p className="text-sm text-vf-muted max-w-md mx-auto">
                  Chat with your AI Twin to explore your personality, get insights about
                  yourself, and grow. Your twin learns from every conversation.
                </p>
                {memoryFacts.length > 0 && (
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <MessageCircle className="w-4 h-4 text-vf-faint" />
                    <span className="text-xs text-vf-faint">
                      {memoryFacts.length} facts remembered from past chats
                    </span>
                  </div>
                )}
              </div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((msg) => {
                const isMe = msg.role === "user";
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                    data-testid={`message-${msg.id}`}
                  >
                    <div className="max-w-[80%]">
                      {!isMe && (
                        <div className="flex items-center gap-1 ml-3 mb-1">
                          <Brain className="w-3 h-3 text-vf-mint" />
                          <span className="text-xs text-vf-mint font-medium">Your Twin</span>
                        </div>
                      )}
                      <div
                        className={`px-4 py-2.5 text-sm leading-relaxed ${
                          isMe
                            ? "rounded-[18px] rounded-br-[6px] bg-vf-ember text-vf-ink font-medium"
                            : "rounded-[18px] rounded-bl-[6px] border border-vf-mint/25 bg-vf-mint/10 text-vf-text"
                        }`}
                      >
                        {msg.content}
                      </div>
                      <div
                        className={`flex items-center gap-1 mt-1 ${
                          isMe ? "justify-end mr-1" : "ml-3"
                        }`}
                      >
                        <span className="text-[10px] text-vf-faint">
                          {formatRelativeTime(msg.timestamp)}
                        </span>
                        {isMe && (
                          <StatusIndicator status={msg.status} />
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}

              {isTyping && <TypingIndicator key="typing" />}
            </AnimatePresence>

            {quickReplies.length > 0 && !isStreaming && messages.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-wrap gap-1.5 ml-1"
                data-testid="quick-replies-container"
              >
                {quickReplies.map((reply, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickReply(reply)}
                    className="text-xs px-3 py-1.5 rounded-full border border-vf-mint/30 bg-vf-mint/10 text-vf-mint hover:bg-vf-mint/20 transition-colors"
                    data-testid={`chip-quick-reply-bottom-${i}`}
                  >
                    {reply}
                  </button>
                ))}
              </motion.div>
            )}
          </div>

          <div className="p-4 border-t border-vf-line bg-vf-ink shrink-0">
            <form
              className="flex gap-2 max-w-4xl mx-auto"
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(input);
              }}
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Tell your twin something true..."
                className="flex-1 rounded-full bg-white/5 border-vf-line text-vf-text"
                disabled={isStreaming}
                data-testid="input-twin-message"
              />
              <Button
                type="submit"
                size="icon"
                className="rounded-full bg-vf-mint text-vf-ink hover:bg-[#A9EDD6] disabled:opacity-50"
                disabled={!input.trim() || isStreaming}
                data-testid="button-send-twin"
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

        <aside className="hidden md:block w-[340px] shrink-0 border-l border-vf-line p-5 overflow-y-auto">
          <TwinTrustPanel
            memoryFacts={memoryFacts}
            memorySummary={memorySummary}
            trainingOptOut={trainingOptOut}
            onTrainingOptOutChange={setTrainingOptOut}
          />
        </aside>
      </div>
    </div>
  );
}
