// The pieces of a direct message beyond plain text (Part E): photos, view
// once photos, voice notes, reactions, the per-message actions (react, edit,
// unsend, report), and the typing indicator.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, Flag, Loader2, Mic, Pause, Pencil, Play, Undo2, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { clock, loadMedia, useSentMedia } from "@/lib/dm-media";
import { canStillChange, DM_REACTIONS, type DmMessageView } from "@shared/dm";
import { haptic } from "@/lib/haptics";

// ── photo ────────────────────────────────────────────────────────────

function PhotoViewer({ url, onClose, viewOnce }: { url: string; onClose: () => void; viewOnce?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-black flex items-center justify-center"
      onClick={onClose}
      onContextMenu={(e) => viewOnce && e.preventDefault()}
      data-testid="photo-viewer"
    >
      <img
        src={url}
        alt=""
        draggable={false}
        className="max-w-full max-h-full object-contain select-none"
        style={viewOnce ? { WebkitTouchCallout: "none" } as React.CSSProperties : undefined}
      />
      {viewOnce && (
        <span className="absolute bottom-[max(24px,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 whitespace-nowrap inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[12.5px] text-white/85">
          <EyeOff className="w-3.5 h-3.5" /> View once · gone when you close it
        </span>
      )}
      <button
        onClick={onClose}
        className="absolute top-[max(12px,env(safe-area-inset-top))] right-3 w-11 h-11 rounded-full flex items-center justify-center text-white/90 hover:bg-white/10"
        aria-label="Close"
        data-testid="button-close-photo"
      >
        <X className="w-6 h-6" />
      </button>
    </div>,
    document.body,
  );
}

