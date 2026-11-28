import { LayoutShell } from "@/components/layout-shell";
import { BUTTON_CLASSES, eventActionState, eventResonanceSignal, OfficialBadge } from "@/components/event-row";
import { useMySeats, useEvent, useEventAttendees, useAttendEvent, useCancelAttendance, useUpdateEvent, useCancelEvent, useEnsureEventChat, useEventResources, useAddEventResource, useDeleteEventResource } from "@/hooks/use-events";
import { useGroups } from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { peekPendingRsvp, clearPendingRsvp } from "@/lib/pending-rsvp";
import { useProfile } from "@/hooks/use-profiles";
import { Loader2, ArrowLeft, Pencil, Flag, X, Share2, ImageIcon, CalendarPlus } from "lucide-react";
import { SeatTicket, addToCalendar } from "@/components/seat-ticket";
import { DoorPassCard, EventClicksCard, HostDoorLink } from "@/components/event-door";
import { EventHostCard, EventRatingCard } from "@/components/event-extras";
import { AvatarStack, goingLine } from "@/components/event-row";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { PurchaseSheet } from "@/components/purchase-sheet";
import { ticketPrice } from "@shared/event-tickets";
import { EventSkeleton } from "@/components/ui-vf/skeletons";
import { toLocalInput, formatFullDate, formatTime, SEAT_MODEL_COPY, genderLabel, genderPolicyLabel } from "@/components/event-detail/event-detail-utils";
import { OfficialLeadPanel, HostTicketsCard } from "@/components/event-detail/host-panels";
import { EventReportDialog, useEventSharing } from "@/components/event-detail/event-sharing";

