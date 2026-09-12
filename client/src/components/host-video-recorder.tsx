import { useEffect, useRef, useState } from "react";
import { Loader2, Video, RotateCcw } from "lucide-react";

const MAX_SEC = 60;
const MIN_SEC = 10;

export interface RecordedVideo {
  blob: Blob;
  poster: Blob | null;
  durationSec: number;
}

// Records the host video IN-APP ONLY — there is deliberately no file picker. An
// uploaded clip could be anyone's; a recorded one is a live face and voice tied
// to the account. Portrait, audio required. One retake, then it commits.
export function HostVideoRecorder({
  value,
  onChange,
}: {
  value: RecordedVideo | null;
  onChange: (v: RecordedVideo | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<"idle" | "ready" | "recording" | "review">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retaken, setRetaken] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (value && phase === "idle") setPhase("review");
  }, [value, phase]);

  const askCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: true,
      });
      if (!stream.getAudioTracks().length) {
        stream.getTracks().forEach((t) => t.stop());
        setError("We couldn't get your microphone. A silent video defeats the point — check the mic permission and try again.");
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play().catch(() => {});
      }
      setPhase("ready");
    } catch {
      setError("Video needs camera access. You can host without it — you'll just get fewer people.");
    }
  };

  const start = () => {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";
    const rec = new MediaRecorder(stream, { mimeType: mime });
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = () => finish();
    recorderRef.current = rec;
    rec.start();
    startedAtRef.current = Date.now();
    setElapsed(0);
    setPhase("recording");
    tickRef.current = window.setInterval(() => {
      const s = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(s);
      if (s >= MAX_SEC) stop();
    }, 100);
  };

  const stop = () => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
  };

  const finish = async () => {
    const durationSec = Math.min(MAX_SEC, (Date.now() - startedAtRef.current) / 1000);
    const blob = new Blob(chunksRef.current, { type: "video/webm" });
    const poster = await capturePoster();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = url;
      videoRef.current.muted = false;
    }
    setPhase("review");
    onChange({ blob, poster, durationSec });
  };

  const capturePoster = async (): Promise<Blob | null> => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/jpeg", 0.8));
  };

  const retake = () => {
    if (retaken) return;
    setRetaken(true);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    onChange(null);
    setPhase("idle");
    setElapsed(0);
    askCamera();
  };

  const remaining = Math.max(0, MAX_SEC - elapsed);

  return (
    <div className="rounded-[16px] border border-vf-line bg-vf-surface2 overflow-hidden">
      <div className="relative bg-black" style={{ aspectRatio: "9 / 16", maxHeight: 420 }}>
        <video
          ref={videoRef}
          playsInline
          controls={phase === "review"}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ transform: phase === "review" ? "none" : "scaleX(-1)" }}
        />
        {phase === "recording" && (
          <div className="absolute top-3 left-3 flex items-center gap-2 font-mono text-[11px] text-white bg-black/50 rounded-full px-2.5 py-1">
            <span className="w-2 h-2 rounded-full bg-vf-ember animate-pulse" />
            {remaining.toFixed(0)}s left
          </div>
        )}
        {(phase === "idle" || error) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Video className="w-7 h-7 text-vf-faint" />
            {error ? (
              <p className="text-[13px] text-vf-muted leading-[1.5]">{error}</p>
            ) : (
              <p className="text-[13px] text-vf-muted leading-[1.5]">
                Say who you are, where this is, and what the evening actually looks like.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="p-3 flex items-center justify-between gap-3">
        {phase === "idle" && (
          <button
            type="button"
            onClick={askCamera}
            className="h-9 px-4 rounded-full bg-vf-ember text-vf-ink font-semibold text-[13px] btn-press hover:bg-[var(--vf-ember-soft)] transition-colors"
            data-testid="button-camera"
          >
            {error ? "Try camera again" : "Turn on camera"}
          </button>
        )}
        {phase === "ready" && (
          <button
            type="button"
            onClick={start}
            className="h-9 px-4 rounded-full bg-vf-ember text-vf-ink font-semibold text-[13px] btn-press hover:bg-[var(--vf-ember-soft)] transition-colors"
            data-testid="button-record"
          >
            Start recording
          </button>
        )}
        {phase === "recording" && (
          <button
            type="button"
            onClick={stop}
            disabled={elapsed < MIN_SEC}
            className="h-9 px-4 rounded-full border border-vf-line text-vf-text text-[13px] disabled:opacity-40 transition-colors"
            data-testid="button-stop"
          >
            {elapsed < MIN_SEC ? `Keep going… ${(MIN_SEC - elapsed).toFixed(0)}s` : "Stop"}
          </button>
        )}
        {phase === "review" && (
          <>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-vf-mint">
              Recorded · {Math.round(value?.durationSec ?? 0)}s
            </span>
            {!retaken && (
              <button
                type="button"
                onClick={retake}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-vf-line text-vf-muted hover:text-vf-text text-[13px] transition-colors"
                data-testid="button-retake"
              >
                <RotateCcw className="w-3.5 h-3.5" /> One retake
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
