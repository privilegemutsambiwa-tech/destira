// A flat gray circle with an initial is what every unphotographed profile
// falls back to today — functional, but visually dead, especially in a
// group chat member list or a Discover card. This gives each person a
// consistent (same person always gets the same color, not random per
// render), distinct-enough background instead, drawn from a small warm
// palette that stays in the same family as the app's own ember/gold accents
// rather than introducing arbitrary new brand colors. White text reads
// cleanly on all of them regardless of light/dark theme.
const PALETTE = ["#FF6B4A", "#E9C46A", "#D98C6B", "#B5654B", "#C68958", "#A6763F", "#DE7F5C", "#C9A24B"];

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic background color for an initial-letter avatar, keyed to a
 *  stable id (userId, not displayName — a name can repeat or change). */
export function avatarColor(seed: string | undefined | null): string {
  if (!seed) return PALETTE[0];
  return PALETTE[hash(seed) % PALETTE.length];
}
