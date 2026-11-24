// Scheduled game nights (docs/destira-3-upgrade-prompt.md Part J): a banner
// in the room's chat, and the room's games page lists what's coming up with
// "I'm in", plus "Schedule a game night" for the room's admins.
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, Loader2, Users } from "lucide-react";
import { VfButton, VfSheet } from "@/components/ui-vf";
import { useToast } from "@/hooks/use-toast";
import { STAGE, instantSetup, themeFor } from "@/components/games/game-theme";
import { GAME_NIGHT_NOTE_MAX, type GameNightView, type GameNightsForRoom } from "@shared/lounge";

const key = (groupId: number) => [`/api/groups/${groupId}/game-nights`];
export const useGameNights = (groupId: number, enabled = true) =>
  useQuery<GameNightsForRoom>({ queryKey: key(groupId), enabled, refetchInterval: 60_000 });

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400e3);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (d.toDateString() === today.toDateString()) return `Today ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
};

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Something went wrong");
  return data;
}

function useRsvp(groupId: number) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  const rsvp = async (n: GameNightView, going: boolean) => {
    setBusy(n.id);
    try {
      await call(`/api/game-nights/${n.id}/rsvp`, "POST", { going });
      await qc.invalidateQueries({ queryKey: key(groupId) });
      if (going) toast({ title: `You're in. We'll remind you before ${themeFor(n.kind).name}.` });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };
  return { rsvp, busy };
}

/** Under the room's header: the next game night, or one that's on now. */
export function GameNightBanner({ groupId, liveGameShown }: { groupId: number; liveGameShown: boolean }) {
  const { data } = useGameNights(groupId);
  const [, setLocation] = useLocation();
  const { rsvp, busy } = useRsvp(groupId);
  const n = data?.nights[0];
  if (!n) return null;
  const t = themeFor(n.kind);
  if (n.status === "started" && n.gameId) {
    if (liveGameShown) return null; // the live-game banner already says it
    return (
      <button
        onClick={() => setLocation(`/lounge/group/${groupId}/games/${n.gameId}`)}
        className="vf-press flex items-center gap-3 px-4 py-2.5 text-left border-b border-vf-ember/25 bg-vf-ember/[0.08]"
        data-testid="banner-game-night-on"
      >
        <span className="text-[18px]" aria-hidden="true">{t.glyph}</span>
        <span className="flex-1 min-w-0 text-[14px] text-vf-text truncate">Game night is on: {t.name}</span>
        <span className="text-[14px] font-semibold text-vf-ember shrink-0">Play</span>
      </button>
    );
  }
  if (n.status !== "scheduled") return null;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-vf-line bg-vf-surface2" data-testid="banner-game-night">
      <span className="text-[18px]" aria-hidden="true">{t.glyph}</span>
      <button onClick={() => setLocation(`/lounge/group/${groupId}/games`)} className="flex-1 min-w-0 text-left">
        <div className="text-[14px] text-vf-text truncate">Game night: {t.name}</div>
        <div className="text-[12px] text-vf-muted truncate">{when(n.startsAt)} · {n.going} in</div>
      </button>
      {n.imIn ? (
        <span className="inline-flex items-center gap-1 text-[13px] text-vf-muted shrink-0" data-testid="game-night-in"><Check className="w-4 h-4" /> You're in</span>
      ) : (
        <button
          onClick={() => rsvp(n, true)}
          disabled={busy === n.id}
          className="vf-press shrink-0 h-9 px-4 rounded-full text-[13px] font-semibold bg-vf-ember text-vf-ink disabled:opacity-60"
          data-testid="button-game-night-in"
        >
          {busy === n.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "I'm in"}
        </button>
      )}
    </div>
  );
}

/** For datetime-local: the next whole hour at least an hour away, in local time. */
function defaultStart(): string {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ScheduleSheet({ groupId, kinds, open, onOpenChange }: { groupId: number; kinds: { kind: string; label: string }[]; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [kind, setKind] = useState<string | null>(null);
  const [at, setAt] = useState(defaultStart);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!kind) return;
    setBusy(true);
    try {
      await call(`/api/groups/${groupId}/game-nights`, "POST", { kind, setup: instantSetup(kind), startsAt: new Date(at).toISOString(), note });
      await qc.invalidateQueries({ queryKey: key(groupId) });
      toast({ title: "Game night is on the calendar. The room gets a reminder 30 minutes before." });
      setKind(null); setNote(""); setAt(defaultStart());
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <VfSheet
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Game night"
      title="Schedule a game night"
      description="Members say “I'm in”. At the start the game opens with all of them already in it."
      footer={<VfButton fullWidth onClick={submit} disabled={!kind || !at} loading={busy} data-testid="button-schedule-night">Put it on the calendar</VfButton>}
    >
      <div className="vf-label text-vf-faint mb-2">Game</div>
      <div className="flex flex-wrap gap-2">
        {kinds.map((k) => {
          const t = themeFor(k.kind);
          return (
            <button
              key={k.kind}
              type="button"
              onClick={() => setKind(k.kind)}
              aria-pressed={kind === k.kind}
              className={`vf-press px-3.5 min-h-[36px] text-[13px] rounded-full border inline-flex items-center gap-1.5 ${kind === k.kind ? "bg-vf-text border-transparent text-vf-ink" : "bg-vf-surface border-vf-line text-vf-text"}`}
              data-testid={`night-kind-${k.kind}`}
            >
              <span aria-hidden="true">{t.glyph}</span> {t.name}
            </button>
          );
        })}
      </div>
      <label className="block mt-4">
        <span className="vf-label text-vf-faint mb-2 block">When</span>
        <input
          type="datetime-local"
          value={at}
          onChange={(e) => setAt(e.target.value)}
          className="w-full h-11 px-3.5 text-[15px] rounded-[10px] bg-[var(--vf-elevated)] border border-transparent text-vf-text outline-none focus:border-vf-line"
          data-testid="input-night-when"
        />
      </label>
      <label className="block mt-4">
        <span className="vf-label text-vf-faint mb-2 block">A line for the room (optional)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, GAME_NIGHT_NOTE_MAX))}
          placeholder="Friday trivia, losers pick next week's game"
          className="w-full h-11 px-3.5 text-[15px] rounded-[10px] bg-[var(--vf-elevated)] border border-transparent text-vf-text outline-none focus:border-vf-line"
          data-testid="input-night-note"
        />
      </label>
    </VfSheet>
  );
}

/** On the room's games page, above the game of the day. */
export function GameNightsSection({ groupId }: { groupId: number }) {
  const { data } = useGameNights(groupId);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { rsvp, busy } = useRsvp(groupId);
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const nights = data.nights;
  if (!nights.length && !data.canSchedule) return null;
  const cancel = async (n: GameNightView) => {
    try {
      await call(`/api/game-nights/${n.id}`, "DELETE");
      await qc.invalidateQueries({ queryKey: key(groupId) });
      toast({ title: "Called off. Everyone who was in has been told." });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    }
  };
  return (
    <section className="pt-2" data-testid="game-nights">
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: STAGE.faint }}>Game nights</div>
        {data.canSchedule && (
          <button
            onClick={() => setOpen(true)}
            className="vf-press inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-semibold"
            style={{ background: STAGE.glass, color: STAGE.cream, border: `1px solid ${STAGE.line}` }}
            data-testid="button-open-schedule"
          >
            <CalendarClock className="w-4 h-4" /> Schedule one
          </button>
        )}
      </div>
      {nights.length === 0 ? (
        <p className="text-[13px]" style={{ color: STAGE.faint }}>Nothing planned. Pick a game and a time, and the room gets a reminder before it starts.</p>
      ) : (
        <div className="space-y-2.5">
          {nights.map((n) => {
            const t = themeFor(n.kind);
            const on = n.status === "started" && n.gameId;
            return (
              <div key={n.id} className="rounded-[22px] p-4 flex items-center gap-3" style={{ background: STAGE.glass, border: `1px solid ${STAGE.line}` }} data-testid={`game-night-${n.id}`}>
                <span className="text-[30px] shrink-0" aria-hidden="true">{t.glyph}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.14em]" style={{ color: on ? STAGE.mint : STAGE.dim }}>{on ? "On now" : when(n.startsAt)}</div>
                  <div className="text-[16px] font-semibold truncate" style={{ color: STAGE.cream }}>{t.name}</div>
                  <div className="text-[12.5px] truncate" style={{ color: STAGE.dim }}>
                    <Users className="w-3.5 h-3.5 inline -mt-0.5" /> {n.going} in · {n.hostName}{n.note ? ` · ${n.note}` : ""}
                  </div>
                  {n.canCancel && (
                    <button onClick={() => cancel(n)} className="mt-1 text-[12px] underline underline-offset-2" style={{ color: STAGE.faint }} data-testid={`cancel-night-${n.id}`}>Call it off</button>
                  )}
                </div>
                {on ? (
                  <button onClick={() => setLocation(`/lounge/group/${groupId}/games/${n.gameId}`)} className="vf-press h-10 px-4 rounded-full text-[13.5px] font-semibold" style={{ background: "#fff", color: t.b }} data-testid={`play-night-${n.id}`}>Play</button>
                ) : n.imIn ? (
                  <button onClick={() => rsvp(n, false)} disabled={busy === n.id} className="vf-press h-10 px-4 rounded-full text-[13px] inline-flex items-center gap-1" style={{ color: STAGE.cream, border: `1px solid ${STAGE.line}` }} data-testid={`out-night-${n.id}`}>
                    <Check className="w-4 h-4" /> In
                  </button>
                ) : (
                  <button onClick={() => rsvp(n, true)} disabled={busy === n.id} className="vf-press h-10 px-4 rounded-full text-[13.5px] font-semibold" style={{ background: "#fff", color: t.b }} data-testid={`in-night-${n.id}`}>
                    I'm in
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <ScheduleSheet groupId={groupId} kinds={data.kinds} open={open} onOpenChange={setOpen} />
    </section>
  );
}
