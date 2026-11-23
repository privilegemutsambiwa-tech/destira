// Wingman (docs/destira-3-upgrade-prompt.md Part O6): a friend from one of
// your circles suggests someone from Discover ("I think you'd like her"),
// and you see who suggested them and why. The person suggested is never told.

export const WINGMAN_NOTE_MIN = 5;
export const WINGMAN_NOTE_MAX = 140;
/** Suggestions one member can send a day. */
export const WINGMAN_DAILY = 5;

/** The why. No links, handles or phone numbers. */
export function wingmanNoteProblem(note: string): string | null {
  const t = note.trim();
  if (t.length < WINGMAN_NOTE_MIN) return "Say why, in a few words.";
  if (t.length > WINGMAN_NOTE_MAX) return `Keep it under ${WINGMAN_NOTE_MAX} characters.`;
  if (/https?:\/\/|www\.|\.(com|co\.zw|net|org)\b/i.test(t)) return "No links, please.";
  if (/(\d[\s-]?){7,}/.test(t)) return "No phone numbers, please.";
  if (/@\w{2,}/.test(t)) return "No handles, please.";
  return null;
}

export interface WingmanPerson {
  userId: string;
  name: string;
  photoUrl: string | null;
}

export interface WingmanCandidate extends WingmanPerson {
  age: number | null;
  area: string | null;
}

export type WingmanStatus = "pending" | "seen" | "dismissed";

/** What the friend who got the suggestion sees. */
export interface WingmanReceived {
  id: number;
  from: WingmanPerson;
  circleName: string;
  candidate: WingmanCandidate;
  note: string;
  status: WingmanStatus;
  createdAt: string;
}

export interface WingmanMe {
  received: WingmanReceived[];
  /** Sent today, out of WINGMAN_DAILY. */
  sentToday: number;
}

/** On someone's profile: who suggested them to you, and which circle friends you could suggest them to. */
export interface WingmanForProfile {
  suggestedBy: { id: number; from: WingmanPerson; note: string; circleName: string }[];
  friends: { person: WingmanPerson; circleName: string; sent: boolean }[];
  sentToday: number;
}
