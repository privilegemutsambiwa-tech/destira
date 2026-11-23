// One friend circle (Part O3): who's in it, plans with "I'm in", the photos
// from its chat, inviting more people you've met, and leaving.
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarPlus, Check, Images, Loader2, LogOut, MapPin, MessageCircle, UserPlus, X } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { VfAvatar } from "@/components/ui-vf";
import { useToast } from "@/hooks/use-toast";
import { PLAN_PLACE_MAX, PLAN_TITLE_MAX, type CircleDetail } from "@shared/circles";
import { Faces, PeoplePicker, circleSend, planWhen } from "./Circles";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";

function NewPlan({ circleId, onDone }: { circleId: number; onDone: (d: CircleDetail) => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      // The picker gives Harare wall-clock time; send it as Harare (UTC+2).
      const d = await circleSend("POST", `/api/circles/${circleId}/plans`, { title, place, startsAt: `${when}:00+02:00` });
      onDone(d);
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  const field = "w-full h-11 rounded-xl border border-vf-line bg-transparent px-3.5 text-[14.5px] text-vf-text placeholder:text-vf-faint";
  return (
    <div className="rounded-2xl border border-vf-line p-4 space-y-2.5" data-testid="form-new-plan">
      <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, PLAN_TITLE_MAX))} placeholder="Mukuvisi walk? Braai at mine?" className={field} data-testid="input-plan-title" />
      <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={field} data-testid="input-plan-when" />
      <input value={place} onChange={(e) => setPlace(e.target.value.slice(0, PLAN_PLACE_MAX))} placeholder="Where (optional)" className={field} data-testid="input-plan-place" />
      <button onClick={save} disabled={busy || !title.trim() || !when} className="w-full h-11 rounded-full bg-vf-ember text-vf-ink font-medium text-[14px] disabled:opacity-50" data-testid="button-save-plan">
        Suggest it
      </button>
    </div>
  );
}

