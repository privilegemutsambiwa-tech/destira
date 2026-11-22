// Destira Crown: the $100 membership (docs/destira-3-upgrade-prompt.md Part P).
// Shared by client and server. Crown sits ON TOP of Ember: a Crown member's
// plan is Ember (so every Ember feature just works) plus a crown_members row
// that makes them Crown. Prices and the name live here and nowhere else.
//
// The rules that protect everyone:
//   - Verified only: you apply, the team checks you (selfie verification
//     first), and only then can you pay. No unverified crown, ever.
//   - Crown never overrides anyone's choices (filters, blocks, age ranges).
//   - Nothing lets a Crown member pay another member; transactional language
//     is flagged like anyone else's, and abuse loses the crown, no refund.
//   - Real scarcity: a seat cap per city, and "seats left" is the real count.

export const CROWN_NAME = "Crown";
export const CROWN_CITY = "Harare";
export const CROWN_DEFAULT_SEAT_CAP = 100;

export const CROWN_PERIODS = ["monthly", "threeMonth"] as const;
export type CrownPeriod = (typeof CROWN_PERIODS)[number];

export const CROWN_PRICE_CENTS: Record<CrownPeriod, number> = { monthly: 10000, threeMonth: 27000 };
export const CROWN_PERIOD_DAYS: Record<CrownPeriod, number> = { monthly: 31, threeMonth: 93 };
export const CROWN_PERIOD_LABEL: Record<CrownPeriod, string> = { monthly: "month", threeMonth: "3 months" };

/** An approval holds a seat this long while the member pays. */
export const CROWN_APPROVAL_HOLD_DAYS = 14;

export type CrownStatus = "applied" | "approved" | "declined" | "active" | "revoked";

/** What Crown gives. "live" ships today; "soon" is shown as coming, never as
 *  something you already get. */
export const CROWN_PERKS: { title: string; detail: string; status: "live" | "soon" }[] = [
  { title: "The crown, on your profile", detail: "A crown and a gold frame wherever people see you: Discover, likes, chats and events.", status: "live" },
  { title: "Everything in Ember", detail: "Unlimited likes, whole twin transcripts, see who likes you, host events.", status: "live" },
  { title: "Verified, by people", detail: "Every Crown member is checked by the Destira team. That's what the crown means.", status: "live" },
  { title: "Crown Spotlight", detail: "Shown near the top for people who fit you, once a day each, never past anyone's filters.", status: "live" },
  { title: "Direct introductions", detail: "Send a short note with a like, 3 a day. They choose; declining is silent.", status: "live" },
  { title: "Private mode", detail: "Only people you've liked can see you. Turn it on or off here any time.", status: "live" },
  { title: "Your own matchmaker", detail: "A monthly chat with someone on our team, and hand-picked introductions.", status: "soon" },
  { title: "Crown Table", detail: "A private monthly dinner with other Crown members, and a seat kept for you at official events.", status: "soon" },
];

// ── one price function for every paid plan (Plans, PlansPay, the server) ──

export type PaidTier = "spark" | "flame" | "ember";
export type PayTier = PaidTier | "crown";
export type PayPeriod = "weekly" | "monthly" | "sixMonth" | "threeMonth";

export function isCrownPeriod(p: string | null | undefined): p is CrownPeriod {
  return p === "monthly" || p === "threeMonth";
}

export function crownPriceCents(period: CrownPeriod): number {
  return CROWN_PRICE_CENTS[period];
}
