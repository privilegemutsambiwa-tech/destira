// Human names for Lounge game kinds (shared/schema.ts GROUP_GAME_KINDS).
export const GAME_NAMES: Record<string, string> = {
  two_truths_one_lie: "Two truths, one lie",
  would_you_rather: "Would you rather",
  this_or_that: "This or that",
  never_have_i_ever: "Never have I ever",
  most_likely_to: "Most likely to",
  trivia_round: "Trivia round",
  category_sprint: "Category sprint",
  emoji_charades: "Emoji charades",
  icebreaker_roulette: "Icebreaker roulette",
};

export function gameName(kind: string | null | undefined): string {
  return (kind && GAME_NAMES[kind]) || "A game";
}
