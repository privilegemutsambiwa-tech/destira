// Your seat (docs/destira-upgrade-prompt.md §5.7): saving a seat makes a
// ticket. Event name in serif, date in mono, venue, a perforated edge, and a
// real seat number (the order seats were saved in). Lives in Events → My
// seats and on the event page; on the day it also shows on Discover.
import { useLocation } from "wouter";
import { Browser } from "@capacitor/browser";
import { Share } from "@capacitor/share";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { isNativeApp } from "@/lib/native";
import { CalendarPlus } from "lucide-react";
import type { EventItem, MySeat } from "@/hooks/use-events";
import { cn } from "@/lib/utils";
import { SeatGlyph } from "@/components/ui-vf";

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isToday(dateStr: string) {
  return sameDay(new Date(dateStr), new Date());
}

export function ticketTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function ticketDate(dateStr: string) {
  const d = new Date(dateStr);
  if (sameDay(d, new Date())) return "TONIGHT";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (sameDay(d, tomorrow)) return "TOMORROW";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).toUpperCase();
}

/** "Seat 4 of 12", or the honest state when there is no seat yet. */
export function seatLine(seat: Pick<MySeat, "myStatus" | "seatNumber" | "seatModel" | "seatCount" | "resonance">) {
  if (seat.myStatus === "waitlisted") return "On the waitlist";
  if (seat.myStatus === "requested") return "Seat asked for";
  if (seat.seatNumber == null) return "Seat saved";
  if (seat.seatModel === "capped" && seat.seatCount) return `Seat ${seat.seatNumber} of ${seat.seatCount}`;
  return `Seat ${seat.seatNumber} · ${seat.resonance.goingCount} going`;
}

function place(event: EventItem) {
  return [event.venueName, event.suburb].filter(Boolean).join(", ") || event.city || "Venue to be confirmed";
}

/** Google Calendar's own add-event link: no account data leaves Destira. */
export function calendarUrl(event: EventItem) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(event.startsAt);
  const end = event.endsAt ? new Date(event.endsAt) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: `Destira event · ${window.location.origin}/events/${event.id}`,
    location: [event.venueName, event.suburb, event.city].filter(Boolean).join(", "),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** A calendar file (Part J) with reminders the day before and 2 hours
 *  before; any calendar app takes it. Google's add-event link if it fails. */
export async function addToCalendar(event: EventItem) {
  try {
    const res = await fetch(`/api/events/${event.id}/calendar.ics`, { credentials: "include" });
    if (!res.ok) throw new Error(String(res.status));
    const ics = await res.text();
    const filename = `destira-event-${event.id}.ics`;
    if (isNativeApp()) {
      // The share sheet hands the file to the phone's calendar app.
      const written = await Filesystem.writeFile({ path: filename, data: ics, directory: Directory.Cache, encoding: Encoding.UTF8 });
      await Share.share({ files: [written.uri], dialogTitle: "Add to calendar" }).catch(() => {});
      return;
    }
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch {
    const url = calendarUrl(event);
    Browser.open({ url }).catch(() => window.open(url, "_blank", "noopener"));
  }
}

export function SeatTicket({
  seat,
  compact = false,
  className,
}: {
  seat: MySeat;
  compact?: boolean;
  className?: string;
}) {
  const [, navigate] = useLocation();
  const called = seat.status === "cancelled";
  const today = isToday(seat.startsAt);
  return (
    <div
      className={cn(
        "relative rounded-[20px] border bg-vf-surface2 overflow-hidden text-left",
        today && !called ? "border-vf-ember/45" : "border-vf-line",
        compact ? "w-[272px] shrink-0 snap-start" : "w-full",
        className,
      )}
      data-testid={`ticket-${seat.id}`}
    >
      <button
        type="button"
        onClick={() => navigate(`/events/${seat.id}?from=/events`)}
        className="block w-full text-left px-5 pt-4 pb-4 vf-press"
        aria-label={`Open ${seat.title}`}
      >
        <div className={cn("font-mono text-[11px] tracking-[0.14em]", today && !called ? "text-vf-ember" : "text-vf-faint")}>
          {called ? "CALLED OFF" : `${ticketDate(seat.startsAt)} · ${ticketTime(seat.startsAt)}`}
        </div>
        <div className={cn("font-display text-vf-text leading-[1.12] mt-1.5", compact ? "text-[21px] line-clamp-2" : "text-[24px]")}>
          {seat.title}
        </div>
        <div className="vf-small text-vf-muted mt-1 truncate">{place(seat)}</div>
      </button>

      {/* the perforation: two punched notches and a dashed tear line */}
      <div className="relative h-0" aria-hidden="true">
        <span className="absolute -left-[9px] -top-[9px] w-[18px] h-[18px] rounded-full bg-vf-ink border border-vf-line" />
        <span className="absolute -right-[9px] -top-[9px] w-[18px] h-[18px] rounded-full bg-vf-ink border border-vf-line" />
        <span className="absolute left-4 right-4 top-0 border-t border-dashed border-vf-line" />
      </div>

      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <span className={cn("font-mono text-[12px] tracking-[0.08em]", called ? "text-vf-faint line-through" : "text-vf-text")} data-testid={`ticket-seat-${seat.id}`}>
          {seatLine(seat)}
        </span>
        {!called && seat.myStatus === "going" && (
          <button
            type="button"
            onClick={() => addToCalendar(seat)}
            className="vf-press inline-flex items-center gap-1.5 text-[13px] text-vf-muted hover:text-vf-text min-h-[36px] -mr-1 px-1"
            data-testid={`button-calendar-${seat.id}`}
          >
            <CalendarPlus className="w-4 h-4" /> Calendar
          </button>
        )}
      </div>
    </div>
  );
}

/** On the day, the ticket shows at the top of Discover (§5.7):
 *  "Tonight: Board games at Avondale, 18:30". */
export function TonightSeatStrip({ seats }: { seats: MySeat[] | undefined }) {
  const [, navigate] = useLocation();
  const seat = seats?.find((s) => s.myStatus === "going" && s.status !== "cancelled" && isToday(s.startsAt) && new Date(s.startsAt).getTime() > Date.now() - 3 * 60 * 60 * 1000);
  if (!seat) return null;
  const where = seat.venueName || seat.suburb;
  return (
    <button
      type="button"
      onClick={() => navigate(`/events/${seat.id}?from=/discover`)}
      className="vf-press w-full flex items-center gap-3 rounded-[16px] border border-vf-ember/40 bg-vf-ember/[0.07] px-4 py-3 text-left"
      data-testid="strip-tonight-seat"
    >
      <span className="w-9 h-9 rounded-full bg-vf-ember/15 text-vf-ember flex items-center justify-center shrink-0">
        <SeatGlyph size={18} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] text-vf-text truncate">
          Tonight: {seat.title}{where ? ` at ${where}` : ""}, {ticketTime(seat.startsAt)}
        </span>
        <span className="block vf-small text-vf-muted truncate">{seatLine(seat)}</span>
      </span>
    </button>
  );
}
