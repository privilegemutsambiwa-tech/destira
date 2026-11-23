// Plans board, "Who's in?" (docs/destira-3-upgrade-prompt.md Part O4):
// small plans for the next 7 days at public places. Tap "I'm in"; the host
// says yes or no; a little chat opens for the people going.
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Flag, Loader2, MapPin, MessageCircle, Minus, Plus, Search, X } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { VfAvatar } from "@/components/ui-vf";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/use-profiles";
import {
  BOARD_REPORT_REASONS, BOARD_SEATS_MAX, BOARD_TITLE_MAX, BOARD_WHO,
  type BoardMe, type BoardPlace, type BoardPlanView, type BoardWho,
} from "@shared/board";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";
const KEY = ["/api/board"];

async function send(method: string, url: string, data?: unknown) {
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

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Harare" });
const dayKey = (iso: string) => new Date(new Date(iso).getTime() + 2 * 3600_000).toISOString().slice(0, 10);
function dayLabel(iso: string) {
  const k = dayKey(iso);
  const today = dayKey(new Date().toISOString());
  const tomorrow = dayKey(new Date(Date.now() + 86_400_000).toISOString());
  if (k === today) return "Today";
  if (k === tomorrow) return "Tomorrow";
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "Africa/Harare" });
}

function PostForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: profile } = useProfile();
  const gender = (profile as any)?.gender;
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [q, setQ] = useState("");
  const [place, setPlace] = useState<BoardPlace | null>(null);
  const [seats, setSeats] = useState(2);
  const [who, setWho] = useState<BoardWho>("anyone");
  const [busy, setBusy] = useState(false);
  const { data: found } = useQuery<BoardPlace[]>({ queryKey: [`/api/board/places?q=${encodeURIComponent(q)}`], enabled: !place });
  const whos = BOARD_WHO.filter((w) => w.value === "anyone" || (w.value === "women" && gender === "woman") || (w.value === "men" && gender === "man"));
  const field = "w-full h-11 rounded-xl border border-vf-line bg-transparent px-3.5 text-[14.5px] text-vf-text placeholder:text-vf-faint";

  const post = async () => {
    setBusy(true);
    try {
      await send("POST", "/api/board", { title, startsAt: `${when}:00+02:00`, placeId: place?.id, seats, who });
      await qc.invalidateQueries({ queryKey: KEY });
      onDone();
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[22px] border border-vf-line bg-vf-surface p-5 space-y-3" data-testid="form-board-plan">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-[22px] text-vf-text">Post a plan</h2>
        <button onClick={onDone} aria-label="Close" className="text-vf-faint hover:text-vf-text"><X className="w-5 h-5" /></button>
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, BOARD_TITLE_MAX))} placeholder="Gym at 6am, anyone? Watching the match?" className={field} data-testid="input-board-title" />
      <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={field} data-testid="input-board-when" />
      {place ? (
        <div className="flex items-center gap-2 rounded-xl border border-vf-mint/50 bg-vf-mint/[0.06] px-3.5 h-11" data-testid="board-place-picked">
          <MapPin className="w-4 h-4 text-vf-mint" />
          <span className="flex-1 text-[14px] text-vf-text truncate">{place.name} <span className="text-vf-faint">· {place.detail}</span></span>
          <button onClick={() => setPlace(null)} aria-label="Change place" className="text-vf-faint"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <div>
          <div className="relative">
            <Search className="w-4 h-4 text-vf-faint absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Where? Search malls, cafés, venues" className={`${field} pl-10`} data-testid="input-board-place" />
          </div>
          <div className="mt-1.5 max-h-[180px] overflow-y-auto divide-y divide-vf-line">
            {(found ?? []).map((p) => (
              <button key={p.id} type="button" onClick={() => setPlace(p)} className="w-full text-left py-2.5 px-1" data-testid={`board-place-${p.id}`}>
                <div className="text-[14px] text-vf-text">{p.name}</div>
                <div className="text-[12px] text-vf-faint">{p.detail}</div>
              </button>
            ))}
          </div>
          <p className="text-[12px] text-vf-faint mt-1.5">Public places only, so everyone feels safe meeting someone new.</p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[14px] text-vf-text">Seats</span>
        <div className="flex items-center gap-3">
          <button onClick={() => setSeats((s) => Math.max(1, s - 1))} className="w-9 h-9 rounded-full border border-vf-line flex items-center justify-center" aria-label="Fewer seats"><Minus className="w-4 h-4" /></button>
          <span className="w-5 text-center text-[15px] text-vf-text" data-testid="text-board-seats">{seats}</span>
          <button onClick={() => setSeats((s) => Math.min(BOARD_SEATS_MAX, s + 1))} className="w-9 h-9 rounded-full border border-vf-line flex items-center justify-center" aria-label="More seats"><Plus className="w-4 h-4" /></button>
        </div>
      </div>
      {whos.length > 1 && (
        <div className="flex gap-2" role="radiogroup" aria-label="Who can join">
          {whos.map((w) => (
            <button key={w.value} role="radio" aria-checked={who === w.value} onClick={() => setWho(w.value)}
              className={`h-9 px-3.5 rounded-full text-[13px] border ${who === w.value ? "border-vf-ember bg-vf-ember/[0.08] text-vf-text" : "border-vf-line text-vf-muted"}`}
              data-testid={`board-who-${w.value}`}>
              {w.label}
            </button>
          ))}
        </div>
      )}
      <button onClick={post} disabled={busy || title.trim().length < 3 || !when || !place}
        className="w-full h-12 rounded-full bg-vf-ember text-vf-ink font-medium text-[15px] disabled:opacity-50 inline-flex items-center justify-center gap-2"
        data-testid="button-post-plan">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Post it
      </button>
    </section>
  );
}

