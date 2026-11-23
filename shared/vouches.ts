// Vouches (docs/destira-3-upgrade-prompt.md Part O5): the strongest trust
// signal a dating profile can carry, and only possible from people who
// actually met you through Destira.

export const VOUCH_MIN = 10;
export const VOUCH_MAX = 140;
/** Shown on a profile at once. */
export const VOUCHES_SHOWN_MAX = 3;

/** No links, handles or phone numbers: a vouch is not a way to swap contacts. */
export function vouchProblem(body: string): string | null {
  const t = body.trim();
  if (t.length < VOUCH_MIN) return `A few more words, please (at least ${VOUCH_MIN} characters).`;
  if (t.length > VOUCH_MAX) return `Keep it under ${VOUCH_MAX} characters.`;
  if (/https?:\/\/|www\.|\.(com|co\.zw|net|org)\b/i.test(t)) return "No links in a vouch.";
  if (/(\d[\s-]?){7,}/.test(t)) return "No phone numbers in a vouch.";
  if (/@\w{2,}/.test(t)) return "No handles in a vouch.";
  return null;
}

export interface VouchPerson {
  userId: string;
  name: string;
  photoUrl: string | null;
}

export type VouchStatus = "pending" | "shown" | "hidden";

export interface VouchView {
  id: number;
  person: VouchPerson; // the author (received) or the subject (given)
  body: string;
  metLabel: string;
  status: VouchStatus;
  createdAt: string;
}

export interface VouchPublic {
  id: number;
  from: VouchPerson;
  body: string;
  metLabel: string;
}

export interface VouchesMe {
  received: VouchView[];
  given: VouchView[];
  /** People you've met through Destira and can vouch for. */
  canVouch: { person: VouchPerson; metLabel: string }[];
}
