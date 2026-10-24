// Messages written without a connection. Instead of failing, they wait here
// (saved on the device, so closing the app doesn't lose them), show in the
// conversation as "waiting to send", and go out by themselves, in order, as
// soon as the connection is back.
//
// Only text messages to a match or a group. A message is queued only when
// the device is offline or the request never reached the server; anything
// the server answers with an error (blocked, removed from the group) is
// reported as before, not retried.
import { useSyncExternalStore } from "react";
import { queryClient } from "./queryClient";

export type OutboxKind = "direct" | "group";

export interface OutboxItem {
  id: string;
  kind: OutboxKind;
  targetId: number;
  content: string;
  replyToMessageId?: number;
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

export function enqueue(kind: OutboxKind, targetId: number, content: string, replyToMessageId?: number) {
  save([
    ...items,
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      targetId,
      content,
      replyToMessageId,
      createdAt: new Date().toISOString(),
    },
  ]);
  void flush();
}

/** Drops everything waiting: sign-out, or the session ended, so nothing can
 *  go out under whoever signs in next on this device. */
export function clearOutbox() {
  save([]);
}

export function removeItem(id: string) {
  save(items.filter((i) => i.id !== id));
}

function endpoint(item: OutboxItem): { url: string; body: unknown; refresh: unknown[][] } {
  if (item.kind === "direct") {
    return {
      url: `/api/messages/${item.targetId}`,
      body: { content: item.content },
      refresh: [["/api/messages", item.targetId], ["/api/chat/threads"]],
    };
  }
  return {
    url: `/api/groups/${item.targetId}/messages`,
    body: { content: item.content, contentType: "text", ...(item.replyToMessageId ? { replyToMessageId: item.replyToMessageId } : {}) },
    refresh: [["/api/groups", item.targetId, "messages"]],
  };
}

let flushing = false;

/** Sends whatever is waiting, oldest first; stops at the first connection
 *  problem so the order is kept. */
export async function flush() {
  if (flushing || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
  flushing = true;
  try {
    for (const item of [...items]) {
      if (item.failed) continue;
      const { url, body, refresh } = endpoint(item);
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
      } catch {
        break; // still no connection: try again on the next "online"
      }
      if (res.ok) removeItem(item.id);
      else if (res.status >= 500 || res.status === 401) break; // server trouble or signed out: keep it, retry later
      else save(items.map((i) => (i.id === item.id ? { ...i, failed: true } : i)));
      refresh.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
    }
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