function PhotoBubble({ msg, corner }: { msg: DmMessageView; corner: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setNear(true), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  const { url, failed } = useSentMedia(msg.id, near && msg.mediaAvailable);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => url && setOpen(true)}
        className={`block overflow-hidden border border-vf-line bg-vf-surface ${corner}`}
        data-testid={`photo-${msg.id}`}
      >
        {url ? (
          <img src={url} alt="Photo" className="block max-h-[300px] max-w-[240px] object-cover" />
        ) : (
          <div className="w-[200px] h-[200px] flex items-center justify-center text-vf-faint vf-small">
            {failed ? "Photo unavailable" : <Loader2 className="w-5 h-5 animate-spin" />}
          </div>
        )}
      </button>
      {open && url && <PhotoViewer url={url} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Recipient: tap to open, once. Sender: whether it's been opened. */
function ViewOnceBubble({ msg, isMe, corner, onOpened }: { msg: DmMessageView; isMe: boolean; corner: string; onOpened: () => void }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openedHere, setOpenedHere] = useState(false);
  const canOpen = !isMe && msg.mediaAvailable && !openedHere;
  const open = async () => {
    if (!canOpen || busy) return;
    setBusy(true);
    try {
      setUrl(await loadMedia(msg.id, { keep: false }));
      setOpenedHere(true);
    } catch (e: any) {
      setError(e?.status === 410 ? null : "Couldn't open it. Try again.");
      if (e?.status === 410) { setOpenedHere(true); onOpened(); }
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
    onOpened();
  };
  const opened = msg.viewed || openedHere;
  const label = isMe ? (msg.viewed ? "Opened" : "Not opened yet") : opened ? "Opened" : "Tap to open";
  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={!canOpen}
        className={`flex items-center gap-2.5 px-4 py-3 border ${corner} ${
          isMe ? "bg-vf-ember/[0.16] border-vf-ember/25" : "bg-vf-surface border-vf-line"
        } ${canOpen ? "hover:border-vf-text/30" : ""}`}
        data-testid={`view-once-${msg.id}`}
        data-state={opened ? "opened" : "closed"}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin text-vf-muted" /> : opened || isMe ? <EyeOff className="w-4 h-4 text-vf-faint" /> : <Eye className="w-4 h-4 text-vf-ember" />}
        <span className="text-left">
          <span className="block text-[14.5px] text-vf-text">Photo · view once</span>
          <span className="block vf-label text-vf-faint">{error ?? label}</span>
        </span>
      </button>
      {url && <PhotoViewer url={url} onClose={close} viewOnce />}
    </>
  );
}

// ── voice ────────────────────────────────────────────────────────────

function VoiceBubble({ msg, isMe, corner }: { msg: DmMessageView; isMe: boolean; corner: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState(0);
  const [failed, setFailed] = useState(false);
  const total = msg.durationMs ?? 0;

  useEffect(() => () => { audio.current?.pause(); }, []);

  const toggle = async () => {
    if (playing) { audio.current?.pause(); return; }
    if (!audio.current) {
      setLoading(true);
      try {
        const a = new Audio(await loadMedia(msg.id));
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
    <div
      className={`flex items-center gap-3 pl-2 pr-4 py-2 min-w-[200px] border ${corner} ${
        isMe ? "bg-vf-ember/[0.16] border-vf-ember/25" : "bg-vf-surface border-vf-line"
      }`}
      data-testid={`voice-${msg.id}`}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={!msg.mediaAvailable || failed}
        className="w-9 h-9 rounded-full flex items-center justify-center bg-vf-ember text-vf-ink shrink-0 disabled:opacity-40"
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        data-testid={`button-play-${msg.id}`}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="h-1 rounded-full bg-vf-line overflow-hidden">
          <div className="h-full bg-vf-ember transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 flex items-center gap-1 font-mono text-[11px] text-vf-faint">
          <Mic className="w-3 h-3" /> {failed ? "Couldn't play" : clock(playing || pos ? pos : total)}
        </div>
      </div>
    </div>
  );
}

// ── the bubble ───────────────────────────────────────────────────────

/** Non-text messages and unsent ones. Text returns null (DirectChat draws it). */
export function DmSpecialBody({ msg, isMe, corner, onChanged }: { msg: DmMessageView; isMe: boolean; corner: string; onChanged: () => void }) {
  if (msg.unsentAt) {
    return (
      <div className={`px-4 py-2.5 text-[14px] italic text-vf-faint border border-dashed border-vf-line ${corner}`} data-testid={`unsent-${msg.id}`}>
        {isMe ? "You unsent a message" : "Message unsent"}
      </div>
    );
  }
  if (msg.contentType === "photo") {
    return msg.viewOnce ? <ViewOnceBubble msg={msg} isMe={isMe} corner={corner} onOpened={onChanged} /> : <PhotoBubble msg={msg} corner={corner} />;
  }
  if (msg.contentType === "voice") return <VoiceBubble msg={msg} isMe={isMe} corner={corner} />;
  return null;
}

// ── reactions ────────────────────────────────────────────────────────

export function ReactionChips({ reactions, myId, onTap, isMe }: { reactions: { userId: string; emoji: string }[]; myId?: string; onTap: (emoji: string) => void; isMe: boolean }) {
  if (reactions.length === 0) return null;
  const counts = new Map<string, number>();
  reactions.forEach((r) => counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1));
  const mine = reactions.find((r) => r.userId === myId)?.emoji;
  return (
    <div className={`-mt-1.5 relative z-[1] flex gap-1 ${isMe ? "justify-end pr-2" : "justify-start pl-2"}`}>
      {Array.from(counts.entries()).map(([emoji, n]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onTap(emoji)}
          className={`h-6 px-1.5 rounded-full border text-[13px] leading-none flex items-center gap-0.5 bg-vf-ink ${
            mine === emoji ? "border-vf-ember/50" : "border-vf-line"
          }`}
          aria-label={mine === emoji ? `Remove your ${emoji}` : `React ${emoji}`}
          data-testid={`reaction-chip-${emoji}`}
        >
          {emoji}
          {n > 1 && <span className="font-mono text-[10px] text-vf-faint">{n}</span>}
        </button>
      ))}
    </div>
  );
}

/** Under a tapped message: reactions, then what can be done with it. */
export function MessageActions({
  msg, isMe, myReaction, onReact, onEdit, onUnsend, onReport, children,
}: {
  msg: DmMessageView;
  isMe: boolean;
  myReaction?: string;
  onReact: (emoji: string | null) => void;
  onEdit: () => void;
  onUnsend: () => void;
  onReport: () => void;
  /** Time and Seen, drawn by the chat. */
  children?: React.ReactNode;
}) {
  const changeable = isMe && !msg.unsentAt && canStillChange(msg.createdAt);
  const link = "inline-flex items-center gap-1 text-vf-faint hover:text-vf-text";
  return (
    <div className={`mt-1 flex flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}>
      {!msg.unsentAt && (
        <div className="flex items-center gap-0.5 rounded-full border border-vf-line bg-vf-surface px-1 py-0.5" role="group" aria-label="React">
          {DM_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => { haptic.tick(); onReact(myReaction === e ? null : e); }}
              className={`w-9 h-9 rounded-full text-[19px] leading-none flex items-center justify-center transition-transform hover:scale-110 ${myReaction === e ? "bg-vf-ember/20" : ""}`}
              aria-label={`React ${e}`}
              aria-pressed={myReaction === e}
              data-testid={`react-${e}-${msg.id}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      <div className={`flex items-center gap-3 px-1 font-mono text-[11px] text-vf-faint ${isMe ? "justify-end" : ""}`}>
        {children}
        {changeable && msg.contentType === "text" && (
          <button type="button" onClick={onEdit} className={link} data-testid={`action-edit-${msg.id}`}>
            <Pencil className="w-3 h-3" /> Edit
          </button>
        )}
        {changeable && (
          <button type="button" onClick={onUnsend} className={link} data-testid={`action-unsend-${msg.id}`}>
            <Undo2 className="w-3 h-3" /> Unsend
          </button>
        )}
        {!isMe && (
          <button type="button" onClick={onReport} className={link} data-testid={`action-report-${msg.id}`}>
            <Flag className="w-3 h-3" /> Report
          </button>
        )}
      </div>
    </div>
  );
}

// ── typing ───────────────────────────────────────────────────────────

/** Tells the other person while this member types (at most every 3s), and
 *  asks every 2.5s whether they are, while the chat is on screen. */
export function useTyping(matchId: number, draft: string, enabled: boolean) {
  const [theyType, setTheyType] = useState(false);
  const lastSent = useRef(0);

  useEffect(() => {
    if (!enabled || !draft.trim()) return;
    const now = Date.now();
    if (now - lastSent.current < 3000) return;
    lastSent.current = now;
    apiRequest("POST", `/api/dm/${matchId}/typing`, { typing: true }).catch(() => {});
  }, [draft, matchId, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/dm/${matchId}/typing`, { credentials: "include" });
        if (res.ok && live) setTheyType(!!(await res.json())?.typing);
      } catch {}
    };
    void check();
    const t = window.setInterval(check, 2500);
    return () => { live = false; window.clearInterval(t); };
  }, [matchId, enabled]);

  /** Call after sending: they shouldn't see "typing" for a message that's arrived. */
  const sent = () => { lastSent.current = 0; };
  return { theyType, sent };
}

export function TypingBubble() {
  return (
    <div className="flex items-start mt-3" data-testid="typing-indicator" aria-live="polite" aria-label="Typing">
      <div className="flex items-center gap-1 px-4 py-3 rounded-[20px] bg-vf-surface border border-vf-line">
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-1.5 h-1.5 rounded-full bg-vf-faint animate-bounce" style={{ animationDelay: `${i * 140}ms`, animationDuration: "1s" }} />
        ))}
      </div>
    </div>
  );
}
