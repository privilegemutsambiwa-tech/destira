import { Loader2 } from "lucide-react";
import { useReducedMotion, motion } from "framer-motion";
import type { EventItem } from "@/hooks/use-events";
import { VfAvatar } from "@/components/ui-vf";

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
  solid: "bg-vf-ember text-vf-ink hover:bg-[var(--vf-ember-soft)]",
  ghost: "border border-vf-line text-vf-soft hover:border-vf-text/25",
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

// Official events show what it takes to confirm them, ahead of social proof:
// "Needs a lead" is the call to action, and the headcount gap is the honest
// reason the event might be called off 48h out.
export function officialStatusLine(event: EventItem): { text: string; color: "mint" | "gold" } | null {
  if (!event.isOfficial) return null;
  const min = event.minGoing ?? 5;
  const going = event.resonance.goingCount;
  const gap = Math.max(0, min - going);
  if (!event.leadUserId && gap > 0) return { text: `Needs a lead · ${gap} more to confirm`, color: "gold" };
  if (!event.leadUserId) return { text: "Needs a lead to confirm", color: "gold" };
  if (gap > 0) return { text: `Led by ${event.leadName ?? "a member"} · ${gap} more to confirm`, color: "gold" };
  return { text: `Confirmed · led by ${event.leadName ?? "a member"}`, color: "mint" };
}

export function OfficialBadge({ sponsorName }: { sponsorName?: string | null }) {
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] rounded-full px-2 py-0.5 align-middle text-vf-text bg-vf-text/[0.07] border border-vf-text/20"
      data-testid="badge-official-event"
    >
      Destira Official{sponsorName ? ` · ${sponsorName}` : ""}
    </span>
  );
}

export function eventResonanceSignal(event: EventItem): { text: string; color: "mint" | "gold" } | null {
  const official = officialStatusLine(event);
  if (official) return official;
  const { resonance } = event;
  if (resonance.notableAttendees.length > 0) {
    return { text: `${resonance.notableAttendees[0].name.split(" ")[0]} is going`, color: "mint" };
  }
  if (event.emberFirstPick) return { text: "Ember members get first pick", color: "gold" };
  // A brand-new event with nobody going yet used to show no signal line at
  // all here, which read as "nothing happening" right when a host most needs
  // the first RSVP. An inviting line costs nothing and disappears the moment
  // there's real social proof to show instead.
  if (resonance.goingCount === 0 && event.myStatus == null) return { text: "Be the first to RSVP", color: "gold" };
  return null;
}

/** "6 going · 4 more to confirm": the honest headcount line on a card. */
export function goingLine(event: EventItem): string {
  const going = event.resonance.goingCount;
  if (event.isOfficial) {
    const gap = Math.max(0, (event.minGoing ?? 5) - going);
    if (gap > 0) return `${going} going · ${gap} more to confirm`;
    return `${going} going · confirmed`;
  }
  if (event.seatModel === "capped" && event.seatCount) {
    const left = Math.max(0, event.seatCount - going);
    return left === 0 ? `${going} going · full` : `${going} going · ${left} seat${left === 1 ? "" : "s"} left`;
  }
  if (going === 0) return "Nobody yet · be the first";
  return `${going} going`;
}

