// Plans board, "Who's in?" (docs/destira-3-upgrade-prompt.md Part O4).
// Casual, small and soon: a plan for the next 7 days, at a public place,
// with a few seats. Faster than an event; no hosting plan needed.

export const BOARD_DAYS = 7;
export const BOARD_SEATS_MAX = 8;
export const BOARD_TITLE_MAX = 80;
/** Open plans one person can host at a time. */
export const BOARD_HOSTING_MAX = 3;
/** At least this far ahead, so people have time to ask and hear back. */
export const BOARD_MIN_LEAD_MIN = 30;
/** Only these kinds of `places` count as public enough to meet at. */
export const BOARD_PLACE_TYPES = ["mall", "cafe", "venue", "campus"] as const;

export const BOARD_WHO = [
  { value: "anyone", label: "Anyone" },
  { value: "women", label: "Women only" },
  { value: "men", label: "Men only" },
] as const;
export type BoardWho = (typeof BOARD_WHO)[number]["value"];
export const BOARD_WHO_VALUES = BOARD_WHO.map((w) => w.value) as readonly string[];

/** Two taps: Report, then one of these. Sent to the normal report queue. */
export const BOARD_REPORT_REASONS = [
  { value: "safety_escalation", label: "Feels unsafe" },
  { value: "harassment", label: "Harassment" },
  { value: "scam_or_financial", label: "Asking for money" },
  { value: "spam", label: "Spam or advertising" },
  { value: "other", label: "Something else" },
] as const;

export interface BoardPerson {
  userId: string;
  name: string;
  age: number | null;
  photoUrl: string | null;
  isVerified: boolean;
}

export interface BoardPlace {
  id: number;
  name: string;
  detail: string;
}

export type BoardRequestStatus = "pending" | "approved" | "declined";

export interface BoardPlanView {
  id: number;
  title: string;
  startsAt: string;
  place: BoardPlace;
  seats: number;
  taken: number;
  who: BoardWho;
  host: BoardPerson;
  isMine: boolean;
  myStatus: BoardRequestStatus | null;
  /** Host and approved people only. */
  chatGroupId: number | null;
  going: BoardPerson[];
  /** Host only. */
  requests: { person: BoardPerson; status: BoardRequestStatus }[];
}

export interface BoardMe {
  mine: BoardPlanView[];
  asked: BoardPlanView[];
  open: BoardPlanView[];
  canHost: boolean;
}
