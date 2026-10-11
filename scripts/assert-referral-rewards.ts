// Guards "invite a friend, you both get a free week" against the local dev
// database (it creates and then deletes its own test-gr-* members):
//
//   npx tsx --env-file=.env.dev scripts/assert-referral-rewards.ts
//
// Covers how the week lands for each kind of plan, that a double-fire never
// double-grants, the referrer's monthly cap, paid members getting views, the summary the Invite page
// reads, and signup attribution from the vf_ref / vf_src cookies.
import { db } from "../server/db";
import { users } from "../shared/models/auth";
import { profiles, subscriptions, referrals, referralCodes, profileViewGrants, signupSources, twinNotifications } from "../shared/schema";
import { eq, inArray, like } from "drizzle-orm";
import * as referralsService from "../server/referrals";
import { attributeNewSignup } from "../server/growth";

if (process.env.DATABASE_URL) {
  console.error("refusing: DATABASE_URL is set — this writes test members, run it against .env.dev only");
  process.exit(1);
}

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "  ok  " : " FAIL "} ${name}`);
  if (!cond) failures += 1;
};
const DAY = 86400000;
const near = (a: Date | null | undefined, b: number) => !!a && Math.abs(a.getTime() - b) < 60_000;

async function cleanup() {
  const ids = (await db.select({ id: users.id }).from(users).where(like(users.id, "test-gr-%"))).map((u) => u.id);
  if (!ids.length) return;
  await db.delete(twinNotifications).where(inArray(twinNotifications.userId, ids));
  await db.delete(signupSources).where(inArray(signupSources.userId, ids));
  await db.delete(profileViewGrants).where(inArray(profileViewGrants.userId, ids));
  await db.delete(referrals).where(inArray(referrals.invitedUserId, ids));
  await db.delete(referrals).where(inArray(referrals.referrerUserId, ids));
  await db.delete(referralCodes).where(inArray(referralCodes.userId, ids));
  await db.delete(subscriptions).where(inArray(subscriptions.userId, ids));
  await db.delete(profiles).where(inArray(profiles.userId, ids));
  await db.delete(users).where(inArray(users.id, ids));
}

async function member(
  id: string,
  name: string,
  plan: { tier: string; endsIn: number | null; status?: string; provider?: string } | null,
) {
  await db.insert(users).values({ id, email: `${id}@local.test` });
  await db.insert(profiles).values({ userId: id, displayName: name });
  if (plan) {
    const now = Date.now();
    await db.insert(subscriptions).values({
      userId: id,
      tier: plan.tier,
      status: plan.status ?? "active",
      provider: plan.provider ?? "trial",
      currentPeriodStart: new Date(now - 10 * DAY),
      currentPeriodEnd: plan.endsIn == null ? null : new Date(now + plan.endsIn * DAY),
    });
  }
}
const subOf = async (id: string) => (await db.select().from(subscriptions).where(eq(subscriptions.userId, id)))[0];

async function invite(referrerId: string, invitedId: string) {
  const code = await referralsService.getOrCreateCode(referrerId);
  const r = await referralsService.attachReferral(invitedId, code);
  if (!r.ok) throw new Error(`attach failed: ${r.reason}`);
}

async function main() {
  await cleanup();
  const now = Date.now();

  // ── both on running trials: each runs a week longer, same tier ──
  await member("test-gr-a", "Ana Moyo", { tier: "flame", endsIn: 10 });
  await member("test-gr-b", "Ben", { tier: "flame", endsIn: 30 });
  await invite("test-gr-a", "test-gr-b");
  await referralsService.rewardReferral("test-gr-b");
  const a = await subOf("test-gr-a");
  const b = await subOf("test-gr-b");
  check("referrer on trial: ends 7 days later", near(a.currentPeriodEnd, now + 17 * DAY));
  check("referrer keeps their tier", a.tier === "flame");
  check("friend on trial: ends 7 days later", near(b.currentPeriodEnd, now + 37 * DAY));
  const [row] = await db.select().from(referrals).where(eq(referrals.invitedUserId, "test-gr-b"));
  check("referral marked rewarded with 7 days each side", row.status === "rewarded" && row.referrerRewardDays === 7 && row.invitedRewardDays === 7);
  await new Promise((r) => setTimeout(r, 300)); // notifications are fire-and-forget
  const notes = await db.select().from(twinNotifications).where(inArray(twinNotifications.userId, ["test-gr-a", "test-gr-b"]));
  check("both get a notification", notes.length === 2);

  // ── double-fire never double-grants ──
  await referralsService.rewardReferral("test-gr-b");
  check("second call is a no-op", near((await subOf("test-gr-a")).currentPeriodEnd, now + 17 * DAY));

  // ── lapsed plan → a week of Spark; no plan at all → a week of Spark ──
  await member("test-gr-c", "Cee", { tier: "flame", endsIn: -5 });
  await member("test-gr-d", "Dee", null);
  await invite("test-gr-c", "test-gr-d");
  await referralsService.rewardReferral("test-gr-d");
  const c = await subOf("test-gr-c");
  const d = await subOf("test-gr-d");
  check("lapsed referrer: Spark, active, ends in 7 days", c.tier === "spark" && c.status === "active" && near(c.currentPeriodEnd, now + 7 * DAY));
  check("friend with no plan row: Spark for 7 days", !!d && d.tier === "spark" && near(d.currentPeriodEnd, now + 7 * DAY));

  // ── referrer cap: 4 rewards a month, the friend still gets theirs ──
  await member("test-gr-cap", "Cap", { tier: "flame", endsIn: 5 });
  for (let i = 0; i < 5; i++) {
    const id = `test-gr-f${i}`;
    await member(id, `Friend${i}`, { tier: "flame", endsIn: 30 });
    await invite("test-gr-cap", id);
    await referralsService.rewardReferral(id);
  }
  const cap = await subOf("test-gr-cap");
  check("capped referrer got exactly 4 weeks", near(cap.currentPeriodEnd, now + (5 + 28) * DAY));
  const [fifth] = await db.select().from(referrals).where(eq(referrals.invitedUserId, "test-gr-f4"));
  check("5th friend still gets their week", fifth.invitedRewardDays === 7 && near((await subOf("test-gr-f4")).currentPeriodEnd, now + 37 * DAY));
  check("5th referral: referrer gets no week, base views only", fifth.referrerRewardDays === 0 && fifth.referrerRewardViews === 5 && fifth.status === "rewarded");

  // ── paid referrer: views instead of a week, paid period untouched ──
  await member("test-gr-paid", "Pat", { tier: "flame", endsIn: 20, provider: "ecocash" });
  await member("test-gr-p1", "Pia", { tier: "flame", endsIn: 30 });
  await invite("test-gr-paid", "test-gr-p1");
  await referralsService.rewardReferral("test-gr-p1");
  const [paidRow] = await db.select().from(referrals).where(eq(referrals.invitedUserId, "test-gr-p1"));
  check("paid referrer: paid period not extended", near((await subOf("test-gr-paid")).currentPeriodEnd, now + 20 * DAY));
  check("paid referrer: 5 base + 20 views, no days", paidRow.referrerRewardDays === 0 && paidRow.referrerRewardViews === 25);
  const paidGrants = await db.select().from(profileViewGrants).where(eq(profileViewGrants.userId, "test-gr-paid"));
  check("paid referrer: 25 views actually granted", paidGrants.reduce((n, g) => n + g.amount, 0) === 25);
  check("their trial friend still gets a week", paidRow.invitedRewardDays === 7 && near((await subOf("test-gr-p1")).currentPeriodEnd, now + 37 * DAY));

  // ── paid friend: views instead of a week ──
  await member("test-gr-p2", "Pip", { tier: "spark", endsIn: 12, provider: "ecocash" });
  await invite("test-gr-a", "test-gr-p2");
  await referralsService.rewardReferral("test-gr-p2");
  const [paidFriend] = await db.select().from(referrals).where(eq(referrals.invitedUserId, "test-gr-p2"));
  check("paid friend: 20 views, no days, period untouched", paidFriend.invitedRewardViews === 20 && paidFriend.invitedRewardDays === 0 && near((await subOf("test-gr-p2")).currentPeriodEnd, now + 12 * DAY));
  check("trial referrer of a paid friend still gets a week", near((await subOf("test-gr-a")).currentPeriodEnd, now + 24 * DAY));

  // ── summary the Invite page reads ──
  const summary = await referralsService.getReferralSummary("test-gr-a");
  check("summary lists friends by first name", summary.friends.length === 2 && summary.friends.some((f) => f.firstName === "Ben" && f.status === "joined"));
  check("summary counts 14 days earned (two friends)", summary.daysEarned === 14 && summary.rewardDays === 7);
  check("summary states the paid reward and cap", summary.paidRewardViews === 20 && summary.monthlyCap === 4);
  check("inviter lookup gives first name only", (await referralsService.getInviterFirstName(summary.code)) === "Ana");
  check("inviter lookup rejects junk", (await referralsService.getInviterFirstName("nope")) === null);

  // ── signup attribution from cookies ──
  const fakeRes = () => {
    const headers: string[] = [];
    return { headers, append: (_k: string, v: string) => headers.push(v) } as any;
  };
  await member("test-gr-s1", "Sue", { tier: "flame", endsIn: 30 });
  const res1 = fakeRes();
  await attributeNewSignup(
    "test-gr-s1",
    { headers: { cookie: `vf_ref=${summary.code}; vf_src=${encodeURIComponent("share_card|invite")}` } } as any,
    res1,
  );
  const [s1] = await db.select().from(signupSources).where(eq(signupSources.userId, "test-gr-s1"));
  check("ref cookie → source referral, detail keeps the Status card", s1?.source === "referral" && s1?.detail === "share_card");
  check("ref cookie attaches the referral", (await db.select().from(referrals).where(eq(referrals.invitedUserId, "test-gr-s1"))).length === 1);
  check("both cookies cleared", res1.headers.some((h: string) => h.startsWith("vf_ref=;")) && res1.headers.some((h: string) => h.startsWith("vf_src=;")));

  await member("test-gr-s2", "Sam", null);
  await attributeNewSignup("test-gr-s2", { headers: { cookie: `vf_src=${encodeURIComponent("event|42")}` } } as any, fakeRes());
  const [s2] = await db.select().from(signupSources).where(eq(signupSources.userId, "test-gr-s2"));
  check("event link source recorded", s2?.source === "event" && s2?.detail === "42");

  await member("test-gr-s3", "Sid", null);
  await attributeNewSignup("test-gr-s3", { headers: { cookie: `vf_src=${encodeURIComponent("hacker|x")}` } } as any, fakeRes());
  const [s3] = await db.select().from(signupSources).where(eq(signupSources.userId, "test-gr-s3"));
  check("unknown source falls back to direct", s3?.source === "direct");

  await cleanup();
  console.log(failures ? `\n${failures} check(s) failed` : "\nall referral reward checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => {});
  process.exit(1);
});
