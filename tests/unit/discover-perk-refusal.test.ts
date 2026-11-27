// A refused rewind, super like or boost (components/discover/use-deck.ts):
// the paid-plans sheet when the server names a plan or offers a purchase,
// otherwise just the server's message as a toast.
import { describe, expect, it } from "vitest";
import { perkRefusalGate } from "@/components/discover/use-deck";

describe("perkRefusalGate", () => {
  it("offers the plan the server names", () => {
    const g = perkRefusalGate("rewind", { currentTier: "spark", requiredTierName: "Flame", requiredPrice: "$5", message: "Rewind is on Flame", action: "See Flame", resetAt: "x" });
    expect(g).toEqual({ ok: false, tier: "spark", limit: null, resetAt: "x", line: "Rewind is on Flame", action: "See Flame", requiredTierName: "Flame", requiredPrice: "$5" });
  });

  it("opens the sheet for a super like or boost the member can buy, even with no plan named", () => {
    const g = perkRefusalGate("super_like", { upgradeRequired: true, message: "None left today" });
    expect(g).toMatchObject({ ok: false, tier: "free", line: "None left today", requiredTierName: undefined });
    expect(perkRefusalGate("boost", { upgradeRequired: true })).not.toBeNull();
  });

  it("a rewind without a plan to offer is just a message", () => {
    expect(perkRefusalGate("rewind", { upgradeRequired: true, message: "Nothing to bring back" })).toBeNull();
    expect(perkRefusalGate("boost", { message: "Already on" })).toBeNull();
    expect(perkRefusalGate("super_like", null)).toBeNull();
  });
});
