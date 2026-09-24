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
  /** groups you can be a member of; null = unlimited. This is the Lounge lever —
   *  posting inside a room you're in is never metered, only how many rooms
   *  you're in at once. */
  groupsMax: number | null;
  /** groups you can create; null = unlimited */
  groupsCreatedMax: number | null;
  /** host your own events */
  canHostEvent: boolean;
  /** see the names/profiles of people who viewed or liked your story (not just the count) */
  seeStoryEngagers: boolean;
  /** replies you can post to other people's stories per rolling 7 days; null = no limit.
   *  Reading replies to your OWN stories is never capped, on any tier. Free is
   *  0 — commenting on someone's story is a paying-tier-only action. */
  storyRepliesPerWeek: number | null;
  /** "Request Private Chat" from inside a Lounge, per rolling 7 days; free is
   *  0 — this is a paying-tier-only action, not just metered lower for free. */
  groupChatRequestsPerWeek: number | null;
}

export const LIMITS: Record<Tier, TierLimits> = {
  free: {
    priceCents: 0,
    dailyLikes: 30,
    weeklyInterviews: 3,
    transcriptLines: 2,
    seeWhoAsked: false,
    groupsMax: 3,
    groupsCreatedMax: 0,
    canHostEvent: false,
    seeStoryEngagers: false,
    storyRepliesPerWeek: 0,
    groupChatRequestsPerWeek: 0,
  },
  spark: {
    priceCents: 499,
    dailyLikes: 80,
    weeklyInterviews: 15,
    transcriptLines: 2,
    seeWhoAsked: true,
    groupsMax: 8,
    groupsCreatedMax: 0,
    canHostEvent: false,
    seeStoryEngagers: true,
    storyRepliesPerWeek: 20,
    groupChatRequestsPerWeek: 5,
  },
  flame: {
    priceCents: 999,
    dailyLikes: 200,
    weeklyInterviews: 40,
    transcriptLines: null,
    seeWhoAsked: true,
    groupsMax: 20,
    groupsCreatedMax: 3,
    canHostEvent: true,
    seeStoryEngagers: true,
    storyRepliesPerWeek: 60,
    groupChatRequestsPerWeek: 20,
  },
  ember: {
    priceCents: 1999,
    dailyLikes: null,
    weeklyInterviews: null,
    transcriptLines: null,
    seeWhoAsked: true,
    groupsMax: null,
    groupsCreatedMax: null,
    canHostEvent: true,
    seeStoryEngagers: true,
    storyRepliesPerWeek: null,
    groupChatRequestsPerWeek: null,
  },
};

// Feature keys used by the server gate (Phase 3) and the client useGate hook.
export const FEATURES = [
  "daily_likes",
  "start_interview",
  "read_transcript",
  "see_who_asked",
  "join_group",
  "create_group",
  "host_event",
  "proximity_identity", // see WHO a "someone's here" alert is about, and act on it
  "see_story_engagers", // names/profiles of who viewed or liked your story
  "story_reply", // posting a reply to someone else's story
  "group_chat_request", // "Request Private Chat" on a member from inside a Lounge
] as const;
export type Feature = (typeof FEATURES)[number];

/** Lowest tier that unlocks a boolean feature (for the upgrade prompt copy). */
export const FEATURE_MIN_TIER: Record<Feature, Tier> = {
  daily_likes: "free",
  start_interview: "free",
  read_transcript: "flame", // full transcript
  see_who_asked: "spark",
  join_group: "free",
  create_group: "flame",
  host_event: "flame",
  proximity_identity: "spark",
  see_story_engagers: "spark",
  story_reply: "free", // a metered count, not a tier floor — see LIMIT_KEY
  group_chat_request: "free", // metered, not tier-floored — free's count is just 0, see LIMIT_KEY
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
    priceCents: LIMITS.free.priceCents,
    pitch: "Enough room to feel the twin work before anything asks for money.",
    gets: [
      `${LIMITS.free.dailyLikes} likes a day`,
      `${LIMITS.free.weeklyInterviews} twin interviews a week`,
      "The full Discover feed",
      `Join up to ${LIMITS.free.groupsMax} rooms in the Lounge`,
      "Browse events",
    ],
    notYet: [`Transcripts stop at ${LIMITS.free.transcriptLines} lines`, "Can't see who asked to meet you", "Can't host events"],
  },
  {
    tier: "spark",
    name: "Spark",
    priceCents: LIMITS.spark.priceCents,
    pitch: "You can finally see who asked to meet you, not just that someone did.",
    gets: [
      "Names and profiles of everyone who asked you",
      `${LIMITS.spark.dailyLikes} likes a day`,
      `${LIMITS.spark.weeklyInterviews} interviews a week`,
      `Up to ${LIMITS.spark.groupsMax} rooms in the Lounge`,
    ],
    notYet: [`Transcripts still stop at ${LIMITS.spark.transcriptLines} lines`, "Can't host events"],
  },
  {
    tier: "flame",
    name: "Flame",
    priceCents: LIMITS.flame.priceCents,
    pitch: "Read the whole conversation your twins had, and start hosting your own events.",
    gets: [
      "The full twin‑to‑twin transcript, every time",
      "Host your own events",
      `${LIMITS.flame.dailyLikes} likes a day`,
      `${LIMITS.flame.weeklyInterviews} interviews a week`,
      `Up to ${LIMITS.flame.groupsMax} rooms, create up to ${LIMITS.flame.groupsCreatedMax}`,
    ],
    notYet: ["Likes, interviews and rooms still have a ceiling"],
    recommended: true,
  },
  {
    tier: "ember",
    name: "Ember",
    priceCents: LIMITS.ember.priceCents,
    pitch: "Nothing counts down — unlimited likes, interviews, rooms and events.",
    gets: [
      "Unlimited likes",
      "Unlimited interviews",
      "Unlimited rooms, hosted or joined",
      "The full transcript, every time",
      "Host your own events",
    ],
    notYet: [],
  },
];

