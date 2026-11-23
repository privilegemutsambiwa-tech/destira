// The Sunday Table (docs/destira-3-upgrade-prompt.md Part O2): every week,
// a table of six people you'd get on with, in person. All times are Harare
// (UTC+2, no daylight saving).
//   Thursday 18:00  sign-ups close for that Sunday
//   Friday 09:00    tables are formed; you learn the vibe
//   Saturday 08:00  the place, and the table's chat opens
//   Sunday 13:00    lunch; names and faces from 12:45
//   after           each person privately picks who they'd see again

export const TABLE_MIXES = [
  { value: "mixed", label: "Mixed", note: "Three women and three men, where we can." },
  { value: "women", label: "Women only", note: "A table of women." },
  { value: "men", label: "Men only", note: "A table of men." },
] as const;
export type TableMix = (typeof TABLE_MIXES)[number]["value"];
export const TABLE_MIX_VALUES = TABLE_MIXES.map((m) => m.value) as readonly string[];

export const TABLE_SIZE = 6;
export const TABLE_MIN = 4;
/** The oldest and youngest at a table are at most this many years apart. */
export const TABLE_AGE_SPREAD = 8;

const HARARE_MS = 2 * 3600_000;
const DAY = 86_400_000;

/** The Sunday (YYYY-MM-DD) someone signing up now would sit at. */
export function signupWeekend(now: Date = new Date()): string {
  const h = new Date(now.getTime() + HARARE_MS);
  const dow = h.getUTCDay(); // 0 = Sunday
  const thisSunday = Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate()) + ((7 - dow) % 7) * DAY;
  const closed = dow === 0 || dow === 5 || dow === 6 || (dow === 4 && h.getUTCHours() >= 18);
  const sunday = dow === 0 ? thisSunday + 7 * DAY : closed ? thisSunday + 7 * DAY : thisSunday;
  return new Date(sunday).toISOString().slice(0, 10);
}

/** The moments of one weekend, as real instants. */
export function weekendTimes(weekend: string) {
  const sunday = Date.parse(`${weekend}T00:00:00Z`) - HARARE_MS; // Sunday 00:00 Harare
  const at = (days: number, hour: number, min = 0) => new Date(sunday + days * DAY + hour * 3600_000 + min * 60_000);
  return {
    signupCloses: at(-3, 18),
    formsAt: at(-2, 9),
    placeAt: at(-1, 8),
    startsAt: at(0, 13),
    namesAt: at(0, 12, 45),
    picksOpen: at(0, 15),
    picksClose: at(7, 13),
  };
}

export function weekendLabel(weekend: string): string {
  return new Date(`${weekend}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

export type TablePickKind = "friends" | "love";

export interface TablePerson {
  userId: string;
  name: string;
  age: number | null;
  photoUrl: string | null;
}

export interface TableView {
  id: number;
  weekend: string;
  startsAt: string;
  size: number;
  ageMin: number | null;
  ageMax: number | null;
  vibe: string;
  /** From Saturday 08:00. */
  place: { name: string; detail: string | null } | null;
  placeAt: string;
  chatGroupId: number | null;
  /** From 12:45 on Sunday. */
  people: TablePerson[] | null;
  namesAt: string;
  picks: {
    open: boolean;
    opensAt: string;
    closesAt: string;
    /** "love" is offered only when both of you are here for Love too. */
    canLove: string[];
    mine: { toId: string; kind: TablePickKind }[];
  };
}

export interface TablesMe {
  weekend: string;
  weekendLabel: string;
  signupCloses: string;
  /** `weekend` differs from the top-level one while last sign-up is being formed. */
  signup: { weekend: string; weekendLabel: string; status: "waiting" | "seated" | "unseated"; mix: TableMix } | null;
  allowance: { ok: true } | { ok: false; reason: string };
  friendsOn: boolean;
  table: TableView | null;
  /** Last weekend's table, while its "see again" picks are open. */
  recent: TableView | null;
}
