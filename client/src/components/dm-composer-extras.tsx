// The chat composer's photo and voice-note controls (Part E). Both hand a
// file to the outbox (lib/outbox.ts), so they work the same offline.
import { useRef, useState } from "react";
import { EyeOff, ImagePlus, Mic, Send, Trash2 } from "lucide-react";
import { IconButton, VfButton, VfSheet } from "@/components/ui-vf";
import { useToast } from "@/hooks/use-toast";
import { canRecordVoice, clock, shrinkPhoto, useVoiceRecorder } from "@/lib/dm-media";
import { enqueueDirectMedia } from "@/lib/outbox";
import { VOICE_MAX_MS } from "@shared/dm";
import { haptic } from "@/lib/haptics";

export function PhotoButton({ matchId, otherFirst, disabled }: { matchId: number; otherFirst: string; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<{ blob: Blob; url: string } | null>(null);
  const [viewOnce, setViewOnce] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const choose = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "That isn't a photo", variant: "destructive" });
      return;
    }
    const blob = await shrinkPhoto(file);
    setViewOnce(false);
    setPicked({ blob, url: URL.createObjectURL(blob) });
  };
  const close = () => {
    if (picked) URL.revokeObjectURL(picked.url);
    setPicked(null);
  };
  const send = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      await enqueueDirectMedia(matchId, picked.blob, { kind: "photo", viewOnce });
      haptic.send();
      close();
    } catch {
      toast({ title: "Couldn't save that photo to send", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <IconButton label="Send a photo" onClick={() => input.current?.click()} disabled={disabled} data-testid="button-photo">
        <ImagePlus className="w-5 h-5" />
      </IconButton>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }}
        data-testid="input-photo"
      />
      <VfSheet
        open={!!picked}
        onOpenChange={(o) => !o && close()}
        title={`Send to ${otherFirst}`}
        data-testid="sheet-photo"
        footer={
          <div className="flex flex-col gap-2">
            <VfButton fullWidth loading={busy} onClick={send} leading={<Send className="w-4 h-4" />} data-testid="button-send-photo">
              {viewOnce ? "Send, view once" : "Send photo"}
            </VfButton>
            <VfButton variant="quiet" size="sm" fullWidth onClick={close}>Cancel</VfButton>
          </div>
        }
      >
        {picked && (
          <div className="flex flex-col gap-3">
            <img src={picked.url} alt="" className="max-h-[46vh] w-full object-contain rounded-[16px] bg-vf-surface" />
            <label className="flex items-start gap-3 rounded-[14px] border border-vf-line px-3.5 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={viewOnce}
                onChange={(e) => setViewOnce(e.target.checked)}
                className="mt-1 accent-[hsl(var(--vf-ember))]"
                data-testid="toggle-view-once"
              />
              <span>
                <span className="flex items-center gap-1.5 text-[15px] text-vf-text"><EyeOff className="w-4 h-4" /> View once</span>
                <span className="block vf-small text-vf-muted mt-0.5">
                  {otherFirst} can open it one time, and you won't be able to see it again either. A screenshot can still be taken.
                </span>
              </span>
            </label>
          </div>
        )}
      </VfSheet>
    </>
  );
}

/** Tap the mic to record; the bar replaces the composer until sent or binned. */
export function useVoiceNote(matchId: number) {
  const { toast } = useToast();
  const rec = useVoiceRecorder((r) => {
    haptic.send();
    void enqueueDirectMedia(matchId, r.blob, { kind: "voice", durationMs: r.durationMs }).catch(() =>
      toast({ title: "Couldn't save that voice note to send", variant: "destructive" }),
    );
  });
  const start = async () => {
    haptic.tick();
    const problem = await rec.start();
    if (problem) toast({ title: problem, variant: "destructive" });
  };
  return { ...rec, start, available: canRecordVoice() };
}

export function MicButton({ onStart, disabled }: { onStart: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={disabled}
      className="vf-press shrink-0 w-11 h-11 rounded-full flex items-center justify-center bg-vf-ember text-vf-ink hover:bg-[var(--vf-ember-soft)] disabled:opacity-40 transition-colors"
      aria-label="Record a voice note"
      data-testid="button-mic"
    >
      <Mic className="w-5 h-5" />
    </button>
  );
}

export function RecordingBar({ elapsed, onCancel, onSend }: { elapsed: number; onCancel: () => void; onSend: () => void }) {
  const left = Math.max(0, VOICE_MAX_MS - elapsed);
  return (
    <div className="flex items-center gap-2" data-testid="recording-bar">
      <IconButton label="Delete voice note" onClick={onCancel} data-testid="button-cancel-voice">
        <Trash2 className="w-5 h-5" />
      </IconButton>
      <div className="flex-1 min-h-[44px] rounded-[22px] px-4 flex items-center gap-2.5 bg-vf-surface border border-vf-ember/40">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
        <span className="font-mono text-[14px] text-vf-text" data-testid="recording-time">{clock(elapsed)}</span>
        <span className="vf-small text-vf-faint ml-auto">{left < 10_000 ? `${Math.ceil(left / 1000)}s left` : "Recording"}</span>
      </div>
      <button
        type="button"
        onClick={onSend}
        className="vf-press shrink-0 w-11 h-11 rounded-full flex items-center justify-center bg-vf-ember text-vf-ink"
        aria-label="Send voice note"
        data-testid="button-send-voice"
      >
        <Send className="w-5 h-5" />
      </button>
    </div>
  );
}
