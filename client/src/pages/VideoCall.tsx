// A video date with a match: ringing (either side), the call itself, and
// how it ended. Server: server/video-calls.ts. Media: LiveKit, never recorded.
//
// Data first: starts in "data saver" (small picture, low frame rate, about
// 4 MB a minute both ways) with one tap to sound-only. Members on bundles
// see roughly how much the call has used.
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Room, RoomEvent, Track, type RemoteTrack, type LocalVideoTrack } from "livekit-client";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone, RefreshCw, Flag, Loader2, Download, Headphones } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { setScreenSecure } from "@/lib/native";
import { avatarColor } from "@/lib/avatar-color";
import { startRinging } from "@/components/incoming-call";
import {
  callApi,
  clock,
  deviceCanVideo,
  openAppDownload,
  MB_PER_MINUTE,
  type CallQuality,
  type CallView,
} from "@/lib/video-call";

type Phase = "loading" | "update-app" | "unsupported" | "ringing" | "connecting" | "live" | "over" | "error";

// What the phone asks LiveKit for. "saver" is the default on purpose.
const QUALITY = {
  saver: { resolution: { width: 320, height: 240, frameRate: 15 }, maxBitrate: 220_000 },
  clear: { resolution: { width: 640, height: 360, frameRate: 24 }, maxBitrate: 550_000 },
} as const;

const ENDED_TEXT: Record<string, string> = {
  declined: "They couldn't take the call right now.",
  cancelled: "The call was cancelled.",
  missed: "No answer.",
  ended: "Call ended.",
};

