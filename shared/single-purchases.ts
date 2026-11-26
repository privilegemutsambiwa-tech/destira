// Single purchases (Part G3): one super like, one boost, or 24 hours of
// seeing who liked you, bought through Paynow without a plan. Prices are the
// owner's (2026-11). server/single-purchases.ts sells and credits them.

export const SINGLE_KINDS = ["super_like", "boost", "likes_pass"] as const;
export type SingleKind = (typeof SINGLE_KINDS)[number];

export const SINGLE_PRICE_CENTS: Record<SingleKind, number> = {
  super_like: 50,
  boost: 100,
  likes_pass: 100,
};

export const LIKES_PASS_HOURS = 24;

/** What the receipt and payment history call it. */
export const SINGLE_LABEL: Record<SingleKind, string> = {
  super_like: "One super like",
  boost: "One 30-minute boost",
  likes_pass: "See who liked you for 24 hours",
};

export const singlePrice = (k: SingleKind) => `$${(SINGLE_PRICE_CENTS[k] / 100).toFixed(2)}`;
