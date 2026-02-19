import { useState, useEffect, useRef, useCallback } from "react";
import { useCreateMatch } from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Send, ArrowLeft, Bot, Sparkles, Loader2, Check, CheckCheck } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

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
    return <Loader2 className="w-3 h-3 text-primary-foreground/50 animate-spin" />;
  }
  if (status === "sent") {
    return <Check className="w-3 h-3 text-primary-foreground/60" />;
  }
  return <CheckCheck className="w-3 h-3 text-primary-foreground/80" />;
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

        if (interview.transcript) {
          try {
            const history: { role: string; content: string }[] = JSON.parse(interview.transcript);
            const restored: Message[] = history.map((h, idx) => ({
              id: idx + 1,
              text: h.content,
              sender: h.role === "user" ? "user" as const : "ai" as const,
              timestamp: new Date(),
              status: "delivered" as const,
            }));
            setMessages(restored);
          } catch {
            setMessages([{
              id: 1,
              text: `Hi! I'm ${name}'s AI Twin. I'm here to help you see if we'd be a great match. Ask me anything!`,
              sender: "ai",
              timestamp: new Date(),
              status: "delivered",
            }]);
          }
        } else {
          setMessages([{
            id: 1,
            text: `Hi! I'm ${name}'s AI Twin. I'm here to help you see if we'd be a great match. Ask me anything about ${name.toLowerCase() === "their" ? "them" : name} - their values, hobbies, life goals, or what they're looking for!`,
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

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMsg: Message = {
      id: Date.now(),
      text: input,
      sender: "user",
      timestamp: new Date(),
      status: "sending",
    };

    setMessages(prev => [...prev, userMsg]);
    const currentInput = input;
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

  return (
    <div className="h-screen flex flex-col bg-background" data-testid="interview-chat-page">
      <div className="bg-card border-b px-4 py-3 flex items-center justify-between gap-2 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/interviews")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <Avatar>
              {targetAvatar ? (
                <AvatarImage src={targetAvatar} alt={targetName} />
              ) : null}
              <AvatarFallback className="gradient-bg text-white font-bold">
                {avatarInitial}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-sm" data-testid="text-twin-name">{targetName}'s AI Twin</h2>
                <Badge variant="secondary" className="text-[10px]">
                  <Bot className="w-3 h-3 mr-1" />
                  AI Twin
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span data-testid="text-twin-status">Online</span>
              </p>
            </div>
          </div>
        </div>
        {targetUserId && (
          <Button
            variant="outline"
            onClick={handleRequestMatch}
            disabled={createMatch.isPending}
            data-testid="button-request-match"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Request Match
          </Button>
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
                <Avatar className="h-8 w-8 mr-2 mt-1 shrink-0">
                  {targetAvatar ? (
                    <AvatarImage src={targetAvatar} alt={targetName} />
                  ) : null}
                  <AvatarFallback className="gradient-bg text-white text-xs font-bold">
                    {avatarInitial}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="flex flex-col gap-1 max-w-[75%]">
                <div
                  className={`
                    rounded-md px-4 py-3 text-sm leading-relaxed
                    ${msg.sender === "user"
                      ? "gradient-bg text-white rounded-tr-none"
                      : "bg-card border text-card-foreground rounded-tl-none"
                    }
                  `}
                >
                  {msg.text}
                </div>
                {msg.sender === "user" && (
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-muted-foreground">
                      {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <StatusIndicator status={msg.status} />
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

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
              <Avatar className="h-8 w-8 mr-2 mt-1 shrink-0">
                {targetAvatar ? (
                  <AvatarImage src={targetAvatar} alt={targetName} />
                ) : null}
                <AvatarFallback className="gradient-bg text-white text-xs font-bold">
                  {avatarInitial}
                </AvatarFallback>
              </Avatar>
              <Card className="border">
                <CardContent className="p-3 flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:100ms]" />
                    <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:200ms]" />
                  </div>
                  <span className="text-xs text-muted-foreground">Twin is thinking...</span>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-background border-t">
        <form
          className="flex gap-2 max-w-4xl mx-auto items-center"
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          data-testid="form-send-message"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask about ${targetName}'s values, interests...`}
            className="flex-1"
            disabled={isStreaming}
            data-testid="input-message"
          />
          <Button
            type="submit"
            size="icon"
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
