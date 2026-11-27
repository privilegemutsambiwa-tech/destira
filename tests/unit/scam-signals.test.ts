// The scam scanner (shared/safety.ts detectRisks): what it flags in a message,
// and what it leaves alone. Flags go to a person in the console; they never
// block a message by themselves.
import { describe, expect, it } from "vitest";
import { detectRisks, worstRisk, RISK_TIP } from "@shared/safety";

const kinds = (t: string) => detectRisks(t).map((h) => h.kind);

describe("scam signals", () => {
  it("ordinary chat is never flagged", () => {
    for (const t of [
      "Hey! How was your weekend?",
      "I loved the photo from Nyanga, was it cold up there?",
      "Let's get coffee at the market on Saturday",
      "My sister just paid off her car, she's so happy",
    ]) {
      expect(detectRisks(t), t).toEqual([]);
    }
  });

  it("asking for money is the serious one", () => {
    const hits = detectRisks("Babe can you send me $50 on EcoCash for transport, I'll pay you back");
    expect(hits[0]).toMatchObject({ kind: "money_request", severity: "high" });
    expect(hits[0].snippet.length).toBeGreaterThan(0);
  });

  it("investment pitches", () => {
    expect(kinds("I trade forex and bitcoin, guaranteed returns every week. Let me show you how to invest")).toContain("investment");
  });

  it("a phone number is only a low tip", () => {
    const hits = detectRisks("Text me on 0772 123 456");
    expect(hits.map((h) => [h.kind, h.severity])).toContainEqual(["off_platform", "low"]);
  });

  it("nothing to scan, nothing found", () => {
    expect(detectRisks("")).toEqual([]);
    expect(detectRisks(null)).toEqual([]);
    expect(detectRisks(undefined)).toEqual([]);
  });

  it("very long text is still scanned without trouble", () => {
    const t = "hello there ".repeat(2000) + " send me $100 please";
    expect(() => detectRisks(t)).not.toThrow();
  });

  it("the worst signal leads, and each kind has a tip for the reader", () => {
    const hits = detectRisks("WhatsApp me on 0772123456, and please send me $20 for airtime");
    expect(worstRisk(hits)?.severity).toBe("high");
    for (const h of hits) expect(RISK_TIP[h.kind]?.length, h.kind).toBeGreaterThan(10);
    expect(worstRisk([])).toBeNull();
  });
});
