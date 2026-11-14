// Game Night: each game's identity. Every game gets its own colour pair, a
// glyph and a one-line promise, so the lobby reads like a shelf of games and
// a room feels like that game the moment it opens. The stage itself is
// always dark (game night), whatever the app's theme.

export interface GameTheme {
  kind: string;
  name: string;
  glyph: string;
  /** One line, what you do. */
  tagline: string;
  /** Rough length of a round, shown on the cards. */
  length: string;
  /** Two colours: the game's light and its depth. */
  a: string;
  b: string;
  /** Starts in one tap from the lobby (no setup needed). */
  instant: boolean;
}

export const GAME_THEMES: Record<string, GameTheme> = {
  hot_take: {
    kind: "hot_take", name: "Hot Take", glyph: "🌶️",
    tagline: "One spicy opinion. Slide to where you stand.",
    length: "1 min", a: "#FF5A36", b: "#B0124B", instant: true,
  },
  would_you_rather: {
    kind: "would_you_rather", name: "Would You Rather", glyph: "🤔",
    tagline: "Two options. Pick a side.",
    length: "30 sec", a: "#8B5CF6", b: "#3B1E8F", instant: true,
  },
  trivia_round: {
    kind: "trivia_round", name: "Trivia Blitz", glyph: "⚡",
    tagline: "5 questions, 15 seconds each. Fast answers score more.",
    length: "90 sec", a: "#3B82F6", b: "#1E2A78", instant: true,
  },
  this_or_that: {
    kind: "this_or_that", name: "This or That", glyph: "🔀",
    tagline: "Five quick picks. Are you with the room?",
    length: "30 sec", a: "#F59E0B", b: "#9A3412", instant: true,
  },
  most_likely_to: {
    kind: "most_likely_to", name: "Most Likely To", glyph: "👑",
    tagline: "Vote for the person in the room who fits.",
    length: "1 min", a: "#EAB308", b: "#7C4A03", instant: true,
  },
  never_have_i_ever: {
    kind: "never_have_i_ever", name: "Never Have I Ever", glyph: "🙈",
    tagline: "Have you or haven't you? Be honest.",
    length: "30 sec", a: "#EC4899", b: "#7E1450", instant: true,
  },
  category_sprint: {
    kind: "category_sprint", name: "Category Sprint", glyph: "🏃",
    tagline: "90 seconds. Name things nobody else thinks of.",
    length: "90 sec", a: "#22C55E", b: "#0B5D3B", instant: true,
  },
  emoji_charades: {
    kind: "emoji_charades", name: "Emoji Charades", glyph: "🎬",
    tagline: "Crack the emoji. First to guess wins bragging rights.",
    length: "2 min", a: "#F97316", b: "#8A2B06", instant: true,
  },
  two_truths_one_lie: {
    kind: "two_truths_one_lie", name: "Two Truths and a Lie", glyph: "🎭",
    tagline: "Tell three things about you. They find the lie.",
    length: "2 min", a: "#A855F7", b: "#4C1D95", instant: false,
  },
  icebreaker_roulette: {
    kind: "icebreaker_roulette", name: "Icebreaker Roulette", glyph: "🎲",
    tagline: "One question, everyone answers. No points, just stories.",
    length: "Open", a: "#14B8A6", b: "#0F4C5C", instant: true,
  },
};

export const GAME_ORDER = [
  "hot_take", "trivia_round", "would_you_rather", "most_likely_to", "this_or_that",
  "never_have_i_ever", "category_sprint", "emoji_charades", "two_truths_one_lie", "icebreaker_roulette",
];

const FALLBACK: GameTheme = {
  kind: "game", name: "Game", glyph: "🎮", tagline: "", length: "", a: "#FF6B4A", b: "#5B1A2E", instant: false,
};

export function themeFor(kind: string | null | undefined): GameTheme {
  return (kind && GAME_THEMES[kind]) || FALLBACK;
}

/** The stage colours: a deep ink lit by the game's own colour. */
export const STAGE = {
  ink: "#0D0A12",
  cream: "#F7F2EC",
  dim: "rgba(247,242,236,0.62)",
  faint: "rgba(247,242,236,0.38)",
  line: "rgba(247,242,236,0.12)",
  glass: "rgba(247,242,236,0.06)",
  mint: "#5EE0B5",
};

export function stageBackground(t: GameTheme): string {
  return `radial-gradient(120% 70% at 50% -10%, ${t.a}55, transparent 60%), radial-gradient(90% 60% at 100% 110%, ${t.b}88, transparent 60%), ${STAGE.ink}`;
}

/** The glossy tile a game's glyph sits on. */
export function tileBackground(t: GameTheme): string {
  return `linear-gradient(145deg, ${t.a}, ${t.b})`;
}

/** Setup the one-tap start sends for each instant game. */
export function instantSetup(kind: string): Record<string, unknown> {
  if (kind === "most_likely_to") return { random: true };
  if (kind === "emoji_charades") return { fromBank: true };
  return {};
}