export function AvatarStack({ people, size = 26 }: { people: EventItem["resonance"]["notableAttendees"]; size?: number }) {
  if (people.length === 0) return null;
  return (
    <span className="flex -space-x-2 shrink-0" aria-hidden="true">
      {people.slice(0, 4).map((p) => (
        <VfAvatar key={p.id} size={size} name={p.name} seed={p.id} src={p.avatarUrl ?? undefined} className="ring-2 ring-[var(--vf-surface2)]" />
      ))}
    </span>
  );
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
      className="vf-card vf-row rounded-[22px] border border-vf-line bg-vf-surface2 p-5 grid grid-cols-[auto_minmax(0,1fr)_auto] gap-[18px] items-center cursor-pointer hover:border-vf-text/20 transition-colors duration-150"
      data-testid={`event-row-${event.id}`}
    >
      {/* The date stub stays the primary anchor (events are read by "when"
          first) — a cover photo, when the host set one, rides along as a
          small thumbnail rather than displacing it, so a feed of many rows
          stays scannable instead of turning into a wall of photo cards. */}
      <div className="flex items-center gap-3">
        <div className="text-center w-[56px] shrink-0">
          <div className="font-mono text-[11px] tracking-[0.14em] text-vf-ember">{formatDay(event.startsAt)}</div>
          <div className="font-serif text-[34px] leading-[1.05] text-vf-text">{formatDateNum(event.startsAt)}</div>
        </div>
        {event.coverImageUrl && (
          <div className="hidden sm:block w-12 h-12 rounded-[10px] overflow-hidden shrink-0 border border-vf-line">
            <img src={event.coverImageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}
      </div>

      <div className="min-w-0">
        {event.isOfficial && <div className="mb-1.5"><OfficialBadge sponsorName={event.sponsorName} /></div>}
        <div className="text-[17.5px] text-vf-text truncate">{event.title}</div>
        <div className="text-[13px] text-vf-muted mt-1 truncate">{metaParts.join(" · ")}</div>
        {event.costModel === "contribute" && event.contributionAmount != null && (
          <div className="font-mono text-[10px] mt-2 uppercase tracking-[0.12em] text-vf-faint truncate" data-testid={`event-contribution-${event.id}`}>
            {`Contribution · $${event.contributionAmount} · settled in person on the day · Destira never handles it`}
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
        className={`shrink-0 whitespace-nowrap px-5 py-2.5 rounded-full text-[13.5px] font-semibold btn-press vf-btn-primary transition-colors disabled:opacity-50 flex items-center gap-2 ${BUTTON_CLASSES[variant]}`}
        style={{ minHeight: 44 }}
        data-testid={`event-action-${event.id}`}
      >
        {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {label}
      </button>
    </div>
  );
}

// The single most-imminent event in the feed gets a full photo-forward hero
// treatment — the date stub becomes a "ticket stub" overlapping the cover's
// bottom-left corner, the same overlap language Profile's avatar-over-cover
// and Lounge's name-over-field already use, so "the next real thing
// happening" reads as a real place, not another row. Falls back to the same
// neutral surface2 + serif-initial treatment as everywhere else with no
// photo — a real photo (when present) gets the fixed-dark legibility scrim,
// matching how every other photo-backed card in the app treats it
// regardless of theme; the no-photo fallback stays fully theme-aware.
export function FeaturedEventRow({ event, groupName, isHost, pending, onOpen, onAttend, onCancel, onManage }: EventRowProps) {
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
  const cover = event.coverImageUrl;

  return (
    <div
      onClick={onOpen}
      className="vf-card rounded-[26px] border border-vf-line bg-vf-surface overflow-hidden cursor-pointer transition-colors duration-150 hover:border-vf-text/20"
      data-testid={`event-row-featured-${event.id}`}
    >
      <div className="relative h-[180px]">
        {cover ? (
          <>
            <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-vf-scrim to-transparent pointer-events-none" />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-vf-surface2">
            <span className="font-serif text-vf-text/20 text-7xl">{event.title?.[0]?.toUpperCase() || "?"}</span>
          </div>
        )}

        {event.twinFlagged && (
          <span
            className="absolute top-3 right-3 font-mono text-[10px] uppercase tracking-[0.14em] rounded-full px-2.5 py-1"
            style={
              cover
                ? { background: "rgba(12,9,16,.5)", color: "#8FE3C7", backdropFilter: "blur(6px)" }
                : { background: "var(--vf-elevated)", color: "hsl(var(--vf-mint))" }
            }
          >
            Your twin flagged this
          </span>
        )}

        {/* Ticket stub — overlaps the cover's bottom edge by half, same
            "punched into both surfaces" ring treatment as Discover's
            resonance medallion and Profile's twin badge. */}
        <div
          className="absolute left-5 bottom-0 translate-y-1/2 flex flex-col items-center justify-center w-[64px] h-[64px] rounded-[16px]"
          style={{ background: "var(--vf-surface)", border: "1px solid var(--vf-line)", boxShadow: "0 8px 20px rgba(12,9,16,.25)" }}
        >
          <div className="font-mono text-[10px] tracking-[0.14em] text-vf-ember">{formatDay(event.startsAt)}</div>
          <div className="font-serif text-[26px] leading-[1.05] text-vf-text">{formatDateNum(event.startsAt)}</div>
        </div>
      </div>

      <div className="pt-9 pb-5 px-5 flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          {event.isOfficial && <div className="mb-1.5"><OfficialBadge sponsorName={event.sponsorName} /></div>}
          <div className="font-serif text-[21px] text-vf-text truncate">{event.title}</div>
          <div className="text-[13px] text-vf-muted mt-1 truncate">{metaParts.join(" · ")}</div>
          {signal && (
            <div className={`font-mono text-[11.5px] mt-1.5 ${signal.color === "mint" ? "text-vf-mint" : "text-vf-gold"}`}>
              {signal.text}
            </div>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClick?.(); }}
          disabled={pending || !onClick}
          className={`shrink-0 whitespace-nowrap px-5 py-2.5 rounded-full text-[13.5px] font-semibold btn-press vf-btn-primary transition-colors disabled:opacity-50 flex items-center gap-2 ${BUTTON_CLASSES[variant]}`}
          style={{ minHeight: 44 }}
          data-testid={`event-action-${event.id}`}
        >
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {label}
        </button>
      </div>
    </div>
  );
}

/** "This week" as large cards (docs/destira-upgrade-prompt.md §7.14): cover,
 *  the day in big serif numerals, title, place, who's going and one action. */
export function EventCard({ event, groupName, isHost, pending, onOpen, onAttend, onCancel, onManage, index = 0 }: EventRowProps & { index?: number }) {
  const reduce = useReducedMotion();
  const state = eventActionState(event, isHost);
  const onClick =
    state.kind === "attend" ? onAttend :
    state.kind === "cancel" ? onCancel :
    state.kind === "manage" ? onManage :
    undefined;
  const d = new Date(event.startsAt);
  const weekday = d.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase();
  const where = [event.venueName, event.suburb].filter(Boolean).join(", ") || event.city;
  const cover = event.coverImageUrl;
  const firstGoing = event.resonance.notableAttendees[0]?.name?.split(" ")[0];

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 6) * 0.05, duration: 0.28 }}
      onClick={onOpen}
      className="group vf-lift rounded-[24px] border border-vf-line bg-vf-surface2 overflow-hidden cursor-pointer hover:border-vf-text/20 flex flex-col"
      data-testid={`event-card-${event.id}`}
    >
      <div className="relative h-[188px]">
        {cover ? (
          <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" loading="lazy" />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "radial-gradient(120% 120% at 20% 0%, hsl(var(--vf-ember) / .28), transparent 60%), radial-gradient(90% 90% at 100% 100%, hsl(var(--vf-mint) / .18), transparent 60%), var(--vf-elevated)" }}
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-[rgba(12,9,16,.88)] to-transparent pointer-events-none" />
        <div className="absolute left-4 bottom-3 flex items-end gap-3" style={{ color: "#F5F0EA" }}>
          <span className="font-display text-[54px] leading-[0.85]" data-testid={`event-card-day-${event.id}`}>{d.getDate()}</span>
          <span className="font-mono text-[11px] tracking-[0.14em] pb-1 opacity-90">
            {weekday} · {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
          </span>
        </div>
        {event.twinFlagged && (
          <span
            className="absolute top-3 right-3 font-mono text-[10px] uppercase tracking-[0.14em] rounded-full px-2.5 py-1"
            style={{ background: "rgba(12,9,16,.55)", color: "#8FE3C7", backdropFilter: "blur(6px)" }}
          >
            Your twin flagged this
          </span>
        )}
        {event.isOfficial && (
          <span
            className="absolute top-3 left-3 font-mono text-[10px] uppercase tracking-[0.14em] rounded-full px-2.5 py-1"
            style={{ background: "rgba(245,240,234,.92)", color: "#14101C" }}
            data-testid="badge-official-event"
          >
            Destira Official{event.sponsorName ? ` · ${event.sponsorName}` : ""}
          </span>
        )}
      </div>

      <div className="p-4 pt-3.5 flex flex-col gap-3 flex-1">
        <div className="min-w-0">
          <div className="font-display text-[22px] leading-[1.15] text-vf-text line-clamp-2">{event.title}</div>
          <div className="vf-small text-vf-muted mt-1 truncate">
            {[where, groupName ? `hosted by ${groupName}` : null].filter(Boolean).join(" · ")}
          </div>
          {event.costModel === "contribute" && event.contributionAmount != null && (
            <div className="font-mono text-[10px] mt-1.5 uppercase tracking-[0.12em] text-vf-faint truncate">
              Contribution ${event.contributionAmount} · paid in person
            </div>
          )}
        </div>
        <div className="mt-auto flex items-center gap-3">
          <AvatarStack people={event.resonance.notableAttendees} />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] text-vf-text truncate" data-testid={`event-going-${event.id}`}>{goingLine(event)}</div>
            {firstGoing && !event.isOfficial && <div className="text-[12px] text-vf-muted truncate">{firstGoing} is going</div>}
            {event.isOfficial && !event.leadUserId && <div className="text-[12px] text-vf-gold truncate">Needs a lead</div>}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            disabled={pending || !onClick}
            className={`vf-press shrink-0 whitespace-nowrap px-4 rounded-full text-[14px] font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 ${BUTTON_CLASSES[state.variant]}`}
            style={{ minHeight: 44 }}
            data-testid={`event-action-${event.id}`}
          >
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {state.label}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
