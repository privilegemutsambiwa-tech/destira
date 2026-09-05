import { LayoutShell } from "@/components/layout-shell";
import {
  BUTTON_CLASSES,
  eventActionState,
  eventResonanceSignal,
} from "@/components/event-row";
import { useEvent, useAttendEvent, useCancelAttendance } from "@/hooks/use-events";
import { useGroups } from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Loader2, ArrowLeft, MapPin, CalendarDays } from "lucide-react";

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}
function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

const SEAT_MODEL_COPY: Record<string, string> = {
  open: "Open — anyone can save a seat",
  capped: "Limited seats — waitlist once full",
  curated: "Seats picked for conversation, not first-come",
};

export default function EventDetail({ params }: { params: { id: string } }) {
  const eventId = Number(params.id);
  const { data: event, isLoading } = useEvent(eventId);
  const { data: groups } = useGroups();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const attend = useAttendEvent();
  const cancel = useCancelAttendance();

  if (isLoading) {
    return (
      <LayoutShell>
        <div className="h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-vf-mint" />
        </div>
      </LayoutShell>
    );
  }

  if (!event) {
    return (
      <LayoutShell>
        <div className="py-16 text-center">
          <p className="font-serif text-xl text-vf-text mb-3">That event isn't here.</p>
          <button onClick={() => setLocation("/events")} className="text-sm text-vf-mint underline">
            Back to events
          </button>
        </div>
      </LayoutShell>
    );
  }

  const isHost = event.hostUserId === user?.id;
  const groupName = event.groupId ? (groups || []).find((g: any) => g.id === event.groupId)?.name : undefined;
  const signal = eventResonanceSignal(event);
  const state = eventActionState(event, isHost);
  const pending = attend.isPending || cancel.isPending;

  const runAction = () => {
    if (state.kind === "attend") attend.mutate({ eventId: event.id, seatModel: event.seatModel });
    else if (state.kind === "cancel") cancel.mutate(event.id);
    // 'manage' has no action here yet — this IS the host's page. Host tooling
    // (promote/decline for curated events) is a separate follow-up.
  };

  const notable = event.resonance.notableAttendees;
  const otherGoing = Math.max(0, event.resonance.goingCount - notable.length);

  return (
    <LayoutShell>
      <div className="max-w-4xl mx-auto motion-safe:animate-[vf-rise_0.4s_ease_both]">
        <button
          onClick={() => setLocation("/events")}
          className="flex items-center gap-1.5 text-[13px] text-vf-faint hover:text-vf-text transition-colors mb-4"
          data-testid="button-back-events"
        >
          <ArrowLeft className="w-4 h-4" /> Events
        </button>

        {/* Cover + title */}
        <div className="relative rounded-[24px] overflow-hidden border border-vf-line h-[clamp(200px,32vw,320px)]">
          {event.coverImageUrl ? (
            <img src={event.coverImageUrl} alt={event.title} className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full"
              style={{ background: "radial-gradient(120% 140% at 50% 0%, rgba(255,107,74,.12), transparent 60%), var(--vf-surface2)" }}
            />
          )}
          <div
            className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{ height: "70%", background: "linear-gradient(to top, rgba(12,9,16,.94), rgba(12,9,16,0))" }}
          />
          <div className="absolute left-6 right-6 bottom-5">
            <h1 className="font-serif font-normal text-white text-[clamp(24px,3.4vw,38px)] leading-[1.08]">
              {event.title}
            </h1>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px] gap-6 mt-6">
          {/* Left: about */}
          <div className="flex flex-col gap-6 min-w-0">
            {event.description && (
              <div>
                <div className="font-mono uppercase tracking-[0.16em] text-[10.5px] text-vf-faint mb-2">About</div>
                <p className="text-[15px] leading-relaxed text-vf-text whitespace-pre-line">{event.description}</p>
              </div>
            )}
            <div className="flex flex-col gap-3">
              {(event.venueName || event.suburb || event.city) && (
                <div className="flex items-start gap-2.5 text-[14px] text-vf-muted">
                  <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-vf-faint" />
                  <span>{[event.venueName, event.suburb, event.city].filter(Boolean).join(" · ")}</span>
                </div>
              )}
              <div className="flex items-start gap-2.5 text-[14px] text-vf-muted">
                <CalendarDays className="w-4 h-4 shrink-0 mt-0.5 text-vf-faint" />
                <span>
                  {formatFullDate(event.startsAt)} · {formatTime(event.startsAt)}
                  {event.endsAt ? `–${formatTime(event.endsAt)}` : ""}
                </span>
              </div>
              {groupName && (
                <div className="text-[13px] text-vf-faint">Hosted by {groupName}</div>
              )}
            </div>
          </div>

          {/* Right: sticky action card */}
          <div className="md:sticky md:top-6 self-start rounded-[20px] border border-vf-line bg-vf-surface2 p-5 flex flex-col gap-4">
            <div>
              <div className="font-mono text-[11px] tracking-[0.14em] text-vf-ember">
                {formatFullDate(event.startsAt).toUpperCase()}
              </div>
              <div className="text-[13px] text-vf-muted mt-1">
                {formatTime(event.startsAt)} · {event.resonance.goingCount} going
              </div>
              <div className="text-[12px] text-vf-faint mt-1.5">{SEAT_MODEL_COPY[event.seatModel]}</div>
            </div>

            {signal && (
              <div className={`font-mono text-[11.5px] ${signal.color === "mint" ? "text-vf-mint" : "text-vf-gold"}`}>
                {signal.text}
              </div>
            )}

            {state.kind !== "manage" && (
              <button
                onClick={runAction}
                disabled={pending}
                className={`w-full px-5 py-3 rounded-full text-[14px] font-semibold btn-press transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${BUTTON_CLASSES[state.variant]}`}
                style={{ minHeight: 44 }}
                data-testid="button-event-action"
              >
                {pending && <Loader2 className="w-4 h-4 animate-spin" />}
                {state.label}
              </button>
            )}
            {isHost && (
              <div className="text-[12px] text-vf-faint text-center">You're hosting this one.</div>
            )}

            {notable.length > 0 && (
              <div className="border-t border-vf-line pt-4">
                <div className="font-mono uppercase tracking-[0.16em] text-[10.5px] text-vf-faint mb-3">Who's going</div>
                <div className="flex flex-col gap-2.5">
                  {notable.map((a) => (
                    <div key={a.id} className="flex items-center gap-2.5" data-testid={`event-attendee-${a.id}`}>
                      <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-vf-surface flex items-center justify-center">
                        {a.avatarUrl ? (
                          <img src={a.avatarUrl} alt={a.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="font-serif text-[12px] text-vf-soft">{a.name[0]}</span>
                        )}
                      </div>
                      <span className="text-[13.5px] text-vf-text flex-1 truncate">{a.name}</span>
                      <span className="font-mono text-[11.5px] text-vf-mint shrink-0">{a.score}</span>
                    </div>
                  ))}
                </div>
                {otherGoing > 0 && (
                  <div className="text-[12px] text-vf-faint mt-2.5">and {otherGoing} other{otherGoing === 1 ? "" : "s"}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </LayoutShell>
  );
}