export default function EventDetail({ params }: { params: { id: string } }) {
  const eventId = Number(params.id);
  const { data: event, isLoading } = useEvent(eventId);
  const { data: mySeats } = useMySeats();
  const mySeat = mySeats?.find((s) => s.id === eventId && s.myStatus === "going");
  const { data: attendees } = useEventAttendees(eventId);
  const { data: resources } = useEventResources(eventId);
  const addResource = useAddEventResource();
  const deleteResource = useDeleteEventResource();
  const [resourceText, setResourceText] = useState("");
  const { data: groups } = useGroups();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const attend = useAttendEvent();
  const cancel = useCancelAttendance();
  const updateEvent = useUpdateEvent();
  const cancelEvent = useCancelEvent();
  const ensureChat = useEnsureEventChat();
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ title: "", description: "", startsAt: "" });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const { toast } = useToast();
  const [reportOpen, setReportOpen] = useState(false);
  const [seatJustSaved, setSeatJustSaved] = useState(false);
  // Paid tickets (shared/event-tickets.ts): buy one, then the seat is yours.
  const [buyingTicket, setBuyingTicket] = useState(false);
  const [ticketBusy, setTicketBusy] = useState(false);
  const { data: myProfile } = useProfile();
  const autoRsvpTried = useRef(false);
  const { shareEvent, makeStatusCard, makingCard, dialogs: sharingDialogs } = useEventSharing(event, user?.id);

  // Arrived via "Save my seat" on the signed-out preview: save it now, once.
  useEffect(() => {
    if (!event || !user || autoRsvpTried.current) return;
    if (peekPendingRsvp() !== event.id) return;
    autoRsvpTried.current = true;
    clearPendingRsvp();
    const active = event.myStatus === "going" || event.myStatus === "waitlisted" || event.myStatus === "requested";
    if (active || event.status !== "published" || event.hostUserId === user.id) return;
    attend.mutate(
      { eventId: event.id, seatModel: event.seatModel },
      { onSuccess: (r) => { setSeatJustSaved(true); toast({ title: r.status === "going" ? "Your seat is saved" : r.status === "waitlisted" ? "You're on the waitlist" : "Request sent to the host" }); } },
    );
  }, [event, user, attend, toast]);

  if (isLoading) {
    return (
      <LayoutShell>
        <div className="max-w-4xl mx-auto">
          <EventSkeleton />
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

  const refreshEvent = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/events", event.id] });
    queryClient.invalidateQueries({ queryKey: ["/api/events"] });
  };
  // Someone who already has a ticket (and gave up the seat) takes it back
  // without paying again; everyone else buys one.
  const takeTicketSeat = async () => {
    setTicketBusy(true);
    try {
      const res = await fetch(`/api/events/${event.id}/attend`, { method: "POST", credentials: "include" });
      if (res.status === 402) return setBuyingTicket(true);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return toast({ title: body?.message || "Couldn't save your seat", variant: "destructive" });
      refreshEvent();
      toast({ title: body.status === "going" ? "Your seat is back" : "You're on the waitlist", description: "You already have a ticket." });
    } finally {
      setTicketBusy(false);
    }
  };

  const runAction = () => {
    if (state.kind === "ticket") void takeTicketSeat();
    else if (state.kind === "attend") attend.mutate({ eventId: event.id, seatModel: event.seatModel });
    else if (state.kind === "cancel") cancel.mutate(event.id);
    // 'manage' has no action here yet — this IS the host's page. Host tooling
    // (promote/decline for curated events) is a separate follow-up.
  };

  const notable = event.resonance.notableAttendees;
  const notableIds = new Set(notable.map((a) => a.id));
  const genderByUserId = new Map((attendees || []).map((a) => [a.userId, a.gender]));
  const otherAttendees = (attendees || []).filter((a) => a.status === "going" && !notableIds.has(a.userId));

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

        {event.status === "cancelled" && (
          <div className="mb-4 rounded-[14px] border border-vf-line bg-vf-surface2 px-4 py-3" data-testid="banner-cancelled">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">This event was called off</div>
            {event.cancelReason && (
              <p className="text-[13.5px] text-vf-muted mt-1 leading-[1.5]">{event.cancelReason}</p>
            )}
          </div>
        )}
        {seatJustSaved && (
          <div className="mb-4 rounded-[14px] border border-vf-mint/30 bg-vf-mint/[0.06] px-4 py-3" data-testid="banner-seat-saved">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-mint">You're in</div>
            <p className="text-[13.5px] text-vf-muted mt-1 leading-[1.5]">
              {myProfile?.onboardingCompleted
                ? "Your seat is saved and you've been added to the event chat."
                : "Your seat is saved. Answer a few quick questions next, so the people going know a bit about who you are."}
            </p>
            {!myProfile?.onboardingCompleted && (
              <button
                onClick={() => setLocation("/onboarding")}
                className="mt-2.5 h-9 px-4 rounded-full bg-vf-ember text-vf-ink text-[13px] font-semibold btn-press"
                data-testid="button-seat-saved-onboarding"
              >
                Answer the questions
              </button>
            )}
          </div>
        )}
        {event.status === "pending_review" && isHost && (
          <div className="mb-4 rounded-[14px] border border-vf-gold/30 bg-vf-gold/[0.06] px-4 py-3" data-testid="banner-review">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-gold">In review</div>
            <p className="text-[13.5px] text-vf-muted mt-1 leading-[1.5]">
              Private homes get a quick once-over — verifying your video and ID — before the event goes public. Nobody
              else can see it yet.
            </p>
          </div>
        )}

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
            {event.isOfficial && <div className="mb-2"><OfficialBadge /></div>}
            <h1 className="font-serif font-normal text-white text-[clamp(24px,3.4vw,38px)] leading-[1.08]">
              {event.title}
            </h1>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px] gap-6 mt-6">
          {/* Left: about */}
          <div className="flex flex-col gap-6 min-w-0">
            {event.isOfficial && event.sponsorName && (
              <div className="flex items-center gap-3" data-testid="event-sponsor">
                {event.sponsorLogoUrl && (
                  <img src={event.sponsorLogoUrl} alt="" className="w-10 h-10 rounded-[10px] object-cover border border-vf-line" />
                )}
                <div>
                  <div className="font-mono uppercase tracking-[0.16em] text-[10.5px] text-vf-faint">Presented by</div>
                  <div className="text-[15px] text-vf-text">{event.sponsorName}</div>
                </div>
              </div>
            )}
            {event.description && (
              <div>
                <div className="font-mono uppercase tracking-[0.16em] text-[10.5px] text-vf-faint mb-2">About</div>
                <p className="text-[15px] leading-relaxed text-vf-text whitespace-pre-line">{event.description}</p>
              </div>
            )}
            <dl className="grid grid-cols-[64px_1fr] gap-x-4 gap-y-2.5 text-[14px]">
              {(event.venueName || event.suburb || event.city) && (
                <>
                  <dt className="font-mono uppercase tracking-[0.16em] text-[10.5px] text-vf-faint pt-0.5">Where</dt>
                  <dd className="text-vf-text">{[event.venueName, event.suburb, event.city].filter(Boolean).join(" · ")}</dd>
                </>
              )}
              <dt className="font-mono uppercase tracking-[0.16em] text-[10.5px] text-vf-faint pt-0.5">When</dt>
              <dd className="text-vf-text">
                {formatFullDate(event.startsAt)} · {formatTime(event.startsAt)}
                {event.endsAt ? `–${formatTime(event.endsAt)}` : ""}
              </dd>
              {groupName && (
                <>
                  <dt className="font-mono uppercase tracking-[0.16em] text-[10.5px] text-vf-faint pt-0.5">Host</dt>
                  <dd className="text-vf-muted">{groupName}</dd>
                </>
              )}
            </dl>
            <EventHostCard eventId={event.id} />

            {(event.myStatus === "going" || (resources && resources.length > 0)) && (
              <div>
                <div className="font-mono uppercase tracking-[0.16em] text-[10.5px] text-vf-faint mb-2">What people are bringing</div>
                {resources && resources.length > 0 ? (
                  <div className="flex flex-col gap-2 mb-3">
                    {resources.map((r) => (
                      <div key={r.id} className="flex items-center gap-2.5 text-[13.5px]" data-testid={`event-resource-${r.id}`}>
                        <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 bg-vf-surface2 flex items-center justify-center">
                          {r.coverPhotoUrl ? (
                            <img src={r.coverPhotoUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="font-serif text-[11px] text-vf-soft">{(r.displayName || "?")[0]}</span>
                          )}
                        </div>
                        <span className="text-vf-text">
                          <span className="text-vf-muted">{r.displayName || "Someone"} —</span> {r.description}
                        </span>
                        {r.userId === user?.id && (
                          <button
                            onClick={() => deleteResource.mutate({ eventId: event.id, pledgeId: r.id })}
                            className="text-vf-faint hover:text-vf-text transition-colors ml-auto shrink-0"
                            aria-label="Remove"
                            data-testid={`button-remove-resource-${r.id}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-vf-faint mb-3">Nobody's said what they're bringing yet.</p>
                )}
                {event.myStatus === "going" && (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!resourceText.trim()) return;
                      addResource.mutate(
                        { eventId: event.id, description: resourceText.trim() },
                        { onSuccess: () => setResourceText("") },
                      );
                    }}
                  >
                    <input
                      value={resourceText}
                      onChange={(e) => setResourceText(e.target.value)}
                      placeholder="I'm bringing… ($10, a speaker, extra chairs)"
                      className="flex-1 h-9 rounded-full border border-vf-line bg-vf-surface2 px-3.5 text-[13px] text-vf-text placeholder:text-vf-faint outline-none focus:border-vf-text/25"
                      data-testid="input-add-resource"
                    />
                    <button
                      type="submit"
                      disabled={!resourceText.trim() || addResource.isPending}
                      className="h-9 px-4 rounded-full bg-vf-ember text-vf-ink text-[13px] font-semibold btn-press hover:bg-[var(--vf-ember-soft)] transition-colors disabled:opacity-40 shrink-0"
                      data-testid="button-add-resource"
                    >
                      Add
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Right: sticky action card */}
          <div className="md:sticky md:top-6 self-start flex flex-col gap-4 min-w-0">
          {mySeat && event.status !== "cancelled" && <SeatTicket seat={mySeat} />}
          {!isHost && event.myStatus === "going" && event.status === "published" && <DoorPassCard eventId={event.id} />}
          <EventClicksCard eventId={event.id} />
          <EventRatingCard eventId={event.id} title={event.title} />
          <div className="rounded-[20px] border border-vf-line bg-vf-surface2 p-5 flex flex-col gap-4">
            <div>
              <div className="font-mono text-[11px] tracking-[0.14em] text-vf-ember">
                {formatFullDate(event.startsAt).toUpperCase()}
              </div>
              <div className="text-[13px] text-vf-muted mt-1">
                {formatTime(event.startsAt)}
                {[event.venueName, event.suburb].filter(Boolean).length > 0 && ` · ${[event.venueName, event.suburb].filter(Boolean).join(", ")}`}
              </div>
              <div className="flex items-center gap-2.5 mt-3" data-testid="event-going-line">
                <AvatarStack people={event.resonance.notableAttendees} size={24} />
                <span className="text-[13px] text-vf-text">{goingLine(event)}</span>
              </div>
              <div className="text-[12px] text-vf-faint mt-1.5">
                {event.costModel === "ticket" && event.seatModel === "capped" ? `${event.seatCount ?? ""} seats, sold as tickets` : SEAT_MODEL_COPY[event.seatModel]}
              </div>
              {genderPolicyLabel(event) && (
                <div className="text-[12px] text-vf-faint mt-0.5" data-testid="event-gender-policy">{genderPolicyLabel(event)}</div>
              )}
              {event.costModel === "contribute" && event.contributionAmount != null && (
                <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-vf-faint leading-[1.5]" data-testid="event-contribution-line">
                  Contribution · ${event.contributionAmount} · settled in person on the day · Destira never handles it
                </div>
              )}
              {event.costModel === "free_hosted" && (
                <div className="mt-2 text-[12px] text-vf-faint">The host is covering it.</div>
              )}
              {event.costModel === "ticket" && event.ticketCents != null && (
                <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-vf-faint leading-[1.5]" data-testid="event-ticket-line">
                  Ticket · {ticketPrice(event.ticketCents)} · paid through Destira · your seat once it's paid · full refund if the event is called off
                </div>
              )}
            </div>

            {event.twinFlagged && (
              <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-vf-mint" data-testid="event-twin-flag">
                Your twin flagged this
              </div>
            )}
            {signal && (
              <div className={`font-mono text-[11.5px] ${signal.color === "mint" ? "text-vf-mint" : "text-vf-gold"}`}>
                {signal.text}
              </div>
            )}

            {event.isOfficial && event.status === "published" && (
              <OfficialLeadPanel event={event} />
            )}

            {state.kind !== "manage" && (
              <button
                onClick={runAction}
                disabled={pending || ticketBusy || state.kind == null}
                className={`w-full px-5 py-3 rounded-full text-[14px] font-semibold btn-press transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${BUTTON_CLASSES[state.variant]}`}
                style={{ minHeight: 44 }}
                data-testid="button-event-action"
              >
                {(pending || ticketBusy) && <Loader2 className="w-4 h-4 animate-spin" />}
                {state.label}
              </button>
            )}
            {!isHost && event.costModel === "ticket" && event.myStatus === "going" && (
              <p className="text-[12px] text-vf-faint leading-[1.5]" data-testid="event-ticket-held">
                You have a ticket. If you give up your seat, the ticket isn't refunded, but you can take a seat back while there's room. If the event is called off, you get it all back.
              </p>
            )}
            {isHost && event.costModel === "ticket" && <HostTicketsCard eventId={event.id} />}
            {event.costModel === "ticket" && event.ticketCents != null && (
              <PurchaseSheet
                open={buyingTicket}
                onOpenChange={setBuyingTicket}
                kind="event_ticket"
                refId={event.id}
                title="Ticket"
                label={event.title}
                cents={event.ticketCents}
                note="Your seat is saved once it's paid. If the event is called off, you get the full amount back."
                onPaid={() => {
                  setBuyingTicket(false);
                  refreshEvent();
                  setSeatJustSaved(true);
                  toast({ title: "You have a ticket", description: "Your seat is saved." });
                }}
              />
            )}
            {!isHost && event.myStatus === "going" && event.chatGroupId != null && (
              <button
                onClick={() => setLocation(`/lounge/group/${event.chatGroupId}`)}
                className="w-full h-10 rounded-full border border-vf-line text-vf-soft hover:border-vf-text/25 text-[13px] transition-colors"
                data-testid="button-event-chat"
              >
                Open event chat
              </button>
            )}
            {event.status !== "cancelled" && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 self-start">
                {event.myStatus === "going" && (
                  <button
                    onClick={() => addToCalendar(event)}
                    className="inline-flex items-center gap-1.5 text-[12.5px] text-vf-faint hover:text-vf-text transition-colors min-h-[32px]"
                    data-testid="button-add-calendar"
                  >
                    <CalendarPlus className="w-3.5 h-3.5" /> Add to calendar
                  </button>
                )}
                <button
                  onClick={shareEvent}
                  className="inline-flex items-center gap-1.5 text-[12.5px] text-vf-faint hover:text-vf-text transition-colors"
                  data-testid="button-share-event"
                >
                  <Share2 className="w-3.5 h-3.5" /> Share
                </button>
                {event.status === "published" && (
                  <button
                    onClick={makeStatusCard}
                    disabled={makingCard}
                    className="inline-flex items-center gap-1.5 text-[12.5px] text-vf-faint hover:text-vf-text transition-colors disabled:opacity-60"
                    data-testid="button-status-card-event"
                  >
                    {makingCard ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />} Post to Status
                  </button>
                )}
                {!isHost && (
                  <button
                    onClick={() => setReportOpen(true)}
                    className="inline-flex items-center gap-1.5 text-[12.5px] text-vf-faint hover:text-vf-text transition-colors"
                    data-testid="button-report-event"
                  >
                    <Flag className="w-3.5 h-3.5" /> Report event
                  </button>
                )}
              </div>
            )}
            {isHost && event.status !== "cancelled" && (
              <div className="border-t border-vf-line pt-4 flex flex-col gap-3">
                <div className="font-mono uppercase tracking-[0.16em] text-[10.5px] text-vf-faint">You're hosting</div>
                {event.status === "published" && <HostDoorLink eventId={event.id} />}

                {!editing && !cancelOpen && (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEdit({
                            title: event.title,
                            description: event.description ?? "",
                            startsAt: toLocalInput(event.startsAt),
                          });
                          setEditing(true);
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-full border border-vf-line text-vf-soft hover:border-vf-text/25 text-[13px] transition-colors"
                        data-testid="button-edit-event"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => setCancelOpen(true)}
                        className="flex-1 h-9 rounded-full border border-vf-line text-vf-faint hover:text-vf-text hover:border-vf-text/25 text-[13px] transition-colors"
                        data-testid="button-open-cancel-event"
                      >
                        Call it off
                      </button>
                    </div>
                    <button
                      disabled={ensureChat.isPending}
                      onClick={() => {
                        if (event.chatGroupId) {
                          setLocation(`/lounge/group/${event.chatGroupId}`);
                        } else {
                          ensureChat.mutate(event.id, {
                            onSuccess: (r) => setLocation(`/lounge/group/${r.groupId}`),
                          });
                        }
                      }}
                      className="w-full h-9 rounded-full border border-vf-line text-vf-soft hover:border-vf-text/25 text-[13px] transition-colors inline-flex items-center justify-center gap-2"
                      data-testid="button-event-chat"
                    >
                      {ensureChat.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {event.chatGroupId ? "Open event chat" : "Turn on event chat"}
                    </button>
                  </div>
                )}

                {editing && (
                  <div className="flex flex-col gap-2.5">
                    <input
                      className="w-full bg-vf-ink border border-vf-line rounded-[10px] px-3 h-10 text-[14px] text-vf-text outline-none focus:border-vf-mint/50"
                      value={edit.title}
                      onChange={(e) => setEdit((s) => ({ ...s, title: e.target.value }))}
                      data-testid="input-edit-title"
                    />
                    <textarea
                      className="w-full bg-vf-ink border border-vf-line rounded-[10px] px-3 py-2 h-20 text-[14px] text-vf-text outline-none focus:border-vf-mint/50 leading-[1.5]"
                      value={edit.description}
                      onChange={(e) => setEdit((s) => ({ ...s, description: e.target.value }))}
                      placeholder="Description"
                      data-testid="input-edit-description"
                    />
                    <input
                      type="datetime-local"
                      className="w-full bg-vf-ink border border-vf-line rounded-[10px] px-3 h-10 text-[14px] text-vf-text outline-none focus:border-vf-mint/50"
                      value={edit.startsAt}
                      onChange={(e) => setEdit((s) => ({ ...s, startsAt: e.target.value }))}
                      data-testid="input-edit-starts"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditing(false)}
                        className="flex-1 h-9 rounded-full border border-vf-line text-vf-muted text-[13px]"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={updateEvent.isPending || edit.title.trim().length < 4 || !edit.startsAt}
                        onClick={() => {
                          const dt = new Date(edit.startsAt);
                          if (Number.isNaN(dt.getTime())) return;
                          updateEvent.mutate(
                            {
                              eventId: event.id,
                              patch: {
                                title: edit.title.trim(),
                                description: edit.description.trim() || null,
                                startsAt: dt.toISOString(),
                              },
                            },
                            { onSuccess: () => setEditing(false) },
                          );
                        }}
                        className="flex-1 h-9 rounded-full bg-vf-ember text-vf-ink font-semibold text-[13px] btn-press hover:bg-[var(--vf-ember-soft)] disabled:opacity-40 inline-flex items-center justify-center gap-2"
                        data-testid="button-save-event"
                      >
                        {updateEvent.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Save
                      </button>
                    </div>
                  </div>
                )}

                {cancelOpen && (
                  <div className="flex flex-col gap-2.5">
                    <textarea
                      className="w-full bg-vf-ink border border-vf-line rounded-[10px] px-3 py-2 h-20 text-[14px] text-vf-text outline-none focus:border-vf-mint/50 leading-[1.5]"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="What should people who signed up know?"
                      data-testid="input-cancel-reason"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setCancelOpen(false); setCancelReason(""); }}
                        className="flex-1 h-9 rounded-full border border-vf-line text-vf-muted text-[13px]"
                      >
                        Keep it
                      </button>
                      <button
                        disabled={cancelEvent.isPending || cancelReason.trim().length < 3}
                        onClick={() =>
                          cancelEvent.mutate(
                            { eventId: event.id, reason: cancelReason.trim() },
                            { onSuccess: () => setCancelOpen(false) },
                          )
                        }
                        className="flex-1 h-9 rounded-full bg-vf-ember text-vf-ink font-semibold text-[13px] btn-press hover:bg-[var(--vf-ember-soft)] disabled:opacity-40 inline-flex items-center justify-center gap-2"
                        data-testid="button-confirm-cancel-event"
                      >
                        {cancelEvent.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Call it off
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {(notable.length > 0 || otherAttendees.length > 0) && (
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
                      <span className="text-[13.5px] text-vf-text flex-1 truncate">
                        {a.name}
                        {genderLabel(genderByUserId.get(a.id)) && (
                          <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-vf-faint"> · {genderLabel(genderByUserId.get(a.id))}</span>
                        )}
                      </span>
                    </div>
                  ))}
                  {otherAttendees.map((a) => (
                    <div key={a.userId} className="flex items-center gap-2.5" data-testid={`event-attendee-${a.userId}`}>
                      <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-vf-surface flex items-center justify-center">
                        {a.coverPhotoUrl ? (
                          <img src={a.coverPhotoUrl} alt={a.displayName || "Attendee"} className="w-full h-full object-cover" />
                        ) : (
                          <span className="font-serif text-[12px] text-vf-soft">{(a.displayName || "?")[0]}</span>
                        )}
                      </div>
                      <span className="text-[13.5px] text-vf-text flex-1 truncate">
                        {a.displayName || "Someone"}
                        {genderLabel(a.gender) && (
                          <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-vf-faint"> · {genderLabel(a.gender)}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          </div>
        </div>
      </div>

      <EventReportDialog eventId={event.id} open={reportOpen} onOpenChange={setReportOpen} />
      {sharingDialogs}
    </LayoutShell>
  );
}
