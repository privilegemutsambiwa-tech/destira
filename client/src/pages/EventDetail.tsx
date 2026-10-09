import { LayoutShell } from "@/components/layout-shell";
import {
  BUTTON_CLASSES,
  eventActionState,
  eventResonanceSignal,
  OfficialBadge,
} from "@/components/event-row";
import { type EventItem, useMyLeadApplication, useApplyToLead, useEvent, useEventAttendees, useAttendEvent, useCancelAttendance, useUpdateEvent, useCancelEvent, useEnsureEventChat, useEventResources, useAddEventResource, useDeleteEventResource } from "@/hooks/use-events";
import { useGroups } from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { peekPendingRsvp, clearPendingRsvp } from "@/lib/pending-rsvp";
import { useProfile } from "@/hooks/use-profiles";
import { Loader2, ArrowLeft, Pencil, Flag, X, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

function toLocalInput(dateStr: string): string {
  const d = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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

function genderLabel(gender: string | null | undefined): string | null {
  if (gender === "man") return "Man";
  if (gender === "woman") return "Woman";
  return null;
}

function genderPolicyLabel(event: { genderPolicy: string; menSlots: number | null; womenSlots: number | null }): string | null {
  if (event.genderPolicy === "men_only") return "Men only";
  if (event.genderPolicy === "women_only") return "Women only";
  if (event.genderPolicy === "quota" && (event.menSlots != null || event.womenSlots != null)) {
    const parts = [];
    if (event.menSlots != null) parts.push(`${event.menSlots} men`);
    if (event.womenSlots != null) parts.push(`${event.womenSlots} women`);
    return `${parts.join(", ")} needed`;
  }
  return null;
}

// Lead + confirmation status for an official event, and the "I'll lead this"
// offer. States the 48h rule plainly so nobody is surprised by a cancellation.
function OfficialLeadPanel({ event }: { event: EventItem }) {
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

export default function EventDetail({ params }: { params: { id: string } }) {
  const eventId = Number(params.id);
  const { data: event, isLoading } = useEvent(eventId);
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
  const [reportReason, setReportReason] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [seatJustSaved, setSeatJustSaved] = useState(false);
  const { data: myProfile } = useProfile();
  const autoRsvpTried = useRef(false);

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

  const submitEventReport = async () => {
    if (!event) return;
    setReportBusy(true);
    try {
      // Dedicated event-report endpoint, not the user-report one — reporting
      // an event isn't the same as wanting to never see this host again, so
      // unlike a profile report this deliberately doesn't auto-block them.
      await apiRequest("POST", `/api/events/${event.id}/report`, {
        reason: reportReason.trim(),
      });
      toast({ title: "Report sent", description: "Our team will review it." });
      setReportOpen(false);
      setReportReason("");
    } catch {
      toast({ title: "Could not send report", variant: "destructive" });
    } finally {
      setReportBusy(false);
    }
  };

  // The event's own URL doubles as its invite link — it's public once
  // published, so (unlike a group) there's no separate token to mint first.
  // A friend who isn't signed up yet still gets funneled back here after
  // signup (see EventLinkGate / pending-invite.ts in App.tsx).
  const handleShareEvent = async () => {
    if (!event) return;
    const url = `${window.location.origin}/events/${event.id}`;
    const shareData = { title: event.title, text: `Come to "${event.title}" on Destira`, url };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        setShareLink(url);
        setShareDialogOpen(true);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setShareLink(url);
      setShareDialogOpen(true);
    }
  };

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      toast({ title: "Link copied!" });
    } catch {
      toast({ title: "Could not copy link", variant: "destructive" });
    }
  };

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
          <div className="md:sticky md:top-6 self-start rounded-[20px] border border-vf-line bg-vf-surface2 p-5 flex flex-col gap-4">
            <div>
              <div className="font-mono text-[11px] tracking-[0.14em] text-vf-ember">
                {formatFullDate(event.startsAt).toUpperCase()}
              </div>
              <div className="text-[13px] text-vf-muted mt-1">
                {formatTime(event.startsAt)} · {event.resonance.goingCount} going
              </div>
              <div className="text-[12px] text-vf-faint mt-1.5">{SEAT_MODEL_COPY[event.seatModel]}</div>
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
                disabled={pending}
                className={`w-full px-5 py-3 rounded-full text-[14px] font-semibold btn-press transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${BUTTON_CLASSES[state.variant]}`}
                style={{ minHeight: 44 }}
                data-testid="button-event-action"
              >
                {pending && <Loader2 className="w-4 h-4 animate-spin" />}
                {state.label}
              </button>
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
              <div className="flex items-center gap-4 self-start">
                <button
                  onClick={handleShareEvent}
                  className="inline-flex items-center gap-1.5 text-[12.5px] text-vf-faint hover:text-vf-text transition-colors"
                  data-testid="button-share-event"
                >
                  <Share2 className="w-3.5 h-3.5" /> Share
                </button>
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
                      <span className="font-mono text-[11.5px] text-vf-mint shrink-0">{a.score}</span>
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

      <Dialog open={reportOpen} onOpenChange={(v) => { setReportOpen(v); if (!v) setReportReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this event</DialogTitle>
            <DialogDescription>This sends a record to our team for review, citing this event.</DialogDescription>
          </DialogHeader>
          <textarea
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            placeholder="What's going on? (optional)"
            rows={3}
            className="w-full rounded-[12px] border border-vf-line bg-vf-surface2 p-3 text-sm text-vf-text outline-none resize-none"
            data-testid="input-event-report-reason"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReportOpen(false)} data-testid="button-cancel-event-report">
              Cancel
            </Button>
            <Button onClick={submitEventReport} disabled={reportBusy} data-testid="button-submit-event-report">
              {reportBusy ? "Sending…" : "Send report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share this event</DialogTitle>
            <DialogDescription>
              Anyone with this link can see the event, including a friend who isn't on Destira yet. In WhatsApp it
              shows as a card with the date and how many are going, and they can save a seat in one tap.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-[12px] border border-vf-line bg-vf-surface2 p-3 text-[13px] text-vf-text break-all" data-testid="text-event-share-link">
            {shareLink}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShareDialogOpen(false)} data-testid="button-close-event-share">
              Close
            </Button>
            <Button variant="outline" onClick={handleCopyShareLink} data-testid="button-copy-event-share-link">
              Copy link
            </Button>
            <Button
              asChild
              data-testid="button-whatsapp-event-share"
            >
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Come with me to "${event.title}" on Destira ${shareLink}`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Send on WhatsApp
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LayoutShell>
  );
}