function Report({ plan }: { plan: BoardPlanView }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const report = async (category: string, label: string) => {
    try {
      await send("POST", `/api/users/${plan.host.userId}/report`, {
        category, reason: `Plans board: "${plan.title}" (${label})`, evidence: [{ type: "board_plan", id: plan.id }],
      });
      toast({ title: "Reported. Thank you.", description: "We'll look at it. You won't see their plans any more." });
      qc.invalidateQueries({ queryKey: KEY });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    }
    setOpen(false);
  };
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[12px] text-vf-faint inline-flex items-center gap-1 hover:text-vf-text" data-testid={`button-report-${plan.id}`}>
        <Flag className="w-3.5 h-3.5" /> Report
      </button>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap gap-1.5" data-testid={`report-reasons-${plan.id}`}>
      {BOARD_REPORT_REASONS.map((r) => (
        <button key={r.value} onClick={() => report(r.value, r.label)} className="h-8 px-3 rounded-full border border-vf-line text-[12.5px] text-vf-text" data-testid={`report-${r.value}`}>
          {r.label}
        </button>
      ))}
      <button onClick={() => setOpen(false)} className="h-8 px-2 text-[12.5px] text-vf-faint">Cancel</button>
    </div>
  );
}

function PlanCard({ p }: { p: BoardPlanView }) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const left = p.seats - p.taken;
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await qc.invalidateQueries({ queryKey: KEY }); } catch (e: any) { toast({ title: e.message, variant: "destructive" }); } finally { setBusy(false); }
  };
  return (
    <article className="rounded-2xl border border-vf-line bg-vf-surface p-4" data-testid={`board-plan-${p.id}`}>
      <div className="flex items-start gap-3">
        <VfAvatar size={40} src={p.host.photoUrl ?? undefined} name={p.host.name} seed={p.host.userId} />
        <div className="flex-1 min-w-0">
          <div className="text-[15.5px] text-vf-text leading-snug">{p.title}</div>
          <div className="text-[12.5px] text-vf-faint mt-1 flex items-center gap-1">
            {p.isMine ? "Your plan" : <>{p.host.name}{p.host.age != null && `, ${p.host.age}`}{p.host.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-vf-mint" aria-label="Verified" />}</>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[15px] text-vf-text tabular-nums">{time(p.startsAt)}</div>
          <div className="text-[11.5px] text-vf-faint">{left > 0 ? `${left} of ${p.seats} left` : "Full"}</div>
        </div>
      </div>
      <div className="text-[13px] text-vf-muted mt-3 flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5 shrink-0" /> {p.place.name}<span className="text-vf-faint">· {p.place.detail}</span>
      </div>
      {p.who !== "anyone" && <div className="text-[12px] text-vf-faint mt-1">{BOARD_WHO.find((w) => w.value === p.who)?.label}</div>}

      {p.going.length > 0 && (
        <div className="flex items-center gap-2 mt-3">
          <div className="flex -space-x-2">
            {p.going.map((g) => (
              <div key={g.userId} className="rounded-full border-2 border-vf-surface"><VfAvatar size={24} src={g.photoUrl ?? undefined} name={g.name} seed={g.userId} /></div>
            ))}
          </div>
          <span className="text-[12px] text-vf-faint">{p.going.map((g) => g.name).join(", ")} going</span>
        </div>
      )}

      {/* The host: requests, the chat, calling it off. */}
      {p.isMine && (
        <div className="mt-3 space-y-2">
          {p.requests.filter((r) => r.status === "pending").map((r) => (
            <div key={r.person.userId} className="flex items-center gap-2.5 rounded-xl bg-vf-text/[0.03] px-3 py-2" data-testid={`board-request-${r.person.userId}`}>
              <VfAvatar size={30} src={r.person.photoUrl ?? undefined} name={r.person.name} seed={r.person.userId} />
              <span className="flex-1 text-[13.5px] text-vf-text">
                {r.person.name}{r.person.age != null && `, ${r.person.age}`} is in
                {r.person.isVerified && <BadgeCheck className="inline w-3.5 h-3.5 text-vf-mint ml-1 -mt-0.5" aria-label="Verified" />}
              </span>
              <button disabled={busy} onClick={() => act(() => send("POST", `/api/board/${p.id}/requests/${r.person.userId}`, { approve: false }))} className="h-8 px-3 rounded-full border border-vf-line text-[12.5px] text-vf-muted" data-testid={`board-no-${r.person.userId}`}>No</button>
              <button disabled={busy || left <= 0} onClick={() => act(() => send("POST", `/api/board/${p.id}/requests/${r.person.userId}`, { approve: true }))} className="h-8 px-3 rounded-full bg-vf-mint text-vf-ink text-[12.5px] font-medium disabled:opacity-50" data-testid={`board-yes-${r.person.userId}`}>Yes</button>
            </div>
          ))}
          <div className="flex items-center gap-3 pt-1">
            {p.chatGroupId && (
              <button onClick={() => setLocation(`/lounge/group/${p.chatGroupId}`)} className="h-9 px-3.5 rounded-full bg-vf-text text-vf-ink text-[13px] font-medium inline-flex items-center gap-1.5" data-testid={`board-chat-${p.id}`}>
                <MessageCircle className="w-4 h-4" /> Plan chat
              </button>
            )}
            <button disabled={busy} onClick={() => act(() => send("DELETE", `/api/board/${p.id}`))} className="text-[12.5px] text-vf-muted underline underline-offset-2" data-testid={`board-cancel-${p.id}`}>Call it off</button>
          </div>
        </div>
      )}

      {/* Everyone else. */}
      {!p.isMine && (
        <div className="mt-3 flex items-center gap-3">
          {p.myStatus === null && (
            <button disabled={busy || left <= 0} onClick={() => act(() => send("POST", `/api/board/${p.id}/in`))}
              className="h-9 px-4 rounded-full bg-vf-ember text-vf-ink text-[13.5px] font-medium disabled:opacity-50" data-testid={`board-in-${p.id}`}>
              I'm in
            </button>
          )}
          {p.myStatus === "pending" && <span className="text-[13px] text-vf-muted" data-testid={`board-status-${p.id}`}>Waiting for {p.host.name}</span>}
          {p.myStatus === "declined" && <span className="text-[13px] text-vf-faint" data-testid={`board-status-${p.id}`}>Not this time</span>}
          {p.myStatus === "approved" && (
            <>
              <span className="text-[13px] text-vf-mint font-medium" data-testid={`board-status-${p.id}`}>You're in</span>
              {p.chatGroupId && (
                <button onClick={() => setLocation(`/lounge/group/${p.chatGroupId}`)} className="h-9 px-3.5 rounded-full bg-vf-text text-vf-ink text-[13px] font-medium inline-flex items-center gap-1.5" data-testid={`board-chat-${p.id}`}>
                  <MessageCircle className="w-4 h-4" /> Plan chat
                </button>
              )}
            </>
          )}
          {(p.myStatus === "pending" || p.myStatus === "approved") && (
            <button disabled={busy} onClick={() => act(() => send("DELETE", `/api/board/${p.id}/in`))} className="text-[12.5px] text-vf-faint underline underline-offset-2" data-testid={`board-withdraw-${p.id}`}>
              Can't make it
            </button>
          )}
          <div className="ml-auto"><Report plan={p} /></div>
        </div>
      )}
    </article>
  );
}

function ByDay({ plans }: { plans: BoardPlanView[] }) {
  const days: { label: string; items: BoardPlanView[] }[] = [];
  for (const p of plans) {
    const label = dayLabel(p.startsAt);
    const last = days[days.length - 1];
    if (last && last.label === label) last.items.push(p);
    else days.push({ label, items: [p] });
  }
  return (
    <div className="space-y-5">
      {days.map((d) => (
        <div key={d.label}>
          <div className="text-[13px] font-medium text-vf-text mb-2">{d.label}</div>
          <div className="space-y-2.5">{d.items.map((p) => <PlanCard key={p.id} p={p} />)}</div>
        </div>
      ))}
    </div>
  );
}

export default function PlansBoardPage() {
  const { data, isLoading } = useQuery<BoardMe>({ queryKey: KEY, staleTime: 0 });
  const [posting, setPosting] = useState(false);
  return (
    <LayoutShell>
      <div className="max-w-[460px] mx-auto pb-10" data-testid="page-plans-board">
        <div className={EYEBROW}>Plans board</div>
        <h1 className="font-serif font-normal text-[30px] leading-[1.1] text-vf-text mt-2">Who's in?</h1>
        <p className="text-[14px] text-vf-muted mt-2 leading-[1.5]">
          Small plans for the next 7 days. Tap "I'm in" and the host says yes or no. Public places only.
        </p>
        <div className="mt-6 space-y-6">
          {isLoading || !data ? (
            <Loader2 className="w-6 h-6 animate-spin text-vf-faint" />
          ) : (
            <>
              {posting ? (
                <PostForm onDone={() => setPosting(false)} />
              ) : data.canHost ? (
                <button onClick={() => setPosting(true)} className="w-full h-12 rounded-full bg-vf-ember text-vf-ink font-medium text-[15px] inline-flex items-center justify-center gap-2" data-testid="button-new-board-plan">
                  <Plus className="w-4 h-4" /> Post a plan
                </button>
              ) : (
                <p className="text-[13px] text-vf-faint">You have 3 plans up. Post another once one has happened.</p>
              )}
              {data.mine.length > 0 && (
                <section data-testid="board-mine">
                  <div className={`${EYEBROW} mb-2.5`}>Your plans</div>
                  <div className="space-y-2.5">{data.mine.map((p) => <PlanCard key={p.id} p={p} />)}</div>
                </section>
              )}
              {data.asked.length > 0 && (
                <section data-testid="board-asked">
                  <div className={`${EYEBROW} mb-2.5`}>You asked</div>
                  <div className="space-y-2.5">{data.asked.map((p) => <PlanCard key={p.id} p={p} />)}</div>
                </section>
              )}
              <section data-testid="board-open">
                <div className={`${EYEBROW} mb-2.5`}>This week</div>
                {data.open.length ? <ByDay plans={data.open} /> : (
                  <p className="text-[13.5px] text-vf-faint" data-testid="board-empty">Nothing on the board yet. Be the first: post a plan.</p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </LayoutShell>
  );
}
