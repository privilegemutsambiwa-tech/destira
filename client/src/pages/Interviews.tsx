import { useState, useMemo } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useChatThreads } from "@/hooks/use-interactions";
import { useProfile } from "@/hooks/use-profiles";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Link, useLocation } from "wouter";
import { Loader2, Search, Brain, Shield, MessageCircle, ArrowRight } from "lucide-react";

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "now";
  if (diffHr < 1) return `${diffMin}m`;
  if (diffDay < 1) return `${diffHr}h`;
  if (diffDay < 7) return `${diffDay}d`;
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
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display font-bold text-[#1F2937]" style={{ fontSize: "28px" }} data-testid="text-chat-title">
          Chat
        </h1>
        <p className="text-[#6B7280] mt-1" style={{ fontSize: "14px" }}>All your conversations in one place</p>
      </div>

      {/* Featured card: Chat With My Twin — purple background */}
      {profile?.onboardingCompleted && (
        <div
          className="mb-5 rounded-2xl p-4 cursor-pointer"
          style={{ background: "#7C3AED" }}
          onClick={() => setLocation("/twin-chat")}
          data-testid="card-my-twin"
        >
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.2)" }}
            >
              <Brain className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h2 className="font-bold text-white" style={{ fontSize: "16px" }}>Chat With My Twin</h2>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "#EC4899", color: "#fff" }}
                >
                  <Shield className="w-3 h-3 inline mr-0.5" />
                  Private
                </span>
              </div>
              <p className="text-white/80 text-sm mb-2 leading-snug">
                Train, coach, and reflect with your personal AI Twin
              </p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-white/80 text-xs font-medium">Active</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Brain className="w-3 h-3 text-white/70" />
                  <span className="text-white/80 text-xs">Memory enabled</span>
                </div>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-white/70 shrink-0" />
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
        <Input
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 rounded-lg border-0"
          style={{ background: "#F3F4F6", height: "44px" }}
          data-testid="input-search-chats"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-5">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setActiveFilter(f.value)}
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors btn-press"
            style={
              activeFilter === f.value
                ? { background: "#7C3AED", color: "#fff", border: "none" }
                : { background: "transparent", color: "#6B7280", border: "1px solid #E5E7EB" }
            }
            data-testid={`filter-${f.value}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Thread list */}
      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#7C3AED" }} />
        </div>
      ) : filteredThreads.length > 0 ? (
        <div className="space-y-0">
          {filteredThreads.map((thread: any, idx: number) => (
            <Link key={thread.id} href={thread.href}>
              <div
                className="flex items-center gap-3 px-1 py-4 cursor-pointer transition-colors hover:bg-[#F3F4F6] rounded-xl"
                style={{ borderBottom: idx < filteredThreads.length - 1 ? "1px solid #F3F4F6" : "none" }}
                data-testid={`card-thread-${thread.id}`}
              >
                {/* 48px avatar */}
                <Avatar className="shrink-0 rounded-xl" style={{ width: "48px", height: "48px", borderRadius: "8px" }}>
                  <AvatarImage src={thread.avatar} alt={thread.name} />
                  <AvatarFallback style={{ borderRadius: "8px" }}>{thread.name?.[0] || "?"}</AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#1F2937] text-sm truncate">{thread.name}</span>
                    {thread.lastMessageAt && (
                      <span className="text-xs text-[#9CA3AF] shrink-0">{formatRelativeTime(thread.lastMessageAt)}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-sm text-[#6B7280] truncate" style={{ fontSize: "13px" }}>
                      {thread.lastMessage || "No messages yet"}
                    </p>
                    {thread.unreadCount > 0 && (
                      <span
                        className="shrink-0 text-xs font-bold text-white rounded-full px-1.5 py-0.5 min-w-[20px] text-center"
                        style={{ background: "#7C3AED", fontSize: "10px" }}
                        data-testid={`badge-unread-${thread.id}`}
                      >
                        {thread.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </LayoutShell>
  );
}

function EmptyState() {
  const [, setLocation] = useLocation();
  return (
    <div className="text-center py-16 px-6">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
        style={{ background: "#EDE9FE" }}
      >
        <MessageCircle className="w-8 h-8" style={{ color: "#7C3AED" }} />
      </div>
      <h3 className="font-display font-bold mb-2 text-[#1F2937]" style={{ fontSize: "20px" }}>
        No conversations yet
      </h3>
      <p className="text-[#6B7280] max-w-xs mx-auto mb-6" style={{ fontSize: "14px" }}>
        Go to Discover to start meeting people.
      </p>
      <button
        onClick={() => setLocation("/discover")}
        className="font-semibold btn-press px-8 py-3 text-white"
        style={{ background: "#7C3AED", height: "48px", fontSize: "15px", borderRadius: "8px", border: "none" }}
        data-testid="button-go-discover"
      >
        Discover People
      </button>
    </div>
  );
}
