// Event page: the Destira lead panel and the host's tickets card (split out of pages/EventDetail.tsx).
import { type EventItem, useMyLeadApplication, useApplyToLead } from "@/hooks/use-events";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { HOST_PAYOUT_DAYS, TICKET_FEE_PERCENT, ticketPrice, type HostTicketSummary } from "@shared/event-tickets";

// Lead + confirmation status for an official event, and the "I'll lead this"
// offer. States the 48h rule plainly so nobody is surprised by a cancellation.
export function OfficialLeadPanel({ event }: { event: EventItem }) {
  const min = event.minGoing ?? 5;
  const going = event.resonance.goingCount;
  const deadline = new Date(new Date(event.startsAt).getTime() - 48 * 60 * 60 * 1000);
  const deadlineText = deadline.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const isGoing = event.myStatus === "going";
  const canOffer = isGoing && !event.leadUserId && !event.iAmLead;
  const { data: mine } = useMyLeadApplication(event.id, canOffer);
  const apply = useApplyToLead();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const application = mine?.application ?? null;

  return (
    <div className="rounded-[14px] border border-vf-line bg-vf-surface px-4 py-3.5 flex flex-col gap-3" data-testid="official-lead-panel">
      <div>
        <div className="font-mono uppercase tracking-[0.16em] text-[10.5px] text-vf-faint mb-1">Lead</div>
        {event.leadUserId ? (
          <div className="text-[14px] text-vf-text" data-testid="event-lead-name">
            {event.iAmLead ? "You're leading this one" : event.leadName ?? "A member"}
          </div>
        ) : (
          <div className="text-[14px] text-vf-gold" data-testid="event-needs-lead">Needs a lead</div>
        )}
      </div>
      <p className="text-[12.5px] text-vf-muted leading-[1.5]">
        Confirmed if {min} people have joined and it has a lead by {deadlineText}. {going} of {min} so far.
        Otherwise it's called off and everyone is told.
      </p>

      {canOffer && !application && !open && (
        <button
          onClick={() => setOpen(true)}
          className="w-full h-10 rounded-full border border-vf-gold/40 text-vf-gold hover:bg-vf-gold/[0.08] text-[13px] font-semibold transition-colors"
          data-testid="button-lead-open"
        >
          I'll lead this
        </button>
      )}
      {canOffer && !application && open && (
        <div className="flex flex-col gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Why you? Where you'd meet people, what you'd organise (optional)"
            className="w-full bg-vf-ink border border-vf-line rounded-[10px] px-3 py-2 h-20 text-[13.5px] text-vf-text outline-none focus:border-vf-mint/50 leading-[1.5]"
            data-testid="input-lead-note"
          />
          <div className="flex gap-2">
            <button
              onClick={() => apply.mutate({ eventId: event.id, note: note.trim() }, { onSuccess: () => setOpen(false) })}
              disabled={apply.isPending}
              className="flex-1 h-10 rounded-full bg-vf-ember text-vf-ink text-[13px] font-semibold btn-press disabled:opacity-50 inline-flex items-center justify-center gap-2"
              data-testid="button-lead-submit"
            >
              {apply.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Send my offer
            </button>
            <button onClick={() => setOpen(false)} className="h-10 px-4 rounded-full border border-vf-line text-vf-faint text-[13px]">
              Cancel
            </button>
          </div>
        </div>
      )}
      {canOffer && application?.status === "pending" && (
        <p className="text-[12.5px] text-vf-mint" data-testid="lead-pending">
          Offer sent. Destira reviews offers and will tell you if you're picked.
        </p>
      )}
      {canOffer && application?.status === "rejected" && (
        <p className="text-[12.5px] text-vf-faint">We went another way this time. Thanks for offering.</p>
      )}
      {!isGoing && !event.leadUserId && (
        <p className="text-[12.5px] text-vf-faint">Save a seat first, then you can offer to lead.</p>
      )}
    </div>
  );
}

/** The host's ticket sales: what's sold, Destira's cut, and their payout. */
export function HostTicketsCard({ eventId }: { eventId: number }) {
  const { data: t } = useQuery<HostTicketSummary | null>({ queryKey: [`/api/events/${eventId}/tickets`] });
  if (!t) return null;
  const due = new Date(t.payoutDueBy).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return (
    <div className="rounded-[16px] border border-vf-line p-4" data-testid="host-tickets">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-vf-faint">Tickets</div>
      <div className="text-[15px] text-vf-text mt-1.5">
        {t.sold} sold · {ticketPrice(t.grossCents)}
      </div>
      <div className="text-[13px] text-vf-muted mt-1 leading-[1.5]">
        {t.paidOutAt
          ? `We sent you ${ticketPrice(t.paidOutCents ?? t.hostCents)} on ${new Date(t.paidOutAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}.`
          : `You get ${ticketPrice(t.hostCents)} after Destira's ${TICKET_FEE_PERCENT}% (${ticketPrice(t.feeCents)}), sent to ${t.payoutNumberMasked ?? "your EcoCash"} by ${due}, within ${HOST_PAYOUT_DAYS} days of the event.`}
      </div>
      {t.refundsDue > 0 && <div className="text-[12.5px] text-vf-faint mt-1">{t.refundsDue} being refunded.</div>}
    </div>
  );
}
