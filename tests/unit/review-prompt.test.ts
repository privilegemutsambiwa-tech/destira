// When the Play Store rating card may be asked for (client/src/lib/review-prompt.ts,
// Part M5): only at the first match, only once, and never within a day of a
// bad moment (a block, report, unmatch or an error the member saw).
import { beforeEach, describe, expect, it } from "vitest";
import { noteBadMoment, reviewMomentOk } from "@/lib/review-prompt";

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};

const HOUR = 60 * 60 * 1000;

describe("review moment", () => {
  beforeEach(() => store.clear());

  it("asks at the first match, not before or after it", () => {
    expect(reviewMomentOk(0)).toBe(false);
    expect(reviewMomentOk(1)).toBe(true);
    expect(reviewMomentOk(2)).toBe(false);
  });

  it("asks only once", () => {
    store.set("destira.review.asked", "2026-11-27T10:00:00Z");
    expect(reviewMomentOk(1)).toBe(false);
  });

  it("stays quiet for a day after a bad moment", () => {
    noteBadMoment();
    const now = Date.now();
    expect(reviewMomentOk(1, now + HOUR)).toBe(false);
    expect(reviewMomentOk(1, now + 23 * HOUR)).toBe(false);
    expect(reviewMomentOk(1, now + 25 * HOUR)).toBe(true);
  });
});
