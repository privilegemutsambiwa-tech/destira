// The one resonance/compatibility calc in this codebase. Mirrors the client-side
// getResonance() in client/src/pages/Discover.tsx exactly — do not fork this logic.
//
// Important honesty caveat: this is NOT a pairwise "you vs. them" compatibility
// score. There is no viewer-aware compatibility calc anywhere in this app (the
// `matches.compatibility_score` column has always been unpopulated dead weight).
// What this actually computes is the average of a profile's own numeric
// personality traits — a proxy for "how filled-out this candidate's profile
// is," not "how well you'd get along." It only produces a result for profiles
// that carry numeric traits (the 5 demo-seeded users); profiles onboarded
// through the real flow store free-text answers and get `null` here, on
// purpose — no invented numbers for the common case.
export interface ResonanceResult {
  score: number;
  axes: { label: string; value: number }[];
}

export function computeResonance(personalityProfile: unknown): ResonanceResult | null {
  if (!personalityProfile || typeof personalityProfile !== "object") return null;
  const numeric = Object.entries(personalityProfile as Record<string, unknown>).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number"
  );
  if (numeric.length === 0) return null;
  const score = Math.round(numeric.reduce((sum, [, v]) => sum + v, 0) / numeric.length);
  const axes = numeric
    .slice(0, 4)
    .map(([label, value]) => ({ label: label.charAt(0).toUpperCase() + label.slice(1), value }));
  return { score, axes };
}
