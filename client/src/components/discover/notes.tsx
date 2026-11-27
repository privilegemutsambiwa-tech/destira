// Discover: the notes under the deck, and the ways to widen a search that ran dry.

import { useDiscoverExpandOptions, useProfileCompletion } from "@/hooks/use-interactions";
import { useTwinReadiness } from "@/hooks/use-onboarding";
import { ScreenNotes, NOTE_PRIORITY, type NoteSpec } from "@/components/ui-vf";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";

/** Discover's notes (docs/destira-upgrade-prompt.md §5.4): one at a time,
 *  below the deck, never above a person. Same server-side dismissals and the
 *  same conditions the three separate strips used to have. */
export function DiscoverNotes() {
  const [, navigate] = useLocation();
  const { data: r } = useTwinReadiness();
  const { data: completion } = useProfileCompletion();
  const nextTask = completion?.tasks.find((t: { completed: boolean }) => !t.completed);
  const notes: NoteSpec[] = [
    {
      kind: "twin_disclosure_intro",
      priority: NOTE_PRIORITY.safety,
      tone: "twin",
      eyebrow: "Your twin",
      body: "Your twin talks to people who are deciding about you. You choose what it may say.",
      action: { label: "Set the boundaries", onClick: () => navigate("/twin-disclosure"), testId: "link-disclosure-intro" },
      testId: "strip-disclosure-intro",
    },
    {
      kind: "discover_readiness_strip",
      priority: NOTE_PRIORITY.setup,
      when: !!r && !r.discoverStripDismissed && r.pct < 50,
      tone: "twin",
      eyebrow: "Your twin",
      body: r
        ? `I'm answering interviews with ${r.answeredCount === 1 ? "one answer" : `${r.answeredCount} answers`} to work from. A few more and I can speak for you properly.`
        : null,
      action: { label: "Answer a few more", onClick: () => navigate("/onboarding"), testId: "link-readiness-strip" },
      testId: "strip-readiness",
    },
    {
      kind: "profile_completion_nudge",
      priority: NOTE_PRIORITY.tip,
      when: !!completion && completion.score < 80,
      eyebrow: `Profile ${completion?.score ?? 0}%`,
      body: (
        <>
          A complete profile gets more likes and shows up more
          {nextTask ? <>: {nextTask.benefit.toLowerCase()}.</> : "."}
        </>
      ),
      action: { label: "Finish your profile", onClick: () => navigate("/profile"), testId: "link-profile-completion" },
      testId: "strip-profile-completion",
    },
  ];
  return <ScreenNotes notes={notes} />;
}

// Shown once someone's evaluated everyone their current distance/age
// preferences allow — offers to widen either, with a real count of how many
// more people that would actually surface, so it's never a blind "try
// widening" guess. Applies through the same POST /api/settings/discovery
// Settings already uses, so this is just another entry point into the one
// real preference-update path, not a parallel one.
export function ExpandSearchOptions({ userLat, userLng }: { userLat: number | null; userLng: number | null }) {
  const { data, isLoading } = useDiscoverExpandOptions(true, userLat, userLng);
  const qc = useQueryClient();
  const { toast } = useToast();
  const apply = useMutation({
    mutationFn: (body: Record<string, number>) => apiRequest("POST", "/api/settings/discovery", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      qc.invalidateQueries({ queryKey: ["/api/profiles/discover"] });
      qc.invalidateQueries({ queryKey: ["/api/profiles/discover/expand-options"] });
      toast({ title: "Search widened" });
    },
    onError: () => toast({ title: "Couldn't update that", variant: "destructive" }),
  });

  if (isLoading || !data || (!data.distance && !data.age)) return null;

  return (
    <div className="mt-6 pt-6 border-t border-vf-line flex flex-col gap-3">
      <p className="text-[13px] text-vf-muted">Nobody left within your current preferences. Want to see more?</p>
      <div className="flex flex-col gap-2">
        {data.distance?.options.map((o) => (
          <button
            key={`distance-${o.km}`}
            onClick={() => apply.mutate({ maxDistanceKm: o.km })}
            disabled={apply.isPending}
            className="h-11 rounded-full border border-vf-line text-[13.5px] text-vf-text hover:border-vf-text/25 transition-colors disabled:opacity-50"
            data-testid={`button-expand-distance-${o.km}`}
          >
            Extend to {o.km}km away <span className="text-vf-muted">(+{o.additionalCount})</span>
          </button>
        ))}
        {data.age?.options.map((o) => (
          <button
            key={`age-${o.min}-${o.max}`}
            onClick={() => apply.mutate({ ageMinPreference: o.min, ageMaxPreference: o.max })}
            disabled={apply.isPending}
            className="h-11 rounded-full border border-vf-line text-[13.5px] text-vf-text hover:border-vf-text/25 transition-colors disabled:opacity-50"
            data-testid={`button-expand-age-${o.min}-${o.max}`}
          >
            Widen age range to {o.min}–{o.max} <span className="text-vf-muted">(+{o.additionalCount})</span>
          </button>
        ))}
      </div>
    </div>
  );
}