export function priceLabel(cents: number): string {
  return cents === 0 ? "Free" : `$${(cents / 100).toFixed(2)}`;
}

export function limitLabel(n: number | null): string {
  return n == null ? "Unlimited" : String(n);
}

// ── Billing periods ──
// Monthly is the only period that has ever actually billed anyone — it's the
// default everywhere and the one already-settled price. Weekly and 6-month
// are priced FROM the monthly price, never independently, so they can't
// drift out of the ladder above.

export const BILLING_PERIODS = ["weekly", "monthly", "sixMonth"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export const PERIOD_LABEL: Record<BillingPeriod, string> = {
  weekly: "week",
  monthly: "month",
  sixMonth: "6 months",
};

/** Whole days a period covers — used for currentPeriodEnd math. */
export const PERIOD_DAYS: Record<BillingPeriod, number> = {
  weekly: 7,
  monthly: 31,
  sixMonth: 186, // 31 * 6 — matches the existing 31-day monthly convention
};

// Weekly ≈ 1.5x the "fair" per-week slice of the monthly price — clearly
// worse value than paying monthly, but the absolute number stays small and
// repeatable (this matters for EcoCash, where weekly is a realistic amount,
// not a trap). 6-month is priced to land on a consistent ~17% saving vs.
// paying monthly six times, computed below, never hardcoded into copy.
const PAID_TIERS = ["spark", "flame", "ember"] as const;
export const PERIOD_PRICE_CENTS: Record<(typeof PAID_TIERS)[number], Record<BillingPeriod, number>> = {
  spark: { weekly: 179, monthly: LIMITS.spark.priceCents, sixMonth: 2499 },
  flame: { weekly: 349, monthly: LIMITS.flame.priceCents, sixMonth: 4999 },
  ember: { weekly: 699, monthly: LIMITS.ember.priceCents, sixMonth: 9999 },
};

export function periodPriceCents(tier: Tier, period: BillingPeriod): number {
  if (tier === "free") return 0;
  return PERIOD_PRICE_CENTS[tier][period];
}

/** The per-month figure to show under a longer-than-monthly price. Null for
 *  weekly/monthly, which don't need an equivalent shown. */
export function periodPerMonthCents(tier: Tier, period: BillingPeriod): number | null {
  if (period !== "sixMonth" || tier === "free") return null;
  return Math.round(periodPriceCents(tier, period) / 6);
}

/** Honest saving vs. paying the monthly price six times over, rounded to a
 *  whole percent. Null when there's nothing to compare (weekly/monthly). */
export function periodSavingsPct(tier: Tier, period: BillingPeriod): number | null {
  if (period !== "sixMonth" || tier === "free") return null;
  const sixMonths = periodPriceCents(tier, "monthly") * 6;
  const actual = periodPriceCents(tier, period);
  return Math.round((1 - actual / sixMonths) * 100);
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
  join_group: "groupsMax",
  story_reply: "storyRepliesPerWeek",
  group_chat_request: "groupChatRequestsPerWeek",
};

const ACTION: Record<Feature, string> = {
  daily_likes: "Sending more likes",
  start_interview: "Starting another interview",
  read_transcript: "Reading the full transcript",
  see_who_asked: "Seeing who asked to meet you",
  join_group: "Joining another room",
  create_group: "Creating a room",
  host_event: "Hosting an event",
  proximity_identity: "Opening a nearby profile",
  see_story_engagers: "Seeing who viewed or liked your story",
  story_reply: "Replying to a story",
  group_chat_request: "Requesting a private chat",
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
      : feature === "story_reply" ? "replies"
      : feature === "group_chat_request" ? "requests"
      : "rooms";
    const per =
      feature === "daily_likes" ? "today"
      : feature === "start_interview" || feature === "story_reply" || feature === "group_chat_request" ? "this week"
      : "";

    let line: string;
    if (feature === "join_group") {
      line = `You're in ${limit} rooms, the most on ${TIER_NAME[curTier]}. ${nextName} takes you to ${nextVal ?? "no limit"}.`;
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
    read_transcript: `Transcripts stop at ${LIMITS[curTier].transcriptLines} lines on ${curName}. ${reqName} opens the whole conversation your twins had${priced}.`,
    see_who_asked: `You can see that someone asked, but not who. ${reqName} shows you the names and profiles${priced}.`,
    create_group: `Creating a room starts on ${reqName}${priced}. You can still join up to ${LIMITS[curTier].groupsMax ?? "several"} on ${curName}.`,
    proximity_identity: `Your twin can tell you someone's nearby, but opening their profile needs ${reqName}${priced}.`,
    see_story_engagers: `You can see how many people viewed or liked your story, but not who. ${reqName} shows you the names and profiles${priced}.`,
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
