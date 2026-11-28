// Event page: sharing the event (link, Status card, Destira story) and
// reporting it (split out of pages/EventDetail.tsx).
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { renderStatusCard, shareStatusBlob, logShare } from "@/lib/status-card";
import { isNativeApp, nativeShareLink } from "@/lib/native";
import { publicOrigin } from "@/lib/app-api";
import type { EventItem } from "@/hooks/use-events";
import { formatFullDate, formatTime } from "@/components/event-detail/event-detail-utils";

type Seats = { going: number; seatsLeft: number | null; womenSeatsLeft: number | null; menSeatsLeft: number | null };

export function seatsBadge(s: Seats): string | null {
  if (s.womenSeatsLeft != null && s.menSeatsLeft != null) {
    // Nobody in yet: lead with what makes it easy to say yes.
    if (s.going === 0) return `Free · ${s.womenSeatsLeft + s.menSeatsLeft} seats, half for women`;
    if (s.womenSeatsLeft > 0 && s.menSeatsLeft > 0) return `${s.womenSeatsLeft} women's and ${s.menSeatsLeft} men's seats left`;
    if (s.womenSeatsLeft > 0) return `${s.womenSeatsLeft} women's ${s.womenSeatsLeft === 1 ? "seat" : "seats"} left`;
    if (s.menSeatsLeft > 0) return `${s.menSeatsLeft} men's ${s.menSeatsLeft === 1 ? "seat" : "seats"} left`;
    return "Waitlist open";
  }
  if (s.seatsLeft != null) return s.seatsLeft > 0 ? `${s.seatsLeft} ${s.seatsLeft === 1 ? "seat" : "seats"} left` : "Waitlist open";
  return s.going > 0 ? `${s.going} going` : null;
}

/** Share the event: the link (native share sheet, or a dialog with the
 *  link), and "Post to Status", one card for the Destira story or WhatsApp
 *  Status. `dialogs` renders the two dialogs; put it once in the page. */
