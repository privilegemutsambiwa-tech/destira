import { useState, useMemo, useEffect } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useChatThreads, useMarkStoryRepliesRead } from "@/hooks/use-interactions";
import { useProfile } from "@/hooks/use-profiles";
import { Link, useLocation, useSearch } from "wouter";
import { ChevronRight } from "lucide-react";
import { EmptyState as VfEmptyState, PageHeader, SearchField, SegmentedControl, TwinGlyph, VfAvatar, VfButton, VfSkeleton } from "@/components/ui-vf";
import { wantsFriends } from "@shared/friends";

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

type FilterType = "all" | "matches" | "friends" | "ai_twin" | "story_replies";

function initialFilterFromSearch(search: string): FilterType {
  const value = new URLSearchParams(search).get("filter");
  return value === "matches" || value === "friends" || value === "ai_twin" || value === "story_replies" ? value : "all";
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
    // Friendships live in their own section (Part O), for anyone with Friends on.
    ...(wantsFriends((profile as any)?.lookingFor) ? [{ label: "Friends", value: "friends" as FilterType }] : []),
    { label: "Twin", value: "ai_twin" },
    { label: "Story replies", value: "story_replies" },
  ];

  return (
    <LayoutShell>
      {/* Header */}
      <PageHeader title="Chats" subtitle="Everyone you're talking to, and your twin." />

      {/* Your twin: one slim row, not a big card (§7.8). It's the only row
          here that isn't a conversation with another person. */}
      {profile?.onboardingCompleted && (
        <button
          onClick={() => setLocation("/twin-chat?from=/chats")}
          className="vf-press group w-full mb-5 flex items-center gap-3.5 rounded-[18px] border border-vf-mint/25 bg-vf-mint/[0.06] px-4 py-3 text-left hover:border-vf-mint/45 transition-colors"
          data-testid="card-my-twin"
        >
          <span className="relative w-10 h-10 shrink-0" aria-hidden="true">
            <span
              className="absolute -inset-1 rounded-full motion-safe:animate-[vf-breathe_5s_ease-in-out_infinite]"
              style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--vf-mint-vivid) 40%, transparent), transparent 70%)" }}
            />
            <span
              className="absolute inset-0 rounded-full"
              style={{ background: "radial-gradient(circle at 35% 30%, #D8F6EA, var(--vf-mint-vivid) 38%, #2E7F6B 100%)" }}
            />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-display text-[19px] leading-tight text-vf-text">Your twin</span>
            <span className="block vf-small text-vf-muted truncate">Private. Talk it through, or teach it more about you.</span>
          </span>
          <ChevronRight className="w-4 h-4 text-vf-mint shrink-0 transition-transform group-hover:translate-x-0.5" />
        </button>
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
        <div className="flex flex-col -mx-2">
          {filteredThreads.map((thread: any) => {
            const isTwin = thread.type === "ai_twin_interview";
            const unread = thread.unreadCount > 0;
            const threadHref = `${thread.href}${thread.href.includes("?") ? "&" : "?"}from=/chats`;
            return (
              <Link key={thread.id} href={threadHref}>
                <div
                  className="vf-press flex items-center gap-3.5 px-2 py-3 cursor-pointer rounded-[16px] hover:bg-vf-surface transition-colors duration-150"
                  data-testid={`card-thread-${thread.id}`}
                >
                  <span className="relative shrink-0">
                    <VfAvatar size={52} name={thread.name} seed={thread.partnerId || thread.id} src={thread.avatar ?? undefined} />
                    {isTwin && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-vf-ink flex items-center justify-center"
                        aria-label="Twin conversation"
                      >
                        <TwinGlyph size={14} className="text-vf-mint" />
                      </span>
                    )}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex items-baseline gap-2 min-w-0">
                        <span className={`font-display text-[18px] leading-tight truncate ${unread ? "text-vf-text" : "text-vf-soft"}`}>{thread.name}</span>
                        {thread.kind === "friends" && (
                          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-vf-mint" data-testid={`label-friend-${thread.id}`}>Friend</span>
                        )}
                      </span>
                      {thread.lastMessageAt && (
                        <span className={`font-mono text-[11px] shrink-0 ${unread ? "text-vf-ember" : "text-vf-faint"}`}>
                          {formatRelativeTime(thread.lastMessageAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className={`text-[14px] truncate ${unread ? "text-vf-text font-medium" : "text-vf-muted"}`}>
                        {thread.lastMessage || "No messages yet"}
                      </p>
                      {unread && (
                        <span
                          className="shrink-0 font-mono text-[10.5px] rounded-full px-1.5 min-w-[20px] h-5 inline-flex items-center justify-center bg-vf-ember text-vf-ink"
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
      body="When you and someone both say yes, you can talk here. Asking someone's twin a question starts a chat too."
      action={
        <VfButton onClick={() => setLocation("/discover")} data-testid="button-go-discover">
          Go to Discover
        </VfButton>
      }
    />
  );
}
