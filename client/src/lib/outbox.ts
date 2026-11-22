// Messages written without a connection. Instead of failing, they wait here
// (saved on the device, so closing the app doesn't lose them), show in the
// conversation as "waiting to send", and go out by themselves, in order, as
// soon as the connection is back.
//
// Text to a match or a group; to a match also photos, voice notes and
// reactions (the files wait in IndexedDB, lib/dm-media.ts). Text is queued
// only when the device is offline or the request never reached the server;
// photos, voice notes and reactions always go through here, so they behave
// the same with or without a connection. Anything the server answers with
// an error (blocked, removed from the group) is reported, not retried.
import { useSyncExternalStore } from "react";
import { queryClient } from "./queryClient";
import { putFile, getFile, deleteFile } from "./dm-media";

export type OutboxKind = "direct" | "group";

export interface OutboxItem {
  id: string;
  kind: OutboxKind;
  targetId: number;
  content: string;
  replyToMessageId?: number;
  /** Direct messages: what's being sent (text when absent). */
  op?: "text" | "photo" | "voice" | "react";
  /** Lets the server spot a retry of something that did arrive. */
  clientId?: string;
  viewOnce?: boolean;
  durationMs?: number;
  /** A reaction: on which message, and which (null takes it off). */
  messageId?: number;
  emoji?: string | null;
  createdAt: string;
  /** The server refused it (not a connection problem). Kept so the member
   *  can see it and remove it; never retried. */
  failed?: boolean;
}

const KEY = "destira.outbox";
const listeners = new Set<() => void>();
let items: OutboxItem[] = load();

function load(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

function save(next: OutboxItem[]) {
  items = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full: still held in memory for this session */
  }
  listeners.forEach((l) => l());
}

/** True when this error means the message never got to the server. */
export function isConnectionError(e: unknown): boolean {
  return (typeof navigator !== "undefined" && navigator.onLine === false) || e instanceof TypeError;
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
/** For a send that may be retried through the outbox. */
export const newClientId = newId;

export function enqueue(kind: OutboxKind, targetId: number, content: string, replyToMessageId?: number, clientId?: string) {
  save([
    ...items,
    {
      id: newId(),
      kind,
      targetId,
      content,
      replyToMessageId,
      clientId,
      createdAt: new Date().toISOString(),
    },
  ]);
  void flush();
}

/** A photo or voice note to a match: saved on the device first, then sent. */
export async function enqueueDirectMedia(
  matchId: number,
  file: Blob,
  opts: { kind: "photo" | "voice"; viewOnce?: boolean; durationMs?: number },
) {
  const id = newId();
  await putFile(id, file);
  save([
    ...items,
    {
      id,
      kind: "direct",
      targetId: matchId,
      content: opts.kind === "photo" ? "Photo" : "Voice note",
      op: opts.kind,
      clientId: id,
      viewOnce: opts.viewOnce,
      durationMs: opts.durationMs,
      createdAt: new Date().toISOString(),
    },
  ]);
  void flush();
}

/** A reaction (null takes it off). A newer one for the same message
 *  replaces one still waiting. */
export function enqueueReaction(matchId: number, messageId: number, emoji: string | null) {
  save([
    ...items.filter((i) => !(i.op === "react" && i.messageId === messageId)),
    { id: newId(), kind: "direct", targetId: matchId, content: "", op: "react", messageId, emoji, createdAt: new Date().toISOString() },
  ]);
  void flush();
}

/** Drops everything waiting: sign-out, or the session ended, so nothing can
 *  go out under whoever signs in next on this device. */
export function clearOutbox() {
  items.forEach((i) => { if (i.op === "photo" || i.op === "voice") void deleteFile(i.id); });
  save([]);
}

export function removeItem(id: string) {
  const item = items.find((i) => i.id === id);
  save(items.filter((i) => i.id !== id));
  if (item?.op === "photo" || item?.op === "voice") void deleteFile(id);
}

type Outgoing = { url: string; method: string; body: BodyInit; json: boolean; refresh: unknown[][] } | null;

async function endpoint(item: OutboxItem): Promise<Outgoing> {
  if (item.kind === "direct") {
    const refresh = [["/api/messages", item.targetId], ["/api/chat/threads"]];
    if (item.op === "react") {
      return { url: `/api/dm/${item.messageId}/reaction`, method: "PUT", body: JSON.stringify({ emoji: item.emoji ?? null }), json: true, refresh };
    }
    if (item.op === "photo" || item.op === "voice") {
      const file = await getFile(item.id);
      if (!file) return null; // the device lost it: nothing left to send
      const form = new FormData();
      const ext = item.op === "photo" ? "jpg" : (file.type.split("/")[1] || "webm").replace("x-", "");
      form.append("clientId", item.clientId ?? item.id);
      if (item.viewOnce) form.append("viewOnce", "1");
      if (item.durationMs) form.append("durationMs", String(Math.round(item.durationMs)));
      form.append("file", file, `${item.op}.${ext}`);
      return { url: `/api/messages/${item.targetId}/media`, method: "POST", body: form, json: false, refresh };
    }
    return {
      url: `/api/messages/${item.targetId}`,
      method: "POST",
      body: JSON.stringify({ content: item.content, ...(item.clientId ? { clientId: item.clientId } : {}) }),
      json: true,
      refresh,
    };
  }
  return {
    url: `/api/groups/${item.targetId}/messages`,
    method: "POST",
    body: JSON.stringify({ content: item.content, contentType: "text", ...(item.replyToMessageId ? { replyToMessageId: item.replyToMessageId } : {}) }),
    json: true,
    refresh: [["/api/groups", item.targetId, "messages"]],
  };
}

let flushing = false;
let again = false;

/** Sends whatever is waiting, oldest first; stops at the first connection
 *  problem so the order is kept. */
export async function flush() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  if (flushing) {
    again = true; // something was added mid-run: go round once more after
    return;
  }
  flushing = true;
  try {
    do {
      again = false;
      for (const item of [...items]) {
        if (item.failed || !items.some((i) => i.id === item.id)) continue;
        const req = await endpoint(item);
        if (!req) {
          save(items.map((i) => (i.id === item.id ? { ...i, failed: true } : i)));
          continue;
        }
        let res: Response;
        try {
          res = await fetch(req.url, {
            method: req.method,
            headers: req.json ? { "Content-Type": "application/json" } : {},
            credentials: "include",
            body: req.body,
          });
        } catch {
          return; // still no connection: try again on the next "online"
        }
        if (res.ok) {
          // Refresh first, so the sent one is on screen before the queued copy goes.
          await Promise.all(req.refresh.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
          removeItem(item.id);
          continue;
        }
        // Server trouble, signed out, or sending too fast: keep it, retry later.
        if (res.status >= 500 || res.status === 429) {
          window.setTimeout(() => void flush(), 30_000);
          return;
        }
        if (res.status === 401) return;
        save(items.map((i) => (i.id === item.id ? { ...i, failed: true } : i)));
        req.refresh.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
      }
    } while (again);
  } finally {
    flushing = false;
  }
}

/** Waiting messages for one conversation, live. */
export function useOutbox(kind: OutboxKind, targetId: number): OutboxItem[] {
  const all = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
  );
  return all.filter((i) => i.kind === kind && i.targetId === targetId);
}

/** Starts sending on reconnect and at launch. Called once from main.tsx. */
export function initOutbox() {
  window.addEventListener("online", () => void flush());
  window.setTimeout(() => void flush(), 3000);
}
