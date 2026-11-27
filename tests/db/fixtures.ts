// Test members on the in-memory database.
import { db } from "../../server/db";
import { users } from "@shared/models/auth";
import { profiles, subscriptions } from "@shared/schema";

export const DAY = 86_400_000;

type ProfileFields = Partial<typeof profiles.$inferInsert>;
type Plan = { tier: string; endsInDays: number | null; status?: string; provider?: string };

/** A user with a profile and, optionally, a plan. */
export async function addMember(id: string, fields: ProfileFields = {}, plan?: Plan) {
  await db.insert(users).values({ id, email: `${id}@test.local` });
  await db.insert(profiles).values({ userId: id, displayName: id, ...fields });
  if (plan) {
    const now = Date.now();
    await db.insert(subscriptions).values({
      userId: id,
      tier: plan.tier,
      status: plan.status ?? "active",
      provider: plan.provider ?? "paynow",
      currentPeriodStart: new Date(now - 10 * DAY),
      currentPeriodEnd: plan.endsInDays == null ? null : new Date(now + plan.endsInDays * DAY),
    });
  }
  return id;
}
