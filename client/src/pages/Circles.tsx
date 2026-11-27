// Friend circles (docs/destira-3-upgrade-prompt.md Part O3): invitations
// waiting for you, your circles, and starting one with people you've met.
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, CircleDot, Loader2, Plus, X } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { VfAvatar } from "@/components/ui-vf";
import { useToast } from "@/hooks/use-toast";
import { CIRCLE_MAX, CIRCLE_NAME_MAX, type CirclePerson, type CirclesMe } from "@shared/circles";
import { CardsSkeleton } from "@/components/ui-vf/skeletons";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";

export async function circleSend(method: string, url: string, data?: unknown) {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || "Something went wrong");
  return body;
}

export const planWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Harare" });

export function Faces({ people, size = 32, max = 5 }: { people: CirclePerson[]; size?: number; max?: number }) {
  return (
    <div className="flex -space-x-2">
      {people.slice(0, max).map((p) => (
        <div key={p.userId} className="rounded-full border-2 border-vf-surface">
          <VfAvatar size={size} src={p.photoUrl ?? undefined} name={p.name} seed={p.userId} />
        </div>
      ))}
      {people.length > max && (
        <div className="rounded-full border-2 border-vf-surface bg-vf-text/[0.06] text-vf-muted text-[11px] flex items-center justify-center" style={{ width: size + 4, height: size + 4 }}>
          +{people.length - max}
        </div>
      )}
    </div>
  );
}

