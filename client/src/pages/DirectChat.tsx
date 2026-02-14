import { useState, useEffect, useRef } from "react";
import { useDirectMessages, useSendDirectMessage, useMatches } from "@/hooks/use-interactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, ArrowLeft, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
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
    <div className="h-screen flex flex-col bg-white">
      <div className="bg-white border-b border-purple-100 px-4 py-3 flex items-center gap-4 sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/matches")} data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-200 to-pink-200 flex items-center justify-center font-bold text-primary">
            {otherName[0]}
          </div>
          <div>
            <h2 className="font-bold text-sm" data-testid="text-chat-name">{otherName}</h2>
            <p className="text-xs text-green-600 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Online
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
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
                <div className={`
                  max-w-[80%] rounded-2xl px-5 py-3 shadow-sm text-sm leading-relaxed
                  ${isMe
                    ? 'bg-primary text-white rounded-tr-none'
                    : 'bg-white border border-purple-100 text-gray-800 rounded-tl-none'
                  }
                `} data-testid={`message-${msg.id}`}>
                  {msg.content}
                </div>
              </motion.div>
            );
          })
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg font-medium mb-2">Say hello to {otherName}!</p>
            <p className="text-sm">You're now matched. Start the conversation.</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-purple-100">
        <form
          className="flex gap-2 max-w-4xl mx-auto"
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Message ${otherName}...`}
            className="flex-1 rounded-full border-purple-200 focus-visible:ring-primary h-12 px-6"
            data-testid="input-message"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || sendMessage.isPending}
            className="h-12 w-12 rounded-full bg-primary shadow-md"
            data-testid="button-send"
          >
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
