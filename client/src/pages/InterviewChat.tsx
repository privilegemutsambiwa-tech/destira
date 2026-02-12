import { useState, useEffect, useRef } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useInterviewChat } from "@/hooks/use-interactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brain, Send, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";

interface Message {
    id: number;
    text: string;
    sender: 'user' | 'ai';
    timestamp: Date;
}

export default function InterviewChat({ params }: { params: { id: string } }) {
  const [messages, setMessages] = useState<Message[]>([
      { id: 1, text: "Hi! I'm Sarah's AI Twin. I'm here to see if we'd be a good match. Ask me anything about her values, hobbies, or life goals!", sender: 'ai', timestamp: new Date() }
  ]);
  const [input, setInput] = useState("");
  const chatMutation = useInterviewChat(Number(params.id));
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();

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
            text: response.response, // Assuming API returns { response: string }
            sender: 'ai',
            timestamp: new Date()
        };
        setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
        console.error("Chat failed", error);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white">
        {/* Header */}
        <div className="bg-white border-b border-purple-100 px-4 py-3 flex items-center gap-4 sticky top-0 z-10">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/interviews")}>
                <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white">
                    <Brain className="w-5 h-5" />
                </div>
                <div>
                    <h2 className="font-bold text-sm">Sarah's AI Twin</h2>
                    <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Online
                    </p>
                </div>
            </div>
        </div>

        {/* Chat Area */}
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
                    `}>
                        {msg.text}
                    </div>
                </motion.div>
            ))}
            {chatMutation.isPending && (
                <div className="flex justify-start">
                    <div className="bg-white border border-purple-100 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex gap-1">
                        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
                        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce delay-75" />
                        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce delay-150" />
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-purple-100">
            <form 
                className="flex gap-2 max-w-4xl mx-auto"
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            >
                <Input 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about her values..."
                    className="flex-1 rounded-full border-purple-200 focus-visible:ring-primary h-12 px-6"
                />
                <Button 
                    type="submit" 
                    size="icon" 
                    disabled={!input.trim() || chatMutation.isPending}
                    className="h-12 w-12 rounded-full bg-primary hover:bg-primary/90 shadow-md"
                >
                    <Send className="w-5 h-5" />
                </Button>
            </form>
        </div>
    </div>
  );
}
