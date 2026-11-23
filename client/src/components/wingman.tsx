// Wingman (docs/destira-3-upgrade-prompt.md Part O6) on a profile and in
// Discover: "Kuda suggested them" with the why, a way to suggest someone to
// a friend in one of your circles, and a strip when friends suggested people.
import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, HeartHandshake } from "lucide-react";
import { VfAvatar } from "@/components/ui-vf";
import { useToast } from "@/hooks/use-toast";
import { WINGMAN_DAILY, WINGMAN_NOTE_MAX, wingmanNoteProblem, type WingmanForProfile, type WingmanMe } from "@shared/wingman";

const forKey = (id: string) => [`/api/wingman/for/${id}`];

function useForProfile(candidateId: string) {
  return useQuery<WingmanForProfile>({ queryKey: forKey(candidateId), enabled: !!candidateId });
}

/** At the top of a profile: who in your circles suggested this person, and why. */
export function WingmanNote({ candidateId }: { candidateId: string }) {
  const { data } = useForProfile(candidateId);
  if (!data?.suggestedBy.length) return null;
  return (
    <div className="rounded-[18px] border border-vf-ember/30 bg-vf-ember/[0.05] p-4 flex flex-col gap-3" data-testid="wingman-note">
      {data.suggestedBy.map((s) => (
        <div key={s.id} className="flex gap-3">
          <VfAvatar size={34} src={s.from.photoUrl ?? undefined} name={s.from.name} seed={s.from.userId} />
          <div className="min-w-0">
            <div className="text-[12.5px] text-vf-ember flex items-center gap-1.5">
              <HeartHandshake className="w-3.5 h-3.5" /> {s.from.name} suggested them · {s.circleName}
            </div>
            <p className="text-[14.5px] text-vf-text mt-1 leading-[1.5]">&ldquo;{s.note}&rdquo;</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Near the end of a profile: suggest this person to a friend in one of your circles. */
export function WingmanSuggest({ candidateId, name }: { candidateId: string; name: string }) {
  const { data } = useForProfile(candidateId);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!data?.friends.length) return null;
  const left = WINGMAN_DAILY - data.sentToday;
  const problem = note.trim() ? wingmanNoteProblem(note) : null;
  const friend = data.friends.find((f) => f.person.userId === to);

  const send = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/wingman", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toId: to, candidateId, note }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || "Something went wrong");
      toast({ title: `Sent to ${friend?.person.name}`, description: `${name} won't be told.` });
      setOpen(false); setTo(null); setNote("");
      await qc.invalidateQueries({ queryKey: forKey(candidateId) });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="flex justify-center">
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-vf-line text-[13.5px] text-vf-soft hover:border-vf-ember/50"
          data-testid="button-wingman-open">
          <HeartHandshake className="w-4 h-4 text-vf-ember" /> Suggest {name} to a friend
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-[20px] border border-vf-line p-4 max-w-[460px] w-full mx-auto" data-testid="wingman-suggest">
      <div className="text-[15px] text-vf-text">Who would like {name}?</div>
      <p className="text-[12.5px] text-vf-faint mt-1">Friends from your circles who are dating. {name} won't be told.</p>
      <div className="mt-3 flex flex-col gap-1.5">
        {data.friends.map((f) => (
          <button key={f.person.userId} disabled={f.sent} onClick={() => setTo(f.person.userId)}
            className={`flex items-center gap-3 rounded-2xl border p-2.5 text-left disabled:opacity-60 ${to === f.person.userId ? "border-vf-ember bg-vf-ember/[0.06]" : "border-vf-line"}`}
            data-testid={`wingman-friend-${f.person.userId}`}>
            <VfAvatar size={32} src={f.person.photoUrl ?? undefined} name={f.person.name} seed={f.person.userId} />
            <div className="flex-1 min-w-0">
              <div className="text-[14px] text-vf-text">{f.person.name}</div>
              <div className="text-[12px] text-vf-faint truncate">{f.sent ? "Already suggested" : f.circleName}</div>
            </div>
            {to === f.person.userId && <Check className="w-4 h-4 text-vf-ember" />}
          </button>
        ))}
      </div>
      {to && (
        <>
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, WINGMAN_NOTE_MAX))} rows={2}
            placeholder={`Why ${friend?.person.name} would like ${name}: "You both love hiking and terrible puns."`}
            className="mt-3 w-full rounded-xl border border-vf-line bg-transparent p-3 text-[14.5px] text-vf-text placeholder:text-vf-faint resize-none"
            data-testid="input-wingman-note" />
          <div className="flex justify-between text-[12px] text-vf-faint mt-1">
            <span>{problem ?? `${left} of ${WINGMAN_DAILY} left today`}</span>
            <span className="tabular-nums">{note.length}/{WINGMAN_NOTE_MAX}</span>
          </div>
        </>
      )}
      <div className="flex gap-2 mt-3">
        <button onClick={() => { setOpen(false); setTo(null); setNote(""); }} className="h-10 px-4 rounded-full border border-vf-line text-vf-muted text-[13.5px]">Cancel</button>
        <button onClick={send} disabled={busy || !to || !note.trim() || !!problem || left <= 0}
          className="flex-1 h-10 rounded-full bg-vf-ember text-vf-ink font-medium text-[13.5px] disabled:opacity-50" data-testid="button-wingman-send">
          {left <= 0 ? `That's ${WINGMAN_DAILY} for today` : friend ? `Suggest to ${friend.person.name}` : "Pick a friend"}
        </button>
      </div>
    </div>
  );
}

/** In Discover: friends suggested people you haven't looked at yet. */
export function WingmanStrip() {
  const { data } = useQuery<WingmanMe>({ queryKey: ["/api/wingman/me"], staleTime: 60_000 });
  const fresh = data?.received.filter((r) => r.status === "pending") ?? [];
  if (!fresh.length) return null;
  const first = fresh[0];
  return (
    <Link href="/wingman">
      <div className="mb-4 rounded-2xl border border-vf-ember/30 bg-vf-ember/[0.05] p-3 flex items-center gap-3 cursor-pointer" data-testid="wingman-strip">
        <VfAvatar size={34} src={first.from.photoUrl ?? undefined} name={first.from.name} seed={first.from.userId} />
        <div className="flex-1 min-w-0 text-[13.5px] text-vf-text">
          {fresh.length === 1 ? `${first.from.name} thinks you'd like someone` : `Your friends suggested ${fresh.length} people`}
          <div className="text-[12px] text-vf-faint truncate">From your circles</div>
        </div>
        <ChevronRight className="w-4 h-4 text-vf-faint" />
      </div>
    </Link>
  );
}