export default function CirclePage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = [`/api/circles/${id}`];
  const { data, isLoading, error } = useQuery<CircleDetail>({ queryKey: key, staleTime: 0 });
  const [planning, setPlanning] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const set = (d: CircleDetail) => qc.setQueryData(key, d);
  const act = async (fn: () => Promise<any>) => {
    setBusy(true);
    try { await fn(); } catch (e: any) { toast({ title: e.message, variant: "destructive" }); } finally { setBusy(false); }
  };

  return (
    <LayoutShell>
      <div className="max-w-[460px] mx-auto pb-10" data-testid="page-circle">
        <button onClick={() => setLocation("/circles")} className="inline-flex items-center gap-1.5 text-[13px] text-vf-muted hover:text-vf-text" data-testid="link-back-circles">
          <ArrowLeft className="w-4 h-4" /> Circles
        </button>
        {isLoading ? (
          <Loader2 className="w-6 h-6 animate-spin text-vf-faint mt-6" />
        ) : !data || error ? (
          <p className="text-[14px] text-vf-muted mt-6">This circle isn't available.</p>
        ) : (
          <>
            <div className={`${EYEBROW} mt-4`}>{data.source === "table" ? "From a Sunday Table" : "Friend circle"}</div>
            <h1 className="font-serif font-normal text-[30px] leading-[1.1] text-vf-text mt-2" data-testid="text-circle-name">{data.name}</h1>
            <div className="flex items-center gap-3 mt-4">
              <Faces people={data.members} size={34} max={8} />
              <span className="text-[13px] text-vf-faint">{data.members.length} in{data.pending.length ? `, ${data.pending.length} invited` : ""}</span>
            </div>
            <button
              onClick={() => setLocation(`/lounge/group/${data.groupId}`)}
              className="mt-5 w-full h-12 rounded-full bg-vf-text text-vf-ink font-medium text-[14.5px] inline-flex items-center justify-center gap-2"
              data-testid="button-circle-chat"
            >
              <MessageCircle className="w-4 h-4" /> Open the chat
            </button>

            {/* Plans */}
            <section className="mt-8">
              <div className="flex items-center justify-between">
                <div className={EYEBROW}>Plans</div>
                {!planning && (
                  <button onClick={() => setPlanning(true)} className="text-[13px] text-vf-ember inline-flex items-center gap-1.5" data-testid="button-new-plan">
                    <CalendarPlus className="w-4 h-4" /> Suggest a plan
                  </button>
                )}
              </div>
              <div className="mt-3 space-y-2.5">
                {planning && <NewPlan circleId={data.id} onDone={(d) => { set(d); setPlanning(false); }} />}
                {data.plans.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-vf-line p-4" data-testid={`plan-${p.id}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] text-vf-text">{p.title}</div>
                        <div className="text-[12.5px] text-vf-faint mt-1">{planWhen(p.startsAt)}</div>
                        {p.place && (
                          <div className="text-[12.5px] text-vf-faint mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {p.place}
                          </div>
                        )}
                        <div className="text-[12.5px] text-vf-faint mt-1">Suggested by {p.mine ? "you" : p.author.name}</div>
                      </div>
                      <button
                        onClick={() => act(async () => set(await circleSend("POST", `/api/circles/plans/${p.id}/in`, { in: !p.imIn })))}
                        disabled={busy}
                        aria-pressed={p.imIn}
                        className={`h-9 px-3.5 rounded-full text-[13px] border inline-flex items-center gap-1.5 shrink-0 ${p.imIn ? "bg-vf-mint text-vf-ink border-vf-mint" : "border-vf-line text-vf-text"}`}
                        data-testid={`button-plan-in-${p.id}`}
                      >
                        {p.imIn && <Check className="w-3.5 h-3.5" />} I'm in
                      </button>
                    </div>
                    {p.ins.length > 0 && (
                      <div className="flex items-center gap-2 mt-3">
                        <Faces people={p.ins} size={22} max={8} />
                        <span className="text-[12px] text-vf-faint">{p.ins.length} in</span>
                      </div>
                    )}
                    {p.mine && (
                      <button
                        onClick={() => act(async () => set(await circleSend("DELETE", `/api/circles/plans/${p.id}`)))}
                        className="mt-3 text-[12.5px] text-vf-muted underline underline-offset-2"
                        data-testid={`button-plan-cancel-${p.id}`}
                      >
                        Call it off
                      </button>
                    )}
                  </div>
                ))}
                {!data.plans.length && !planning && <p className="text-[13px] text-vf-faint">No plans yet. Suggest one and see who's in.</p>}
              </div>
            </section>

            {/* Album */}
            <section className="mt-8" data-testid="circle-album">
              <div className={EYEBROW}>Album</div>
              {data.album.length ? (
                <div className="grid grid-cols-3 gap-1.5 mt-3">
                  {data.album.map((ph) => (
                    <a key={ph.id} href={ph.url} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden bg-vf-text/[0.05]">
                      <img src={ph.url} alt={`Shared by ${ph.by}`} className="w-full h-full object-cover" loading="lazy" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-vf-faint mt-3 inline-flex items-center gap-2"><Images className="w-4 h-4" /> Photos you share in the chat collect here.</p>
              )}
            </section>

            {/* Invite */}
            <section className="mt-8">
              <div className="flex items-center justify-between">
                <div className={EYEBROW}>People</div>
                {data.spaceLeft > 0 && !inviting && (
                  <button onClick={() => setInviting(true)} className="text-[13px] text-vf-ember inline-flex items-center gap-1.5" data-testid="button-invite-more">
                    <UserPlus className="w-4 h-4" /> Invite
                  </button>
                )}
              </div>
              {inviting && (
                <div className="mt-3 rounded-2xl border border-vf-line p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] text-vf-muted">Room for {data.spaceLeft} more</span>
                    <button onClick={() => setInviting(false)} aria-label="Close" className="text-vf-faint"><X className="w-4 h-4" /></button>
                  </div>
                  <PeoplePicker circleId={data.id} picked={picked} setPicked={setPicked} room={data.spaceLeft} />
                  <button
                    onClick={() => act(async () => { set(await circleSend("POST", `/api/circles/${data.id}/invite`, { userIds: Array.from(picked) })); setPicked(new Set()); setInviting(false); })}
                    disabled={busy || !picked.size}
                    className="mt-3 w-full h-11 rounded-full bg-vf-ember text-vf-ink font-medium text-[14px] disabled:opacity-50"
                    data-testid="button-send-invites"
                  >
                    Send invitations
                  </button>
                </div>
              )}
              <div className="mt-3 divide-y divide-vf-line">
                {data.members.map((m) => (
                  <div key={m.userId} className="flex items-center gap-3 py-2.5">
                    <VfAvatar size={34} src={m.photoUrl ?? undefined} name={m.name} seed={m.userId} />
                    <span className="text-[14px] text-vf-text">{m.name}</span>
                  </div>
                ))}
                {data.pending.map((m) => (
                  <div key={m.userId} className="flex items-center gap-3 py-2.5 opacity-60" data-testid={`circle-pending-${m.userId}`}>
                    <VfAvatar size={34} src={m.photoUrl ?? undefined} name={m.name} seed={m.userId} />
                    <span className="text-[14px] text-vf-text flex-1">{m.name}</span>
                    <span className="text-[12px] text-vf-faint">Invited</span>
                  </div>
                ))}
              </div>
            </section>

            <button
              onClick={() => act(async () => { await circleSend("POST", `/api/circles/${data.id}/leave`); qc.invalidateQueries({ queryKey: ["/api/circles"] }); setLocation("/circles"); })}
              className="mt-8 text-[13px] text-vf-muted inline-flex items-center gap-1.5"
              data-testid="button-leave-circle"
            >
              <LogOut className="w-4 h-4" /> Leave this circle
            </button>
          </>
        )}
      </div>
    </LayoutShell>
  );
}
