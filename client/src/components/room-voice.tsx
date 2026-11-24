// Voice notes in Lounge rooms (docs/destira-3-upgrade-prompt.md Part J): the
// direct messages' recorder (lib/dm-media.ts) and the same small player.
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Mic, Pause, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { haptic } from "@/lib/haptics";
import { canRecordVoice, clock, useVoiceRecorder } from "@/lib/dm-media";

/** Record, then send to the room. `replyTo` is read when the note is done. */
export function useRoomVoice(groupId: number, replyTo: () => number | null, onSent: () => void) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const rec = useVoiceRecorder(async (r) => {
    haptic.send();
    setSending(true);
    try {
      const form = new FormData();
      form.append("file", r.blob, `voice.${r.mime.split("/")[1] || "webm"}`);
      form.append("durationMs", String(Math.round(r.durationMs)));
      const reply = replyTo();
      if (reply) form.append("replyToMessageId", String(reply));
      const res = await fetch(`/api/groups/${groupId}/voice`, { method: "POST", credentials: "include", body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || "Couldn't send that voice note");
      onSent();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["/api/groups", groupId, "messages-enriched"] }),
        qc.invalidateQueries({ queryKey: [`/api/groups/${groupId}/posting`] }),
      ]);
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  });
  const start = async () => {
    haptic.tick();
    const problem = await rec.start();
    if (problem) toast({ title: problem, variant: "destructive" });
  };
  return { ...rec, start, sending, available: canRecordVoice() };
}

const loaded = new Map<string, string>();

export function RoomVoiceBubble({ msg, isMe }: { msg: { id: number; mediaUrl?: string | null; durationMs?: number | null }; isMe: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState(0);
  const [failed, setFailed] = useState(false);
  const total = msg.durationMs ?? 0;
  useEffect(() => () => { audio.current?.pause(); }, []);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (playing) { audio.current?.pause(); return; }
    if (!audio.current) {
      if (!msg.mediaUrl) { setFailed(true); return; }
      setLoading(true);
      try {
        let url = loaded.get(msg.mediaUrl);
        if (!url) {
          const res = await fetch(msg.mediaUrl, { credentials: "include" });
          if (!res.ok) throw new Error();
          url = URL.createObjectURL(await res.blob());
          loaded.set(msg.mediaUrl, url);
        }
        const a = new Audio(url);
        a.ontimeupdate = () => setPos(a.currentTime * 1000);
        a.onplay = () => setPlaying(true);
        a.onpause = () => setPlaying(false);
        a.onended = () => { setPlaying(false); setPos(0); };
        audio.current = a;
      } catch {
        setFailed(true);
        return;
      } finally {
        setLoading(false);
      }
    }
    audio.current.play().catch(() => setFailed(true));
  };

  const pct = total ? Math.min(100, (pos / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 min-w-[190px]" data-testid={`room-voice-${msg.id}`}>
      <button
        type="button"
        onClick={toggle}
        disabled={failed}
        className="w-9 h-9 rounded-full flex items-center justify-center bg-vf-ember text-vf-ink shrink-0 disabled:opacity-40"
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        data-testid={`button-play-room-voice-${msg.id}`}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className={`h-1 rounded-full overflow-hidden ${isMe ? "bg-vf-ember/20" : "bg-vf-line"}`}>
          <div className="h-full bg-vf-ember transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 flex items-center gap-1 font-mono text-[11px] text-vf-faint">
          <Mic className="w-3 h-3" /> {failed ? "Couldn't play" : clock(playing || pos ? pos : total)}
        </div>
      </div>
    </div>
  );
}
