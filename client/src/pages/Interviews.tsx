import { useState, useMemo } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useChatThreads } from "@/hooks/use-interactions";
import { useProfile } from "@/hooks/use-profiles";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Loader2, Search, Sparkles, Brain, Shield, MessageCircle, ArrowRight } from "lucide-react";

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "Just now";
  if (diffHr < 1) return `${diffMin}m ago`;
  if (diffDay < 1) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

type FilterType = "all" | "matches" | "ai_twin";

export default function Interviews() {
  const { data: profile } = useProfile();
  const [, setLocation] = useLocation();
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: threads, isLoading } = useChatThreads(activeFilter);

  const filteredThreads = useMemo(() => {
    if (!threads) return [];
    if (!searchQuery.trim()) return threads;
    return threads.filter((t: any) =>
      t.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [threads, searchQuery]);

  const filters: { label: string; value: FilterType }[] = [
    { label: "All", value: "all" },
    { label: "Matches", value: "matches" },
    { label: "AI Twin", value: "ai_twin" },
  ];

  return (
    <LayoutShell>
      <div className="mb-6">
        <h1 className="text-3xl font-display font-bold" data-testid="text-chat-title">Chat</h1>
        <p className="text-muted-foreground mt-1">All your conversations in one place</p>
      </div>

      {profile?.onboardingCompleted && (
        <Card className="mb-6 hover-elevate cursor-pointer" onClick={() => setLocation("/twin-chat")} data-testid="card-my-twin">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-md gradient-bg flex items-center justify-center text-white shrink-0">
                <Sparkles className="w-7 h-7" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h2 className="font-bold text-lg">Chat With My Twin</h2>
                  <Badge variant="secondary" className="text-xs">
                    <Shield className="w-3 h-3 mr-1" />
                    Private
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Train, coach, and reflect with your personal AI Twin. Your Twin learns from each conversation.
                </p>
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Active
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Brain className="w-3 h-3" />
                    Memory enabled
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon" data-testid="button-chat-my-twin">
                <ArrowRight className="w-5 h-5 text-muted-foreground" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="input-search-chats"
        />
      </div>

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {filters.map((f) => (
          <Badge
            key={f.value}
            variant={activeFilter === f.value ? "default" : "secondary"}
            className={`cursor-pointer toggle-elevate ${activeFilter === f.value ? "toggle-elevated" : ""}`}
            onClick={() => setActiveFilter(f.value)}
            data-testid={`filter-${f.value}`}
          >
            {f.label}
          </Badge>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredThreads.length > 0 ? (
        <div className="grid gap-2">
          {filteredThreads.map((thread: any) => (
            <Link key={thread.id} href={thread.href}>
              <Card
                className="hover-elevate cursor-pointer"
                data-testid={`card-thread-${thread.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={thread.avatar} alt={thread.name} />
                      <AvatarFallback>{thread.name?.[0] || "?"}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold truncate">{thread.name}</span>
                        <Badge variant="outline" className="text-xs no-default-hover-elevate">
                          {thread.type === "match" ? "Match" : "AI Twin"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">
                        {thread.lastMessage || "No messages yet"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {thread.lastMessageAt && (
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(thread.lastMessageAt)}
                        </span>
                      )}
                      {thread.unreadCount > 0 && (
                        <Badge className="text-xs no-default-hover-elevate" data-testid={`badge-unread-${thread.id}`}>
                          {thread.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 px-6 bg-card rounded-md border border-dashed">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-bold font-display mb-2">No conversations yet</h3>
          <p className="text-muted-foreground max-w-md mx-auto mb-6">
            Go to Discover to start meeting people.
          </p>
          <Button size="lg" onClick={() => setLocation("/discover")} className="rounded-full btn-press" data-testid="button-go-discover">
            Discover People
          </Button>
        </div>
      )}
    </LayoutShell>
  );
}
