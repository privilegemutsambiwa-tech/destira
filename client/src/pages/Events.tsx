import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LayoutShell } from "@/components/layout-shell";
import { EventRow } from "@/components/event-row";
import {
  useEventsFeed,
  useEventSearch,
  useAttendEvent,
  useCancelAttendance,
  searchParamsToQuery,
  type EventSearchParams,
  type EventItem,
} from "@/hooks/use-events";
import { useGroups } from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
import { useGate } from "@/hooks/use-gate";
import { usePaywall } from "@/hooks/use-paywall";
import { EVENT_KINDS, EVENT_PLACE_TYPES } from "@shared/event-taxonomy";
import { Loader2, Search, X } from "lucide-react";

const DISTANCES = [5, 10, 25, 50] as const;
const WHENS: { value: NonNullable<EventSearchParams["when"]>; label: string }[] = [
  { value: "any", label: "Any" },
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

  if (eventDate < nextWeekStart) return "This Week";
  if (eventDate < weekAfterStart) return "Next Week";
  return `Week of ${startOfWeek(eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
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

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3.5 h-8 text-[12.5px] capitalize transition-colors ${
        active
          ? "border-vf-mint/50 bg-vf-mint/10 text-vf-text"
          : "border-vf-line text-vf-muted hover:text-vf-text hover:border-vf-text/20"
      }`}
    >
      {label}
    </button>
  );
}

function EmptyState({
  line,
  ctaHref,
  ctaLabel,
}: {
  line: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <div className="py-12" data-testid="events-empty-state">
      <p className="font-serif text-xl text-vf-text mb-2">{line}</p>
      <Link href={ctaHref}>
        <a className="text-sm text-vf-mint hover:text-vf-text underline">{ctaLabel}</a>
      </Link>
    </div>
  );
}

