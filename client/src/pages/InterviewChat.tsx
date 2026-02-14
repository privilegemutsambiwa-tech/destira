import { useState, useEffect, useRef } from "react";
import { useInterviewChat } from "@/hooks/use-interactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brain, Send, ArrowLeft, Heart } from "lucide-react";
import { useLocation } from "wouter";
import { useCreateMatch } from "@/hooks/use-interactions";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

export default function InterviewChat({ params }: { params: { id: string } }) {
  const interviewId = Number(params.id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [targetName, setTargetName] = useState("Their");
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const chatMutation = useInterviewChat(interviewId);
  const createMatch = useCreateMatch();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    fetch(`/api/interviews`, { credentials: "include" })
      .then(r => r.json())
      .then(interviews => {
        const interview = interviews.find((i: any) => i.id === interviewId);
        if (!interview) return;

        const name = interview.targetProfile?.displayName || "Their";
        setTargetName(name);
        setTargetUserId(interview.targetProfile?.userId || interview.targetId);

        if (interview.transcript) {
          try {
            const history: { role: string; content: string }[] = JSON.parse(interview.transcript);
            const restored: Message[] = history.map((h, idx) => ({
              id: idx + 1,
              text: h.content,
              sender: h.role === "user" ? "user" as const : "ai" as const,
              timestamp: new Date(),
            }));
            setMessages(restored);
          } catch (e) {
            setMessages([{
              id: 1,
              text: `Hi! I'm ${name}'s AI Twin. I'm here to help you see if we'd be a great match. Ask me anything!`,
              sender: 'ai',
              timestamp: new Date()
            }]);
          }
        } else {
          setMessages([{
            id: 1,
            text: `Hi! I'm ${name}'s AI Twin. I'm here to help you see if we'd be a great match. Ask me anything about ${name.toLowerCase() === "their" ? "them" : name} - their values, hobbies, life goals, or what they're looking for!`,
            sender: 'ai',
            timestamp: new Date()
          }]);
        }
      })
      .catch(() => {});
  }, [interviewId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now(),
      text: input,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");

    try {
      const response = await chatMutation.mutateAsync(input);
      const aiMsg: Message = {
        id: Date.now() + 1,
        text: response.response,
        sender: 'ai',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
      console.error("Chat failed", error);
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

  return (
    <div className="h-screen flex flex-col bg-white">
      <div className="bg-white border-b border-purple-100 px-4 py-3 flex items-center justify-between gap-2 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/interviews")} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm" data-testid="text-twin-name">{targetName}'s AI Twin</h2>
              <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Online
              </p>
            </div>
          </div>
        </div>
        {targetUserId && (
          <Button
            variant="outline"
            onClick={handleRequestMatch}
            disabled={createMatch.isPending}
            className="rounded-full border-pink-200 text-pink-600"
            data-testid="button-request-match"
          >
            <Heart className="w-4 h-4 mr-2" />
            Request Match
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`
              max-w-[80%] rounded-2xl px-5 py-3 shadow-sm text-sm leading-relaxed
              ${msg.sender === 'user'
                ? 'bg-primary text-white rounded-tr-none'
                : 'bg-white border border-purple-100 text-gray-800 rounded-tl-none'
              }
            `} data-testid={`message-${msg.sender}-${msg.id}`}>
              {msg.text}
            </div>
          </motion.div>
        ))}
        {chatMutation.isPending && (
          <div className="flex justify-start">
            <div className="bg-white border border-purple-100 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex gap-1">
              <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
              <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:75ms]" />
              <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:150ms]" />
            </div>
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
            placeholder={`Ask about ${targetName}'s values...`}
            className="flex-1 rounded-full border-purple-200 focus-visible:ring-primary h-12 px-6"
            data-testid="input-message"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || chatMutation.isPending}
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
