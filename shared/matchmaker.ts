// Crown matchmaker (docs/destira-3-upgrade-prompt.md Part P4). Shared by
// client and server.
//
// Each Crown member is looked after by one person on the Destira team (any
// console admin). That person proposes up to MATCHMAKER_MONTHLY introductions
// a month, each with a short "why". Both sides see a nameless card first:
// age, area, what they're looking for and the note. Only when both say yes
// is a love match made and names shown. Saying no is never told to anyone.
// Once a month the member can also ask for a chat with their matchmaker.

export const MATCHMAKER_MONTHLY = 4;
/** An introduction not answered at either step in this many days lapses. */
export const MATCHMAKER_ANSWER_DAYS = 14;
export const MATCHMAKER_NOTE_MIN = 20;
export const MATCHMAKER_NOTE_MAX = 400;
export const MATCHMAKER_CHAT_MAX = 600;
export const MATCHMAKER_MATCH_NOTE = "Introduced by your Destira matchmaker";
export const MATCHMAKER_TZ_OFFSET_HOURS = 2; // Harare, no daylight saving

export type MatchmakerIntroStatus = "proposed" | "crown_accepted" | "matched" | "declined" | "passed" | "expired";

/** What each side sees before names are shared. */
export type MatchmakerCard = {
  age: number | null;
  area: string | null;
  intent: string | null;
  verified: boolean;
};

export type MatchmakerIntroView = {
  id: number;
  /** "crown": you're the Crown member; "candidate": a Crown member's matchmaker picked you. */
  role: "crown" | "candidate";
  /** What you see: waiting for you, waiting for them, matched, or over. */
  stage: "yours" | "theirs" | "matched" | "over";
  card: MatchmakerCard;
  note: string;
  /** Only once matched. */
  name: string | null;
  photoUrl: string | null;
  matchId: number | null;
  createdAt: string;
  answerBy: string | null;
};

export type MatchmakerChatView = {
  id: number;
  message: string;
  status: "requested" | "scheduled" | "done";
  reply: string | null;
  requestedAt: string;
};

export type MatchmakerMe = {
  crown: boolean;
  matchmakerName: string | null;
  introsThisMonth: number;
  monthly: number;
  intros: MatchmakerIntroView[];
  chat: MatchmakerChatView | null;
  canAskChat: boolean;
};

/** Start of this calendar month in Harare, as a Date. */
export function matchmakerMonthStart(now = new Date()): Date {
  const local = new Date(now.getTime() + MATCHMAKER_TZ_OFFSET_HOURS * 3600e3);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - MATCHMAKER_TZ_OFFSET_HOURS * 3600e3);
}

export function matchmakerNoteProblem(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s.length < MATCHMAKER_NOTE_MIN) return `Say why in at least ${MATCHMAKER_NOTE_MIN} characters. Both of them will read it.`;
  if (s.length > MATCHMAKER_NOTE_MAX) return `Keep it under ${MATCHMAKER_NOTE_MAX} characters.`;
  return null;
}
