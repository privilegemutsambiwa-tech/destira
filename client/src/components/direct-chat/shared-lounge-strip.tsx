import { useState } from "react";
import { useLocation } from "wouter";
import { Users, X } from "lucide-react";
import { useSuggestedLounges } from "@/hooks/use-profiles";

// A lower-pressure first step than a cold 1:1 thread: if this pair already
// shares Lounges, point at them; otherwise suggest ones the other person is
// in that overlap the viewer's interests, or a curated one as a last
// resort. Dismissible for this one conversation only (local state).
export function SharedLoungeStrip({ otherUserId, otherName }: { otherUserId?: string; otherName: string }) {
  const [, setLocation] = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const { lounges } = useSuggestedLounges(otherUserId);

  if (dismissed || !otherUserId || lounges.length === 0) return null;

  const top = lounges[0];
  const intro =
    top.reason === "mutual" ? (
      lounges.length > 1 ? (
        <>You're both in a few Lounges. Say hi there too.</>
      ) : (
        <>You're both in <span className="text-vf-text">{top.name}</span>. Say hi there too.</>
      )
    ) : top.reason === "their-interest" ? (
      lounges.length > 1 ? (
        <>{otherName} is in a few Lounges that look like your kind of thing.</>
      ) : (
        <>{otherName} is in <span className="text-vf-text">{top.name}</span>. Looks like your kind of thing.</>
      )
    ) : (
      <><span className="text-vf-text">{top.name}</span> could be a good place to meet {otherName} in a group first.</>
    );

  return (
    <div
      className="mx-4 mt-3 rounded-[16px] border border-vf-line bg-vf-surface px-4 py-3 flex items-start justify-between gap-3"
      data-testid="strip-shared-lounge"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <Users className="w-4 h-4 text-vf-faint shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="vf-small text-vf-muted">{intro}</p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {lounges.map((l) => (
              <button
                key={l.id}
                onClick={() => setLocation(`/lounge/group/${l.id}`)}
                className="text-[13px] px-2.5 py-1 rounded-full border border-vf-line text-vf-text hover:border-vf-text/25 transition-colors"
                data-testid={`link-shared-lounge-${l.id}`}
              >
                {l.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-vf-faint hover:text-vf-text transition-colors shrink-0 -mr-1 -mt-0.5 w-8 h-8 flex items-center justify-center"
        aria-label="Dismiss"
        data-testid="button-dismiss-shared-lounge"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
