// Likes and passes, remembered on the device. The server is what keeps someone
// out of Discover for good (a `matches` row, or `discover_passes`), but it can
// only do that once the request arrives, and on a weak connection it often
// doesn't. So every decision is saved here first: the person stays out of the
// deck straight away, across reloads and app restarts, and anything the server
// hasn't heard yet is sent again until it has.
//
// Saved per member, so a second account on the same phone neither sees these
// nor sends them. A delivered decision is only kept for a day, to cover a deck
// that was already on its way when the tap happened. After that the server's
// own record is the only one that matters.
import { useMemo, useSyncExternalStore } from "react";
import { queryClient } from "./queryClient";

type Kind = "like" | "pass" | "undo-pass";
/** sending: useCreateMatch has the request out. waiting: not delivered yet,
 *  sendWaitingDecisions will send it. delivered: the server has it. */
type State = "sending" | "waiting" | "delivered";

interface Decision {
  by: string;
  targetId: string;
  kind: Kind;
  state: State;
  at: number;
}

const KEY = "destira.discover-decisions";
const KEEP_DELIVERED_MS = 24 * 60 * 60 * 1000;
const FIRST_RETRY_MS = 30 * 1000;
const LONGEST_RETRY_MS = 5 * 60 * 1000;

const listeners = new Set<() => void>();
let items: Decision[] = load();
let sending = false;
let inFlight: string | null = null;
let retryTimer: number | null = null;
let retryDelay = FIRST_RETRY_MS;

function isCurrent(d: Decision) {
  return d.state !== "delivered" || Date.now() - d.at < KEEP_DELIVERED_MS;
}

function load(): Decision[] {
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Decision[]) : [];
    // A request that was out when the app closed may or may not have landed.
    // Sending it again is safe: a repeat like or pass changes nothing.
    return saved.filter(isCurrent).map((d) => (d.state === "sending" ? { ...d, state: "waiting" as const } : d));
  } catch {
    return [];
  }
}

function save(next: Decision[]) {
  items = next.filter(isCurrent);
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full: still held in memory for this session */
  }
  listeners.forEach((l) => l());
}

function me(): string | undefined {
  return (queryClient.getQueryData(["/api/auth/user"]) as { id?: string } | undefined)?.id;
}

const mine = (d: Decision, by: string | undefined, targetId: string) => d.by === by && d.targetId === targetId;

function put(kind: Kind, state: State, targetId: string) {
  const by = me() ?? "";
  save([...items.filter((d) => !mine(d, by, targetId)), { by, targetId, kind, state, at: Date.now() }]);
}

function remove(targetId: string) {
  const by = me() ?? "";
  save(items.filter((d) => !mine(d, by, targetId)));
}

/** True when the server didn't really answer, so asking again makes sense. */
export function worthRetrying(status: number) {
  return status >= 500 || status === 401 || status === 408 || status === 429;
}

export function likeSending(targetId: string) {
  put("like", "sending", targetId);
}
export function likeDelivered(targetId: string) {
  put("like", "delivered", targetId);
}
export function likeWaiting(targetId: string) {
  put("like", "waiting", targetId);
  scheduleRetry();
}
/** The server said no (daily limit, blocked), so nothing was decided. */
export function likeRefused(targetId: string) {
  remove(targetId);
}

export function recordPass(targetId: string) {
  put("pass", "waiting", targetId);
  void sendWaitingDecisions();
}

/** Takes a pass back. If the server never heard it, there's nothing to tell. */
export function undoPass(targetId: string) {
  const by = me() ?? "";
  const pass = items.find((d) => mine(d, by, targetId));
  if (pass?.state === "waiting" && pass.kind === "pass" && inFlight !== targetId) {
    remove(targetId);
    return;
  }
  put("undo-pass", "waiting", targetId);
  void sendWaitingDecisions();
}

async function deliver(d: Decision): Promise<"delivered" | "refused" | "retry"> {
  const json = { "Content-Type": "application/json" };
  const body = JSON.stringify({ targetId: d.targetId });
  try {
    const res =
      d.kind === "undo-pass"
        ? await fetch(`/api/discover/pass/${encodeURIComponent(d.targetId)}`, { method: "DELETE", credentials: "include" })
        : await fetch(d.kind === "like" ? "/api/matches" : "/api/discover/pass", { method: "POST", headers: json, body, credentials: "include" });
    if (res.ok || (d.kind === "like" && res.status === 409)) return "delivered";
    return worthRetrying(res.status) ? "retry" : "refused";
  } catch {
    return "retry";
  }
}

function scheduleRetry() {
  if (retryTimer !== null) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void sendWaitingDecisions();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, LONGEST_RETRY_MS);
}

/** Sends what hasn't reached the server, one at a time and in order, so taking
 *  back a pass can never overtake the pass itself. */
export async function sendWaitingDecisions() {
  const by = me();
  if (!by || sending) return;
  sending = true;
  let stuck = false;
  let refresh = false;
  try {
    for (;;) {
      const next = items.find((d) => d.by === by && d.state === "waiting");
      if (!next) break;
      inFlight = next.targetId;
      const outcome = await deliver(next);
      inFlight = null;
      if (outcome === "retry") {
        stuck = true;
        break;
      }
      const now = items.find((d) => mine(d, by, next.targetId));
      // Changed while the request was out (a pass taken back): the loop comes
      // back round and sends the newer decision.
      if (!now || now.kind !== next.kind) continue;
      if (next.kind !== "pass") refresh = true;
      if (outcome === "refused" || next.kind === "undo-pass") {
        save(items.filter((d) => !mine(d, by, next.targetId)));
      } else {
        save(items.map((d) => (mine(d, by, next.targetId) ? { ...d, state: "delivered" as const, at: Date.now() } : d)));
      }
    }
  } finally {
    inFlight = null;
    sending = false;
  }
  if (stuck) {
    scheduleRetry();
  } else {
    retryDelay = FIRST_RETRY_MS;
  }
  if (refresh) {
    queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
    queryClient.invalidateQueries({ queryKey: ["/api/likes/outgoing"] });
    queryClient.invalidateQueries({ queryKey: ["/api/gate", "daily_likes"] });
    queryClient.invalidateQueries({ queryKey: ["/api/daily-picks"] });
  }
}

/** Everyone this member has liked or passed that this device knows about. */
export function useDecidedIds(userId: string | undefined): Set<string> {
  const all = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
  );
  return useMemo(
    () => new Set(all.filter((d) => d.by === userId && d.kind !== "undo-pass").map((d) => d.targetId)),
    [all, userId],
  );
}

/** Starts sending on reconnect and at launch. Called once from main.tsx. */
export function initDiscoverDecisions() {
  window.addEventListener("online", () => {
    retryDelay = FIRST_RETRY_MS;
    void sendWaitingDecisions();
  });
  window.setTimeout(() => void sendWaitingDecisions(), 3000);
}
