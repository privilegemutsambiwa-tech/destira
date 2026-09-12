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
        <h1 className="font-serif font-normal text-[clamp(26px,6vw,32px)] text-vf-text" data-testid="text-chat-title">
          Chat
        </h1>
        <p className="mt-1 text-sm text-vf-muted">All your conversations in one place</p>
      </div>

      {/* My Twin featured card */}
      {profile?.onboardingCompleted && (
        <div
          className="mb-5 p-4 cursor-pointer btn-press rounded-[20px] border border-vf-mint/25 bg-vf-mint/[0.08] hover:bg-vf-mint/[0.11] transition-colors"
          onClick={() => setLocation("/twin-chat?from=/matches")}
          data-testid="card-my-twin"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 bg-vf-mint/15">
              <Brain className="w-7 h-7 text-vf-mint" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h2 className="font-serif text-lg text-vf-text">Chat With My Twin</h2>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 border border-vf-mint/30 text-vf-mint">
                  <Shield className="w-3 h-3" />
                  Private
                </span>
              </div>
              <p className="text-sm mb-2 leading-snug text-vf-muted">
                Train, coach, and reflect with your personal AI Twin
              </p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: "#22C55E" }} />
                  <span className="text-xs font-medium text-vf-muted">Active</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Brain className="w-3 h-3 text-vf-faint" />
                  <span className="text-xs text-vf-muted">Memory enabled</span>
                </div>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 shrink-0 text-vf-mint" />
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vf-faint" />
        <input
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-11 pl-9 pr-4 text-sm rounded-xl bg-vf-surface border border-vf-line text-vf-text placeholder:text-vf-faint focus:outline-none focus:ring-1 focus:ring-vf-mint/50"
          data-testid="input-search-chats"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-5">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setActiveFilter(f.value)}
            className={`px-4 py-1.5 text-sm font-medium rounded-full border transition-colors btn-press ${
              activeFilter === f.value
                ? "bg-vf-ember border-transparent text-vf-ink"
                : "border-vf-line text-vf-soft hover:border-vf-text/25"
            }`}
            data-testid={`filter-${f.value}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Thread list */}
      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-vf-mint" />
        </div>
      ) : filteredThreads.length > 0 ? (
        <div className="space-y-0">
          {filteredThreads.map((thread: any, idx: number) => {
            const isTwin = thread.type === "ai_twin_interview";
            return (
              <Link key={thread.id} href={thread.href}>
                <div
                  className={`flex items-center gap-3 px-1 py-4 cursor-pointer rounded-xl transition-colors hover:bg-vf-text/[0.03] ${
                    idx < filteredThreads.length - 1 ? "border-b border-vf-line" : ""
                  }`}
                  data-testid={`card-thread-${thread.id}`}
                >
                  <Avatar className={`shrink-0 w-12 h-12 rounded-xl ${isTwin ? "ring-1 ring-vf-mint/40" : ""}`}>
                    <AvatarImage src={thread.avatar} alt={thread.name} />
                    <AvatarFallback className="rounded-xl bg-vf-surface2 text-vf-muted">
                      {isTwin ? <Brain className="w-5 h-5 text-vf-mint" /> : thread.name?.[0] || "?"}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-vf-text truncate">{thread.name}</span>
                      {thread.lastMessageAt && (
                        <span className="text-xs shrink-0 text-vf-faint">
                          {formatRelativeTime(thread.lastMessageAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-[13px] truncate text-vf-muted">
                        {thread.lastMessage || "No messages yet"}
                      </p>
                      {thread.unreadCount > 0 && (
                        <span
                          className="shrink-0 font-mono text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center bg-vf-ember text-vf-ink"
                          data-testid={`badge-unread-${thread.id}`}
                        >
                          {thread.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
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
      <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-vf-mint/10">
        <MessageCircle className="w-8 h-8 text-vf-mint" />
      </div>
      <h3 className="font-serif text-xl mb-2 text-vf-text">
        No conversations yet
      </h3>
      <p className="max-w-xs mx-auto mb-6 text-sm text-vf-muted">
        Go to Discover to start meeting people.
      </p>
      <button
        onClick={() => setLocation("/discover")}
        className="font-semibold btn-press px-8 h-12 rounded-full bg-vf-ember text-vf-ink hover:bg-[var(--vf-ember-soft)] transition-colors"
        data-testid="button-go-discover"
      >
        Discover People
      </button>
    </div>
  );
}
