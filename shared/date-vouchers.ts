// Date on me (docs/destira-3-upgrade-prompt.md Part P6). Shared by client and
// server.
//
// A Crown member planning a date at a partner venue can prepay something
// there from the venue's member-price menu (coffee for two, dinner). Destira
// collects through Paynow; the date sees "Your date has covered this"; the
// venue checks the code at the till; Destira pays venues monthly for the
// vouchers used. A voucher unused after VOUCHER_DAYS, or whose date is off,
// is refunded to the Crown member. It is never cash: it can't be paid to the
// other person, only used at the venue.

export const VOUCHER_DAYS = 30;
export const VOUCHER_ITEMS_MAX = 6;
export const VOUCHER_CENTS_MIN = 100;
export const VOUCHER_CENTS_MAX = 20000;
export const PURCHASE_KIND_VOUCHER = "date_voucher";

export type VoucherItem = { id: string; label: string; cents: number };
export type VoucherStatus = "pending_payment" | "active" | "redeemed" | "refund_due" | "refunded" | "cancelled";

export type PlanVoucherState = {
  /** The partner venue this date is at, if it's one with a menu. */
  venue: { name: string; offer: string | null } | null;
  items: VoucherItem[];
  canAttach: boolean;
  voucher: {
    id: number;
    code: string;
    itemLabel: string;
    amountCents: number;
    status: VoucherStatus;
    expiresAt: string | null;
    /** You paid for it (otherwise your date did). */
    mine: boolean;
  } | null;
};

export type TillCheck = {
  code: string;
  venueName: string;
  itemLabel: string;
  amountCents: number;
  status: VoucherStatus;
  expiresAt: string | null;
  redeemedAt: string | null;
};

/** Unambiguous code alphabet (no 0/O, 1/I/L). */
export const VOUCHER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const normalizeVoucherCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^(.{4})(.{4})$/, "$1-$2");
