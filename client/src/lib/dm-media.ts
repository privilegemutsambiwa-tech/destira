// Chat photos and voice notes on the device: files waiting in the outbox
// (IndexedDB, since localStorage can't hold them), loading a sent one from
// /api/dm/media/:id, and recording a voice note.
import { useEffect, useRef, useState } from "react";
import { VOICE_BITS_PER_SECOND, VOICE_MAX_MS } from "@shared/dm";

// ── files waiting to send ────────────────────────────────────────────
const DB = "destira-outbox";
const STORE = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => { resolve(req.result as T); db.close(); };
    t.onerror = () => { reject(t.error); db.close(); };
  });
}

export const putFile = (id: string, blob: Blob) => tx<void>("readwrite", (s) => s.put(blob, id));
export const getFile = (id: string) => tx<Blob | undefined>("readonly", (s) => s.get(id)).catch(() => undefined);
export const deleteFile = (id: string) => tx<void>("readwrite", (s) => s.delete(id)).catch(() => {});

/** A queued file as something an <img> or <audio> can use. */
export function useQueuedFile(id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let made: string | null = null;
    let live = true;
    getFile(id).then((b) => {
      if (!live || !b) return;
      made = URL.createObjectURL(b);
      setUrl(made);
    });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [id]);
  return url;
}

// ── sent media ───────────────────────────────────────────────────────
// Kept for the session so a poll re-rendering the chat doesn't download
// the same photo again. Never used for view-once photos.
const loaded = new Map<number, string>();

export async function loadMedia(messageId: number, opts: { keep?: boolean } = {}): Promise<string> {
  const hit = loaded.get(messageId);
  if (hit) return hit;
  const res = await fetch(`/api/dm/media/${messageId}`, { credentials: "include" });
  if (!res.ok) {
    let message = "Couldn't open it";
    try { message = (await res.json())?.message || message; } catch {}
    throw Object.assign(new Error(message), { status: res.status });
  }
  const url = URL.createObjectURL(await res.blob());
  if (opts.keep !== false) loaded.set(messageId, url);
  return url;
}

/** A sent photo, loaded once it scrolls near the screen. */
export function useSentMedia(messageId: number, enabled: boolean) {
  const [url, setUrl] = useState<string | null>(() => loaded.get(messageId) ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled || url) return;
    let live = true;
    loadMedia(messageId).then((u) => live && setUrl(u)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [messageId, enabled, url]);
  return { url, failed };
}

/** A camera photo made light enough for a slow connection (and for waiting
 *  on the device): at most 1600px on the long side, JPEG. Falls back to the
 *  original if the browser can't decode it here (the server re-encodes
 *  anyway). */
export async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

// ── recording ────────────────────────────────────────────────────────
const TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"];

export function canRecordVoice(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export type Recording = { blob: Blob; durationMs: number; mime: string };

/** Records up to VOICE_MAX_MS, then stops by itself and hands the note over. */
export function useVoiceRecorder(onDone: (r: Recording) => void) {
  const [state, setState] = useState<"idle" | "starting" | "recording">("idle");
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const discard = useRef(false);
  const timer = useRef<number | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const cleanup = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    rec.current?.stream.getTracks().forEach((t) => t.stop());
    rec.current = null;
    setState("idle");
    setElapsed(0);
  };

  const start = async (): Promise<string | null> => {
    if (state !== "idle") return null;
    if (!canRecordVoice()) return "This device can't record voice notes";
    setState("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setState("idle");
      return "Allow the microphone to send voice notes";
    }
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));
    const r = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: VOICE_BITS_PER_SECOND });
    chunks.current = [];
    discard.current = false;
    r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    r.onstop = () => {
      const durationMs = Math.min(Date.now() - started.current, VOICE_MAX_MS);
      const mime = (r.mimeType || mimeType || "audio/webm").split(";")[0];
      const blob = new Blob(chunks.current, { type: mime });
      const keep = !discard.current && durationMs >= 700 && blob.size > 0;
      cleanup();
      if (keep) doneRef.current({ blob, durationMs, mime });
    };
    rec.current = r;
    started.current = Date.now();
    r.start(250);
    setState("recording");
    timer.current = window.setInterval(() => {
      const ms = Date.now() - started.current;
      setElapsed(ms);
      if (ms >= VOICE_MAX_MS && rec.current?.state === "recording") rec.current.stop();
    }, 200);
    return null;
  };

  const stop = () => { if (rec.current?.state === "recording") rec.current.stop(); };
  const cancel = () => {
    discard.current = true;
    if (rec.current?.state === "recording") rec.current.stop();
    else cleanup();
  };

  useEffect(() => () => { discard.current = true; if (rec.current?.state === "recording") rec.current.stop(); }, []);

  return { state, elapsed, start, stop, cancel };
}

export const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
