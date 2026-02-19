import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
} from "lucide-react";
import { useTwinMemory } from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profiles";
import { useLocation } from "wouter";
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
    return <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />;
  }
  if (status === "sent") {
    return <Check className="w-3 h-3 text-muted-foreground" />;
  }
  return <CheckCheck className="w-3 h-3 text-primary" />;
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
          <Brain className="w-3 h-3 text-primary" />
          <span className="text-xs text-primary font-medium">Your Twin</span>
        </div>
        <Card className="border">
          <CardContent className="p-3 flex items-center gap-2">
            <div className="flex items-center gap-1">
              <motion.span
                className="w-2 h-2 rounded-full bg-primary"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
              />
              <motion.span
                className="w-2 h-2 rounded-full bg-primary"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0.3 }}
              />
              <motion.span
                className="w-2 h-2 rounded-full bg-primary"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0.6 }}
              />
            </div>
            <span className="text-xs text-muted-foreground">Twin is thinking...</span>
          </CardContent>
        </Card>
      </div>
    </motion.div>
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
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const [, setLocation] = useLocation();
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
                setQuickReplies(event.replies);
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
          setQuickReplies(data.quickReplies);
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

  const userInitial = user?.firstName?.[0] || user?.email?.[0] || "U";

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10 bg-background">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/profile")}
          data-testid="button-back-twin"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2 flex-1">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              <Brain className="w-4 h-4" />
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-bold text-sm" data-testid="text-twin-title">
              Chat with My Twin
            </h2>
            <p className="text-xs text-muted-foreground">Self-reflection & growth</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMemoryOpen(!memoryOpen)}
          data-testid="button-toggle-memory"
        >
          {memoryOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </div>

      <AnimatePresence>
        {memoryOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b"
          >
            <div className="p-4 space-y-3 bg-card/50">
              <div className="flex items-center gap-2 flex-wrap">
                <Brain className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Twin Memory</span>
                {memoryFacts.length > 0 && (
                  <Badge variant="secondary" data-testid="badge-fact-count">
                    {memoryFacts.length} facts learned
                  </Badge>
                )}
              </div>

              {memorySummary && (
                <p className="text-xs text-muted-foreground leading-relaxed" data-testid="text-memory-summary">
                  {memorySummary}
                </p>
              )}

              {memoryFacts.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {memoryFacts.slice(0, 8).map((fact: any, i: number) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="text-[10px]"
                      data-testid={`badge-fact-${i}`}
                    >
                      {typeof fact === "string" ? fact : fact.content || fact.fact || JSON.stringify(fact)}
                    </Badge>
                  ))}
                  {memoryFacts.length > 8 && (
                    <Badge variant="outline" className="text-[10px]">
                      +{memoryFacts.length - 8} more
                    </Badge>
                  )}
                </div>
              )}

              {memoryFacts.length > 0 && (
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-primary animate-pulse" />
                  <span className="text-xs text-muted-foreground">Memory is learning</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-1 border-t">
                <div className="flex items-center gap-2">
                  <Shield className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Training opt-out</span>
                </div>
                <Switch
                  checked={trainingOptOut}
                  onCheckedChange={setTrainingOptOut}
                  data-testid="switch-training-optout"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !isTyping && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h3 className="font-bold text-lg mb-2" data-testid="text-empty-title">
              Your AI Twin is ready
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Chat with your AI Twin to explore your personality, get insights about
              yourself, and grow. Your twin learns from every conversation.
            </p>
            {memoryFacts.length > 0 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <MessageCircle className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
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
                      <Brain className="w-3 h-3 text-primary" />
                      <span className="text-xs text-primary font-medium">Your Twin</span>
                    </div>
                  )}
                  <div
                    className={`rounded-md px-4 py-2.5 text-sm leading-relaxed ${
                      isMe
                        ? "gradient-bg text-white"
                        : "bg-card border text-card-foreground"
                    }`}
                  >
                    {msg.content}
                  </div>
                  <div
                    className={`flex items-center gap-1 mt-1 ${
                      isMe ? "justify-end mr-1" : "ml-3"
                    }`}
                  >
                    <span className="text-[10px] text-muted-foreground">
                      {formatRelativeTime(msg.timestamp)}
                    </span>
                    {isMe && (
                      <StatusIndicator status={msg.status} />
                    )}
                  </div>

                  {!isMe && msg.quickReplies && msg.quickReplies.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2 ml-1">
                      {msg.quickReplies.map((reply, ri) => (
                        <Badge
                          key={ri}
                          variant="outline"
                          className="cursor-pointer text-xs"
                          onClick={() => handleQuickReply(reply)}
                          data-testid={`chip-quick-reply-${ri}`}
                        >
                          {reply}
                        </Badge>
                      ))}
                    </div>
                  )}
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
            className="flex flex-wrap gap-1 ml-1"
            data-testid="quick-replies-container"
          >
            {quickReplies.map((reply, i) => (
              <Badge
                key={i}
                variant="outline"
                className="cursor-pointer text-xs"
                onClick={() => handleQuickReply(reply)}
                data-testid={`chip-quick-reply-bottom-${i}`}
              >
                {reply}
              </Badge>
            ))}
          </motion.div>
        )}
      </div>

      <div className="p-4 border-t bg-background">
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
            placeholder="Ask your twin anything..."
            className="flex-1"
            disabled={isStreaming}
            data-testid="input-twin-message"
          />
          <Button
            type="submit"
            size="icon"
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
  );
}
