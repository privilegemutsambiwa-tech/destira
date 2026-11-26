// Single purchases (Part G3, shared/single-purchases.ts): one super like,
// one boost, or 24 hours of "see who liked you", through the one-off
// purchase path (server/purchases.ts). Paying credits them inside the
// payment's own transaction, so a webhook that fires twice credits once
// (activateFromPayment skips a payment that's already paid).
//   super_like -> profiles.super_matches_remaining + 1 (used after the plan's week)
//   boost      -> profiles.boosts_remaining + 1
//   likes_pass -> profiles.see_likes_until = later of (now, current) + 24h
// The ref is always 1: one of the thing.
import { eq, sql } from "drizzle-orm";
import { profiles } from "@shared/schema";
import { LIMITS } from "@shared/entitlements";
import { LIKES_PASS_HOURS, SINGLE_KINDS, SINGLE_LABEL, SINGLE_PRICE_CENTS, type SingleKind } from "@shared/single-purchases";
import { registerPurchaseKind } from "./purchase-kinds";
import { getEffectiveTier, likesPassUntil } from "./gate";

const RETURN_TO: Record<SingleKind, string> = { super_like: "/discover", boost: "/discover", likes_pass: "/matches" };

async function credit(tx: any, kind: SingleKind, userId: string): Promise<void> {
  if (kind === "super_like") {
    await tx.update(profiles).set({ superMatchesRemaining: sql`coalesce(${profiles.superMatchesRemaining}, 0) + 1` }).where(eq(profiles.userId, userId));
  } else if (kind === "boost") {
    await tx.update(profiles).set({ boostsRemaining: sql`coalesce(${profiles.boostsRemaining}, 0) + 1` }).where(eq(profiles.userId, userId));
  } else {
    const [p] = await tx.select({ until: profiles.seeLikesUntil }).from(profiles).where(eq(profiles.userId, userId));
    const from = Math.max(Date.now(), p?.until ? p.until.getTime() : 0);
    await tx.update(profiles).set({ seeLikesUntil: new Date(from + LIKES_PASS_HOURS * 3600e3) }).where(eq(profiles.userId, userId));
  }
}

export function registerSinglePurchases(): void {
  for (const kind of SINGLE_KINDS) {
    registerPurchaseKind(kind, {
      repeatable: true,
      async quote(userId, ref) {
        if (ref !== 1) return { error: 400, message: "One at a time." };
        if (kind === "likes_pass") {
          if (LIMITS[await getEffectiveTier(userId)].seeWhoAsked) return { error: 409, message: "Your plan already shows you who liked you." };
          const until = await likesPassUntil(userId);
          if (until && until.getTime() - Date.now() > 3600e3) return { error: 409, message: "You can already see who liked you." };
        }
        return { cents: SINGLE_PRICE_CENTS[kind], label: SINGLE_LABEL[kind], returnTo: RETURN_TO[kind] };
      },
      async onPaid(tx, pay) {
        await credit(tx, kind, pay.userId);
      },
      async returnTo() {
        return RETURN_TO[kind];
      },
    });
  }
}

/** For the likes list: when this member's bought pass ends, if it's running. */
export async function activeLikesPass(userId: string): Promise<string | null> {
  const until = await likesPassUntil(userId);
  return until && until.getTime() > Date.now() ? until.toISOString() : null;
}
