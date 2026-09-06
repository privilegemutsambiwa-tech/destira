import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { LayoutShell } from "@/components/layout-shell";
import { EventRow } from "@/components/event-row";
import { useEvents, useAttendEvent, useCancelAttendance, type EventItem } from "@/hooks/use-events";
import { useGroups } from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

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

export default function Events() {
  const { data: events, isLoading } = useEvents();
  const { data: groups } = useGroups();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const attend = useAttendEvent();
  const cancel = useCancelAttendance();

  const groupNameById = useMemo(() => {
    const map = new Map<number, string>();
    (groups || []).forEach((g: any) => map.set(g.id, g.name));
    return map;
  }, [groups]);

  const grouped = useMemo(() => {
    if (!events) return [];
    const now = new Date();
    const sections = new Map<string, EventItem[]>();
    for (const event of events) {
      const label = weekLabel(new Date(event.startsAt), now);
      if (!sections.has(label)) sections.set(label, []);
      sections.get(label)!.push(event);
    }
    return Array.from(sections.entries());
  }, [events]);

  if (isLoading) {
    return (
      <LayoutShell>
        <div className="h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-vf-mint" />
        </div>
      </LayoutShell>
    );
  }

  return (
    <LayoutShell>
      <div className="max-w-3xl mx-auto">
        <h1 className="font-serif font-normal text-[clamp(30px,3.6vw,44px)] leading-[1.05] tracking-[-0.02em] text-vf-text mb-2">
          The point is the meeting.
        </h1>
        <p className="text-[15px] text-vf-muted max-w-[560px] mb-3">
          Small, hosted, in real rooms. Your twin flags who's going that you'd get on with.
        </p>
        <button
          onClick={() => setLocation("/settings/events?from=/events")}
          className="mb-8 inline-flex items-center rounded-full border border-vf-line text-vf-muted hover:text-vf-text hover:border-white/20 h-9 px-4 text-[13px] transition-colors"
          data-testid="button-event-preferences"
        >
          Preferences
        </button>

        {(!events || events.length === 0) ? (
          <div className="py-12" data-testid="events-empty-state">
            <p className="font-serif text-xl text-vf-text mb-2">Nothing on the calendar yet.</p>
            <Link href="/lounge">
              <a className="text-sm text-vf-mint hover:text-vf-text underline" data-testid="link-events-empty-groups">
                Join a group to see what they're hosting
              </a>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {grouped.map(([label, items]) => (
              <div key={label}>
                <div className="font-mono uppercase tracking-[0.16em] text-[10.5px] text-vf-faint mb-3">
                  {label}
                </div>
                <div className="flex flex-col gap-3.5 motion-reduce:[&>*]:!animate-none">
                  {items.map((event) => {
                    const isHost = event.hostUserId === user?.id;
                    const isPending =
                      (attend.isPending && attend.variables?.eventId === event.id) ||
                      (cancel.isPending && cancel.variables === event.id);
                    return (
                      <div key={event.id} className="motion-safe:animate-[vf-rise_0.4s_ease_both]">
                        <EventRow
                          event={event}
                          groupName={event.groupId ? groupNameById.get(event.groupId) : undefined}
                          isHost={isHost}
                          pending={isPending}
                          onOpen={() => setLocation(`/events/${event.id}`)}
                          onAttend={() => attend.mutate({ eventId: event.id, seatModel: event.seatModel })}
                          onCancel={() => cancel.mutate(event.id)}
                          onManage={() => setLocation(`/events/${event.id}`)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </LayoutShell>
  );
}
