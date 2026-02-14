import { useState } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Coffee, Mountain, BookOpen, UtensilsCrossed, Sparkles, Send, ArrowLeft, Loader2 } from "lucide-react";
import { useGroups, useJoinGroup, useGroupMessages, useSendGroupMessage, useGroup } from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

const GROUP_ICONS: Record<string, any> = {
  "Morning Coffee": Coffee,
  "Adventure Seekers": Mountain,
  "Book Club": BookOpen,
  "Foodies Unite": UtensilsCrossed,
  "Mindfulness & Growth": Sparkles,
};

export default function Lounge() {
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const { data: groups, isLoading } = useGroups();
  const { toast } = useToast();

  if (activeGroupId !== null) {
    return <GroupChat groupId={activeGroupId} onBack={() => setActiveGroupId(null)} />;
  }

  return (
    <LayoutShell>
      <div className="text-center mb-12">
        <h1 className="text-4xl font-display font-bold mb-4" data-testid="text-lounge-title">Serendipity Lounge</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Connect organically in interest-based groups. Chat with anonymous nicknames and discover unexpected connections.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups?.map((group: any) => {
            const Icon = GROUP_ICONS[group.name] || Users;
            return (
              <GroupCard
                key={group.id}
                icon={Icon}
                name={group.name}
                description={group.description}
                members={group.memberCount || 0}
                onJoin={() => setActiveGroupId(group.id)}
              />
            );
          })}
        </div>
      )}
    </LayoutShell>
  );
}

function GroupCard({ icon: Icon, name, description, members, onJoin }: {
  icon: any, name: string, description: string, members: number, onJoin: () => void
}) {
  return (
    <div
      className="bg-white p-6 rounded-2xl border border-purple-100 shadow-sm cursor-pointer group"
      onClick={onJoin}
      data-testid={`card-group-${name.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-primary">
          <Icon className="w-6 h-6" />
        </div>
        <div className="text-xs font-semibold bg-gray-100 px-2 py-1 rounded-full text-gray-600">
          {members} members
        </div>
      </div>
      <h3 className="font-bold text-lg mb-2">{name}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function GroupChat({ groupId, onBack }: { groupId: number; onBack: () => void }) {
  const [input, setInput] = useState("");
  const { data: group } = useGroup(groupId);
  const { data: messages, isLoading: msgsLoading } = useGroupMessages(groupId);
  const sendMessage = useSendGroupMessage(groupId);
  const joinGroup = useJoinGroup();
  const { user } = useAuth();
  const { toast } = useToast();
  const [hasJoined, setHasJoined] = useState(false);

  const isMember = group?.members?.some((m: any) => m.userId === user?.id) || hasJoined;

  const handleJoin = async () => {
    try {
      await joinGroup.mutateAsync(groupId);
      setHasJoined(true);
      toast({ title: "Joined!", description: `You're now part of ${group?.name}. You got an anonymous nickname!` });
    } catch (e: any) {
      if (e.message?.includes("Already")) {
        setHasJoined(true);
      } else {
        toast({ title: "Error", description: "Failed to join group.", variant: "destructive" });
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const text = input;
    setInput("");
    try {
      await sendMessage.mutateAsync(text);
    } catch (e) {
      toast({ title: "Error", description: "Must join group first.", variant: "destructive" });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      <div className="bg-white border-b border-purple-100 px-4 py-3 flex items-center gap-4 sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-lounge">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="font-bold text-sm" data-testid="text-group-name">{group?.name || "Group"}</h2>
          <p className="text-xs text-muted-foreground">{group?.memberCount || 0} members</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
        {msgsLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : messages && messages.length > 0 ? (
          messages.map((msg: any) => {
            const isMe = msg.userId === user?.id;
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div className="max-w-[80%]">
                  {!isMe && (
                    <span className="text-xs text-purple-600 font-medium ml-3 mb-1 block">{msg.nickname || "Anonymous"}</span>
                  )}
                  <div className={`
                    rounded-2xl px-5 py-3 shadow-sm text-sm leading-relaxed
                    ${isMe
                      ? 'bg-primary text-white rounded-tr-none'
                      : 'bg-white border border-purple-100 text-gray-800 rounded-tl-none'
                    }
                  `}>
                    {msg.content}
                  </div>
                </div>
              </motion.div>
            );
          })
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg font-medium mb-2">Welcome to {group?.name}!</p>
            <p className="text-sm">Be the first to start the conversation.</p>
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-purple-100">
        {!isMember ? (
          <Button
            className="w-full h-12 rounded-full"
            onClick={handleJoin}
            disabled={joinGroup.isPending}
            data-testid="button-join-group"
          >
            <Users className="w-5 h-5 mr-2" />
            Join Group to Chat (Anonymous Nickname)
          </Button>
        ) : (
          <form
            className="flex gap-2 max-w-4xl mx-auto"
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Say something nice..."
              className="flex-1 rounded-full border-purple-200 focus-visible:ring-primary h-12 px-6"
              data-testid="input-group-message"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || sendMessage.isPending}
              className="h-12 w-12 rounded-full bg-primary shadow-md"
              data-testid="button-send-group"
            >
              <Send className="w-5 h-5" />
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
