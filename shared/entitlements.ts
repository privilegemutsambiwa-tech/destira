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
  "proximity_identity", // see WHO a "someone's here" alert is about, and act on it
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
  proximity_identity: "spark",
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

// ── ONE source for what a locked feature says, in context ──
//
// Every gate refusal — the moment-of-tap sheet, the inline <Gated> card, and
// the server 403 body — renders from gateCopy(). Tier names and prices come
// from LIMITS / PLAN_CARDS so the wording can't drift from the ladder. Never
// says "upgrade", "unlock", or "you're missing out"; always states what you
// CAN still do where there's an answer.

const TIER_NAME: Record<Tier, string> = Object.fromEntries(
  PLAN_CARDS.map((c) => [c.tier, c.name]),
) as Record<Tier, string>;

/** Lowest tier whose numeric limit for `key` beats `fromTier`'s (or is unlimited). */
function nextTierForLimit(fromTier: Tier, key: keyof TierLimits): Tier {
  const cur = LIMITS[fromTier][key] as number | null;
  for (const t of TIERS) {
    if (tierRank(t) <= tierRank(fromTier)) continue;
    const v = LIMITS[t][key] as number | null;
    if (v == null || (typeof cur === "number" && typeof v === "number" && v > cur)) return t;
  }
  return "ember";
}

const LIMIT_KEY: Partial<Record<Feature, keyof TierLimits>> = {
  daily_likes: "dailyLikes",
  start_interview: "weeklyInterviews",
  lounge_post: "loungePostsPerDay",
  join_group: "groupsMax",
};

const ACTION: Record<Feature, string> = {
  daily_likes: "Sending more likes",
  start_interview: "Starting another interview",
  read_transcript: "Reading the full transcript",
  see_who_asked: "Seeing who asked to meet you",
  lounge_post: "Posting in the Lounge",
  join_group: "Joining another group",
  create_group: "Creating a group",
  host_event: "Hosting an event",
  proximity_identity: "Opening a nearby profile",
};

export interface GateCopy {
  /** Title-case phrase for the mono eyebrow / sheet heading. */
  action: string;
  /** The full sentence(s), composed. Same string everywhere. */
  line: string;
  /** Cheapest tier that clears this gate. */
  requiredTier: Tier;
  requiredTierName: string;
  requiredPrice: string;
  kind: "tier" | "limit";
}

export interface GateCopyState {
  tier?: string;
  limit?: number | null;
  used?: number | null;
  /** e.g. "at midnight" / "at 6:00 PM" — server-computed, from resetLabel(). */
  resetLabel?: string | null;
}

export function gateCopy(feature: Feature, s: GateCopyState = {}): GateCopy {
  const curTier = coerceKnownTier(s.tier);
  const limitKey = LIMIT_KEY[feature];
  const isLimit = !!limitKey && feature !== "create_group";

  if (isLimit && limitKey) {
    const limit = s.limit ?? (LIMITS[curTier][limitKey] as number | null) ?? 0;
    const nextTier = nextTierForLimit(curTier, limitKey);
    const nextVal = LIMITS[nextTier][limitKey] as number | null;
    const nextName = TIER_NAME[nextTier];

    const noun =
      feature === "daily_likes" ? "likes"
      : feature === "start_interview" ? "interviews"
      : feature === "lounge_post" ? "Lounge posts"
      : "groups";
    const per =
      feature === "daily_likes" || feature === "lounge_post" ? "today"
      : feature === "start_interview" ? "this week"
      : "";

    let line: string;
    if (feature === "join_group") {
      line = `You're in ${limit} groups, the most on ${TIER_NAME[curTier]}. ${nextName} takes you to ${nextVal ?? "no limit"}.`;
    } else {
      const head =
        limit === 1
          ? `One ${noun.replace(/s$/, "")} a ${per === "today" ? "day" : "week"} on ${TIER_NAME[curTier]}.`
          : `That's your ${limit} ${noun} for ${per}.`;
      const reset = s.resetLabel ? ` Your next ones land ${s.resetLabel}.` : "";
      const more =
        nextVal == null
          ? ` ${nextName} lifts the ceiling.`
          : ` ${nextName} gives you ${nextVal}${per === "today" ? " a day" : per === "this week" ? " a week" : ""}.`;
      line = `${head}${reset}${more}`;
    }
    return {
      action: ACTION[feature],
      line,
      requiredTier: nextTier,
      requiredTierName: nextName,
      requiredPrice: priceLabel(LIMITS[nextTier].priceCents),
      kind: "limit",
    };
  }

  // tier gate
  const req = FEATURE_MIN_TIER[feature];
  const reqName = TIER_NAME[req];
  const price = priceLabel(LIMITS[req].priceCents);
  const priced = LIMITS[req].priceCents > 0 ? `, ${price} a month` : "";
  const curName = TIER_NAME[curTier];

  const LINES: Partial<Record<Feature, string>> = {
    host_event: `You can't host events on ${curName}. ${reqName} opens it up${priced}. You can still go to anything you're invited to.`,
    read_transcript: `Transcripts stop at two lines on ${curName}. ${reqName} opens the whole conversation your twins had${priced}.`,
    see_who_asked: `You can see that someone asked, but not who. ${reqName} shows you the names and profiles${priced}.`,
    create_group: `Creating groups starts on ${reqName}${priced}. You can still join up to ${LIMITS[curTier].groupsMax ?? "several"} on ${curName}.`,
    proximity_identity: `Your twin can tell you someone's nearby, but opening their profile needs ${reqName}${priced}.`,
  };

  return {
    action: ACTION[feature],
    line: LINES[feature] ?? `That's a ${reqName} feature${priced}.`,
    requiredTier: req,
    requiredTierName: reqName,
    requiredPrice: price,
    kind: "tier",
  };
}

function coerceKnownTier(t?: string): Tier {
  return t === "spark" || t === "flame" || t === "ember" ? t : "free";
}
