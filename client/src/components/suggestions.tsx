// Somewhere to go from an empty screen (Part M): rather than "nothing here",
// the next useful thing. Three people from the member's own Discover deck, or
// the rooms that are busy where they live. Each block keeps its height while
// it loads and shows nothing at all when it has nothing real to show.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronRight } from "lucide-react";
import type { LoungeDiscover } from "@shared/lounge";
import { useDiscoverProfiles, useGroups } from "@/hooks/use-interactions";
import { withFrom } from "@/lib/from-route";
import { VfAvatar, VfSkeleton } from "@/components/ui-vf";

function Rows({ title, testId, loading, children }: { title: string; testId: string; loading: boolean; children: React.ReactNode }) {
  return (
    <section className="w-full max-w-[440px] mx-auto text-left" data-testid={testId} aria-busy={loading || undefined}>
      <div className="vf-label text-vf-faint mb-2">{title}</div>
      <ul className="rounded-[18px] border border-vf-line overflow-hidden bg-vf-surface">{children}</ul>
    </section>
  );
}

function Row({ onOpen, avatar, name, line, testId }: { onOpen: () => void; avatar: React.ReactNode; name: string; line: string; testId: string }) {
  return (
    <li className="border-b border-vf-line last:border-b-0">
      <button onClick={onOpen} className="vf-press w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-vf-text/[0.04] transition-colors" data-testid={testId}>
        {avatar}
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-vf-text truncate">{name}</span>
          <span className="block text-[13px] text-vf-muted truncate">{line}</span>
        </span>
        <ChevronRight className="w-4 h-4 text-vf-faint shrink-0" aria-hidden="true" />
      </button>
    </li>
  );
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <li key={i} className="border-b border-vf-line last:border-b-0 flex items-center gap-3 px-4 py-3">
          <VfSkeleton className="w-11 h-11 rounded-full shrink-0" />
          <span className="flex-1 flex flex-col gap-1.5">
            <VfSkeleton className="h-4 w-1/2" />
            <VfSkeleton className="h-3 w-3/4" />
          </span>
        </li>
      ))}
    </>
  );
}

/** Three people from the member's Discover deck, each with why they might fit. */
export function PeopleWhoFit({ from, title = "Three people who fit", className }: { from: string; title?: string; className?: string }) {
  const [, setLocation] = useLocation();
  const { data, isPending } = useDiscoverProfiles("all");
  const people = (data ?? []).slice(0, 3);
  if (!isPending && people.length === 0) return null;
  return (
    <div className={className}>
      <Rows title={title} testId="suggest-people" loading={isPending}>
        {isPending ? (
          <SkeletonRows />
        ) : (
          people.map((p: any) => {
            const name = `${p.displayName || "Someone"}${p.age ? `, ${p.age}` : ""}`;
            const why = Array.isArray(p.reasons) && p.reasons[0]?.text ? p.reasons[0].text : p.location || "On Discover now";
            return (
              <Row
                key={p.userId}
                onOpen={() => setLocation(withFrom(`/u/${p.userId}`, from))}
                avatar={<VfAvatar src={p.coverPhotoUrl || p.user?.profileImageUrl} name={p.displayName} seed={p.userId} size={44} />}
                name={name}
                line={why}
                testId={`suggest-person-${p.userId}`}
              />
            );
          })
        )}
      </Rows>
    </div>
  );
}

/** The busiest rooms the member isn't in, their own area's first. */
export function RoomsNearYou({ className, exclude = [] }: { className?: string; exclude?: number[] }) {
  const [, setLocation] = useLocation();
  const { data: groups, isPending } = useGroups(undefined, "all");
  const { data: discover } = useQuery<LoungeDiscover>({ queryKey: ["/api/lounge/discover"], staleTime: 60_000 });
  const area = discover?.myArea ?? null;
  const rooms = useMemo(() => {
    const here = (g: any) => Number(!!area && String(g.locationLabel ?? "").toLowerCase().includes(area.toLowerCase()));
    return (groups ?? [])
      .filter((g: any) => !g.isMember && !exclude.includes(g.id))
      .sort((a: any, b: any) => here(b) - here(a) || (b.memberCount || 0) - (a.memberCount || 0))
      .slice(0, 3);
  }, [groups, area, exclude]);
  if (!isPending && rooms.length === 0) return null;
  return (
    <div className={className}>
      <Rows title={area ? `Popular in ${area}` : "Popular rooms"} testId="suggest-rooms" loading={isPending}>
        {isPending ? (
          <SkeletonRows />
        ) : (
          rooms.map((g: any) => (
            <Row
              key={g.id}
              onOpen={() => setLocation(`/lounge/group/${g.id}`)}
              avatar={<VfAvatar src={g.iconUrl} name={g.name} seed={String(g.id)} size={44} square />}
              name={g.name}
              line={`${g.memberCount || 0} ${g.memberCount === 1 ? "member" : "members"}${g.locationLabel ? ` · ${g.locationLabel}` : ""}`}
              testId={`suggest-room-${g.id}`}
            />
          ))
        )}
      </Rows>
    </div>
  );
}
