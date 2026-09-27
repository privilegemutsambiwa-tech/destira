// Real, dynamic Big Five trait estimates for the Discover resonance panel —
// grounded in what a person actually wrote (onboarding answers), then nudged
// over time by real twin-chat conversation, instead of the hardcoded numbers
// the demo-seeded accounts have always carried. Stored in the same
// profiles.personalityProfile jsonb column the demo accounts already use, so
// every existing reader (Discover.tsx's getResonance, Matches.tsx's
// resonanceScore, profile-derived.ts) picks this up with no changes on their
// end — the panel simply starts rendering once a real value exists.
import { completeText } from "./ai";

export type BigFiveTraits = {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
};

const TRAIT_KEYS = ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"] as const;

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function coerceTraits(raw: unknown): BigFiveTraits | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const out: Partial<BigFiveTraits> = {};
  for (const key of TRAIT_KEYS) {
    const v = obj[key];
    if (typeof v !== "number" || Number.isNaN(v)) return null;
    out[key] = clamp(v);
  }
  return out as BigFiveTraits;
}

// One-time, high-signal estimate from the real onboarding answers (the ten
// soul-mapping questions) — called once, right when onboarding completes,
// alongside the existing twin-persona generation. Returns null (never a
// guess) if the model's response doesn't parse into all five traits — a
// missing baseline is exactly what already renders as "no panel yet"
// everywhere this column is read, which is the correct outcome for
// insufficient data, not an invented one.
export async function estimatePersonalityFromAnswers(
  answers: { q: string; a: string }[],
): Promise<BigFiveTraits | null> {
  if (answers.length === 0) return null;
  try {
    const completion = await completeText(
      [
        {
          role: "system",
          content:
            `You estimate Big Five personality traits for a dating app profile, from someone's own answers to soul-mapping questions. ` +
            `Ground every number in what they actually wrote — if an answer gives little signal for a trait, use a moderate estimate (40-60) rather than guessing toward an extreme. ` +
            `Return strict JSON with exactly these five integer fields, each 0-100: ` +
            `{"openness": 0, "conscientiousness": 0, "extraversion": 0, "agreeableness": 0, "neuroticism": 0}`,
        },
        { role: "user", content: JSON.stringify(answers) },
      ],
      // 500 was too tight — the backfill run showed the model sometimes
      // reasoning before the JSON even with response_format json_object,
      // truncating mid-object often enough to matter (matches
      // extractMemoryAfterChat's budget for the same reason).
      { json: true, maxTokens: 2000 },
    );
    return coerceTraits(JSON.parse(completion.text || "{}"));
  } catch (e) {
    console.error("Personality estimation error (non-blocking):", e);
    return null;
  }
}

// Small nudges (-3..+3 per trait) derived from a real twin-chat exchange —
// see extractMemoryAfterChat's trait_signals field. Applied as a delta on
// top of the existing baseline, never as a replacement, so the score moves
// the way a real read of someone would: slowly, from accumulated evidence,
// not lurching to a new value because of one conversation.
export function applyTraitSignals(current: BigFiveTraits, signals: unknown): BigFiveTraits | null {
  if (!signals || typeof signals !== "object") return null;
  const obj = signals as Record<string, unknown>;
  let changed = false;
  const next: BigFiveTraits = { ...current };
  for (const key of TRAIT_KEYS) {
    const raw = obj[key];
    if (typeof raw !== "number" || Number.isNaN(raw) || raw === 0) continue;
    const delta = Math.max(-3, Math.min(3, Math.round(raw)));
    const updated = clamp(current[key] + delta);
    if (updated !== next[key]) { next[key] = updated; changed = true; }
  }
  return changed ? next : null;
}

export { coerceTraits, TRAIT_KEYS };
