// Console member lookup and actions (docs/destira-3-upgrade-prompt.md Part L1, L2).

/** Plans nobody paid for: the signup trial, referral reward days, and days
 *  the team granted. Never counted as revenue or as a paying member. */
export const FREE_PLAN_PROVIDERS = ["trial", "referral", "grant"] as const;
export const isFreePlanProvider = (p: string | null | undefined) => (FREE_PLAN_PROVIDERS as readonly string[]).includes(p ?? "");

export const MEMBER_ACTIONS = [
  "grant_plan_days",
  "credit_super_like",
  "credit_boost",
  "refund_given",
  "reset_verification",
  "suspend",
  "ban",
  "reinstate",
] as const;
export type MemberAction = (typeof MEMBER_ACTIONS)[number];

export const MEMBER_ACTION_LABEL: Record<MemberAction, string> = {
  grant_plan_days: "Grant plan days",
  credit_super_like: "Credit super likes",
  credit_boost: "Credit boosts",
  refund_given: "Mark a refund as given",
  reset_verification: "Reset verification",
  suspend: "Suspend",
  ban: "Ban",
  reinstate: "Lift suspension or ban",
};

/** Password re-entry first (Part L: ban, refund note and plan grants), plus
 *  suspend and reinstate, which change whether someone can use the app. */
export const STEP_UP_ACTIONS: readonly MemberAction[] = ["grant_plan_days", "refund_given", "suspend", "ban", "reinstate"];
/** Admin or owner only; support can do the rest. */
export const ADMIN_ONLY_ACTIONS: readonly MemberAction[] = ["grant_plan_days", "refund_given", "ban", "reinstate"];

export const GRANT_TIERS = ["spark", "flame", "ember"] as const;
export const MAX_GRANT_DAYS = 93;
export const MAX_CREDIT = 20;

export interface MemberSearchRow {
  userId: string;
  name: string | null;
  email: string | null;
  tier: string | null;
  moderationStatus: string;
  isVerified: boolean;
  joinedAt: string | null;
}
