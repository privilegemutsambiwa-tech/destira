// Video dates between matches: the calls the screens make, and whether this
// device can take part. Server side: server/video-calls.ts.
import { Browser } from "@capacitor/browser";
import { apiRequest } from "./queryClient";
import { isNativeApp, nativeBuild } from "./native";
import { API_BASE } from "./app-api";

/** App build that first asks for the camera and microphone (versionCode 5,
 *  Destira 1.4). Older installs get the new screens over the air but can't
 *  open the camera, so they're asked to install the update instead. */
export const VIDEO_MIN_BUILD = 5;

export type CallStatus = "ringing" | "active" | "ended" | "declined" | "cancelled" | "missed";

export interface CallView {
  id: number;
  matchId: number;
  status: CallStatus;
  role: "caller" | "callee";
  other: { userId: string; name: string; photoUrl: string | null };
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  seconds: number;
  endedBy: "me" | "them" | null;
}

export interface CallTicket {
  url: string;
  token: string;
  /** The caller's video time left today; null = no limit. */
  secondsLeft: number | null;
}

/** Can this device show a camera at all? */
export async function deviceCanVideo(): Promise<"ok" | "update-app" | "unsupported"> {
  if (isNativeApp() && (await nativeBuild()) < VIDEO_MIN_BUILD) return "update-app";
  if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") return "unsupported";
  return "ok";
}

/** Sends the member to the new app download (opens in the phone's browser). */
export function openAppDownload() {
  const url = `${API_BASE}/download/android`;
  Browser.open({ url }).catch(() => window.open(url, "_blank"));
}

const json = async <T>(p: Promise<Response>) => (await p).json() as Promise<T>;

export const callApi = {
  start: (matchId: number) => json<{ id: number }>(apiRequest("POST", "/api/calls", { matchId })),
  get: (id: number) => json<CallView>(apiRequest("GET", `/api/calls/${id}`)),
  accept: (id: number) => json<CallView>(apiRequest("POST", `/api/calls/${id}/accept`)),
  end: (id: number) => json<CallView>(apiRequest("POST", `/api/calls/${id}/end`)),
  alive: (id: number) => json<CallView>(apiRequest("POST", `/api/calls/${id}/alive`)),
  ticket: (id: number) => json<CallTicket>(apiRequest("POST", `/api/calls/${id}/token`)),
  incoming: () => json<{ call: CallView | null }>(apiRequest("GET", "/api/calls/incoming")),
};

/** "3:07" */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

// Rough data use, both directions together, so members on bundles know what
// a call costs them. Matches the bitrates the call screen asks LiveKit for.
export const MB_PER_MINUTE = { saver: 4, clear: 9, audio: 0.5 } as const;
export type CallQuality = keyof typeof MB_PER_MINUTE;
