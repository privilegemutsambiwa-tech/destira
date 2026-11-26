// Paid event tickets (Part G4). A host (Flame and up) sets a ticket price;
// members pay Destira through Paynow, and the seat is theirs only once the
// payment is confirmed. Owner's terms (2026-11): Destira keeps 10%, the host
// is paid the rest within 3 days after the event (sent by hand, recorded in
// the console), and if the host cancels everyone gets a full refund.
// server/event-tickets.ts sells them; server/admin/event-tickets.ts pays out.

export const PURCHASE_KIND_TICKET = "event_ticket";
export const TICKET_FEE_PERCENT = 10;
export const TICKET_CENTS_MIN = 100;
export const TICKET_CENTS_MAX = 20000;
export const HOST_PAYOUT_DAYS = 3;
/** An event with no end time counts as over this long after it starts. */
export const EVENT_DEFAULT_HOURS = 4;

export const ticketFeeCents = (cents: number) => Math.round((cents * TICKET_FEE_PERCENT) / 100);
export const hostShareCents = (cents: number) => cents - ticketFeeCents(cents);

export function eventEndsAt(startsAt: Date | string, endsAt?: Date | string | null): Date {
  if (endsAt) return new Date(endsAt);
  return new Date(new Date(startsAt).getTime() + EVENT_DEFAULT_HOURS * 3600e3);
}

/** A wallet number a host can be paid on: 07XXXXXXXX. */
export function normalizePayoutNumber(raw: string | null | undefined): string | null {
  const d = (raw || "").replace(/\D/g, "").replace(/^263/, "0");
  const n = d.startsWith("0") ? d : `0${d}`;
  return /^07\d{8}$/.test(n) ? n : null;
}

export const ticketPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** What the host sees about their ticket sales (GET /api/events/:id/tickets). */
export interface HostTicketSummary {
  sold: number;
  grossCents: number;
  feeCents: number;
  hostCents: number;
  refundsDue: number;
  payoutDueBy: string;
  paidOutAt: string | null;
  paidOutCents: number | null;
  payoutNumberMasked: string | null;
}