export default function VideoCallPage({ params }: { params: { id: string } }) {
  const callId = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>("loading");
  const [call, setCall] = useState<CallView | null>(null);
  const [errorText, setErrorText] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [quality, setQuality] = useState<CallQuality>("saver");
  const [front, setFront] = useState(true);
  const [theirVideo, setTheirVideo] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [mbUsed, setMbUsed] = useState(0);
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const remoteVideoEl = useRef<HTMLVideoElement>(null);
  const localVideoEl = useRef<HTMLVideoElement>(null);
  const audioHolder = useRef<HTMLDivElement>(null);
  const endedRef = useRef(false);
  const qualityRef = useRef<CallQuality>("saver");
  qualityRef.current = camOn ? quality : "audio";

  const backToChat = useCallback(() => {
    setLocation(call?.matchId ? `/chat/${call.matchId}` : "/matches");
  }, [call?.matchId, setLocation]);

  const leaveRoom = useCallback(() => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) void room.disconnect();
    void setScreenSecure(false);
  }, []);

  // The call is over, whoever ended it.
  const finishLocally = useCallback(
    (view: CallView | null) => {
      if (endedRef.current) return;
      endedRef.current = true;
      leaveRoom();
      if (view) setCall(view);
      setPhase("over");
    },
    [leaveRoom],
  );

  const hangUp = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      finishLocally(await callApi.end(callId));
    } catch {
      finishLocally(null);
    } finally {
      setBusy(false);
    }
  }, [busy, callId, finishLocally]);

  // Join the room once the call is answered.
  const connect = useCallback(async () => {
    if (roomRef.current || endedRef.current) return;
    setPhase("connecting");
    try {
      const ticket = await callApi.ticket(callId);
      setSecondsLeft(ticket.secondsLeft);
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: { resolution: QUALITY.saver.resolution, facingMode: "user" },
        publishDefaults: {
          simulcast: false,
          videoEncoding: { maxBitrate: QUALITY.saver.maxBitrate, maxFramerate: QUALITY.saver.resolution.frameRate },
          dtx: true,
        },
      });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Video && remoteVideoEl.current) {
          track.attach(remoteVideoEl.current);
          setTheirVideo(true);
        } else if (track.kind === Track.Kind.Audio && audioHolder.current) {
          audioHolder.current.appendChild(track.attach());
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el) => el.remove?.());
        if (track.kind === Track.Kind.Video) setTheirVideo(false);
      });
      room.on(RoomEvent.TrackMuted, (pub) => {
        if (pub.kind === Track.Kind.Video && pub.track && pub.track !== room.localParticipant.getTrackPublication(Track.Source.Camera)?.track) setTheirVideo(false);
      });
      room.on(RoomEvent.TrackUnmuted, (pub) => {
        if (pub.kind === Track.Kind.Video && pub.track && pub.track !== room.localParticipant.getTrackPublication(Track.Source.Camera)?.track) setTheirVideo(true);
      });
      room.on(RoomEvent.ParticipantDisconnected, () => {
        // They left; the server knows within a few seconds.
        callApi.get(callId).then((v) => v.status !== "active" && finishLocally(v)).catch(() => {});
      });
      await room.connect(ticket.url, ticket.token);
      // Only once connected: a failed connection is handled below, not as
      // the call ending.
      room.on(RoomEvent.Disconnected, () => {
        if (!endedRef.current) callApi.end(callId).then(finishLocally, () => finishLocally(null));
      });
      // No screenshots or screen recording of the other person.
      void setScreenSecure(true);
      await room.localParticipant.setMicrophoneEnabled(true);
      try {
        await room.localParticipant.setCameraEnabled(true);
      } catch {
        // Camera refused or busy: carry on with sound only.
        setCamOn(false);
        toast({ title: "Camera unavailable", description: "You're on sound only. Allow the camera in your phone's settings to be seen." });
      }
      const local = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
      if (local && localVideoEl.current) local.attach(localVideoEl.current);
      setPhase("live");
    } catch (e: any) {
      endedRef.current = true;
      leaveRoom();
      const msg = String(e?.message || "");
      if (/Permission|NotAllowed/i.test(msg)) {
        setErrorText("Destira needs your camera and microphone for video dates. Allow them in your phone's settings, then try again.");
      } else if (msg.startsWith("403")) {
        setErrorText("The video minutes for today have run out.");
      } else {
        setErrorText("Couldn't connect the call. Check your connection and try again.");
      }
      setPhase("error");
      callApi.end(callId).catch(() => {});
    }
  }, [callId, finishLocally, leaveRoom, toast]);

  // First load: can this phone do video, and where is the call at?
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const can = await deviceCanVideo();
      let view: CallView;
      try {
        view = await callApi.get(callId);
      } catch {
        if (!cancelled) {
          setErrorText("This call isn't available.");
          setPhase("error");
        }
        return;
      }
      if (cancelled) return;
      setCall(view);
      if (view.status !== "ringing" && view.status !== "active") {
        endedRef.current = true;
        setPhase("over");
        return;
      }
      if (can !== "ok") {
        setPhase(can);
        return;
      }
      if (view.status === "active") void connect();
      else setPhase("ringing");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  // While ringing: the caller waits for an answer, the callee for a decision
  // (and either side sees the other give up).
  useEffect(() => {
    if (phase !== "ringing") return;
    const t = setInterval(async () => {
      try {
        const v = await callApi.get(callId);
        setCall(v);
        if (v.status === "active" && v.role === "caller") void connect();
        else if (v.status !== "ringing" && v.status !== "active") finishLocally(v);
      } catch {
        /* next tick */
      }
    }, 1500);
    return () => clearInterval(t);
  }, [phase, callId, connect, finishLocally]);

  // The phone rings while a call is coming in.
  const incomingRing = phase === "ringing" && call?.role === "callee";
  useEffect(() => {
    if (!incomingRing) return;
    return startRinging();
  }, [incomingRing]);

  // During the call: tell the server we're still here, notice if the other
  // side ended it, count the time and the data.
  useEffect(() => {
    if (phase !== "live") return;
    const tick = setInterval(() => {
      setElapsed((s) => s + 1);
      setMbUsed((mb) => mb + MB_PER_MINUTE[qualityRef.current] / 60);
      setSecondsLeft((left) => {
        if (left === null) return null;
        if (left <= 1) {
          toast({ title: "Time's up", description: "That's today's video minutes. You can keep talking in the chat." });
          void hangUp();
          return 0;
        }
        return left - 1;
      });
    }, 1000);
    const alive = setInterval(() => {
      callApi
        .alive(callId)
        .then((v) => v.status !== "active" && finishLocally(v))
        .catch(() => {});
    }, 10_000);
    return () => {
      clearInterval(tick);
      clearInterval(alive);
    };
  }, [phase, callId, finishLocally, hangUp, toast]);

  // Leaving the screen (back button, navigation) hangs up, or stops the
  // ringing on both phones.
  useEffect(
    () => () => {
      if (!endedRef.current) callApi.end(callId).catch(() => {});
      leaveRoom();
    },
    [callId, leaveRoom],
  );

  const answer = async () => {
    setBusy(true);
    try {
      const v = await callApi.accept(callId);
      setCall(v);
      await connect();
    } catch {
      callApi.get(callId).then(finishLocally, () => finishLocally(null));
    } finally {
      setBusy(false);
    }
  };

  const toggleMic = async () => {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(!micOn).catch(() => {});
    setMicOn(!micOn);
  };

  // Camera off = sound only both ways: stop sending ours and stop receiving
  // theirs, which is what actually saves the data.
  const toggleCamera = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !camOn;
    try {
      await room.localParticipant.setCameraEnabled(next);
      if (next) {
        const local = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
        if (local && localVideoEl.current) local.attach(localVideoEl.current);
      }
    } catch {
      toast({ title: "Couldn't turn the camera on" });
      return;
    }
    room.remoteParticipants.forEach((p) =>
      p.getTrackPublications().forEach((pub) => pub.kind === Track.Kind.Video && "setSubscribed" in pub && (pub as any).setSubscribed(next)),
    );
    setCamOn(next);
  };

  const flipCamera = async () => {
    const track = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;
    if (!track) return;
    const next = !front;
    try {
      await track.restartTrack({ facingMode: next ? "user" : "environment", resolution: QUALITY[quality === "clear" ? "clear" : "saver"].resolution });
      setFront(next);
    } catch {
      /* single-camera phone */
    }
  };

  const toggleQuality = async () => {
    const room = roomRef.current;
    const track = room?.localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;
    const next: CallQuality = quality === "saver" ? "clear" : "saver";
    setQuality(next);
    if (track) {
      await track
        .restartTrack({ facingMode: front ? "user" : "environment", resolution: QUALITY[next === "clear" ? "clear" : "saver"].resolution })
        .catch(() => {});
    }
  };

  const report = async (category: string) => {
    if (!call) return;
    try {
      await apiRequest("POST", `/api/users/${call.other.userId}/report`, {
        category,
        reason: "Reported during a video call",
        evidence: [{ type: "video_call", id: call.id }],
      });
      toast({ title: "Reported", description: "Thanks. We'll look at it, and you won't hear from them again." });
    } catch {
      toast({ title: "Couldn't send the report", variant: "destructive" });
    }
    setReporting(false);
    await hangUp();
  };

  const name = call?.other.name ?? "Your match";

  // ── screens ──────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <Shell>
        <Loader2 className="w-7 h-7 animate-spin text-vf-ember" />
      </Shell>
    );
  }

  if (phase === "update-app" || phase === "unsupported") {
    return (
      <Shell>
        <Face call={call} />
        <h1 className="font-serif text-[24px] text-vf-text mt-5 text-center">Update Destira for video dates</h1>
        <p className="text-[14px] text-vf-muted text-center mt-2 max-w-xs leading-relaxed">
          {phase === "update-app"
            ? "This version of the app can't use the camera yet. Install the new version (it keeps your account and chats), then open the call again."
            : "This browser can't do video calls. Open Destira on your phone instead."}
        </p>
        {phase === "update-app" && (
          <PrimaryButton onClick={openAppDownload} testId="button-update-for-video">
            <Download className="w-4 h-4" /> Get the new version
          </PrimaryButton>
        )}
        <TextButton onClick={() => (call?.status === "ringing" ? hangUp().then(backToChat) : backToChat())}>Back</TextButton>
      </Shell>
    );
  }

  if (phase === "ringing" && call) {
    const incoming = call.role === "callee";
    return (
      <Shell>
        <Face call={call} pulse />
        <h1 className="font-serif text-[26px] text-vf-text mt-6 text-center">{name}</h1>
        <p className="text-[14px] text-vf-muted mt-1" data-testid="text-call-state">
          {incoming ? "wants to video date" : "Ringing…"}
        </p>
        <p className="text-[12px] text-vf-faint mt-4 text-center max-w-xs">
          Starts in data saver, about {MB_PER_MINUTE.saver} MB a minute. Calls are never recorded.
        </p>
        <div className="flex items-center gap-10 mt-10">
          {incoming ? (
            <>
              <RoundButton label="Decline" onClick={hangUp} danger testId="button-decline-call">
                <PhoneOff className="w-6 h-6" />
              </RoundButton>
              <RoundButton label="Answer" onClick={answer} accept disabled={busy} testId="button-answer-call">
                <Phone className="w-6 h-6" />
              </RoundButton>
            </>
          ) : (
            <RoundButton label="Cancel" onClick={() => hangUp()} danger testId="button-cancel-call">
              <PhoneOff className="w-6 h-6" />
            </RoundButton>
          )}
        </div>
      </Shell>
    );
  }

  if (phase === "over" || phase === "error") {
    const text =
      phase === "error"
        ? errorText
        : call?.status === "ended" && call.seconds > 0
          ? `You talked for ${clock(call.seconds)}.`
          : ENDED_TEXT[call?.status ?? "ended"] ?? "Call ended.";
    return (
      <Shell>
        <Face call={call} />
        <h1 className="font-serif text-[24px] text-vf-text mt-5">{name}</h1>
        <p className="text-[14px] text-vf-muted text-center mt-2 max-w-xs" data-testid="text-call-over">{text}</p>
        <PrimaryButton onClick={backToChat} testId="button-back-to-chat">Back to the chat</PrimaryButton>
      </Shell>
    );
  }

  // connecting / live
  const showTime = secondsLeft !== null && secondsLeft <= 120;
  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col" data-testid="video-call-live">
      <div ref={audioHolder} className="hidden" />
      {/* Them */}
      <video ref={remoteVideoEl} autoPlay playsInline className={`absolute inset-0 w-full h-full object-cover ${theirVideo && camOn ? "" : "hidden"}`} />
      {!(theirVideo && camOn) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Face call={call} />
          <p className="text-[13px] text-white/70 mt-4">
            {phase === "connecting" ? "Connecting…" : camOn ? `${name}'s camera is off` : "Sound only"}
          </p>
        </div>
      )}

      {/* Top bar */}
      <div className="relative z-10 flex items-start justify-between p-4" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
        <div>
          <p className="text-[15px] font-medium drop-shadow">{name}</p>
          <p className="text-[12px] text-white/75 drop-shadow" data-testid="text-call-clock">
            {phase === "connecting" ? "Connecting…" : clock(elapsed)} · about {Math.max(1, Math.round(mbUsed))} MB
            {showTime && <span className="text-[#FFB199]"> · {clock(secondsLeft!)} left today</span>}
          </p>
        </div>
        <button
          onClick={() => setReporting(true)}
          className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center"
          aria-label="Report"
          data-testid="button-call-report"
        >
          <Flag className="w-4 h-4" />
        </button>
      </div>

      {/* Me */}
      <video
        ref={localVideoEl}
        autoPlay
        playsInline
        muted
        className={`absolute right-4 bottom-36 w-24 h-32 rounded-xl object-cover border border-white/20 bg-black/40 ${camOn ? "" : "hidden"}`}
        style={{ transform: front ? "scaleX(-1)" : undefined }}
      />

      {/* Controls */}
      <div className="mt-auto relative z-10 pb-8 px-6" style={{ paddingBottom: "max(2rem, calc(env(safe-area-inset-bottom) + 1.25rem))" }}>
        {camOn && (
          <div className="flex justify-center mb-4">
            <button
              onClick={toggleQuality}
              className="text-[12px] px-3 py-1.5 rounded-full bg-black/45 text-white/90"
              data-testid="button-call-quality"
            >
              {quality === "saver" ? `Data saver · ~${MB_PER_MINUTE.saver} MB/min · tap for clearer` : `Clearer · ~${MB_PER_MINUTE.clear} MB/min · tap to save data`}
            </button>
          </div>
        )}
        <div className="flex items-center justify-center gap-5">
          <RoundButton label={micOn ? "Mute" : "Unmute"} onClick={toggleMic} testId="button-call-mic">
            {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </RoundButton>
          <RoundButton label={camOn ? "Sound only" : "Video on"} onClick={toggleCamera} testId="button-call-camera">
            {camOn ? <Video className="w-5 h-5" /> : <Headphones className="w-5 h-5" />}
          </RoundButton>
          <RoundButton label="Flip" onClick={flipCamera} disabled={!camOn} testId="button-call-flip">
            <RefreshCw className="w-5 h-5" />
          </RoundButton>
          <RoundButton label="End" onClick={hangUp} danger testId="button-end-call">
            <PhoneOff className="w-6 h-6" />
          </RoundButton>
        </div>
      </div>

      {reporting && (
        <div className="fixed inset-0 z-20 bg-black/70 flex items-end justify-center p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-vf-surface2 border border-vf-line p-5 text-vf-text">
            <h2 className="font-serif text-[20px] mb-1">Report {name}</h2>
            <p className="text-[13px] text-vf-muted mb-4">The call ends, they're blocked, and our team reviews it.</p>
            {[
              ["inappropriate_content", "Nudity or sexual behaviour"],
              ["harassment", "Harassment or threats"],
              ["scam_or_financial", "Asking for money, or blackmail"],
              ["underage_concern", "Looks under 18"],
              ["other", "Something else"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => report(key)}
                className="w-full text-left text-[14px] px-4 py-3 rounded-xl border border-vf-line mb-2 hover:bg-vf-surface"
                data-testid={`button-call-report-${key}`}
              >
                {label}
              </button>
            ))}
            <button onClick={() => setReporting(false)} className="w-full text-[14px] text-vf-muted py-2 mt-1">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-vf-ink flex flex-col items-center justify-center px-6">{children}</div>;
}

function Face({ call, pulse }: { call: CallView | null; pulse?: boolean }) {
  const [failed, setFailed] = useState(false);
  const photo = call?.other.photoUrl;
  return (
    <div className={`relative ${pulse ? "animate-pulse" : ""}`}>
      {photo && !failed ? (
        <img src={photo} alt="" onError={() => setFailed(true)} className="w-28 h-28 rounded-full object-cover border-2 border-vf-ember/60" />
      ) : (
        <div
          className="w-28 h-28 rounded-full flex items-center justify-center font-serif text-4xl text-white"
          style={{ background: avatarColor(call?.other.userId) }}
        >
          {(call?.other.name ?? "?")[0]}
        </div>
      )}
    </div>
  );
}

function RoundButton({
  children,
  label,
  onClick,
  danger,
  accept,
  disabled,
  testId,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  accept?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  const bg = danger ? "bg-[#E5484D]" : accept ? "bg-[#30A46C]" : "bg-white/15";
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        onClick={onClick}
        disabled={disabled}
        className={`w-14 h-14 rounded-full ${bg} text-white flex items-center justify-center btn-press disabled:opacity-40`}
        aria-label={label}
        data-testid={testId}
      >
        {children}
      </button>
      <span className="text-[11px] text-white/70">{label}</span>
    </div>
  );
}

function PrimaryButton({ children, onClick, testId }: { children: React.ReactNode; onClick: () => void; testId?: string }) {
  return (
    <button
      onClick={onClick}
      className="mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-vf-ember text-vf-ink font-semibold h-11 px-6 text-[14px] btn-press"
      data-testid={testId}
    >
      {children}
    </button>
  );
}

function TextButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-3 text-[14px] text-vf-muted py-2">
      {children}
    </button>
  );
}
