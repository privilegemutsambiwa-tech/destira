// Events, the rest of Part J: who's hosting (events hosted, stars once
// there are enough), a venue partner's offer, and rating the event after.
import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Star, Tag } from "lucide-react";
import { VfAvatar } from "@/components/ui-vf";
import { useToast } from "@/hooks/use-toast";
import { RATING_NOTE_MAX, type EventAbout, type HostSummary } from "@shared/event-extras";

const aboutKey = (id: number) => [`/api/events/${id}/about`];
export const useEventAbout = (eventId: number) => useQuery<EventAbout>({ queryKey: aboutKey(eventId) });

export function hostLine(h: HostSummary): string {
  const bits: string[] = [];
  if (h.rating) bits.push(`★ ${h.rating.avg.toFixed(1)} from ${h.rating.count}`);
  bits.push(h.hosted === 0 ? "First event" : h.hosted === 1 ? "1 event hosted" : `${h.hosted} events hosted`);
  return bits.join(" · ");
}

/** Under the event's details: the host, and a partner venue's offer. */
export function EventHostCard({ eventId }: { eventId: number }) {
  const { data } = useEventAbout(eventId);
  if (!data) return null;
  const h = data.host;
  return (
    <div className="flex flex-col gap-2.5">
      <Link href={`/hosts/${h.userId}`}>
        <div className="flex items-center gap-3 rounded-2xl border border-vf-line p-3 cursor-pointer hover:border-vf-text/25" data-testid="event-host">
          <VfAvatar size={40} src={h.photoUrl ?? undefined} name={h.name} seed={h.userId} />
          <div className="flex-1 min-w-0">
            <div className="text-[14.5px] text-vf-text">Hosted by {h.name}</div>
            <div className="text-[12.5px] text-vf-faint">{hostLine(h)}</div>
          </div>
          <ChevronRight className="w-4 h-4 text-vf-faint" />
        </div>
      </Link>
      {data.partnerOffer && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-vf-gold/40 bg-vf-gold/[0.07] p-3" data-testid="event-partner">
          <Tag className="w-4 h-4 text-vf-gold shrink-0" />
          <div className="text-[13.5px] text-vf-text">Destira partner venue<div className="text-[12.5px] text-vf-muted">{data.partnerOffer}. Show the app when you pay.</div></div>
        </div>
      )}
    </div>
  );
}

function Stars({ value, onPick, size = 30, testid }: { value: number; onPick?: (n: number) => void; size?: number; testid?: string }) {
  return (
    <div className="flex gap-1" role={onPick ? "radiogroup" : undefined} aria-label="Stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onPick} onClick={() => onPick?.(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`}
          className="disabled:cursor-default" data-testid={testid ? `${testid}-${n}` : undefined}>
          <Star style={{ width: size, height: size }} className={n <= value ? "text-vf-gold" : "text-vf-line"} fill={n <= value ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
  );
}

/** After the event: rate it (people who were there), or the host's view of their ratings. */
export function EventRatingCard({ eventId, title }: { eventId: number; title: string }) {
  const { data } = useEventAbout(eventId);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const r = data.rating;

  if (r.forHost) {
    if (!r.forHost.count) return null;
    return (
      <section className="rounded-[20px] border border-vf-line p-4" data-testid="event-ratings-host">
        <div className="font-mono uppercase tracking-[0.16em] text-[10.5px] text-vf-faint">How it went</div>
        <div className="flex items-center gap-3 mt-2">
          <div className="font-serif text-[34px] leading-none text-vf-text">{r.forHost.avg?.toFixed(1)}</div>
          <div><Stars value={Math.round(r.forHost.avg ?? 0)} size={16} /><div className="text-[12px] text-vf-faint mt-0.5">{r.forHost.count} rating{r.forHost.count > 1 ? "s" : ""}</div></div>
        </div>
        {r.forHost.notes.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {r.forHost.notes.map((n, i) => (
              <p key={i} className="text-[13.5px] text-vf-soft leading-[1.5] border-l-2 border-vf-line pl-3">&ldquo;{n.note}&rdquo;</p>
            ))}
            <p className="text-[11.5px] text-vf-faint">Notes are only for you, without names.</p>
          </div>
        )}
      </section>
    );
  }
  if (!r.canRate) return null;

  if (r.mine && !editing) {
    return (
      <section className="rounded-[20px] border border-vf-line p-4 flex items-center justify-between gap-3" data-testid="event-rated">
        <div><div className="text-[13.5px] text-vf-text">You rated {title}</div><Stars value={r.mine.stars} size={16} /></div>
        <button onClick={() => { setStars(r.mine!.stars); setNote(r.mine!.note ?? ""); setEditing(true); }} className="text-[12.5px] text-vf-muted underline underline-offset-2">Change</button>
      </section>
    );
  }

  const send = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/events/${eventId}/rating`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stars, note }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || "Something went wrong");
      toast({ title: "Thanks. That helps the next people who go." });
      setEditing(false);
      await qc.invalidateQueries({ queryKey: aboutKey(eventId) });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-[20px] border border-vf-gold/40 bg-vf-gold/[0.05] p-4" data-testid="event-rate">
      <div className="font-serif text-[22px] leading-[1.15] text-vf-text">How was {title}?</div>
      <p className="text-[13px] text-vf-muted mt-1">Rate the event, not the people. It helps others choose.</p>
      <div className="mt-3"><Stars value={stars} onPick={setStars} testid="rate-star" /></div>
      {stars > 0 && (
        <>
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, RATING_NOTE_MAX))} rows={2}
            placeholder="A note for the host (optional, they won't see your name)"
            className="mt-3 w-full rounded-xl border border-vf-line bg-transparent p-3 text-[14px] text-vf-text placeholder:text-vf-faint resize-none" data-testid="input-rate-note" />
          <button onClick={send} disabled={busy} className="mt-2 w-full h-10 rounded-full bg-vf-ember text-vf-ink font-medium text-[13.5px] disabled:opacity-50" data-testid="button-rate">
            Send rating
          </button>
        </>
      )}
    </section>
  );
}
