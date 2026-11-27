// Discover: the stories row at the top of the deck.

import { useState, useMemo, useEffect } from "react";
import { Plus, Check } from "lucide-react";
import { useFeedStories } from "@/hooks/use-interactions";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { StoryViewer, OwnStoryViewer, AddStoryButton } from "@/components/story-viewer";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import type { User } from "@shared/models/auth";

export function StoriesCarousel() {
  const { data: stories } = useFeedStories();
  const { user } = useAuth();
  const typedUser = user as User | null;
  // Just the id, not a value snapshot — so a like/comment/view invalidating
  // the feed query actually reaches the still-open viewer instead of it
  // rendering whatever `stories` array looked like the moment it was tapped.
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [showOwnStoryViewer, setShowOwnStoryViewer] = useState(false);
  const [showStoryCreator, setShowStoryCreator] = useState(false);

  const { data: myStories } = useQuery<any[]>({
    queryKey: ["/api/stories/mine"],
    queryFn: async () => {
      const res = await fetch("/api/stories/mine", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const hasMyStories = myStories && myStories.length > 0;
  const myPhotoUrl = typedUser?.profileImageUrl || "";
  const myName = typedUser?.firstName || "You";
  const myOwnStories: any[] = hasMyStories ? myStories : [];

  const grouped = useMemo(() => {
    if (!stories || stories.length === 0) return [];
    const byUser: Record<string, { userId: string; displayName: string; photoUrl: string; isOfficial: boolean; stories: any[] }> = {};
    stories.forEach((s: any) => {
      if (!byUser[s.userId]) {
        byUser[s.userId] = { userId: s.userId, displayName: s.displayName || "User", photoUrl: s.photoUrl || "", isOfficial: !!s.isOfficial, stories: [] };
      }
      byUser[s.userId].stories.push(s);
    });
    // Destira's own posts play in the order they went out through the day.
    for (const g of Object.values(byUser)) {
      if (g.isOfficial) g.stories.sort((a: any, b: any) => String(a.publishAt).localeCompare(String(b.publishAt)));
    }
    const groups = Object.values(byUser);
    // Anyone with at least one story you haven't opened yet sorts to the
    // front (in the server's newest-first order among themselves); everyone
    // whose stories are all already viewed rotates to the back, in that same
    // relative order. A stable sort (guaranteed by the spec since ES2019)
    // makes this a clean partition rather than a real re-sort.
    const hasUnviewed = (g: { stories: any[] }) => g.stories.some((s) => !s.viewedByMe);
    const sorted = [...groups].sort((a, b) => (hasUnviewed(b) ? 1 : 0) - (hasUnviewed(a) ? 1 : 0));
    // The official Destira status always leads the row.
    return [...sorted.filter((g) => g.isOfficial), ...sorted.filter((g) => !g.isOfficial)];
  }, [stories]);

  const viewingGroup = viewingUserId ? grouped.find((g) => g.userId === viewingUserId) || null : null;

  const STORY_SIZE = 72;

  // Only when there's something new to watch (docs/destira-upgrade-prompt.md
  // §7.4): a row of rings you've already seen just pushes the person down.
  // Adding your own story lives on Profile too. Stays up while a story is
  // open, so watching the last new one doesn't pull the viewer out from
  // under you.
  const anyUnseen = grouped.some((g) => g.stories.some((s: any) => !s.viewedByMe));
  const busy = !!viewingUserId || showOwnStoryViewer || showStoryCreator;
  const [shownOnce, setShownOnce] = useState(false);
  useEffect(() => { if (anyUnseen) setShownOnce(true); }, [anyUnseen]);
  if (!anyUnseen && !busy && !shownOnce) return null;

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-hide" data-testid="stories-carousel">
        {hasMyStories ? (
          <button
            onClick={() => setShowOwnStoryViewer(true)}
            className="flex flex-col items-center gap-1.5 shrink-0"
            data-testid="story-own-ring"
          >
            <div
              className="p-[2.5px] rounded-full story-ring-active"
              style={{ width: `${STORY_SIZE}px`, height: `${STORY_SIZE}px` }}
            >
              <div className="w-full h-full rounded-full overflow-hidden" style={{ background: "var(--vf-surface2)" }}>
                <Avatar className="w-full h-full">
                  {myPhotoUrl ? (
                    <AvatarImage src={myPhotoUrl} alt={myName} />
                  ) : (
                    <AvatarFallback style={{ background: "var(--vf-surface2)", color: "hsl(var(--vf-text))", fontSize: "14px" }}>
                      {myName[0]}
                    </AvatarFallback>
                  )}
                </Avatar>
              </div>
            </div>
            <span
              style={{
                fontSize: "11px",
                maxWidth: `${STORY_SIZE}px`,
                textAlign: "center",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "var(--vf-muted)",
                fontWeight: 600,
              }}
            >
              Your Story
            </span>
          </button>
        ) : (
          <button
            className="flex flex-col items-center gap-1.5 shrink-0"
            onClick={() => setShowStoryCreator(true)}
            data-testid="story-add-slot"
          >
            <div
              className="rounded-full flex items-center justify-center"
              style={{
                width: `${STORY_SIZE}px`,
                height: `${STORY_SIZE}px`,
                border: "2px dashed rgba(255,255,255,0.2)",
                background: "transparent",
              }}
            >
              <Plus className="w-5 h-5" style={{ color: "var(--vf-muted)" }} />
            </div>
            <span style={{ fontSize: "11px", color: "var(--vf-muted)" }}>Add</span>
          </button>
        )}

        {grouped.map((u) => {
          const hasUnviewed = u.stories.some((s: any) => !s.viewedByMe);
          return (
          <button
            key={u.userId}
            onClick={() => setViewingUserId(u.userId)}
            className="flex flex-col items-center gap-1.5 shrink-0"
            data-testid={`story-avatar-${u.userId}`}
          >
            <div className={`${hasUnviewed ? "story-ring-active" : "story-ring-inactive"} p-[2.5px] rounded-full`} style={{ width: `${STORY_SIZE}px`, height: `${STORY_SIZE}px` }}>
              <div className="w-full h-full rounded-full overflow-hidden" style={{ background: "var(--vf-surface2)" }}>
                <Avatar className="w-full h-full">
                  {u.photoUrl ? (
                    <AvatarImage src={u.photoUrl} alt={u.displayName} />
                  ) : (
                    <AvatarFallback style={{ background: "var(--vf-elevated)", color: "hsl(var(--vf-text))", fontSize: "14px" }}>
                      {u.displayName[0]}
                    </AvatarFallback>
                  )}
                </Avatar>
              </div>
            </div>
            <span
              className="inline-flex items-center gap-1"
              style={{ fontSize: "11px", color: u.isOfficial ? "hsl(var(--vf-text))" : "var(--vf-muted)", fontWeight: u.isOfficial ? 600 : undefined, maxWidth: `${STORY_SIZE}px`, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {u.displayName.split(" ")[0]}
              {u.isOfficial && (
                <span
                  className="inline-flex items-center justify-center w-3 h-3 rounded-full shrink-0"
                  style={{ background: "#FF6B4A" }}
                  aria-label="Official"
                >
                  <Check className="w-2 h-2" style={{ color: "#0C0910" }} strokeWidth={4} />
                </span>
              )}
            </span>
          </button>
          );
        })}
      </div>

      {viewingGroup && (
        <StoryViewer
          stories={viewingGroup.stories}
          initialIndex={0}
          onClose={() => setViewingUserId(null)}
          userName={viewingGroup.displayName}
          profileImageUrl={viewingGroup.photoUrl}
        />
      )}

      {showOwnStoryViewer && hasMyStories && (
        <OwnStoryViewer
          stories={myOwnStories}
          onClose={() => setShowOwnStoryViewer(false)}
          onAddStory={() => { setShowOwnStoryViewer(false); setShowStoryCreator(true); }}
          userName={myName}
          profileImageUrl={myPhotoUrl}
        />
      )}

      {showStoryCreator && (
        <AddStoryButton
          open={showStoryCreator}
          onOpenChange={setShowStoryCreator}
          onStoryAdded={() => setShowStoryCreator(false)}
        />
      )}
    </>
  );
}
