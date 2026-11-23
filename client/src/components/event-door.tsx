// Events in person (docs/destira-3-upgrade-prompt.md Part J): your door
// pass, the host's way to the door list, and "Who did you click with?".
import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Heart, Loader2, ScanLine, Users } from "lucide-react";
import { VfAvatar } from "@/components/ui-vf";
import { useToast } from "@/hooks/use-toast";
import type { ClickKind, DoorPass, EventClicks } from "@shared/event-door";

const hm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
const dayHm = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });

/** On the event page for someone going: the QR the host scans at the door. */
export function DoorPassCard({ eventId }: { eventId: number }) {
  const { data } = useQuery<DoorPass>({
    queryKey: [`/api/events/${eventId}/door/pass`],
    // While the pass is up, check every few seconds so it turns into "You're in" after the scan.
    refetchInterval: (q) => (q.state.data?.open && !q.state.data?.checkedInAt ? 5000 : false),
  });
  if (!data) return null;
  if (data.checkedInAt) {
    return (
      <div className="rounded-[20px] border border-vf-mint/40 bg-vf-mint/[0.08] p-4 flex items-center gap-3" data-testid="door-pass-in">
        <div className="w-9 h-9 rounded-full bg-vf-mint/20 text-vf-mint flex items-center justify-center"><Check className="w-[18px] h-[18px]" /></div>
        <div className="text-[14px] text-vf-text">You're in<div className="text-[12.5px] text-vf-faint">Checked in at {hm(data.checkedInAt)}</div></div>
      </div>
    );
  }
  if (!data.open || !data.qr) {
    return (
      <div className="rounded-[20px] border border-vf-line p-4 text-[12.5px] text-vf-faint" data-testid="door-pass-later">
        Your door pass shows here from {dayHm(data.opensAt)}. The host scans it when you arrive.
      </div>
    );
  }
  return (
    <div className="rounded-[20px] border border-vf-line bg-white p-4 flex flex-col items-center gap-2" data-testid="door-pass">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#6b6258]">Door pass</div>
      <img src={data.qr} alt="Door pass QR code" className="w-[200px] h-[200px]" />
      <div className="font-mono text-[18px] tracking-[0.3em] text-[#1d1813]" data-testid="door-pass-code">{data.code}</div>
      <p className="text-[12.5px] text-[#6b6258] text-center">Show this to the host at the door.</p>
    </div>
  );
}

export function HostDoorLink({ eventId }: { eventId: number }) {
  return (
    <Link href={`/events/${eventId}/door`}>
      <span className="w-full h-10 rounded-full border border-vf-line text-vf-soft hover:border-vf-text/25 text-[13px] flex items-center justify-center gap-2 cursor-pointer" data-testid="button-door-list">
        <ScanLine className="w-4 h-4" /> Door list and check-in
      </span>
    </Link>
  );
}

/** After the event: pick, privately, who you'd like to see again. */
export function EventClicksCard({ eventId }: { eventId: number }) {
  const key = [`/api/events/${eventId}/clicks`];
  const { data } = useQuery<EventClicks>({ queryKey: key });
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (!data || data.state !== "open" || !data.people.length) return null;

  const pick = async (userId: string, kind: ClickKind | null) => {
    setBusy(userId);
    try {
      const res = await fetch(`/api/events/${eventId}/clicks/${userId}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || "Something went wrong");
      if (body.status === "mutual") toast({ title: body.kind === "love" ? "You clicked. It's a match." : "You both want to meet again", description: "There's a chat waiting." });
      await qc.invalidateQueries({ queryKey: key });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section id="clicks" className="rounded-[20px] border border-vf-ember/30 bg-vf-ember/[0.04] p-4" data-testid="event-clicks">
      <div className="font-serif text-[22px] leading-[1.15] text-vf-text">Who did you click with?</div>
      <p className="text-[13px] text-vf-muted mt-1 leading-[1.5]">
        Private. If they pick you too, you'll both get a chat. Open until {dayHm(data.closesAt)}.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {data.people.map((p) => (
          <div key={p.userId} className="flex items-center gap-3 rounded-2xl border border-vf-line bg-vf-surface p-2.5" data-testid={`click-person-${p.userId}`}>
            <VfAvatar size={40} src={p.photoUrl ?? undefined} name={p.name} seed={p.userId} />
            <div className="flex-1 min-w-0 text-[14.5px] text-vf-text">{p.name}{p.age ? `, ${p.age}` : ""}</div>
            {p.matchId ? (
              <Link href={`/chat/${p.matchId}`}>
                <span className="h-9 px-3.5 rounded-full bg-vf-mint text-vf-ink text-[13px] font-medium inline-flex items-center cursor-pointer" data-testid={`click-chat-${p.userId}`}>
                  Mutual · Chat
                </span>
              </Link>
            ) : busy === p.userId ? (
              <Loader2 className="w-4 h-4 animate-spin text-vf-faint" />
            ) : (
              <div className="flex gap-1.5">
                {p.canFriends && (
                  <button onClick={() => pick(p.userId, p.myPick === "friends" ? null : "friends")}
                    className={`h-9 px-3 rounded-full text-[12.5px] inline-flex items-center gap-1 border ${p.myPick === "friends" ? "border-vf-mint bg-vf-mint/15 text-vf-text" : "border-vf-line text-vf-muted"}`}
                    aria-pressed={p.myPick === "friends"} data-testid={`click-friends-${p.userId}`}>
                    <Users className="w-3.5 h-3.5" /> Friends
                  </button>
                )}
                {p.canLove && (
                  <button onClick={() => pick(p.userId, p.myPick === "love" ? null : "love")}
                    className={`h-9 px-3 rounded-full text-[12.5px] inline-flex items-center gap-1 border ${p.myPick === "love" ? "border-vf-ember bg-vf-ember/15 text-vf-text" : "border-vf-line text-vf-muted"}`}
                    aria-pressed={p.myPick === "love"} data-testid={`click-love-${p.userId}`}>
                    <Heart className="w-3.5 h-3.5" /> More
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