export function useEventSharing(event: EventItem | null | undefined, userId: string | undefined) {
  const { toast } = useToast();
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [makingCard, setMakingCard] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusCard, setStatusCard] = useState<{ blob: Blob; url: string } | null>(null);
  const [postingStory, setPostingStory] = useState(false);
  // The sharer's invite code rides along on event links, so a friend who
  // signs up from one counts as their invite (you both get a free week).
  const { data: referral } = useQuery<{ code: string }>({ queryKey: ["/api/referrals/me"], enabled: !!userId });

  // The event's own URL doubles as its invite link — it's public once
  // published, so (unlike a group) there's no separate token to mint first.
  // A friend who isn't signed up yet still gets funneled back here after
  // signup (see EventLinkGate / pending-invite.ts in App.tsx).
  const eventShareUrl = (extra = "") => {
    if (!event) return "";
    const params = new URLSearchParams();
    if (referral?.code) params.set("ref", referral.code);
    const qs = [params.toString(), extra].filter(Boolean).join("&");
    return `${publicOrigin()}/events/${event.id}${qs ? `?${qs}` : ""}`;
  };

  const shareEvent = async () => {
    if (!event) return;
    const url = eventShareUrl();
    const shareData = { title: event.title, text: `Come to "${event.title}" on Destira`, url };
    logShare("event", "link", event.id);
    try {
      if (isNativeApp()) {
        await nativeShareLink(event.title, shareData.text, url);
      } else if (navigator.share) {
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

  // "Post to Status": one card, two places to put it — the member's
  // Destira story (with a live "See the event" panel for viewers) or their
  // WhatsApp Status (link in the caption, since images aren't tappable there).
  const makeStatusCard = async () => {
    if (!event) return;
    setMakingCard(true);
    try {
      const mine = event.hostUserId === userId;
      const going = event.myStatus === "going";
      const place = [event.venueName, event.suburb, event.city].filter(Boolean).join(" · ");
      const seats = await fetch(`/api/events/${event.id}/seats`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      const d = new Date(event.startsAt);
      const blob = await renderStatusCard({
        eyebrow: mine ? "I'm hosting" : going ? "I'm going" : "Who's coming?",
        title: event.title,
        lines: [`${formatFullDate(event.startsAt)} · ${formatTime(event.startsAt)}`, ...(place ? [place] : [])],
        footer: "Save a seat on Destira",
        imageUrl: event.coverImageUrl,
        date: {
          dow: d.toLocaleDateString("en-GB", { weekday: "short" }),
          day: String(d.getDate()),
          month: d.toLocaleDateString("en-GB", { month: "short" }),
        },
        badge: seats ? seatsBadge(seats) : null,
      });
      setStatusCard((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { blob, url: URL.createObjectURL(blob) };
      });
      setStatusOpen(true);
    } catch {
      toast({ title: "Couldn't make the card", variant: "destructive" });
    } finally {
      setMakingCard(false);
    }
  };

  const postToDestiraStory = async () => {
    if (!event || !statusCard) return;
    setPostingStory(true);
    try {
      const form = new FormData();
      form.append("media", new File([statusCard.blob], "destira-event.png", { type: "image/png" }));
      form.append("eventId", String(event.id));
      const res = await fetch("/api/stories", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || "Couldn't post");
      logShare("event", "destira_story", event.id);
      queryClient.invalidateQueries({ queryKey: ["/api/stories/feed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stories/mine"] });
      setStatusOpen(false);
      toast({ title: "Posted to your story", description: "Anyone who views it can open the event and save a seat." });
    } catch (err) {
      toast({ title: "Couldn't post your story", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setPostingStory(false);
    }
  };

  const postToWhatsAppStatus = async () => {
    if (!event || !statusCard) return;
    const mine = event.hostUserId === userId;
    const going = event.myStatus === "going";
    const url = eventShareUrl("utm_source=status&utm_content=event");
    try {
      const outcome = await shareStatusBlob(
        statusCard.blob,
        `${mine ? "I'm hosting" : going ? "I'm going to" : "Come to"} "${event.title}". Save a seat: ${url}`,
        "destira-event.png",
      );
      if (outcome !== "cancelled") {
        logShare("event", "status_card", event.id);
        setStatusOpen(false);
      }
      if (outcome === "downloaded") {
        toast({ title: "Card saved", description: "Post it as your Status. The link is copied for the caption." });
      }
    } catch {
      toast({ title: "Couldn't share the card", variant: "destructive" });
    }
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      toast({ title: "Link copied!" });
    } catch {
      toast({ title: "Could not copy link", variant: "destructive" });
    }
  };

  const dialogs: ReactNode = (
    <>
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Post to Status</DialogTitle>
            <DialogDescription>
              Put this card on your Destira story, where people can tap through to the event, or on your WhatsApp Status.
            </DialogDescription>
          </DialogHeader>
          {statusCard && (
            <img
              src={statusCard.url}
              alt="Your Status card for this event"
              className="mx-auto w-[180px] max-w-full rounded-[14px] shadow-lg"
              style={{ aspectRatio: "9 / 16" }}
              data-testid="img-status-card-preview"
            />
          )}
          <div className="flex flex-col gap-2.5 mt-1">
            <Button onClick={postToDestiraStory} disabled={postingStory} data-testid="button-post-destira-story">
              {postingStory && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Post to my Destira story
            </Button>
            <Button variant="outline" onClick={postToWhatsAppStatus} data-testid="button-post-whatsapp-status">
              Share to WhatsApp Status
            </Button>
          </div>
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
            <Button variant="outline" onClick={copyShareLink} data-testid="button-copy-event-share-link">
              Copy link
            </Button>
            <Button
              asChild
              data-testid="button-whatsapp-event-share"
            >
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Come with me to "${event?.title ?? ""}" on Destira ${shareLink}`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Send on WhatsApp
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { shareEvent, makeStatusCard, makingCard, dialogs };
}

/** "Report this event": a record for the team, citing the event. */
export function EventReportDialog({ eventId, open, onOpenChange }: { eventId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const close = (v: boolean) => { onOpenChange(v); if (!v) setReason(""); };

  const submit = async () => {
    setBusy(true);
    try {
      // Dedicated event-report endpoint, not the user-report one — reporting
      // an event isn't the same as wanting to never see this host again, so
      // unlike a profile report this deliberately doesn't auto-block them.
      await apiRequest("POST", `/api/events/${eventId}/report`, { reason: reason.trim() });
      toast({ title: "Report sent", description: "Our team will review it." });
      close(false);
    } catch {
      toast({ title: "Could not send report", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this event</DialogTitle>
          <DialogDescription>This sends a record to our team for review, citing this event.</DialogDescription>
        </DialogHeader>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What's going on? (optional)"
          rows={3}
          className="w-full rounded-[12px] border border-vf-line bg-vf-surface2 p-3 text-sm text-vf-text outline-none resize-none"
          data-testid="input-event-report-reason"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} data-testid="button-cancel-event-report">
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} data-testid="button-submit-event-report">
            {busy ? "Sending…" : "Send report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
