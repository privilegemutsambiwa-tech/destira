// Lounge moderator tools (docs/destira-3-upgrade-prompt.md Part J): the room
// rules before your first message, a moderator's pause, slow mode, and
// removing a message with a reason.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Hourglass, ScrollText, ShieldAlert } from "lucide-react";
import { VfButton, VfSheet } from "@/components/ui-vf";
import { useToast } from "@/hooks/use-toast";
import {
  MEMBER_MUTE_OPTIONS, REMOVE_REASONS, REMOVE_REASON_MAX, SLOW_MODE_OPTIONS, slowModeLabel, type RoomPostingState,
} from "@shared/lounge";

const postingKey = (groupId: number) => [`/api/groups/${groupId}/posting`];
export const usePostingState = (groupId: number, enabled: boolean) =>
  useQuery<RoomPostingState>({ queryKey: postingKey(groupId), enabled, refetchInterval: 60_000 });

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Something went wrong");
  return data;
}

const clock = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleString("en-GB", sameDay ? { hour: "2-digit", minute: "2-digit", hour12: false } : { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
};

/** In place of the composer until the member agrees to the room rules. */
export function RoomRulesCard({ groupId, rules }: { groupId: number; rules: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    try {
      await send(`/api/groups/${groupId}/rules/accept`, "POST", {});
      await qc.invalidateQueries({ queryKey: postingKey(groupId) });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-2xl border border-vf-line bg-vf-surface2 p-4" data-testid="room-rules">
      <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">
        <ScrollText className="w-3.5 h-3.5" /> Room rules
      </div>
      <p className="mt-2 text-[14px] leading-[1.55] text-vf-text whitespace-pre-line max-h-[28vh] overflow-y-auto">{rules}</p>
      <VfButton fullWidth className="mt-3" onClick={accept} loading={busy} data-testid="button-accept-rules">
        I'll follow these
      </VfButton>
    </div>
  );
}

/** In place of the composer while a moderator has paused this member. */
export function PausedNotice({ until }: { until: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-vf-line bg-vf-surface2 p-3.5" data-testid="room-paused">
      <ShieldAlert className="w-5 h-5 text-vf-ember shrink-0 mt-0.5" />
      <div className="text-[13.5px] leading-[1.5] text-vf-text">
        A moderator paused your messages here until {clock(until)}.
        <div className="text-vf-muted">You can still read along.</div>
      </div>
    </div>
  );
}

/** Slow mode: counts down from the last message this member sent. */
export function useSlowMode(posting: RoomPostingState | undefined) {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const exempt = !posting || posting.role === "owner" || posting.role === "admin";
  useEffect(() => {
    if (posting?.waitSeconds) setUntil(Date.now() + posting.waitSeconds * 1000);
  }, [posting?.waitSeconds]);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  useEffect(() => {
    if (!left) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [left]);
  return {
    seconds: posting?.slowModeSeconds ?? 0,
    left: exempt ? 0 : left,
    sent: () => {
      if (!exempt && posting?.slowModeSeconds) { setNow(Date.now()); setUntil(Date.now() + posting.slowModeSeconds * 1000); }
    },
  };
}

export function SlowModeLine({ seconds, left }: { seconds: number; left: number }) {
  if (!seconds) return null;
  return (
    <div className="px-4 pt-2 flex items-center gap-1.5 text-[12px] text-vf-muted" data-testid="slow-mode-line">
      <Hourglass className="w-3.5 h-3.5" />
      Slow mode: one message every {slowModeLabel(seconds)}
      {left > 0 && <span className="ml-auto font-mono text-vf-ember" data-testid="slow-mode-left">{left}s</span>}
    </div>
  );
}

/** An admin removes a message and says why. The reason shows in its place. */
export function RemoveMessageSheet({ groupId, message, onClose }: { groupId: number; message: { id: number; nickname?: string | null; content?: string } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [pick, setPick] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (message) { setPick(null); setOther(""); } }, [message?.id]);
  const reason = pick === "other" ? other.trim() : pick;
  const remove = async () => {
    if (!message || !reason) return;
    setBusy(true);
    try {
      await send(`/api/groups/${groupId}/messages/${message.id}/remove`, "POST", { reason });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["/api/groups", groupId, "messages-enriched"] }),
        qc.invalidateQueries({ queryKey: ["/api/groups", groupId, "messages"] }),
      ]);
      toast({ title: "Removed. They'll see why." });
      onClose();
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  const chip = (on: boolean) =>
    `vf-press px-3.5 min-h-[36px] text-[13px] rounded-full border transition-colors ${on ? "bg-vf-text border-transparent text-vf-ink" : "bg-vf-surface border-vf-line text-vf-text"}`;
  return (
    <VfSheet
      open={!!message}
      onOpenChange={(v) => { if (!v && !busy) onClose(); }}
      eyebrow="Moderator"
      title="Remove this message?"
      description={message ? `${message.nickname ? `${message.nickname}'s` : "Their"} message will be replaced with your reason, for everyone.` : undefined}
      footer={
        <VfButton fullWidth onClick={remove} disabled={!reason} loading={busy} data-testid="button-confirm-remove">
          Remove message
        </VfButton>
      }
    >
      {message?.content && (
        <p className="text-[13.5px] text-vf-muted border-l-2 border-vf-line pl-3 mb-4 line-clamp-3">{message.content}</p>
      )}
      <div className="vf-label text-vf-faint mb-2">Why</div>
      <div className="flex flex-wrap gap-2">
        {REMOVE_REASONS.map((r) => (
          <button key={r} type="button" className={chip(pick === r)} onClick={() => setPick(r)} data-testid={`remove-reason-${REMOVE_REASONS.indexOf(r)}`}>{r}</button>
        ))}
        <button type="button" className={chip(pick === "other")} onClick={() => setPick("other")} data-testid="remove-reason-other">Something else</button>
      </div>
      {pick === "other" && (
        <input
          value={other}
          onChange={(e) => setOther(e.target.value.slice(0, REMOVE_REASON_MAX))}
          placeholder="In a few words"
          autoFocus
          className="mt-3 w-full h-11 px-3.5 text-[15px] rounded-[10px] bg-[var(--vf-elevated)] border border-transparent text-vf-text outline-none focus:border-vf-line"
          data-testid="input-remove-reason"
        />
      )}
    </VfSheet>
  );
}

/** In a removed message's bubble. */
export function removedLine(msg: { isDeletedByAdmin?: boolean; removedReason?: string | null }): string {
  return msg.isDeletedByAdmin && msg.removedReason ? `Removed by a moderator · ${msg.removedReason}` : "[Message deleted]";
}

/** Admin: pause a member's messages for a while, or lift it. */
export async function pauseMember(groupId: number, userId: string, minutes: number): Promise<string | null> {
  const r = await send(`/api/groups/${groupId}/members/${userId}/pause`, "POST", { minutes });
  return r.mutedUntil ?? null;
}
export const PAUSE_OPTIONS = MEMBER_MUTE_OPTIONS;
export const pausedUntilLabel = (iso: string | null | undefined) =>
  iso && new Date(iso) > new Date() ? `Paused until ${clock(iso)}` : null;

/** Room settings: slow mode, saved straight away. */
export function SlowModeSetting({ groupId, value }: { groupId: number; value: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [cur, setCur] = useState(value);
  useEffect(() => setCur(value), [value]);
  const set = async (seconds: number) => {
    const prev = cur;
    setCur(seconds);
    try {
      await send(`/api/groups/${groupId}/slow-mode`, "PUT", { seconds });
      qc.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      qc.invalidateQueries({ queryKey: postingKey(groupId) });
      toast({ title: seconds ? `Slow mode: one message every ${slowModeLabel(seconds)}` : "Slow mode is off" });
    } catch (e: any) {
      setCur(prev);
      toast({ title: e.message, variant: "destructive" });
    }
  };
  return (
    <div data-testid="slow-mode-setting">
      <div className="text-sm text-foreground">Slow mode</div>
      <div className="text-xs mt-0.5 mb-2.5" style={{ color: "var(--vf-muted)" }}>How long members wait between messages. Admins aren't slowed.</div>
      <div className="flex flex-wrap gap-2">
        {SLOW_MODE_OPTIONS.map((o) => (
          <button
            key={o.seconds}
            type="button"
            onClick={() => set(o.seconds)}
            aria-pressed={cur === o.seconds}
            className={`px-3 min-h-[32px] text-[12.5px] rounded-full border ${cur === o.seconds ? "bg-vf-text border-transparent text-vf-ink" : "border-vf-line text-vf-text"}`}
            data-testid={`slow-mode-${o.seconds}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
