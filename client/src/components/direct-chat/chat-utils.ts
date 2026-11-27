// Day and time labels for a chat, the once-per-match first reply, and the
// twin's reply ideas.
import { useCallback, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

export const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** "Today", "Yesterday", "Thursday", or "12 November". */
export function dayLabel(d: Date): string {
  const now = new Date();
  if (sameDay(d, now)) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "Yesterday";
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days < 6) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}
/** A message's time, never in the future (a skewed clock would otherwise
 *  label today's messages as "Saturday"). */
export function when(msg: { createdAt?: string | null }): Date {
  const t = msg.createdAt ? new Date(msg.createdAt).getTime() : Date.now();
  return new Date(Math.min(Number.isFinite(t) ? t : Date.now(), Date.now()));
}
export const timeLabel = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });

const FIRST_REPLY_KEY = "destira.first-reply.seen";
export function firstReplySeen(matchId: number): boolean {
  try {
    return (JSON.parse(localStorage.getItem(FIRST_REPLY_KEY) || "[]") as number[]).includes(matchId);
  } catch {
    return true;
  }
}
export function markFirstReplySeen(matchId: number) {
  try {
    const seen = JSON.parse(localStorage.getItem(FIRST_REPLY_KEY) || "[]") as number[];
    if (!seen.includes(matchId)) localStorage.setItem(FIRST_REPLY_KEY, JSON.stringify([...seen, matchId].slice(-200)));
  } catch {}
}

/** Drafts from the member's twin (POST /api/chat/:matchId/suggest). Never
 *  sent on their own: a tap drops one into the composer to edit. */
export function useSuggestions(matchId: number) {
  const [state, setState] = useState<{ loading: boolean; options: string[] | null; error: string | null }>({ loading: false, options: null, error: null });
  const ask = useCallback(async () => {
    setState({ loading: true, options: null, error: null });
    try {
      const res = await apiRequest("POST", `/api/chat/${matchId}/suggest`, {});
      const body = await res.json();
      const options: string[] = Array.isArray(body?.options) ? body.options : [];
      setState({ loading: false, options, error: options.length ? null : "Nothing came to mind. Try again in a moment." });
    } catch (e: any) {
      const msg = String(e?.message || "").replace(/^\d+:\s*/, "");
      setState({ loading: false, options: null, error: msg || "Couldn't think of anything just now." });
    }
  }, [matchId]);
  const clear = useCallback(() => setState({ loading: false, options: null, error: null }), []);
  return { ...state, ask, clear };
}
