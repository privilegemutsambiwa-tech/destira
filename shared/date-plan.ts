// "Let's meet" (docs/destira-3-upgrade-prompt.md Part E): a date proposed in
// the chat, confirmed by the other person, then a card with Add to calendar
// and Share my date, and a private "How did it go?" the next day.

export const DATE_KINDS = ["coffee", "lunch", "walk", "event"] as const;
export type DateKind = (typeof DATE_KINDS)[number];

export const DATE_KIND_LABEL: Record<DateKind, string> = {
  coffee: "Coffee",
  lunch: "Lunch",
  walk: "A walk",
  event: "A Destira event",
};

export const DATE_STATUSES = ["proposed", "confirmed", "declined", "cancelled", "replaced"] as const;
export type DateStatus = (typeof DATE_STATUSES)[number];

/** Up to this many times to choose from in one proposal. */
export const DATE_MAX_TIMES = 3;
/** How far ahead a date can be proposed. */
export const DATE_MAX_DAYS_AHEAD = 60;

export const CHECKIN_ANSWERS = ["great", "okay", "not_for_me", "report"] as const;
export type CheckinAnswer = (typeof CHECKIN_ANSWERS)[number];
export const CHECKIN_LABEL: Record<CheckinAnswer, string> = {
  great: "Great",
  okay: "Okay",
  not_for_me: "Not for me",
  report: "Something wasn't right",
};

export interface DatePlanView {
  id: number;
  matchId: number;
  proposerId: string;
  kind: DateKind;
  placeName: string;
  placeDetail: string | null;
  eventId: number | null;
  /** The times offered (ISO). */
  times: string[];
  /** The time agreed (ISO), once confirmed. */
  startsAt: string | null;
  status: DateStatus;
}

const HARARE = "Africa/Harare";

/** "Sat 29 Nov, 14:00" in Harare time, whatever the phone's zone. */
export function dateTimeLabel(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: HARARE });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: HARARE });
  return `${day}, ${time}`;
}

export function planTitle(p: Pick<DatePlanView, "kind" | "placeName">): string {
  return p.kind === "event" ? p.placeName : `${DATE_KIND_LABEL[p.kind]} at ${p.placeName}`;
}

/** How long the calendar entry runs. */
const DURATION_MIN: Record<DateKind, number> = { coffee: 90, lunch: 120, walk: 90, event: 180 };

export const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
// RFC 5545: escape \ ; , and newlines, then fold lines at 75 octets.
export const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
export function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
    }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** A calendar file for a confirmed date. */
export function buildIcs(p: DatePlanView, otherName: string, now = new Date()): string {
  if (!p.startsAt) throw new Error("not confirmed");
  const start = new Date(p.startsAt);
  const end = new Date(start.getTime() + DURATION_MIN[p.kind] * 60_000);
  const where = [p.placeName, p.placeDetail].filter(Boolean).join(", ");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Destira//Date//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:destira-date-${p.id}@destira.date`,
    `DTSTAMP:${icsStamp(now)}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsText(`${planTitle(p)} with ${otherName}`)}`,
    `LOCATION:${icsText(where)}`,
    `DESCRIPTION:${icsText("Planned on Destira. Meet somewhere public, tell a friend where you'll be, and get yourself there and back.")}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT2H",
    `DESCRIPTION:${icsText(`${planTitle(p)} with ${otherName} in 2 hours`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** What "Share my date" sends to the member's trusted contact. */
export function shareMyDateText(p: DatePlanView, otherName: string): string {
  const where = [p.placeName, p.placeDetail].filter(Boolean).join(", ");
  const what = p.kind === "event" ? `${where} with ${otherName}` : `${DATE_KIND_LABEL[p.kind].toLowerCase()} with ${otherName} at ${where}`;
  const when = p.startsAt ? `, ${dateTimeLabel(p.startsAt)}` : "";
  return `Letting you know where I'll be: ${what}${when}. We met on Destira. I'll message you when I'm home.`;
}