export default function Events() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: groups } = useGroups();
  const { data: hostGate } = useGate("host_event");
  const paywall = usePaywall();
  const attend = useAttendEvent();
  const cancel = useCancelAttendance();

  const params = useMemo(() => parseParams(search), [search]);
  const count = activeCount(params);
  const searching = count > 0;

  const [panelOpen, setPanelOpen] = useState(() => activeCount(parseParams(window.location.search)) > 0);
  const searchBtnRef = useRef<HTMLButtonElement>(null);

  // debounce what actually hits the search endpoint; URL updates immediately
  const [debounced, setDebounced] = useState(params);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(parseParams(search)), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPanelOpen(false);
        searchBtnRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panelOpen]);

  const feed = useEventsFeed();
  const results = useEventSearch(debounced, activeCount(debounced) > 0);

  const groupNameById = useMemo(() => {
    const map = new Map<number, string>();
    (groups || []).forEach((g: any) => map.set(g.id, g.name));
    return map;
  }, [groups]);

  const grouped = useMemo(() => {
    const list = feed.data?.events ?? [];
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
  const backToFeed = () => {
    applyParams({});
    setPanelOpen(false);
  };

  const rowHandlers = (event: EventItem) => {
    const isHost = event.hostUserId === user?.id;
    const isPending =
      (attend.isPending && attend.variables?.eventId === event.id) ||
      (cancel.isPending && cancel.variables === event.id);
    return (
      <EventRow
        event={event}
        groupName={event.groupId ? groupNameById.get(event.groupId) : undefined}
        isHost={isHost}
        pending={isPending}
        onOpen={() => setLocation(`/events/${event.id}`)}
        onAttend={() => attend.mutate({ eventId: event.id, seatModel: event.seatModel })}
        onCancel={() => cancel.mutate(event.id)}
        onManage={() => setLocation(`/events/${event.id}`)}
        signalOverride={searching ? searchSignal(event) || undefined : undefined}
      />
    );
  };

  return (
    <LayoutShell>
      <div className="max-w-3xl mx-auto">
        <h1 className="font-serif font-normal text-[clamp(30px,3.6vw,44px)] leading-[1.05] tracking-[-0.02em] text-vf-text mb-2">
          The point is the meeting.
        </h1>
        <p className="text-[15px] text-vf-muted max-w-[560px] mb-5">
          Small, hosted, in real rooms. Your twin flags who's going that you'd get on with.
        </p>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:justify-end sm:items-center mb-6">
          <button
            ref={searchBtnRef}
            onClick={() => {
              if (panelOpen) backToFeed();
              else setPanelOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-vf-line text-vf-muted hover:text-vf-text hover:border-vf-text/20 h-9 px-4 text-[13px] transition-colors"
            data-testid="button-toggle-search"
          >
            {panelOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
            {panelOpen ? "Close search" : "Search events"}
            {!panelOpen && count > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-vf-mint/15 text-vf-mint font-mono text-[10px]">
                {count}
              </span>
            )}
          </button>
          <button
            onClick={() => setLocation("/settings/events?from=/events")}
            className="inline-flex items-center justify-center rounded-full border border-vf-line text-vf-muted hover:text-vf-text hover:border-vf-text/20 h-9 px-4 text-[13px] transition-colors"
            data-testid="button-event-preferences"
          >
            Preferences
          </button>
          <button
            onClick={() => paywall.guard("host_event", () => setLocation("/events/host"))}
            className="inline-flex items-center justify-center rounded-full bg-vf-ember text-vf-ink font-semibold h-9 px-4 text-[13px] btn-press transition-colors hover:bg-[var(--vf-ember-soft)]"
            data-testid="button-host-event"
          >
            {hostGate?.ok === false ? `Host an event · ${hostGate.requiredTierName || "Flame"}` : "Host an event"}
          </button>
        </div>

        {panelOpen && (
          <div
            className="rounded-[20px] border border-vf-line bg-vf-surface2 p-5 mb-8 flex flex-col gap-5 overflow-hidden motion-safe:animate-[vf-rise_0.24s_ease-out_both]"
            data-testid="search-panel"
          >
            <input
              autoFocus
              value={params.q ?? ""}
              onChange={(e) => applyParams({ ...params, q: e.target.value || undefined })}
              placeholder="Search by name, place, or word in the description"
              className="w-full bg-transparent border-b border-vf-line focus:border-vf-mint/50 outline-none text-[15px] text-vf-text placeholder:text-vf-faint pb-2 transition-colors"
              data-testid="input-search"
            />

            <div>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint mb-2.5">Kind</div>
              <div className="flex flex-wrap gap-2">
                {EVENT_KINDS.map((k) => (
                  <Chip key={k} label={k} active={(params.kind ?? []).includes(k)} onClick={() => toggleArr("kind", k)} />
                ))}
              </div>
            </div>

            <div>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint mb-2.5">Distance</div>
              <div className="flex flex-wrap gap-2">
                {DISTANCES.map((d) => (
                  <Chip
                    key={d}
                    label={`${d}km`}
                    active={params.distanceKm === d}
                    onClick={() => applyParams({ ...params, distanceKm: params.distanceKm === d ? undefined : d })}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint mb-2.5">When</div>
              <div className="flex flex-wrap gap-2">
                {WHENS.map((w) => (
                  <Chip
                    key={w.value}
                    label={w.label}
                    active={w.value === "any" ? !params.when : params.when === w.value}
                    onClick={() =>
                      applyParams({ ...params, when: w.value === "any" || params.when === w.value ? undefined : w.value })
                    }
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint mb-2.5">Place</div>
              <div className="flex flex-wrap gap-2">
                {EVENT_PLACE_TYPES.map((p) => (
                  <Chip
                    key={p}
                    label={p}
                    active={(params.placeType ?? []).includes(p)}
                    onClick={() => toggleArr("placeType", p)}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Chip label="Sober" active={!!params.sober} onClick={() => applyParams({ ...params, sober: params.sober ? undefined : true })} />
              <Chip
                label="Step-free"
                active={!!params.stepFree}
                onClick={() => applyParams({ ...params, stepFree: params.stepFree ? undefined : true })}
              />
            </div>

            {count > 0 && (
              <button
                onClick={() => applyParams({})}
                className="self-start text-[12.5px] text-vf-ember hover:text-[var(--vf-ember-soft)] transition-colors"
                data-testid="button-clear-filters"
              >
                Clear all
              </button>
            )}
          </div>
        )}

        {searching ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="font-mono uppercase tracking-[0.16em] text-[10.5px] text-vf-faint">
                {results.isLoading
                  ? "SEARCHING…"
                  : `${results.data?.events.length ?? 0} EVENT${(results.data?.events.length ?? 0) === 1 ? "" : "S"} · SORTED BY DATE`}
              </div>
              <button
                onClick={backToFeed}
                className="text-[13px] text-vf-ember hover:text-[var(--vf-ember-soft)] transition-colors"
                data-testid="button-back-to-feed"
              >
                Back to your feed
              </button>
            </div>

            {results.isLoading ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="w-7 h-7 animate-spin text-vf-mint" />
              </div>
            ) : (results.data?.events.length ?? 0) === 0 ? (
              <EmptyState line="Nothing matching that yet." ctaHref="/events/host" ctaLabel="Host something yourself" />
            ) : (
              <div className="flex flex-col gap-3.5">
                {results.data!.events.map((event) => (
                  <div key={event.id}>{rowHandlers(event)}</div>
                ))}
              </div>
            )}
          </>
        ) : feed.isLoading ? (
          <div className="h-[50vh] flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-vf-mint" />
          </div>
        ) : feedEmpty ? (
          wideCount.isLoading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="w-7 h-7 animate-spin text-vf-mint" />
            </div>
          ) : (wideCount.data?.count ?? 0) > 0 ? (
            <EmptyState
              line="Your preferences are narrower than Harare right now."
              ctaHref="/settings/events?from=/events"
              ctaLabel="Loosen your event preferences"
            />
          ) : (
            <EmptyState line="Quiet week." ctaHref="/events/host" ctaLabel="Host the thing you'd want to go to" />
          )
        ) : (
          <div className="flex flex-col gap-8">
            {grouped.map(([label, items]) => (
              <div key={label}>
                <div className="font-mono uppercase tracking-[0.16em] text-[10.5px] text-vf-faint mb-3">{label}</div>
                <div className="flex flex-col gap-3.5 motion-reduce:[&>*]:!animate-none">
                  {items.map((event) => (
                    <div key={event.id} className="motion-safe:animate-[vf-rise_0.4s_ease_both]">
                      {rowHandlers(event)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {feed.data?.moreThanShown && (
              <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">
                Showing the 30 that fit best · narrow it in Preferences
              </p>
            )}
          </div>
        )}
      </div>
      {paywall.sheet}
    </LayoutShell>
  );
}
