import { useState, useMemo, useEffect } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useChatThreads, useMarkStoryRepliesRead } from "@/hooks/use-interactions";
import { useProfile } from "@/hooks/use-profiles";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Link, useLocation, useSearch } from "wouter";
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

type FilterType = "all" | "matches" | "ai_twin" | "story_replies";

function initialFilterFromSearch(search: string): FilterType {
  const value = new URLSearchParams(search).get("filter");
  return value === "matches" || value === "ai_twin" || value === "story_replies" ? value : "all";
}

export default function Interviews() {
  const { data: profile } = useProfile();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [activeFilter, setActiveFilter] = useState<FilterType>(() => initialFilterFromSearch(search));
  const [searchQuery, setSearchQuery] = useState("");

  const { data: threads, isLoading } = useChatThreads(activeFilter);
  // Prefetched regardless of the active tab so the filter pill's unread badge
  // is visible without having to switch to it first.
  const { data: replyThreads } = useChatThreads("story_replies");
  const repliesUnreadCount = (replyThreads || []).filter((t: any) => t.unreadCount > 0).length;
  const markRepliesRead = useMarkStoryRepliesRead();

  useEffect(() => {
    if (activeFilter === "story_replies") markRepliesRead.mutate();
    // Fires once per tab activation, not on every unread-count recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter]);

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
    { label: "Story replies", value: "story_replies" },
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

      {/* My Twin featured card — the one card on this page that isn't a
          conversation with another person, so it earns a genuinely
          different treatment: the same breathing mint-glow presence as the
          twin chat screens themselves, not just a tinted rectangle. */}
      {profile?.onboardingCompleted && (
        <div
          className="group mb-6 p-5 cursor-pointer btn-press vf-card rounded-[22px] border border-vf-mint/25 transition-colors hover:border-vf-mint/45"
          style={{ background: "linear-gradient(155deg, hsl(var(--vf-mint) / 0.1), var(--vf-surface2) 72%)" }}
          onClick={() => setLocation("/twin-chat?from=/interviews")}
          data-testid="card-my-twin"
        >
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 shrink-0">
              <div
                className="absolute -inset-2 rounded-full animate-[vf-breathe_5s_ease-in-out_infinite]"
                style={{ background: "radial-gradient(circle, hsl(var(--vf-mint) / 0.35), transparent 70%)" }}
                aria-hidden="true"
              />
              <div
                className="relative w-full h-full rounded-full flex items-center justify-center"
                style={{ background: "radial-gradient(circle at 35% 30%, var(--vf-mint-vivid), #2E7F6B)" }}
              >
                <Brain className="w-7 h-7 text-vf-ink" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <h2 className="font-serif font-normal text-[20px] text-vf-text">Chat with my twin</h2>
                <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 border border-vf-mint/30 text-vf-mint">
                  <Shield className="w-3 h-3" />
                  Private
                </span>
              </div>
              <p className="text-[13.5px] mb-2.5 leading-snug text-vf-muted">
                Train, coach, and reflect with your personal AI Twin
              </p>
              <div className="flex items-center gap-3.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: "#22C55E", boxShadow: "0 0 6px #22C55E" }} />
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-vf-muted">Active</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Brain className="w-3 h-3 text-vf-faint" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-vf-muted">Memory enabled</span>
                </div>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 shrink-0 text-vf-mint transition-transform duration-150 group-hover:translate-x-1" />
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
          className="w-full h-11 pl-9 pr-4 text-sm rounded-xl bg-vf-surface border border-vf-line text-vf-text placeholder:text-vf-faint outline-none transition-shadow duration-150 focus:ring-2 focus:ring-vf-mint/40"
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
            {f.value === "story_replies" && repliesUnreadCount > 0 && (
              <span
                className={`ml-1.5 font-mono text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] inline-block text-center ${
                  activeFilter === f.value ? "bg-vf-ink text-vf-ember" : "bg-vf-ember text-vf-ink"
                }`}
                data-testid="badge-story-replies-unread"
              >
                {repliesUnreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Thread list */}
      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-vf-mint" />
        </div>
      ) : filteredThreads.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {filteredThreads.map((thread: any) => {
            const isTwin = thread.type === "ai_twin_interview";
            const threadHref = `${thread.href}${thread.href.includes("?") ? "&" : "?"}from=/interviews`;
            return (
              <Link key={thread.id} href={threadHref}>
                <div
                  className="vf-card vf-row flex items-center gap-3.5 px-4 py-3.5 cursor-pointer rounded-[16px] border border-vf-line bg-vf-surface2 transition-colors duration-150"
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
