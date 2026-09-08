// SINGLE SOURCE OF TRUTH for plan tiers, prices, limits and feature flags.
// Imported by BOTH client and server. No duplicated feature lists in components,
// no plan copy hardcoded in two pages, no gate numbers as string literals.
//
// Prices are USD, in integer cents. Ember (gold) is the top tier — the name is
// the design's gold-accent word and is not used as a plan name anywhere else.

export const TIERS = ["free", "spark", "flame", "ember"] as const;
export type Tier = (typeof TIERS)[number];

export function tierRank(t: string): number {
  const i = (TIERS as readonly string[]).indexOf(t);
  return i < 0 ? 0 : i;
}

/** null means "no limit". */
export interface TierLimits {
  priceCents: number;
  /** likes you can send per day; resets at local midnight */
  dailyLikes: number | null;
  /** twin interviews you can start per rolling 7 days */
  weeklyInterviews: number | null;
  /** lines of a twin<->twin transcript you can read; null = the whole thing */
  transcriptLines: number | null;
  /** see the names/profiles of people who asked to meet you (not just the count) */
  seeWhoAsked: boolean;
  /** Lounge messages you can post per day; null = unlimited */
  loungePostsPerDay: number | null;
  /** groups you can be a member of */
  groupsMax: number | null;
  /** groups you can create */
  groupsCreatedMax: number;
  /** host your own events */
  canHostEvent: boolean;
}

export const LIMITS: Record<Tier, TierLimits> = {
  free: {
    priceCents: 0,
    dailyLikes: 15,
    weeklyInterviews: 3,
    transcriptLines: 2,
    seeWhoAsked: false,
    loungePostsPerDay: 1,
    groupsMax: 3,
    groupsCreatedMax: 0,
    canHostEvent: false,
  },
  spark: {
    priceCents: 499,
    dailyLikes: 40,
    weeklyInterviews: 15,
    transcriptLines: 2,
    seeWhoAsked: true,
    loungePostsPerDay: 10,
    groupsMax: 8,
    groupsCreatedMax: 0,
    canHostEvent: false,
  },
  flame: {
    priceCents: 999,
    dailyLikes: 100,
    weeklyInterviews: 40,
    transcriptLines: null,
    seeWhoAsked: true,
    loungePostsPerDay: null,
    groupsMax: 20,
    groupsCreatedMax: 3,
    canHostEvent: true,
  },
  ember: {
    priceCents: 1999,
    dailyLikes: null,
    weeklyInterviews: null,
    transcriptLines: null,
    seeWhoAsked: true,
    loungePostsPerDay: null,
    groupsMax: null,
    groupsCreatedMax: 999,
    canHostEvent: true,
  },
};

// Feature keys used by the server gate (Phase 3) and the client useGate hook.
export const FEATURES = [
  "daily_likes",
  "start_interview",
  "read_transcript",
  "see_who_asked",
  "lounge_post",
  "join_group",
  "create_group",
  "host_event",
] as const;
export type Feature = (typeof FEATURES)[number];

/** Lowest tier that unlocks a boolean feature (for the upgrade prompt copy). */
export const FEATURE_MIN_TIER: Record<Feature, Tier> = {
  daily_likes: "free",
  start_interview: "free",
  read_transcript: "flame", // full transcript
  see_who_asked: "spark",
  lounge_post: "free",
  join_group: "free",
  create_group: "flame",
  host_event: "flame",
};

// ── Display metadata — the ONLY place plan copy lives ──
export interface PlanCard {
  tier: Tier;
  name: string;
  priceCents: number;
  /** one plain sentence: why you pay this instead of the step below */
  pitch: string;
  gets: string[];
  notYet: string[]; // what this tier does NOT get
  recommended?: boolean;
}

export const PLAN_CARDS: PlanCard[] = [
  {
    tier: "free",
    name: "Free",
    priceCents: 0,
    pitch: "Enough room to feel the twin work before anything asks for money.",
    gets: [
      "15 likes a day",
      "3 twin interviews a week",
      "The full Discover feed",
      "Read the Lounge, one post a day",
      "Browse events",
    ],
    notYet: ["Transcripts stop at two lines", "Can't see who asked to meet you", "Can't host events"],
  },
  {
    tier: "spark",
    name: "Spark",
    priceCents: 499,
    pitch: "You can finally see who asked to meet you, not just that someone did.",
    gets: ["Names and profiles of everyone who asked you", "40 likes a day", "15 interviews a week", "10 Lounge posts a day", "Up to 8 groups"],
    notYet: ["Transcripts still stop at two lines", "Can't host events"],
  },
  {
    tier: "flame",
    name: "Flame",
    priceCents: 999,
    pitch: "Read the whole conversation your twins had, and start hosting your own events.",
    gets: ["The full twin‑to‑twin transcript, every time", "Host your own events", "100 likes a day", "40 interviews a week", "Unlimited Lounge posts", "Up to 20 groups, create 3"],
    notYet: ["Likes, interviews and groups still have a ceiling"],
    recommended: true,
  },
  {
    tier: "ember",
    name: "Ember",
    priceCents: 1999,
    pitch: "Nothing counts down — unlimited likes, interviews, groups and events.",
    gets: ["Unlimited likes", "Unlimited interviews", "Unlimited groups, hosted or joined", "Everything in Flame"],
    notYet: [],
  },
];

export function priceLabel(cents: number): string {
  return cents === 0 ? "Free" : `$${(cents / 100).toFixed(2)}`;
}

export function limitLabel(n: number | null): string {
  return n == null ? "Unlimited" : String(n);
}