/** Tick people you've met; used to start a circle and to invite more. */
export function PeoplePicker({ circleId, picked, setPicked, room }: { circleId?: number; picked: Set<string>; setPicked: (s: Set<string>) => void; room: number }) {
  const { data, isLoading } = useQuery<CirclePerson[]>({ queryKey: [`/api/circles/candidates${circleId ? `?circleId=${circleId}` : ""}`] });
  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin text-vf-faint" />;
  if (!data?.length) {
    return (
      <p className="text-[13px] text-vf-faint" data-testid="circle-no-candidates">
        Nobody to invite yet. Circles are for people you've met through Destira: your matches and friends, your Sunday Table, or an event you went to.
      </p>
    );
  }
  return (
    <div className="max-h-[300px] overflow-y-auto -mx-1 px-1 divide-y divide-vf-line">
      {data.map((p) => {
        const on = picked.has(p.userId);
        const full = !on && picked.size >= room;
        return (
          <button
            key={p.userId}
            type="button"
            disabled={full}
            onClick={() => {
              const next = new Set(picked);
              on ? next.delete(p.userId) : next.add(p.userId);
              setPicked(next);
            }}
            className="w-full flex items-center gap-3 py-2.5 text-left disabled:opacity-40"
            aria-pressed={on}
            data-testid={`circle-candidate-${p.userId}`}
          >
            <VfAvatar size={36} src={p.photoUrl ?? undefined} name={p.name} seed={p.userId} />
            <span className="flex-1 text-[14.5px] text-vf-text">{p.name}</span>
            <span className={`w-6 h-6 rounded-full border flex items-center justify-center ${on ? "bg-vf-mint border-vf-mint text-vf-ink" : "border-vf-line"}`}>
              {on && <Check className="w-3.5 h-3.5" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StartCircle({ onClose }: { onClose: () => void }) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const c = await circleSend("POST", "/api/circles", { name, inviteIds: Array.from(picked) });
      qc.invalidateQueries({ queryKey: ["/api/circles"] });
      setLocation(`/circles/${c.id}`);
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-[22px] border border-vf-line bg-vf-surface p-5" data-testid="card-start-circle">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-[22px] text-vf-text">Start a circle</h2>
        <button onClick={onClose} aria-label="Close" className="text-vf-faint hover:text-vf-text"><X className="w-5 h-5" /></button>
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, CIRCLE_NAME_MAX))}
        placeholder="Name it: Saturday walkers, Avondale crew…"
        className="mt-4 w-full h-11 rounded-xl border border-vf-line bg-transparent px-3.5 text-[14.5px] text-vf-text placeholder:text-vf-faint"
        data-testid="input-circle-name"
      />
      <div className={`${EYEBROW} mt-5 mb-2`}>Invite ({picked.size}/{CIRCLE_MAX - 1})</div>
      <PeoplePicker picked={picked} setPicked={setPicked} room={CIRCLE_MAX - 1} />
      <p className="text-[12.5px] text-vf-faint mt-3">They'll get an invitation. Nobody joins without saying yes.</p>
      <button
        onClick={create}
        disabled={busy || !name.trim()}
        className="mt-4 w-full h-12 rounded-full bg-vf-ember text-vf-ink font-medium text-[15px] disabled:opacity-50 inline-flex items-center justify-center gap-2"
        data-testid="button-create-circle"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Start the circle
      </button>
    </section>
  );
}

export default function CirclesPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<CirclesMe>({ queryKey: ["/api/circles"], staleTime: 0 });
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  const answer = async (id: number, accept: boolean) => {
    setBusy(id);
    try {
      const out = await circleSend("POST", `/api/circles/invites/${id}`, { accept });
      await qc.invalidateQueries({ queryKey: ["/api/circles"] });
      if (accept) setLocation(`/circles/${out.circleId}`);
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <LayoutShell>
      <div className="max-w-[460px] mx-auto pb-10" data-testid="page-circles">
        <div className={EYEBROW}>Destira Friends</div>
        <h1 className="font-serif font-normal text-[30px] leading-[1.1] text-vf-text mt-2">Your circles</h1>
        <p className="text-[14px] text-vf-muted mt-2 leading-[1.5]">
          Small groups of up to {CIRCLE_MAX} friends you've met here, with a chat, plans and a shared album.
        </p>

        <div className="mt-6 space-y-3">
          {isLoading || !data ? (
            <CardsSkeleton cards={2} media="none" />
          ) : (
            <>
              {data.invites.map((i) => (
                <div key={i.id} className="rounded-2xl border border-vf-mint/40 bg-vf-mint/[0.06] p-4" data-testid={`circle-invite-${i.id}`}>
                  <div className="flex items-center gap-3">
                    <VfAvatar size={40} src={i.from.photoUrl ?? undefined} name={i.from.name} seed={i.from.userId} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[14.5px] text-vf-text">{i.from.name} invited you to <span className="font-medium">{i.circleName}</span></div>
                      <div className="text-[12.5px] text-vf-faint mt-0.5">{i.members} {i.members === 1 ? "person" : "people"} in it so far</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button onClick={() => answer(i.id, false)} disabled={busy === i.id} className="h-10 rounded-full border border-vf-line text-vf-muted text-[13.5px]" data-testid={`button-decline-${i.id}`}>
                      Not for me
                    </button>
                    <button onClick={() => answer(i.id, true)} disabled={busy === i.id} className="h-10 rounded-full bg-vf-mint text-vf-ink font-medium text-[13.5px]" data-testid={`button-join-${i.id}`}>
                      Join
                    </button>
                  </div>
                </div>
              ))}

              {data.circles.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setLocation(`/circles/${c.id}`)}
                  className="w-full text-left rounded-2xl border border-vf-line hover:border-vf-ember/50 p-4 flex items-center gap-3"
                  data-testid={`circle-row-${c.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] text-vf-text truncate">{c.name}</div>
                    <div className="text-[12.5px] text-vf-faint mt-0.5 truncate">
                      {c.nextPlan ? `Next: ${c.nextPlan.title}, ${planWhen(c.nextPlan.startsAt)}` : `${c.members.length} ${c.members.length === 1 ? "member" : "members"}`}
                    </div>
                    <div className="mt-2.5"><Faces people={c.members} size={26} /></div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-vf-faint shrink-0" />
                </button>
              ))}

              {!data.circles.length && !data.invites.length && !starting && (
                <div className="rounded-2xl border border-vf-line p-5 text-center" data-testid="circles-empty">
                  <CircleDot className="w-8 h-8 text-vf-faint mx-auto" />
                  <p className="text-[15px] text-vf-text mt-3">No circles yet</p>
                  <p className="text-[13px] text-vf-faint mt-1">Start one with friends you've made here, or keep your Sunday Table together after lunch.</p>
                </div>
              )}

              {starting ? (
                <StartCircle onClose={() => setStarting(false)} />
              ) : (
                <button
                  onClick={() => setStarting(true)}
                  className="w-full h-12 rounded-full border border-vf-line text-vf-text text-[14.5px] inline-flex items-center justify-center gap-2"
                  data-testid="button-start-circle"
                >
                  <Plus className="w-4 h-4" /> Start a circle
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </LayoutShell>
  );
}
