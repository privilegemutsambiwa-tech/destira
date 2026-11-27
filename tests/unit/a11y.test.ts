// The accessibility helpers (client/src/lib/a11y.tsx, Part K6): which chat
// messages get read out, what a message sounds like, and that pressable()
// makes an element work like a button from the keyboard.
import { describe, expect, it, vi } from "vitest";
import { arrivalsAfter, pressable, spokenMessage } from "@/lib/a11y";

type M = { id: number; from: string };
const me = "me";
const key = (m: M) => m.id;
const mine = (m: M) => m.from === me;
const chat = (...xs: [number, string][]) => xs.map(([id, from]) => ({ id, from }));

describe("which new messages are read out", () => {
  it("nothing on first load: that's history", () => {
    expect(arrivalsAfter(chat([1, "them"], [2, "them"]), null, key, mine)).toEqual([]);
  });

  it("their messages after the last one shown", () => {
    const now = chat([1, "them"], [2, me], [3, "them"], [4, "them"]);
    expect(arrivalsAfter(now, 2, key, mine).map((m) => m.id)).toEqual([3, 4]);
  });

  it("never your own", () => {
    expect(arrivalsAfter(chat([1, "them"], [2, me]), 1, key, mine)).toEqual([]);
  });

  it("older messages loaded above aren't news", () => {
    // Was showing 10..11; scrolling up loaded 8..9 in front.
    const now = chat([8, "them"], [9, "them"], [10, "them"], [11, "them"]);
    expect(arrivalsAfter(now, 11, key, mine)).toEqual([]);
  });

  it("a different chat, or the last one gone, starts afresh", () => {
    expect(arrivalsAfter(chat([50, "them"], [51, "them"]), 11, key, mine)).toEqual([]);
  });
});

describe("what a message sounds like", () => {
  it("text is read as written, kept short", () => {
    expect(spokenMessage({ content: "Hi", contentType: "text" })).toBe("Hi");
    expect(spokenMessage({ content: "x".repeat(500) }).length).toBe(200);
  });

  it("media says what it is", () => {
    expect(spokenMessage({ content: "/uploads/a.webp", contentType: "image" })).toBe("sent a photo");
    expect(spokenMessage({ content: "", contentType: "voice" })).toBe("sent a voice note");
    expect(spokenMessage({ content: "", contentType: "something-new" })).toBe("sent something");
  });
});

describe("pressable()", () => {
  const key = (k: string, same = true) => {
    const target = {};
    return { key: k, target, currentTarget: same ? target : {}, preventDefault: vi.fn() } as any;
  };

  it("is a focusable button by default", () => {
    const p = pressable(() => {});
    expect(p.role).toBe("button");
    expect(p.tabIndex).toBe(0);
  });

  it("Enter and Space press it; other keys don't", () => {
    const onPress = vi.fn();
    const p = pressable(onPress);
    p.onKeyDown(key("Enter"));
    p.onKeyDown(key(" "));
    p.onKeyDown(key("a"));
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it("a key pressed on something inside it (a field, a button) isn't its press", () => {
    const onPress = vi.fn();
    pressable(onPress).onKeyDown(key("Enter", false));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("a switch says whether it's on", () => {
    const p = pressable(() => {}, { role: "switch", checked: true });
    expect(p.role).toBe("switch");
    expect(p["aria-checked" as keyof typeof p]).toBe(true);
  });

  it("disabled: out of the Tab order and doesn't press", () => {
    const onPress = vi.fn();
    const p = pressable(onPress, { disabled: true });
    expect(p.tabIndex).toBe(-1);
    expect(p.onClick).toBeUndefined();
    p.onKeyDown(key("Enter"));
    expect(onPress).not.toHaveBeenCalled();
  });
});
