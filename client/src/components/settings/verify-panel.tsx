// Settings > Verify: the selfie check.

import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CARD, ELEVATED, BORDER, MUTED, TEXT, EMBER, INK, GOLD, SERIF, Panel, GradientButton } from "./ui";

// Selfie verification (server/verification.ts). A live selfie copying a pose
// we pick, checked by a person on the team against the profile photos. The
// camera opens in the page; where it can't (no permission, old WebView), the
// phone's own camera picker is the fallback.
type VerifyState = {
  state: "unverified" | "pending" | "verified" | "rejected";
  rejectReason: string | null;
  submittedAt: string | null;
  pose: { key: string; text: string } | null;
  hasPhoto: boolean;
};

export function VerifyPanel({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<VerifyState>({ queryKey: ["/api/verification"], staleTime: 0 });
  const [step, setStep] = useState<"intro" | "camera" | "review">("intro");
  const [shot, setShot] = useState<Blob | null>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [camError, setCamError] = useState(false);
  const [sending, setSending] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // The pose stays the same for this visit, even if the query refetches.
  const [pose, setPose] = useState<VerifyState["pose"]>(null);
  useEffect(() => {
    if (data?.pose && !pose) setPose(data.pose);
  }, [data?.pose, pose]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => stopCamera, []);
  useEffect(() => () => { if (shotUrl) URL.revokeObjectURL(shotUrl); }, [shotUrl]);

  const openCamera = async () => {
    setCamError(false);
    setStep("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1080 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      setCamError(true);
    }
  };

  const keep = (blob: Blob) => {
    if (shotUrl) URL.revokeObjectURL(shotUrl);
    setShot(blob);
    setShotUrl(URL.createObjectURL(blob));
    setStep("review");
  };

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const size = Math.min(v.videoWidth, v.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Un-mirror: the preview is mirrored like a mirror, the photo isn't.
    ctx.drawImage(v, (v.videoWidth - size) / 2, (v.videoHeight - size) / 2, size, size, 0, 0, size, size);
    canvas.toBlob((b) => {
      if (!b) return;
      stopCamera();
      keep(b);
    }, "image/jpeg", 0.9);
  };

  const send = async () => {
    if (!shot || !pose) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("selfie", shot, "selfie.jpg");
      fd.append("pose", pose.key);
      const res = await fetch("/api/verification", { method: "POST", credentials: "include", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || "Couldn't send your selfie. Please try again.");
      qc.setQueryData(["/api/verification"], (old: VerifyState | undefined) => ({ ...(old as VerifyState), ...body, pose: null }));
      qc.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      setStep("intro");
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Couldn't send your selfie.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const Badge = ({ tone }: { tone: "ok" | "wait" | "start" }) => (
    <div
      style={{
        width: 80, height: 80, borderRadius: "50%", marginBottom: 20,
        background: tone === "ok" ? "#2E7D5B" : tone === "wait" ? ELEVATED : EMBER,
        border: tone === "wait" ? `1px solid ${BORDER}` : "none",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <Check className="w-10 h-10" style={{ color: tone === "wait" ? MUTED : tone === "ok" ? "#fff" : INK }} />
    </div>
  );

  let body: React.ReactNode;
  if (isLoading || !data) {
    body = <p className="text-sm" style={{ color: MUTED }}>Loading…</p>;
  } else if (data.state === "verified") {
    body = (
      <>
        <Badge tone="ok" />
        <h2 className="text-lg mb-2" style={{ ...SERIF, color: TEXT }}>You're verified</h2>
        <p className="text-sm" style={{ color: MUTED }}>
          The verified mark is on your profile. It tells people a person on our team checked that your selfie matches your photos.
        </p>
      </>
    );
  } else if (data.state === "pending") {
    body = (
      <>
        <Badge tone="wait" />
        <h2 className="text-lg mb-2" style={{ ...SERIF, color: TEXT }}>With our team</h2>
        <p className="text-sm" style={{ color: MUTED }} data-testid="text-verify-pending">
          A person on our team is checking your selfie against your photos. It usually takes less than a day, and we'll let you know.
          Your selfie is deleted as soon as it's been checked.
        </p>
      </>
    );
  } else if (!data.hasPhoto) {
    body = (
      <>
        <Badge tone="start" />
        <h2 className="text-lg mb-2" style={{ ...SERIF, color: TEXT }}>Add a photo first</h2>
        <p className="text-sm mb-6" style={{ color: MUTED }}>
          We check your selfie against your profile photos, so add at least one clear photo of your face.
        </p>
        <GradientButton label="Add a photo" onClick={() => setLocation("/photos")} testId="button-verify-add-photo" />
      </>
    );
  } else if (step === "camera") {
    body = (
      <>
        <p className="text-sm font-semibold mb-3" style={{ color: TEXT }} data-testid="text-verify-pose">{pose?.text}</p>
        {camError ? (
          <>
            <p className="text-sm mb-4" style={{ color: MUTED }}>
              We couldn't open your camera here. Use your phone's camera instead.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) keep(f); e.target.value = ""; }}
              data-testid="input-selfie"
            />
            <GradientButton label="Open camera" onClick={() => fileRef.current?.click()} testId="button-verify-file" />
          </>
        ) : (
          <>
            <div className="relative w-full mb-4" style={{ maxWidth: 320, aspectRatio: "1 / 1", borderRadius: 24, overflow: "hidden", background: "#000" }}>
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} data-testid="video-verify" />
              <div className="absolute inset-0 pointer-events-none" style={{ border: `3px solid ${EMBER}`, borderRadius: 24 }} />
            </div>
            <GradientButton label="Take selfie" onClick={capture} testId="button-verify-capture" />
          </>
        )}
        <button className="mt-3 text-sm" style={{ color: MUTED }} onClick={() => { stopCamera(); setStep("intro"); }}>Cancel</button>
      </>
    );
  } else if (step === "review" && shotUrl) {
    body = (
      <>
        <img src={shotUrl} alt="Your selfie" className="w-48 h-48 rounded-3xl object-cover mb-3" style={{ border: `2px solid ${BORDER}` }} />
        <p className="text-sm mb-5" style={{ color: MUTED }}>
          Is your face clear, and are you doing this? <span style={{ color: TEXT, fontWeight: 600 }}>{pose?.text}</span>
        </p>
        <div style={{ width: "100%" }}>
          <GradientButton label={sending ? "Sending…" : "Send for checking"} onClick={send} disabled={sending} testId="button-submit-verify" />
          <button
            onClick={openCamera}
            className="w-full py-3 mt-3 text-sm font-semibold text-foreground btn-press"
            style={{ background: ELEVATED, borderRadius: 12, border: `1px solid ${BORDER}` }}
            data-testid="button-verify-retake"
          >
            Retake
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <Badge tone="start" />
        <h2 className="text-lg mb-2" style={{ ...SERIF, color: TEXT }}>Get the verified mark</h2>
        {data.state === "rejected" && data.rejectReason && (
          <div className="w-full text-left text-sm mb-4 px-3 py-2 rounded-xl" style={{ background: ELEVATED, border: `1px solid ${BORDER}`, color: TEXT }} data-testid="text-verify-rejected">
            <span style={{ color: GOLD, fontWeight: 600 }}>Last try: </span>{data.rejectReason}
          </div>
        )}
        <p className="text-sm mb-4" style={{ color: MUTED }}>
          Take a quick selfie doing a pose we pick. A person on our team checks it matches your profile photos, then the verified mark goes on your profile.
        </p>
        <div className="w-full text-left text-sm mb-6 px-4 py-3 rounded-xl" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <div style={{ color: MUTED, fontSize: 12 }}>Your pose</div>
          <div style={{ color: TEXT, fontWeight: 600 }} data-testid="text-verify-pose-intro">{pose?.text ?? "…"}</div>
        </div>
        <GradientButton label="Open camera" onClick={openCamera} disabled={!pose} testId="button-take-selfie" />
        <p className="text-xs mt-4" style={{ color: MUTED }}>
          Your selfie is never shown on your profile, and it's deleted as soon as it's been checked.
        </p>
      </>
    );
  }

  return (
    <Panel title="Verify your profile" onBack={() => { stopCamera(); onBack(); }}>
      <div className="flex flex-col items-center px-6 pt-8 pb-10 text-center">{body}</div>
    </Panel>
  );
}
