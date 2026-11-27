// The plan ladder (shared/entitlements.ts): what each tier gets and costs,
// and what a locked feature says.
import { describe, expect, it } from "vitest";
import {
  FEATURES,
  FEATURE_MIN_TIER,
  LIMITS,
  PERIOD_PRICE_CENTS,
  TIERS,
  gateCopy,
  periodPerMonthCents,
  periodPriceCents,
  periodSavingsPct,
  priceLabel,
  tierRank,
} from "@shared/entitlements";

const PAID = ["spark", "flame", "ember"] as const;

describe("tiers", () => {
  it("rank in order, unknown counts as free", () => {
    expect(TIERS.map(tierRank)).toEqual([0, 1, 2, 3]);
    expect(tierRank("nonsense")).toBe(0);
  });

  it("every limit only gets better up the ladder", () => {
    const keys = Object.keys(LIMITS.free) as (keyof typeof LIMITS.free)[];
    for (const k of keys) {
      if (k === "priceCents") continue;
      for (let i = 1; i < TIERS.length; i++) {
        const lower = LIMITS[TIERS[i - 1]][k];
        const higher = LIMITS[TIERS[i]][k];
        const label = `${String(k)}: ${TIERS[i - 1]} -> ${TIERS[i]}`;
        if (typeof lower === "boolean") expect(!lower || higher === true, label).toBe(true);
        else if (lower === null) expect(higher, label).toBeNull(); // unlimited never comes back down
        else if (higher !== null) expect(higher as number, label).toBeGreaterThanOrEqual(lower as number);
      }
    }
  });

  it("every feature has a minimum tier", () => {
    for (const f of FEATURES) expect(TIERS, f).toContain(FEATURE_MIN_TIER[f]);
  });
});

describe("prices", () => {
  it("free is free, and each paid tier costs more than the one below", () => {
    expect(LIMITS.free.priceCents).toBe(0);
    expect(LIMITS.spark.priceCents).toBeLessThan(LIMITS.flame.priceCents);
    expect(LIMITS.flame.priceCents).toBeLessThan(LIMITS.ember.priceCents);
  });

  it("the monthly price is the tier's price", () => {
    for (const t of PAID) expect(PERIOD_PRICE_CENTS[t].monthly).toBe(LIMITS[t].priceCents);
  });

  it("six months saves something honest; weekly costs more per month", () => {
    for (const t of PAID) {
      const pct = periodSavingsPct(t, "sixMonth")!;
      expect(pct, t).toBeGreaterThan(5);
      expect(pct, t).toBeLessThan(30);
      expect(periodPriceCents(t, "sixMonth")).toBeLessThan(periodPriceCents(t, "monthly") * 6);
      expect(periodPerMonthCents(t, "sixMonth")).toBe(Math.round(periodPriceCents(t, "sixMonth") / 6));
      expect(periodPriceCents(t, "weekly") * 52 / 12, t).toBeGreaterThan(periodPriceCents(t, "monthly"));
    }
    expect(periodPriceCents("free", "monthly")).toBe(0);
    expect(periodSavingsPct("flame", "monthly")).toBeNull();
  });

  it("labels cents as dollars", () => {
    expect(priceLabel(499)).toContain("4.99");
    expect(priceLabel(1999)).toContain("19.99");
  });
});

describe("what a locked feature says", () => {
  it("every feature has a line on every tier, and it never pushes", () => {
    for (const f of FEATURES) {
      for (const tier of TIERS) {
        const copy = gateCopy(f, { tier });
        expect(copy.line.trim().length, `${f} on ${tier}`).toBeGreaterThan(10);
        expect(copy.line, `${f} on ${tier}`).not.toMatch(/upgrade|unlock|missing out/i);
      }
    }
  });

  it("a daily limit says when it comes back", () => {
    const copy = gateCopy("daily_likes", { tier: "free", limit: LIMITS.free.dailyLikes, used: LIMITS.free.dailyLikes, resetLabel: "at midnight" });
    expect(copy.line).toContain("at midnight");
  });
});
