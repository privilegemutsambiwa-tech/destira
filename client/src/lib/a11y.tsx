// Accessibility helpers (Part K6).
import type React from "react";
import { useEffect, useRef, useState } from "react";

/** A visually hidden live region: whatever text it holds is read out by a
 *  screen reader when it changes, without moving focus. */
export function LiveRegion({ text, assertive = false }: { text: string; assertive?: boolean }) {
  return (
    <div className="sr-only" role="status" aria-live={assertive ? "assertive" : "polite"} aria-atomic="true">
      {text}
    </div>
  );
}

/** What a message says, for reading aloud: its text, or what kind of thing it is. */
export function spokenMessage(m: { content?: string | null; contentType?: string | null }): string {
  const kind = m.contentType && m.contentType !== "text" ? m.contentType : null;
  const what: Record<string, string> = { image: "a photo", video: "a video", voice: "a voice note", poll: "a poll", game: "a game", gif: "a GIF", sticker: "a sticker" };
  if (kind) return `sent ${what[kind] ?? "something"}`;
  return (m.content ?? "").slice(0, 200);
}

/** The line to announce when someone else's message arrives at the end of a
 *  chat. The chat's history, older pages loaded above, and your own messages
 *  are never read out: only what lands after the last message already shown.
 *  Render the result in a <LiveRegion>. */
export function useNewMessageAnnouncement<T>(
  items: T[] | undefined,
  opts: { key: (m: T) => string | number; mine: (m: T) => boolean; say: (m: T) => string },
): string {
  const [text, setText] = useState("");
  const lastKey = useRef<string | number | null>(null);
  const { key, mine, say } = opts;
  useEffect(() => {
    if (!items?.length) return;
    const fresh = arrivalsAfter(items, lastKey.current, key, mine);
    lastKey.current = key(items[items.length - 1]);
    if (fresh.length) setText(fresh.map(say).join(". "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  return text;
}

/** Messages from others that came after `lastKey` (the last one already
 *  shown). None on the first load (no lastKey), and none when lastKey is
 *  gone (another chat, or a reload): that's a fresh start, not news. */
export function arrivalsAfter<T>(items: T[], lastKey: string | number | null, key: (m: T) => string | number, mine: (m: T) => boolean): T[] {
  if (lastKey === null) return [];
  const at = items.findIndex((m) => key(m) === lastKey);
  if (at < 0) return [];
  return items.slice(at + 1).filter((m) => !mine(m));
}

/** Props that make a non-button element (a card, a settings row) work like a
 *  button for keyboards and screen readers: focusable, announced with the
 *  right role, and pressed with Enter or Space. Prefer a real <button> where
 *  the layout allows; this is for rows and cards that hold other markup.
 *
 *    <div {...pressable(open)} aria-label="Open the event">…</div>
 *    <div {...pressable(() => set(!on), { role: "switch", checked: on })}>…</div>
 */
export function pressable(
  onPress: () => void,
  opts: { role?: "button" | "switch" | "link"; checked?: boolean; expanded?: boolean; disabled?: boolean } = {},
) {
  const { role = "button", checked, expanded, disabled } = opts;
  return {
    role,
    tabIndex: disabled ? -1 : 0,
    "aria-disabled": disabled || undefined,
    ...(checked !== undefined ? { "aria-checked": checked } : {}),
    ...(expanded !== undefined ? { "aria-expanded": expanded } : {}),
    onClick: disabled ? undefined : () => onPress(),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (disabled || e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onPress();
      }
    },
  };
}
