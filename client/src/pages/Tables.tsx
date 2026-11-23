// The Sunday Table (docs/destira-3-upgrade-prompt.md Part O2): sign up by
// Thursday, learn your table's vibe on Friday, the place on Saturday, names
// and faces at 12:45 on Sunday. After lunch, privately pick who you'd see again.
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, Heart, Loader2, Lock, MapPin, MessageCircle, Users, Utensils } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { VfAvatar } from "@/components/ui-vf";
import { useToast } from "@/hooks/use-toast";
import { useProfile, useUpdateProfile } from "@/hooks/use-profiles";
import { TABLE_MIXES, type TableMix, type TablePickKind, type TablesMe, type TableView } from "@shared/tables";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Harare" });
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Harare" });

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

function Step({ done, icon: Icon, title, children, testId }: { done: boolean; icon: typeof Users; title: string; children: React.ReactNode; testId: string }) {
  return (
    <div className="flex gap-3" data-testid={testId}>
      <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center ${done ? "bg-vf-mint/[0.12] text-vf-mint" : "bg-vf-text/[0.05] text-vf-faint"}`}>
        {done ? <Icon className="w-4 h-4" /> : <Lock className="w-3.5 h-3.5" />}
      </div>
      <div className="flex-1 min-w-0 pb-4">
        <div className={`text-[14.5px] ${done ? "text-vf-text" : "text-vf-muted"}`}>{title}</div>
        <div className="text-[13px] text-vf-faint mt-0.5 leading-[1.45]">{children}</div>
      </div>
    </div>
  );
}

function TableCard({ t }: { t: TableView }) {
  const [, setLocation] = useLocation();
  return (
    <section className="rounded-[22px] border border-vf-line bg-vf-surface p-5" data-testid="card-my-table">
      <div className={EYEBROW}>Your table · {day(t.startsAt)}</div>
      <p className="font-serif text-[22px] leading-[1.25] text-vf-text mt-2" data-testid="text-table-vibe">{t.vibe}</p>
      <div className="mt-5">
        <Step done icon={Check} title="You're seated" testId="step-seated">
          {t.size} people, lunch at {new Date(t.startsAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Harare" })}. Everyone pays for their own food.
        </Step>
        <Step done={!!t.place} icon={MapPin} title={t.place ? t.place.name : "The place"} testId="step-place">
          {t.place ? (
            <>
              {t.place.detail && <div>{t.place.detail}</div>}
              {t.chatGroupId && (
                <button
                  onClick={() => setLocation(`/lounge/group/${t.chatGroupId}`)}
                  className="mt-2.5 h-9 px-3.5 rounded-full bg-vf-text text-vf-ink text-[13px] font-medium inline-flex items-center gap-1.5"
                  data-testid="button-table-chat"
                >
                  <MessageCircle className="w-4 h-4" /> Table chat
                </button>
              )}
            </>
          ) : (
            <>Arrives {when(t.placeAt)}, with your table's chat.</>
          )}
        </Step>
        <Step done={!!t.people} icon={Users} title="Who's coming" testId="step-people">
          {t.people ? (
            <div className="flex flex-wrap gap-3 mt-2">
              {t.people.map((p) => (
                <div key={p.userId} className="flex flex-col items-center w-[64px]" data-testid={`table-person-${p.userId}`}>
                  <VfAvatar size={52} src={p.photoUrl ?? undefined} name={p.name} seed={p.userId} />
                  <span className="text-[12.5px] text-vf-text mt-1 truncate max-w-full">{p.name}</span>
                  {p.age != null && <span className="text-[11.5px] text-vf-faint">{p.age}</span>}
                </div>
              ))}
            </div>
          ) : (
            <>Names and faces at {when(t.namesAt)}.</>
          )}
        </Step>
      </div>
    </section>
  );
}

function Picks({ t }: { t: TableView }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [mutual, setMutual] = useState<{ name: string; kind: TablePickKind; matchId: number } | null>(null);
  const [, setLocation] = useLocation();
  const mine = new Map(t.picks.mine.map((m) => [m.toId, m.kind]));

  const choose = async (toId: string, name: string, kind: TablePickKind) => {
    setBusy(toId);
    try {
      const next = mine.get(toId) === kind ? null : kind;
      const out = await send("POST", `/api/tables/${t.id}/pick`, { toId, kind: next });
      if (out.status === "mutual") {
        setMutual({ name, kind: out.kind, matchId: out.matchId });
        qc.invalidateQueries({ queryKey: ["/api/chat/threads"] });
      }
      await qc.invalidateQueries({ queryKey: ["/api/tables/me"] });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-[22px] border border-vf-ember/40 bg-vf-ember/[0.06] p-5" data-testid="card-picks">
      <div className={EYEBROW}>After {day(t.startsAt)}</div>
      <h2 className="font-serif text-[24px] leading-[1.2] text-vf-text mt-2">Who would you see again?</h2>
      <p className="text-[13.5px] text-vf-muted mt-1.5 leading-[1.5]">
        Only you see your picks. If someone picks you too, we'll put you in touch. Open until {when(t.picks.closesAt)}.
      </p>
      {mutual && (
        <div className="mt-4 rounded-2xl border border-vf-mint/40 bg-vf-mint/[0.08] p-3.5 flex items-center gap-3" data-testid="banner-table-mutual">
          {mutual.kind === "love" ? <Heart className="w-5 h-5 text-vf-mint shrink-0" /> : <Users className="w-5 h-5 text-vf-mint shrink-0" />}
          <div className="flex-1 text-[14px] text-vf-text">
            {mutual.kind === "love" ? `${mutual.name} said more than friends too. It's a match.` : `${mutual.name} picked you too. You're friends now.`}
          </div>
          <button
            onClick={() => setLocation(`/chat/${mutual.matchId}`)}
            className="h-9 px-3.5 rounded-full bg-vf-text text-vf-ink text-[13px] font-medium"
            data-testid="button-table-mutual-chat"
          >
            Chat
          </button>
        </div>
      )}
      <div className="mt-4 divide-y divide-vf-line">
        {(t.people ?? []).map((p) => {
          const picked = mine.get(p.userId);
          const love = t.picks.canLove.includes(p.userId);
          return (
            <div key={p.userId} className="flex items-center gap-3 py-3" data-testid={`pick-row-${p.userId}`}>
              <VfAvatar size={44} src={p.photoUrl ?? undefined} name={p.name} seed={p.userId} />
              <div className="flex-1 min-w-0 text-[14.5px] text-vf-text truncate">
                {p.name}
                {p.age != null && <span className="text-vf-faint">, {p.age}</span>}
              </div>
              <button
                onClick={() => choose(p.userId, p.name, "friends")}
                disabled={busy === p.userId}
                aria-pressed={picked === "friends"}
                className={`h-9 px-3 rounded-full text-[13px] border inline-flex items-center gap-1.5 disabled:opacity-50 ${picked === "friends" ? "bg-vf-mint text-vf-ink border-vf-mint" : "border-vf-line text-vf-muted"}`}
                data-testid={`pick-friends-${p.userId}`}
              >
                <Users className="w-3.5 h-3.5" /> Friends
              </button>
              {love && (
                <button
                  onClick={() => choose(p.userId, p.name, "love")}
                  disabled={busy === p.userId}
                  aria-pressed={picked === "love"}
                  className={`h-9 px-3 rounded-full text-[13px] border inline-flex items-center gap-1.5 disabled:opacity-50 ${picked === "love" ? "bg-vf-ember text-vf-ink border-vf-ember" : "border-vf-line text-vf-muted"}`}
                  data-testid={`pick-love-${p.userId}`}
                >
                  <Heart className="w-3.5 h-3.5" /> More
                </button>
              )}
            </div>
          );
        })}
      </div>
      <KeepTogether tableId={t.id} />
      {t.picks.canLove.length > 0 && (
        <p className="text-[12px] text-vf-faint mt-2">"More" means more than friends. It only shows where you're both here for Love and would date each other.</p>
      )}
    </section>
  );
}

/** After lunch: turn the table into a friend circle (everyone is invited). */
function KeepTogether({ tableId }: { tableId: number }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const c = await send("POST", "/api/circles", { fromTableId: tableId });
      setLocation(`/circles/${c.id}`);
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={go}
      disabled={busy}
      className="mt-4 w-full h-11 rounded-full border border-vf-line text-vf-text text-[14px] inline-flex items-center justify-center gap-2 disabled:opacity-50"
      data-testid="button-keep-table"
    >
      <Users className="w-4 h-4" /> Keep this table together as a circle
    </button>
  );
}

function SignUp({ me }: { me: TablesMe }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: profile } = useProfile();
  const [mix, setMix] = useState<TableMix>("mixed");
  const [busy, setBusy] = useState(false);
  const gender = (profile as any)?.gender;
  const mixes = TABLE_MIXES.filter((m) => m.value === "mixed" || (m.value === "women" && gender === "woman") || (m.value === "men" && gender === "man"));
  const s = me.signup && me.signup.weekend === me.weekend ? me.signup : null;

  const go = async (method: "POST" | "DELETE") => {
    setBusy(true);
    try {
      const out = await send(method, "/api/tables/signup", method === "POST" ? { mix } : undefined);
      qc.setQueryData(["/api/tables/me"], out);
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (s?.status === "waiting") {
    return (
      <section className="rounded-[22px] border border-vf-line p-5" data-testid="card-signed-up">
        <div className="flex items-center gap-2 text-vf-mint text-[14.5px]">
          <Check className="w-4 h-4" /> You're on the list for {me.weekendLabel}
        </div>
        <p className="text-[13.5px] text-vf-muted mt-2 leading-[1.5]">
          {TABLE_MIXES.find((m) => m.value === s.mix)?.label} table. We seat everyone on Friday morning and tell you your table's vibe then.
        </p>
        <button onClick={() => go("DELETE")} disabled={busy} className="mt-4 text-[13px] text-vf-muted underline underline-offset-2 disabled:opacity-50" data-testid="button-table-cancel">
          Can't make it? Take me off (until {when(me.signupCloses)})
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-[22px] border border-vf-line p-5" data-testid="card-signup">
      <div className={EYEBROW}>{me.weekendLabel} · 13:00</div>
      <h2 className="font-serif text-[22px] leading-[1.25] text-vf-text mt-2">Save me a seat</h2>
      <p className="text-[13.5px] text-vf-muted mt-1.5 leading-[1.5]">Sign up by {when(me.signupCloses)}.</p>
      {!me.allowance.ok ? (
        <div className="mt-4 rounded-2xl bg-vf-text/[0.04] p-4" data-testid="table-allowance">
          <p className="text-[13.5px] text-vf-text">{me.allowance.reason}</p>
          <Link href="/plans">
            <span className="inline-block mt-3 text-[13px] text-vf-ember underline underline-offset-2 cursor-pointer">See plans</span>
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-2" role="radiogroup" aria-label="Table">
            {mixes.map((m) => (
              <button
                key={m.value}
                role="radio"
                aria-checked={mix === m.value}
                onClick={() => setMix(m.value)}
                className={`text-left rounded-2xl border px-4 py-3 ${mix === m.value ? "border-vf-ember bg-vf-ember/[0.06]" : "border-vf-line"}`}
                data-testid={`table-mix-${m.value}`}
              >
                <div className="text-[14.5px] text-vf-text">{m.label}</div>
                <div className="text-[12.5px] text-vf-faint mt-0.5">{m.note}</div>
              </button>
            ))}
          </div>
          <button
            onClick={() => go("POST")}
            disabled={busy}
            className="mt-4 w-full h-12 rounded-full bg-vf-ember text-vf-ink font-medium text-[15px] inline-flex items-center justify-center gap-2 disabled:opacity-50"
            data-testid="button-table-signup"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Utensils className="w-4 h-4" />} Save me a seat
          </button>
        </>
      )}
    </section>
  );
}

export default function TablesPage() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const { data: me, isLoading } = useQuery<TablesMe>({ queryKey: ["/api/tables/me"], staleTime: 0 });
  const other = me?.signup && me.signup.weekend !== me.weekend ? me.signup : null;

  const turnOn = async () => {
    if (!profile) return;
    await updateProfile.mutateAsync({ userId: profile.userId, data: { lookingFor: "both" } as any });
    qc.invalidateQueries({ queryKey: ["/api/tables/me"] });
  };

  return (
    <LayoutShell>
      <div className="max-w-[460px] mx-auto pb-10" data-testid="page-tables">
        <div className={EYEBROW}>Destira Friends</div>
        <h1 className="font-serif font-normal text-[30px] leading-[1.1] text-vf-text mt-2">The Sunday Table</h1>
        <p className="text-[14px] text-vf-muted mt-2 leading-[1.5]">
          Lunch every Sunday at 13:00 with five people near you, close to your age. You'll know the vibe on Friday, the place on Saturday and the names on Sunday.
        </p>

        <div className="mt-6 space-y-4">
          {isLoading || !me ? (
            <Loader2 className="w-6 h-6 animate-spin text-vf-faint" />
          ) : !me.friendsOn ? (
            <div className="rounded-2xl border border-vf-line p-5 text-center" data-testid="tables-friends-off">
              <Users className="w-8 h-8 text-vf-faint mx-auto" />
              <p className="text-[15px] text-vf-text mt-3">The Sunday Table is part of Friends</p>
              <p className="text-[13px] text-vf-faint mt-1">Turn on Friends to sign up. Your dating side stays exactly as it is.</p>
              <button onClick={turnOn} className="mt-4 h-11 px-5 rounded-full bg-vf-ember text-vf-ink font-medium text-[14px]" data-testid="button-tables-friends-on">
                Turn on Friends
              </button>
            </div>
          ) : (
            <>
              {me.recent && me.recent.people && <Picks t={me.recent} />}
              {me.table && <TableCard t={me.table} />}
              {other?.status === "waiting" && (
                <div className="rounded-2xl border border-vf-line p-4 flex gap-3" data-testid="table-forming">
                  <CalendarClock className="w-5 h-5 text-vf-faint shrink-0" />
                  <p className="text-[13.5px] text-vf-muted">We're seating everyone for {other.weekendLabel}. You'll hear from us soon.</p>
                </div>
              )}
              {other?.status === "unseated" && (
                <div className="rounded-2xl border border-vf-line p-4 flex gap-3" data-testid="table-unseated">
                  <CalendarClock className="w-5 h-5 text-vf-faint shrink-0" />
                  <p className="text-[13.5px] text-vf-muted">
                    No table for you on {other.weekendLabel}: not enough people near you and your age signed up. Try the next one.
                  </p>
                </div>
              )}
              {!(me.table && me.table.weekend === me.weekend) && <SignUp me={me} />}
            </>
          )}
        </div>
      </div>
    </LayoutShell>
  );
}
