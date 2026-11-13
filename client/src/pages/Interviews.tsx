import { useState, useMemo, useEffect } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useChatThreads, useMarkStoryRepliesRead } from "@/hooks/use-interactions";
import { useProfile } from "@/hooks/use-profiles";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Link, useLocation, useSearch } from "wouter";
import { Brain, Shield, ArrowRight } from "lucide-react";
import { EmptyState as VfEmptyState, PageHeader, SearchField, SegmentedControl, VfButton, VfSkeleton } from "@/components/ui-vf";

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
    { label: "Twin", value: "ai_twin" },
    { label: "Story replies", value: "story_replies" },
  ];

  return (
    <LayoutShell>
      {/* Header */}
      <PageHeader title="Chats" subtitle="Everyone you're talking to, and your twin." />

      {/* My Twin featured card — the one card on this page that isn't a
          conversation with another person, so it earns a genuinely
          different treatment: the same breathing mint-glow presence as the
          twin chat screens themselves, not just a tinted rectangle. */}
      {profile?.onboardingCompleted && (
        <div
          className="group mb-6 p-5 cursor-pointer btn-press vf-card rounded-[22px] border border-vf-mint/25 transition-colors hover:border-vf-mint/45"
          style={{ background: "linear-gradient(155deg, hsl(var(--vf-mint) / 0.1), var(--vf-surface2) 72%)" }}
          onClick={() => setLocation("/twin-chat?from=/chats")}
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
      <SearchField
        className="mb-4"
        label="Search chats"
        value={searchQuery}
        onChange={setSearchQuery}
        data-testid="input-search-chats"
      />

      {/* Filter tabs */}
      <SegmentedControl
        className="mb-5"
        label="Show"
        value={activeFilter}
        onChange={setActiveFilter}
        options={filters.map((f) => ({
          value: f.value,
          label: f.label,
          count: f.value === "story_replies" ? repliesUnreadCount : undefined,
          testId: `filter-${f.value}`,
        }))}
      />

      {/* Thread list */}
      {isLoading ? (
        <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Loading chats">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <VfSkeleton className="w-12 h-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <VfSkeleton className="h-4 w-1/3" />
                <VfSkeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredThreads.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {filteredThreads.map((thread: any) => {
            const isTwin = thread.type === "ai_twin_interview";
            const threadHref = `${thread.href}${thread.href.includes("?") ? "&" : "?"}from=/chats`;
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
    <VfEmptyState
      title="No chats yet."
      body="When you match with someone, or ask someone's twin a question, the conversation lands here."
      action={
        <VfButton onClick={() => setLocation("/discover")} data-testid="button-go-discover">
          Go to Discover
        </VfButton>
      }
    />
  );
}
