import { useState, useEffect, useRef } from "react";
import { useDirectMessages, useSendDirectMessage, useMatches } from "@/hooks/use-interactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, ArrowLeft, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useKeyboardScroll } from "@/hooks/use-keyboard-scroll";
import { motion } from "framer-motion";

export default function DirectChat({ params }: { params: { matchId: string } }) {
  const matchId = Number(params.matchId);
  const [input, setInput] = useState("");
  const { data: messages, isLoading } = useDirectMessages(matchId);
  const sendMessage = useSendDirectMessage(matchId);
  const { data: matches } = useMatches();
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();

  const match = matches?.find((m: any) => m.id === matchId);
  const otherName = match?.otherProfile?.displayName || "Match";

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);
  useKeyboardScroll(scrollToBottom);

  const handleSend = async () => {
    if (!input.trim()) return;
    const text = input;
    setInput("");
    try {
      await sendMessage.mutateAsync(text);
    } catch (error) {
      console.error("Failed to send:", error);
    }
  };

  return (
    <div className="h-dvh flex flex-col bg-vf-ink">
      <div className="border-b border-vf-line px-4 py-3 flex items-center gap-4 sticky top-0 z-10 bg-vf-ink">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/matches")} data-testid="button-back">
          <ArrowLeft className="w-5 h-5 text-vf-text" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-lg bg-vf-surface2 text-vf-text">
            {otherName[0]}
          </div>
          <div>
            <h2 className="text-sm text-vf-text" data-testid="text-chat-name">{otherName}</h2>
            <p className="text-xs font-medium flex items-center gap-1.5" style={{ color: "#22C55E" }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#22C55E" }} /> Online
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-6 h-6 animate-spin text-vf-ember" />
          </div>
        ) : messages && messages.length > 0 ? (
          messages.map((msg: any) => {
            const isMe = msg.senderId === user?.id;
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-4 py-2.5 text-sm leading-relaxed ${
                    isMe
                      ? "rounded-[18px] rounded-br-[6px] bg-vf-ember text-vf-ink font-medium"
                      : "rounded-[18px] rounded-bl-[6px] border border-vf-line bg-vf-surface text-vf-text"
                  }`}
                  data-testid={`message-${msg.id}`}
                >
                  {msg.content}
                </div>
              </motion.div>
            );
          })
        ) : (
          <div className="text-center py-12">
            <p className="text-lg text-vf-text mb-2">Say hello to {otherName}!</p>
            <p className="text-sm text-vf-muted">You're now matched. Start the conversation.</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-vf-line bg-vf-ink">
        <form
          className="flex gap-2 max-w-4xl mx-auto"
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Message ${otherName}...`}
            className="flex-1 rounded-full h-12 px-6 bg-white/5 border-vf-line text-vf-text"
            data-testid="input-message"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || sendMessage.isPending}
            className="h-12 w-12 rounded-full bg-vf-ember text-vf-ink hover:bg-[var(--vf-ember-soft)]"
            data-testid="button-send"
          >
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
