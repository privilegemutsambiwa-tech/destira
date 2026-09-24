import { useLocation } from "wouter";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, X } from "lucide-react";
import { useStoryViewers, useStoryLikers } from "@/hooks/use-interactions";
import { withFrom } from "@/lib/from-route";

interface Engager {
  userId: string;
  displayName: string;
  photoUrl: string | null;
  viewedAt?: string;
  likedAt?: string;
}

interface StoryEngagersSheetProps {
  storyId: number;
  kind: "viewers" | "likers";
  onClose: () => void;
}

// Frames 3b (free) / 3c (paid): free tier gets the count and an honest gold
// upsell line, paid tier gets the names and photos. Never a blurred row —
// below Spark the list is simply empty, matching how /api/likes/incoming
// already handles "someone asked but you can't see who" everywhere else.
export function StoryEngagersSheet({ storyId, kind, onClose }: StoryEngagersSheetProps) {
  const [, setLocation] = useLocation();
  const viewersQuery = useStoryViewers(kind === "viewers" ? storyId : null);
  const likersQuery = useStoryLikers(kind === "likers" ? storyId : null);
  const { data, isLoading } = kind === "viewers" ? viewersQuery : likersQuery;

  const count: number = data?.count ?? 0;
  const engagers: Engager[] = kind === "viewers" ? data?.viewers ?? [] : data?.likers ?? [];
  const seeStoryEngagers: boolean = data?.seeStoryEngagers ?? false;
  const title = kind === "viewers" ? "Viewed by" : "Liked by";

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center"
      style={{ background: "rgba(12,9,16,0.72)" }}
      onClick={onClose}
      data-testid={`sheet-story-${kind}`}
    >
      <div
        className="w-full max-w-md p-6 flex flex-col"
        style={{
          background: "#14101C",
          borderRadius: "26px 26px 0 0",
          border: "1px solid rgba(255,255,255,0.09)",
          maxHeight: "70vh",
          paddingBottom: "calc(24px + env(safe-area-inset-bottom))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 style={{ fontFamily: '"Instrument Serif", serif', fontWeight: 400, color: "#F5F0EA", fontSize: "22px" }}>
            {title} <span style={{ color: "#7E7690" }}>{count}</span>
          </h2>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-full"
            style={{ background: "rgba(255,255,255,0.08)", color: "#F5F0EA" }}
            onClick={onClose}
            data-testid={`button-close-${kind}-sheet`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#A79FB4" }} />
          </div>
        ) : !seeStoryEngagers ? (
          <div
            className="p-5"
            style={{ background: "#161220", borderRadius: "18px", border: "1px solid rgba(233,196,106,0.3)" }}
            data-testid="card-story-engagers-upsell"
          >
            <p className="text-[15px]" style={{ color: "#F5F0EA" }}>
              <span style={{ fontFamily: '"Instrument Serif", serif', fontSize: "22px" }}>{count}</span>{" "}
              {count === 1 ? "person has" : "people have"} {kind === "viewers" ? "viewed" : "liked"} this story.
            </p>
            <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: "#A79FB4" }}>
              Spark shows you who — names, photos, the whole profile.
            </p>
            <button
              className="mt-3 inline-flex items-center justify-center rounded-full font-semibold h-9 px-4 text-[13px]"
              style={{ background: "#E9C46A", color: "#14101C" }}
              onClick={() => setLocation(withFrom(`/plans?feature=see_story_engagers`, window.location.pathname))}
              data-testid="button-story-engagers-see-plans"
            >
              See plans
            </button>
          </div>
        ) : engagers.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: "#7E7690" }}>
            {kind === "viewers" ? "No one has viewed this yet." : "No likes yet."}
          </p>
        ) : (
          <div className="overflow-y-auto flex flex-col gap-1">
            {engagers.map((e) => (
              <div key={e.userId} className="flex items-center gap-3 py-2.5" data-testid={`row-${kind}-${e.userId}`}>
                <Avatar className="w-10 h-10">
                  <AvatarImage src={e.photoUrl ?? undefined} alt={e.displayName} />
                  <AvatarFallback style={{ background: "rgba(255,255,255,0.08)", color: "#F5F0EA" }}>
                    {e.displayName?.[0]?.toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[15px]" style={{ color: "#F5F0EA" }}>{e.displayName}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
