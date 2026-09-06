import { Loader2 } from "lucide-react";
import type { EventItem } from "@/hooks/use-events";

function formatDay(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
}
function formatDateNum(dateStr: string): number {
  return new Date(dateStr).getDate();
}
function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export type ButtonVariant = "solid" | "ghost" | "gold-outline" | "gold-ghost";

export const BUTTON_CLASSES: Record<ButtonVariant, string> = {
  solid: "bg-vf-ember text-vf-ink hover:bg-[#FF8163]",
  ghost: "border border-vf-line text-vf-soft hover:border-white/25",
  "gold-outline": "border border-vf-gold/40 text-vf-gold hover:bg-vf-gold/[0.08]",
  "gold-ghost": "border border-vf-gold/25 text-vf-gold/80",
};

// Shared with EventDetail.tsx so the seven button states (and what triggers
// each) are defined in exactly one place.
export function eventActionState(
  event: EventItem,
  isHost: boolean,
): { label: string; variant: ButtonVariant; kind: "attend" | "cancel" | "manage" | null } {
  const { resonance, myStatus, seatModel, seatCount } = event;
  const isFull = seatModel === "capped" && seatCount != null && resonance.goingCount >= seatCount;

  if (isHost) return { label: "Manage", variant: "ghost", kind: "manage" };
  if (myStatus === "going") return { label: "Going", variant: "ghost", kind: "cancel" };
  if (myStatus === "waitlisted") {
    return {
      label: event.myWaitlistPosition ? `Waitlisted · #${event.myWaitlistPosition}` : "Waitlisted",
      variant: "ghost",
      kind: "cancel",
    };
  }
  if (myStatus === "requested") return { label: "Requested", variant: "gold-ghost", kind: "cancel" };
  if (seatModel === "curated") return { label: "Request seat", variant: "gold-outline", kind: "attend" };
  if (isFull) return { label: "Join waitlist", variant: "ghost", kind: "attend" };
  return { label: "Save a seat", variant: "solid", kind: "attend" };
}

export function eventResonanceSignal(event: EventItem): { text: string; color: "mint" | "gold" } | null {
  const { resonance } = event;
  if (resonance.notableAttendees.length > 0) {
    return { text: `${resonance.notableAttendees[0].name.split(" ")[0]} is going`, color: "mint" };
  }
  if (resonance.highReadCount > 0) {
    return { text: `${resonance.highReadCount} read${resonance.highReadCount === 1 ? "" : "s"} above 80 going`, color: "mint" };
  }
  if (event.emberFirstPick) return { text: "Ember members get first pick", color: "gold" };
  return null;
}

interface EventRowProps {
  event: EventItem;
  groupName?: string;
  isHost: boolean;
  pending: boolean;
  /** Navigate to the event detail page — fires on a row click outside the action button. */
  onOpen: () => void;
  onAttend: () => void;
  onCancel: () => void;
  onManage?: () => void;
  /** Search results replace the resonance line with a plain KIND · DISTANCE · SUBURB string. */
  signalOverride?: string;
}

export function EventRow({ event, groupName, isHost, pending, onOpen, onAttend, onCancel, onManage, signalOverride }: EventRowProps) {
  const { resonance } = event;
  const signal = eventResonanceSignal(event);
  const state = eventActionState(event, isHost);
  const { label, variant } = state;
  const onClick =
    state.kind === "attend" ? onAttend :
    state.kind === "cancel" ? onCancel :
    state.kind === "manage" ? onManage :
    undefined;

  const metaParts = [
    event.suburb,
    formatTime(event.startsAt),
    groupName ? `hosted by ${groupName}` : null,
    `${resonance.goingCount} going`,
  ].filter(Boolean);

  return (
    <div
      onClick={onOpen}
      className="rounded-[22px] border border-vf-line bg-vf-surface2 p-5 grid grid-cols-[auto_minmax(0,1fr)_auto] gap-[22px] items-center cursor-pointer hover:border-white/20 transition-colors"
      data-testid={`event-row-${event.id}`}
    >
      <div className="text-center min-w-[56px]">
        <div className="font-mono text-[11px] tracking-[0.14em] text-vf-ember">{formatDay(event.startsAt)}</div>
        <div className="font-serif text-[34px] leading-[1.05] text-vf-text">{formatDateNum(event.startsAt)}</div>
      </div>

      <div className="min-w-0">
        <div className="text-[17.5px] text-vf-text truncate">{event.title}</div>
        <div className="text-[13px] text-vf-muted mt-1 truncate">{metaParts.join(" · ")}</div>
        {event.costModel === "contribute" && event.contributionAmount != null && (
          <div className="font-mono text-[10px] mt-2 uppercase tracking-[0.12em] text-vf-faint truncate" data-testid={`event-contribution-${event.id}`}>
            {`Contribution · $${event.contributionAmount} · settled in person on the day · VibeFlow never handles it`}
          </div>
        )}
        {event.twinFlagged && (
          <div
            className="font-mono text-[11px] mt-2 uppercase tracking-[0.14em] text-vf-mint"
            data-testid={`event-twin-flag-${event.id}`}
          >
            Your twin flagged this
          </div>
        )}
        {signalOverride != null ? (
          <div
            className="font-mono text-[11.5px] mt-2 tracking-[0.1em] text-vf-faint truncate"
            data-testid={`event-signal-${event.id}`}
          >
            {signalOverride}
          </div>
        ) : signal ? (
          <div
            className={`font-mono text-[11.5px] mt-2 ${signal.color === "mint" ? "text-vf-mint" : "text-vf-gold"}`}
            data-testid={`event-signal-${event.id}`}
          >
            {signal.text}
          </div>
        ) : null}
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        disabled={pending || !onClick}
        className={`shrink-0 whitespace-nowrap px-5 py-2.5 rounded-full text-[13.5px] font-semibold btn-press transition-colors disabled:opacity-50 flex items-center gap-2 ${BUTTON_CLASSES[variant]}`}
        style={{ minHeight: 44 }}
        data-testid={`event-action-${event.id}`}
      >
        {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {label}
      </button>
    </div>
  );
}
