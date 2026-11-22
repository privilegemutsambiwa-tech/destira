// Events home (docs/destira-upgrade-prompt.md §7.14): the promise in one
// line, your tickets first (§5.7), then this week as large cards and later
// weeks as a compact list. Search and preferences live in the top bar; host
// is a quiet secondary action.
import { useMarkSeen } from "@/hooks/use-activity";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LayoutShell } from "@/components/layout-shell";
import { EventCard, EventRow } from "@/components/event-row";
import { SeatTicket } from "@/components/seat-ticket";
import {
  useEventsFeed,
  useEventSearch,
  useAttendEvent,
  useCancelAttendance,
  useMySeats,
  searchParamsToQuery,
  type EventSearchParams,
  type EventItem,
} from "@/hooks/use-events";
import { useGroups } from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
import { useGate } from "@/hooks/use-gate";
import { usePaywall } from "@/hooks/use-paywall";
import { EVENT_KINDS, EVENT_PLACE_TYPES } from "@shared/event-taxonomy";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import {
  EmptyState,
  IconButton,
  NOTE_PRIORITY,
  ScreenNotes,
  SearchField,
  VfButton,
  VfSheet,
  VfSkeleton,
} from "@/components/ui-vf";

const DISTANCES = [5, 10, 25, 50] as const;
const WHENS: { value: NonNullable<EventSearchParams["when"]>; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "week", label: "This week" },
  { value: "weekend", label: "This weekend" },
  { value: "month", label: "Next 30 days" },
];

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = (copy.getDay() + 6) % 7; // Monday = 0
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function weekLabel(eventDate: Date, now: Date): string {
  const thisWeekStart = startOfWeek(now);
  const nextWeekStart = new Date(thisWeekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  const weekAfterStart = new Date(nextWeekStart);
  weekAfterStart.setDate(weekAfterStart.getDate() + 7);

  if (eventDate < nextWeekStart) return "This week";
  if (eventDate < weekAfterStart) return "Next week";
  return `Week of ${startOfWeek(eventDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

function parseParams(search: string): EventSearchParams {
  const sp = new URLSearchParams(search);
  const kind = sp.getAll("kind");
  const placeType = sp.getAll("placeType");
  const distanceKm = sp.get("distanceKm");
  const when = sp.get("when");
  return {
    q: sp.get("q") || undefined,
    kind: kind.length ? kind : undefined,
    placeType: placeType.length ? placeType : undefined,
    distanceKm: distanceKm ? Number(distanceKm) : undefined,
    when: when === "week" || when === "weekend" || when === "month" ? when : undefined,
    sober: sp.get("sober") === "true" || undefined,
    stepFree: sp.get("stepFree") === "true" || undefined,
  };
}

function activeCount(p: EventSearchParams): number {
  return (
    (p.q ? 1 : 0) +
    (p.kind?.length ?? 0) +
    (p.placeType?.length ?? 0) +
    (p.distanceKm ? 1 : 0) +
    (p.when && p.when !== "any" ? 1 : 0) +
    (p.sober ? 1 : 0) +
    (p.stepFree ? 1 : 0)
  );
}

function searchSignal(e: EventItem): string {
  return [
    e.kind ? e.kind.toUpperCase() : null,
    e.distanceKm != null ? `${e.distanceKm}KM` : null,
    e.suburb ? e.suburb.toUpperCase() : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`vf-press rounded-full border px-3.5 min-h-[36px] text-[13px] capitalize transition-colors duration-150 ${
        active
          ? "border-vf-ember/50 bg-vf-ember/10 text-vf-text"
          : "border-vf-line text-vf-muted hover:text-vf-text hover:border-vf-text/20"
      }`}
    >
      {label}
    </button>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="vf-label text-vf-faint mb-2.5">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function SectionLabel({ children, sub, tone = "faint" }: { children: React.ReactNode; sub?: string; tone?: "faint" | "text" }) {
  return (
    <div className="mb-3">
      <div className={`vf-label ${tone === "text" ? "text-vf-text" : "text-vf-faint"}`}>{children}</div>
      {sub && <p className="vf-small text-vf-muted mt-1">{sub}</p>}
    </div>
  );
}

function CardSkeletons() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-[24px] border border-vf-line overflow-hidden">
          <VfSkeleton className="h-[188px] rounded-none" />
          <div className="p-4 flex flex-col gap-2">
            <VfSkeleton className="h-6 w-3/4" />
            <VfSkeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Events() {
  useMarkSeen("events");
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: groups } = useGroups();
  const { data: hostGate } = useGate("host_event");
  const paywall = usePaywall();
  const attend = useAttendEvent();
  const cancel = useCancelAttendance();
  const seats = useMySeats();

  const params = useMemo(() => parseParams(search), [search]);
  const count = activeCount(params);
  const searching = count > 0;
  const [sheetOpen, setSheetOpen] = useState(false);

  // debounce what actually hits the search endpoint; URL updates immediately
  const [debounced, setDebounced] = useState(params);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(parseParams(search)), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const feed = useEventsFeed();
  const results = useEventSearch(debounced, activeCount(debounced) > 0);

  const groupNameById = useMemo(() => {
    const map = new Map<number, string>();
    (groups || []).forEach((g: any) => map.set(g.id, g.name));
    return map;
  }, [groups]);

  // Platform-run events get their own section at the top (soonest first) so
  // "something to join" is the first thing a member sees.
  const officialEvents = useMemo(
    () =>
      (feed.data?.events ?? [])
        .filter((e) => e.isOfficial)
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [feed.data],
  );

  const grouped = useMemo(() => {
    const list = (feed.data?.events ?? [])
      .filter((e) => !e.isOfficial)
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    const now = new Date();
    const sections = new Map<string, EventItem[]>();
    for (const event of list) {
      const label = weekLabel(new Date(event.startsAt), now);
      if (!sections.has(label)) sections.set(label, []);
      sections.get(label)!.push(event);
    }
    return Array.from(sections.entries());
  }, [feed.data]);

  const feedEmpty = !feed.isLoading && (feed.data?.events.length ?? 0) === 0;
  const wideCount = useQuery<{ count: number }>({
    queryKey: ["/api/events/count", 100],
    queryFn: async () => {
      const r = await fetch("/api/events/count?distanceKm=100", { credentials: "include" });
      return r.ok ? r.json() : { count: 0 };
    },
    enabled: feedEmpty && !searching,
  });

  const applyParams = (next: EventSearchParams) => {
    const qs = searchParamsToQuery(next);
    setLocation(qs ? `/events?${qs}` : "/events", { replace: true });
  };
  const toggleArr = (key: "kind" | "placeType", v: string) => {
    const cur = params[key] ?? [];
    const arr = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    applyParams({ ...params, [key]: arr.length ? arr : undefined });
  };
  const backToFeed = () => applyParams({});

  const commonRowProps = (event: EventItem) => {
    const isHost = event.hostUserId === user?.id;
    const isPending =
      (attend.isPending && attend.variables?.eventId === event.id) ||
      (cancel.isPending && cancel.variables === event.id);
    return {
      event,
      groupName: event.groupId ? groupNameById.get(event.groupId) : undefined,
      isHost,
      pending: isPending,
      onOpen: () => setLocation(`/events/${event.id}`),
      onAttend: () => attend.mutate({ eventId: event.id, seatModel: event.seatModel }),
      onCancel: () => cancel.mutate(event.id),
      onManage: () => setLocation(`/events/${event.id}`),
    };
  };

  const host = () => paywall.guard("host_event", () => setLocation("/events/host"));
  const hostLocked = hostGate?.ok === false;
  const mySeats = seats.data ?? [];
  const resultCount = results.data?.events.length ?? 0;

  return (
    <LayoutShell>
      <div className="max-w-5xl mx-auto">
        <header className="flex items-start gap-3 mb-5" data-testid="events-header">
          <div className="flex-1 min-w-0">
            <h1 className="vf-display text-vf-text text-[clamp(30px,3.6vw,44px)] leading-[1.05]">The point is the meeting.</h1>
            <p className="vf-body text-vf-muted mt-2 max-w-[52ch]">
              Small, hosted, in real rooms. Your twin flags who's going that you'd get on with.
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0 -mr-2">
            <span className="relative">
              <IconButton label="Search events" onClick={() => setSheetOpen(true)} data-testid="button-toggle-search">
                <Search className="w-5 h-5" />
              </IconButton>
              {count > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-vf-ember text-vf-ink font-mono text-[10px] leading-4 text-center pointer-events-none">
                  {count}
                </span>
              )}
            </span>
            <IconButton label="Event preferences" onClick={() => setLocation("/settings/events?from=/events")} data-testid="button-event-preferences">
              <SlidersHorizontal className="w-5 h-5" />
            </IconButton>
          </div>
        </header>

        <ScreenNotes
          className="mb-6"
          notes={[
            {
              kind: "events_intro_tip",
              priority: NOTE_PRIORITY.tip,
              eyebrow: "How events work",
              body: "Join an event someone else is hosting, or create your own. Tap any event to see when, where and who's going before you decide. Destira Official events are run by us: join one, or offer to lead it.",
              testId: "strip-events-intro",
            },
          ]}
        />

        {mySeats.length > 0 && !searching && (
          <section className="mb-8" data-testid="section-my-seats">
            <SectionLabel tone="text">My seats</SectionLabel>
            <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {mySeats.map((s) => (
                <SeatTicket key={s.id} seat={s} compact />
              ))}
            </div>
          </section>
        )}

        <div className="flex items-center justify-between gap-3 mb-6">
          {searching ? (
            <div className="vf-label text-vf-faint" data-testid="text-result-count">
              {results.isLoading ? "Searching…" : `${resultCount} event${resultCount === 1 ? "" : "s"} · by date`}
            </div>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {searching && (
              <VfButton variant="quiet" size="sm" onClick={backToFeed} data-testid="button-back-to-feed">
                Back to your feed
              </VfButton>
            )}
            <VfButton
              variant="secondary"
              size="sm"
              leading={<Plus className="w-4 h-4" />}
              onClick={host}
              data-testid="button-host-event"
            >
              Host an event
              {hostLocked && (
                <span className="ml-1.5 font-mono text-[10px] uppercase tracking-[0.12em] rounded-full px-1.5 py-0.5 bg-vf-gold/15 text-vf-gold">
                  {hostGate?.requiredTierName || "Flame"}
                </span>
              )}
            </VfButton>
          </div>
        </div>

        {searching ? (
          results.isLoading ? (
            <CardSkeletons />
          ) : resultCount === 0 ? (
            <EmptyState
              testId="events-empty-state"
              title="Nothing matching that yet."
              body="Try fewer filters, or host the thing you'd want to go to."
              action={<VfButton variant="secondary" onClick={() => setSheetOpen(true)}>Change filters</VfButton>}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {results.data!.events.map((event) => (
                <EventRow key={event.id} {...commonRowProps(event)} signalOverride={searchSignal(event) || undefined} />
              ))}
            </div>
          )
        ) : feed.isLoading ? (
          <CardSkeletons />
        ) : feedEmpty ? (
          wideCount.isLoading ? (
            <CardSkeletons />
          ) : (wideCount.data?.count ?? 0) > 0 ? (
            <EmptyState
              testId="events-empty-state"
              title="Your preferences are narrower than Harare right now."
              body="There are events further out. Loosen your preferences to see them."
              action={<VfButton variant="secondary" onClick={() => setLocation("/settings/events?from=/events")}>Event preferences</VfButton>}
            />
          ) : (
            <EmptyState
              testId="events-empty-state"
              title="Quiet week."
              body="Host the thing you'd want to go to. Small is fine."
              action={<VfButton onClick={host}>Host an event</VfButton>}
            />
          )
        ) : (
          <div className="flex flex-col gap-10">
            {officialEvents.length > 0 && (
              <section data-testid="section-official-events">
                <SectionLabel sub="Run by Destira. Join one, and if you'd like to run it, offer to lead.">Destira Official</SectionLabel>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {officialEvents.map((event, i) => (
                    <EventCard key={event.id} index={i} {...commonRowProps(event)} />
                  ))}
                </div>
              </section>
            )}
            {grouped.map(([label, items], gi) => (
              <section key={label} data-testid={`section-week-${gi}`}>
                <SectionLabel>{label}</SectionLabel>
                {gi === 0 && label === "This week" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map((event, i) => (
                      <EventCard key={event.id} index={i} {...commonRowProps(event)} />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {items.map((event) => (
                      <EventRow key={event.id} {...commonRowProps(event)} />
                    ))}
                  </div>
                )}
              </section>
            ))}
            {feed.data?.moreThanShown && (
              <p className="vf-label text-vf-faint">Showing the 30 that fit best · narrow it in Preferences</p>
            )}
          </div>
        )}
      </div>

      <VfSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        eyebrow="Events"
        title="Find something"
        data-testid="search-panel"
        footer={
          <div className="flex items-center gap-2">
            {count > 0 && (
              <VfButton variant="quiet" onClick={() => applyParams({})} data-testid="button-clear-filters">
                Clear all
              </VfButton>
            )}
            <VfButton fullWidth onClick={() => setSheetOpen(false)} data-testid="button-show-results">
              {count === 0 ? "Done" : results.isLoading || activeCount(debounced) !== count ? "Show events" : `Show ${resultCount} event${resultCount === 1 ? "" : "s"}`}
            </VfButton>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <SearchField
            label="Search events"
            placeholder="Name, place, or a word in the description"
            value={params.q ?? ""}
            onChange={(v) => applyParams({ ...params, q: v || undefined })}
            data-testid="input-search"
          />
          <FilterGroup label="When">
            {WHENS.map((w) => (
              <Chip
                key={w.value}
                label={w.label}
                active={w.value === "any" ? !params.when : params.when === w.value}
                onClick={() => applyParams({ ...params, when: w.value === "any" || params.when === w.value ? undefined : w.value })}
              />
            ))}
          </FilterGroup>
          <FilterGroup label="Kind">
            {EVENT_KINDS.map((k) => (
              <Chip key={k} label={k} active={(params.kind ?? []).includes(k)} onClick={() => toggleArr("kind", k)} />
            ))}
          </FilterGroup>
          <FilterGroup label="Distance">
            {DISTANCES.map((d) => (
              <Chip
                key={d}
                label={`${d} km`}
                active={params.distanceKm === d}
                onClick={() => applyParams({ ...params, distanceKm: params.distanceKm === d ? undefined : d })}
              />
            ))}
          </FilterGroup>
          <FilterGroup label="Place">
            {EVENT_PLACE_TYPES.map((p) => (
              <Chip key={p} label={p} active={(params.placeType ?? []).includes(p)} onClick={() => toggleArr("placeType", p)} />
            ))}
          </FilterGroup>
          <FilterGroup label="Needs">
            <Chip label="Sober" active={!!params.sober} onClick={() => applyParams({ ...params, sober: params.sober ? undefined : true })} />
            <Chip label="Step-free" active={!!params.stepFree} onClick={() => applyParams({ ...params, stepFree: params.stepFree ? undefined : true })} />
          </FilterGroup>
        </div>
      </VfSheet>
      {paywall.sheet}
    </LayoutShell>
  );
}
