import { useState, useMemo } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useChatThreads } from "@/hooks/use-interactions";
import { useProfile } from "@/hooks/use-profiles";
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
        <h1 className="font-bold text-white" style={{ fontSize: "28px", letterSpacing: "-0.5px" }} data-testid="text-chat-title">
          Chat
        </h1>
        <p className="mt-1" style={{ fontSize: "14px", color: "#9090A8" }}>All your conversations in one place</p>
      </div>

      {/* My Twin featured card — gradient */}
      {profile?.onboardingCompleted && (
        <div
          className="mb-5 p-4 cursor-pointer btn-press"
          style={{
            background: "linear-gradient(135deg, #7C3AED, #EC4899)",
            borderRadius: "20px",
            boxShadow: "0 4px 20px rgba(124,58,237,0.4)",
          }}
          onClick={() => setLocation("/twin-chat?from=/matches")}
          data-testid="card-my-twin"
        >
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.18)" }}
            >
              <Brain className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h2 className="font-bold text-white" style={{ fontSize: "16px" }}>Chat With My Twin</h2>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-0.5"
                  style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}
                >
                  <Shield className="w-3 h-3" />
                  Private
                </span>
              </div>
              <p className="text-sm mb-2 leading-snug" style={{ color: "rgba(255,255,255,0.8)" }}>
                Train, coach, and reflect with your personal AI Twin
              </p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: "#22C55E" }} />
                  <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>Active</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Brain className="w-3 h-3" style={{ color: "rgba(255,255,255,0.65)" }} />
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.8)" }}>Memory enabled</span>
                </div>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 shrink-0" style={{ color: "rgba(255,255,255,0.7)" }} />
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#9090A8" }} />
        <input
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 text-white placeholder-[#9090A8] focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
          style={{
            background: "#1A1A24",
            border: "1px solid #2E2E42",
            borderRadius: "12px",
            height: "44px",
            fontSize: "14px",
          }}
          data-testid="input-search-chats"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-5">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setActiveFilter(f.value)}
            className="px-4 py-1.5 text-sm font-medium transition-colors btn-press"
            style={
              activeFilter === f.value
                ? {
                    background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                    color: "#FFFFFF",
                    borderRadius: "100px",
                    border: "none",
                  }
                : {
                    background: "transparent",
                    color: "#9090A8",
                    borderRadius: "100px",
                    border: "1px solid #2E2E42",
                  }
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
                className="flex items-center gap-3 px-1 py-4 cursor-pointer rounded-xl transition-colors"
                style={{
                  borderBottom: idx < filteredThreads.length - 1 ? "1px solid #2E2E42" : "none",
                }}
                data-testid={`card-thread-${thread.id}`}
              >
                <Avatar
                  className="shrink-0"
                  style={{ width: "48px", height: "48px", borderRadius: "12px" }}
                >
                  <AvatarImage src={thread.avatar} alt={thread.name} />
                  <AvatarFallback
                    style={{ borderRadius: "12px", background: "#242433", color: "#9090A8" }}
                  >
                    {thread.name?.[0] || "?"}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-white text-sm truncate">{thread.name}</span>
                    {thread.lastMessageAt && (
                      <span className="text-xs shrink-0" style={{ color: "#9090A8" }}>
                        {formatRelativeTime(thread.lastMessageAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-sm truncate" style={{ fontSize: "13px", color: "#9090A8" }}>
                      {thread.lastMessage || "No messages yet"}
                    </p>
                    {thread.unreadCount > 0 && (
                      <span
                        className="shrink-0 text-xs font-bold text-white rounded-full px-1.5 py-0.5 min-w-[20px] text-center"
                        style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)", fontSize: "10px" }}
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
        style={{ background: "rgba(124,58,237,0.15)" }}
      >
        <MessageCircle className="w-8 h-8" style={{ color: "#7C3AED" }} />
      </div>
      <h3 className="font-bold mb-2 text-white" style={{ fontSize: "20px" }}>
        No conversations yet
      </h3>
      <p className="max-w-xs mx-auto mb-6" style={{ fontSize: "14px", color: "#9090A8" }}>
        Go to Discover to start meeting people.
      </p>
      <button
        onClick={() => setLocation("/discover")}
        className="font-semibold btn-press px-8 py-3 text-white"
        style={{
          background: "linear-gradient(135deg, #7C3AED, #EC4899)",
          height: "48px",
          fontSize: "15px",
          borderRadius: "14px",
          border: "none",
          boxShadow: "0 4px 20px rgba(124,58,237,0.4)",
        }}
        data-testid="button-go-discover"
      >
        Discover People
      </button>
    </div>
  );
}
