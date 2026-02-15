import { useState, useRef, useEffect } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Send, Loader2, Brain, Sparkles } from "lucide-react";
import { useTwinChat, useTwinMemory } from "@/hooks/use-interactions";
import { useLocation } from "wouter";
import { motion } from "framer-motion";

export default function TwinChat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const twinChat = useTwinChat();
  const { data: memory } = useTwinMemory();
  const [, setLocation] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (memory && !initialized) {
      const hist = memory.reverse().map((m: any) => ({ role: m.role, content: m.message }));
      setMessages(hist);
      setInitialized(true);
    }
  }, [memory, initialized]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || twinChat.isPending) return;
    const text = input;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: text }]);

    try {
      const result = await twinChat.mutateAsync(text);
      setMessages(prev => [...prev, { role: "assistant", content: result.response }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: "I'm here for you. Let's try again." }]);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10 bg-background">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/profile")} data-testid="button-back-twin">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-primary/10 rounded-md">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-sm" data-testid="text-twin-title">Chat with My Twin</h2>
            <p className="text-xs text-muted-foreground">Self-reflection & growth</p>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h3 className="font-bold text-lg mb-2">Your AI Twin is ready</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Chat with your AI Twin to explore your personality, get insights about yourself, and grow. Your twin learns from every conversation.
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          const isMe = msg.role === "user";
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
            >
              <div className="max-w-[80%]">
                {!isMe && (
                  <div className="flex items-center gap-1 ml-3 mb-1">
                    <Brain className="w-3 h-3 text-primary" />
                    <span className="text-xs text-primary font-medium">Your Twin</span>
                  </div>
                )}
                <div className={`
                  rounded-md px-4 py-2.5 text-sm leading-relaxed
                  ${isMe
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border text-card-foreground'
                  }
                `}>
                  {msg.content}
                </div>
              </div>
            </motion.div>
          );
        })}

        {twinChat.isPending && (
          <div className="flex justify-start">
            <div className="bg-card border rounded-md px-4 py-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t bg-background">
        <form
          className="flex gap-2 max-w-4xl mx-auto"
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your twin anything..."
            className="flex-1"
            data-testid="input-twin-message"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || twinChat.isPending}
            className="btn-press"
            data-testid="button-send-twin"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
