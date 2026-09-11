// Nightly (and once on boot) computation of metric_daily rows. Every number
// in the admin metrics screens reads from here, never re-derives from OLTP
// tables on request — see the build report §5 for why.
//
// Every metric here is real (computed from live tables) except where a
// comment says ESTIMATED. Nothing is invented; where the underlying data
// doesn't exist, the metric isn't computed and metrics.ts says so ("no data"
// rather than a fabricated number).
import { db } from "../db";
import {
  users,
  profiles,
  userAnswers,
  interviews,
  matches,
  dailyLikeCounts,
  payments,
  subscriptions,
  proximityAlerts,
  events,
  eventAttendees,
  reports,
  moderationActions,
  feedback,
  llmCallLog,
  userActivityDaily,
  metricDaily,
} from "@shared/schema";
import { and, eq, gte, lt, sql, count, sum, inArray, isNotNull, ne } from "drizzle-orm";
import { DISCLOSURE_CATEGORY_KEYS } from "@shared/disclosure";
import { LIMITS } from "@shared/entitlements";
import { SAFETY_CATEGORIES } from "@shared/admin";

function dayRange(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

async function upsert(date: string, metricKey: string, value: number) {
  await db
    .insert(metricDaily)
    .values({ date, metricKey, value: String(value) })
    .onConflictDoUpdate({ target: [metricDaily.date, metricDaily.metricKey], set: { value: String(value), computedAt: new Date() } });
}

// ── growth ────────────────────────────────────────────────────────────
async function rollGrowth(dateStr: string) {
  const { start, end } = dayRange(dateStr);
  const [signups] = await db.select({ n: count() }).from(users).where(and(gte(users.createdAt, start), lt(users.createdAt, end)));
  await upsert(dateStr, "growth.signups", Number(signups?.n ?? 0));

  for (const [key, days] of [["dau", 1], ["wau", 7], ["mau", 30]] as const) {
    // Active on any day in the `days`-day window ending on dateStr, inclusive.
    const since = new Date(start.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);
    const rows = await db
      .selectDistinct({ userId: userActivityDaily.userId })
      .from(userActivityDaily)
      .where(and(gte(userActivityDaily.date, since), sql`${userActivityDaily.date} <= ${dateStr}`));
    await upsert(dateStr, `growth.${key}`, rows.length);
  }
}

// ── funnel (per signup-day cohort, "as of now") + activation ───────────
const FUNNEL_STAGES = ["signup", "basics_complete", "soul_answer", "twin_generated", "first_interview", "first_match"] as const;

async function rollFunnelForCohortDay(dateStr: string) {
  const { start, end } = dayRange(dateStr);
  const cohort = await db.select({ id: users.id, createdAt: users.createdAt }).from(users).where(and(gte(users.createdAt, start), lt(users.createdAt, end)));
  if (cohort.length === 0) {
    for (const s of FUNNEL_STAGES) await upsert(dateStr, `funnel.${s}`, 0);
    await upsert(dateStr, "activation.d1_pct", 0);
    return;
  }
  const ids = cohort.map((c) => c.id);
  await upsert(dateStr, "funnel.signup", ids.length);

  const [basics, soulAns, twin, firstIv, firstMatch] = await Promise.all([
    db.select({ n: count() }).from(profiles).where(and(inArray(profiles.userId, ids), isNotNull(profiles.gender))),
    db.selectDistinct({ userId: userAnswers.userId }).from(userAnswers).where(inArray(userAnswers.userId, ids)),
    db.select({ n: count() }).from(profiles).where(and(inArray(profiles.userId, ids), isNotNull(profiles.twinPersona))),
    db.selectDistinct({ userId: interviews.requesterId }).from(interviews).where(inArray(interviews.requesterId, ids)),
    db.selectDistinct({ userId: matches.user1Id }).from(matches).where(and(inArray(matches.user1Id, ids), eq(matches.status, "matched"))),
  ]);
  await upsert(dateStr, "funnel.basics_complete", Number(basics[0]?.n ?? 0));
  await upsert(dateStr, "funnel.soul_answer", soulAns.length);
  await upsert(dateStr, "funnel.twin_generated", Number(twin[0]?.n ?? 0));
  await upsert(dateStr, "funnel.first_interview", firstIv.length);
  await upsert(dateStr, "funnel.first_match", firstMatch.length);

  // Activation: % of the cohort with a twin (twinPersona set) within 24h of
  // signup. Uses profiles.createdAt as a proxy for "twin generated at" since
  // there's no dedicated timestamp for it.
  const within24h = await db
    .select({ n: count() })
    .from(profiles)
    .where(and(inArray(profiles.userId, ids), isNotNull(profiles.twinPersona), sql`${profiles.createdAt} < ${end}::timestamp + interval '1 day'`));
  await upsert(dateStr, "activation.d1_pct", Math.round((Number(within24h[0]?.n ?? 0) / ids.length) * 1000) / 10);
}

// ── retention (per signup-day cohort, any activity on day+N) ───────────
async function rollRetentionForCohortDay(dateStr: string) {
  const { start, end } = dayRange(dateStr);
  const cohort = await db.select({ id: users.id }).from(users).where(and(gte(users.createdAt, start), lt(users.createdAt, end)));
  const ids = cohort.map((c) => c.id);
  for (const [key, offset] of [["d1", 1], ["d7", 7], ["d30", 30]] as const) {
    const targetDate = new Date(start.getTime() + offset * 86400000);
    // Leave the row unset (never a fake 0) in either case where there's
    // nothing to measure: not enough time has passed yet, or nobody signed
    // up this day so there's no cohort/denominator at all. Previously an
    // empty cohort wrote an explicit 0 immediately, even for offsets still
    // in the future — the false zero this metric exists to avoid.
    if (targetDate > new Date()) continue;
    if (ids.length === 0) continue;
    const targetDateStr = targetDate.toISOString().slice(0, 10);
    const active = await db
      .selectDistinct({ userId: userActivityDaily.userId })
      .from(userActivityDaily)
      .where(and(inArray(userActivityDaily.userId, ids), eq(userActivityDaily.date, targetDateStr)));
    await upsert(dateStr, `retention.${key}_pct`, Math.round((active.length / ids.length) * 1000) / 10);
  }
}

// ── twin layer ───────────────────────────────────────────────────────
async function rollTwin(dateStr: string) {
  const { start, end } = dayRange(dateStr);
  const [started, completed] = await Promise.all([
    db.select({ n: count() }).from(interviews).where(and(gte(interviews.createdAt, start), lt(interviews.createdAt, end))),
    db.select({ n: count() }).from(interviews).where(and(gte(interviews.createdAt, start), lt(interviews.createdAt, end), eq(interviews.status, "completed"))),
  ]);
  const s = Number(started[0]?.n ?? 0);
  const c = Number(completed[0]?.n ?? 0);
  await upsert(dateStr, "twin.interviews_started", s);
  await upsert(dateStr, "twin.interviews_completed", c);
  await upsert(dateStr, "twin.interview_abandon_pct", s > 0 ? Math.round(((s - c) / s) * 1000) / 10 : 0);

  // Readiness distribution — twinQuestionsAnswered / 10, bucketed. Counts
  // only, as required (never a browsable list of who's in a bucket).
  const allProfiles = await db.select({ n: profiles.twinQuestionsAnswered }).from(profiles);
  const buckets = { "0_20": 0, "20_40": 0, "40_60": 0, "60_80": 0, "80_100": 0 };
  let sumPct = 0;
  for (const p of allProfiles) {
    const pct = Math.min(100, Math.round(((p.n ?? 0) / 10) * 100));
    sumPct += pct;
    if (pct < 20) buckets["0_20"]++;
    else if (pct < 40) buckets["20_40"]++;
    else if (pct < 60) buckets["40_60"]++;
    else if (pct < 80) buckets["60_80"]++;
    else buckets["80_100"]++;
  }
  for (const [k, v] of Object.entries(buckets)) await upsert(dateStr, `twin.readiness_bucket.${k}`, v);
  await upsert(dateStr, "twin.readiness_avg", allProfiles.length ? Math.round(sumPct / allProfiles.length) : 0);

  // Disclosure: how many users have opened ANY category, and per category —
  // counts only. jsonb aggregated in JS (fine at current scale; move to SQL
  // if profiles grows past ~100k).
  const disclosureRows = await db.select({ s: profiles.disclosureSettings }).from(profiles);
  let anyOpen = 0;
  const perCategory: Record<string, number> = Object.fromEntries(DISCLOSURE_CATEGORY_KEYS.map((k) => [k, 0]));
  for (const row of disclosureRows) {
    const s = row.s as Record<string, string> | null;
    if (!s) continue;
    let hasAny = false;
    for (const key of DISCLOSURE_CATEGORY_KEYS) {
      if (s[key] && s[key] !== "closed") {
        perCategory[key]++;
        hasAny = true;
      }
    }
    if (hasAny) anyOpen++;
  }
  await upsert(dateStr, "twin.disclosure_open_count", anyOpen);
  for (const [k, v] of Object.entries(perCategory)) await upsert(dateStr, `twin.disclosure_open.${k}`, v);
}

// ── matching ─────────────────────────────────────────────────────────
async function rollMatching(dateStr: string) {
  const { start, end } = dayRange(dateStr);
  const [likesRow] = await db.select({ total: sum(dailyLikeCounts.count) }).from(dailyLikeCounts).where(eq(dailyLikeCounts.date, dateStr));
  await upsert(dateStr, "match.likes_sent", Number(likesRow?.total ?? 0));

  const asks = await db.select({ id: matches.id, status: matches.status }).from(matches).where(and(gte(matches.createdAt, start), lt(matches.createdAt, end)));
  await upsert(dateStr, "match.asks", asks.length);
  const mutual = asks.filter((a) => a.status === "matched").length;
  await upsert(dateStr, "match.mutual_matches_of_cohort", mutual);
  await upsert(dateStr, "match.ask_to_match_pct", asks.length ? Math.round((mutual / asks.length) * 1000) / 10 : 0);

  // Whether the resonance model is wired to real matches at all — see
  // resonance.ts: there's no real pairwise score for organic users today, so
  // this is expected to read near 0%. That answer is itself the useful
  // signal; a fabricated distribution would not be.
  const [scored] = await db.select({ n: count() }).from(matches).where(isNotNull(matches.compatibilityScore));
  const [totalMatches] = await db.select({ n: count() }).from(matches);
  await upsert(dateStr, "match.resonance_scored_pct", Number(totalMatches?.n ?? 0) ? Math.round((Number(scored?.n ?? 0) / Number(totalMatches!.n)) * 1000) / 10 : 0);

  // % of users signed up >=14d ago with zero matches ever.
  const cutoff = new Date(Date.now() - 14 * 86400000);
  const oldUsers = await db.select({ id: users.id }).from(users).where(lt(users.createdAt, cutoff));
  if (oldUsers.length) {
    const oldIds = oldUsers.map((u) => u.id);
    const withMatch = await db
      .selectDistinct({ userId: matches.user1Id })
      .from(matches)
      .where(and(inArray(matches.user1Id, oldIds), eq(matches.status, "matched")));
    const withMatch2 = await db
      .selectDistinct({ userId: matches.user2Id })
      .from(matches)
      .where(and(inArray(matches.user2Id, oldIds), eq(matches.status, "matched")));
    const haveMatch = new Set([...withMatch.map((r) => r.userId), ...withMatch2.map((r) => r.userId)]);
    const zeroPct = Math.round(((oldIds.length - haveMatch.size) / oldIds.length) * 1000) / 10;
    await upsert(dateStr, "match.zero_matches_14d_pct", zeroPct);
  } else {
    await upsert(dateStr, "match.zero_matches_14d_pct", 0);
  }
}

// ── money ────────────────────────────────────────────────────────────
async function rollMoney(dateStr: string) {
  const activeSubs = await db.select({ tier: subscriptions.tier }).from(subscriptions).where(eq(subscriptions.status, "active"));
  let mrrCents = 0;
  const byTier: Record<string, number> = { spark: 0, flame: 0, ember: 0 };
  for (const s of activeSubs) {
    const tier = s.tier as keyof typeof LIMITS;
    if (LIMITS[tier]) {
      mrrCents += LIMITS[tier].priceCents;
      byTier[tier] = (byTier[tier] ?? 0) + 1;
    }
  }
  await upsert(dateStr, "money.mrr_usd", Math.round(mrrCents) / 100);
  const [totalUsers] = await db.select({ n: count() }).from(users);
  await upsert(dateStr, "money.arpu_usd", Number(totalUsers?.n ?? 0) ? Math.round((mrrCents / Number(totalUsers!.n))) / 100 : 0);
  for (const [tier, n] of Object.entries(byTier)) await upsert(dateStr, `money.paid_subscribers.${tier}`, n);

  const { start, end } = dayRange(dateStr);
  const dayPayments = await db.select().from(payments).where(and(gte(payments.createdAt, start), lt(payments.createdAt, end)));
  await upsert(dateStr, "money.revenue_usd", Math.round(dayPayments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0)) / 100);
  await upsert(dateStr, "money.failed_payments", dayPayments.filter((p) => p.status === "failed").length);

  const byMethod: Record<string, { paid: number; total: number }> = {};
  for (const p of dayPayments) {
    const m = p.provider || "unknown";
    byMethod[m] ??= { paid: 0, total: 0 };
    byMethod[m].total++;
    if (p.status === "paid") byMethod[m].paid++;
  }
  for (const [method, v] of Object.entries(byMethod)) {
    await upsert(dateStr, `money.payment_success_pct.${method}`, v.total ? Math.round((v.paid / v.total) * 1000) / 10 : 0);
    // Raw counts alongside the percentage — the console's payment-success
    // chart stacks success/failure counts, which a percentage alone can't
    // reconstruct (no denominator).
    await upsert(dateStr, `money.payment_count.${method}`, v.total);
    await upsert(dateStr, `money.payment_success_count.${method}`, v.paid);
  }

  // Conversion by gate: of payments that succeeded today, which sourceFeature
  // (the paywall screen they came from) preceded it.
  const byFeature: Record<string, number> = {};
  for (const p of dayPayments) {
    if (p.status !== "paid") continue;
    const f = p.sourceFeature || "(none / cold visit to plans)";
    byFeature[f] = (byFeature[f] ?? 0) + 1;
  }
  for (const [feature, n] of Object.entries(byFeature)) {
    await upsert(dateStr, `money.conversion_by_gate.${feature.replace(/[^a-z0-9_]/gi, "_")}`, n);
  }

  // Involuntary churn: subscriptions that lapsed today (currentPeriodEnd
  // passed, not cancelAtPeriodEnd — i.e. a renewal that should have happened
  // and didn't) vs voluntary (cancelAtPeriodEnd was set).
  const lapsedToday = await db
    .select({ cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd })
    .from(subscriptions)
    .where(and(isNotNull(subscriptions.currentPeriodEnd), gte(subscriptions.currentPeriodEnd, start), lt(subscriptions.currentPeriodEnd, end)));
  const voluntary = lapsedToday.filter((s) => s.cancelAtPeriodEnd).length;
  const involuntary = lapsedToday.length - voluntary;
  await upsert(dateStr, "money.churn_voluntary", voluntary);
  await upsert(dateStr, "money.churn_involuntary", involuntary);
}

// ── proximity + events ───────────────────────────────────────────────
async function rollProximity(dateStr: string) {
  const { start, end } = dayRange(dateStr);
  const dayAlerts = await db.select().from(proximityAlerts).where(and(gte(proximityAlerts.createdAt, start), lt(proximityAlerts.createdAt, end)));
  await upsert(dateStr, "proximity.alerts_fired", dayAlerts.length);
  await upsert(dateStr, "proximity.alerts_dismissed", dayAlerts.filter((a) => a.dismissedAt).length);
  await upsert(dateStr, "proximity.alerts_seen", dayAlerts.filter((a) => a.seenAt).length);

  // Free -> paid: of recipients who got a free-tier alert today, what % are
  // on a paid tier as of rollup time. A cohort proxy, not strict causal
  // attribution to that one alert — the only honest claim the data supports.
  const freeAlertRecipients = Array.from(new Set(dayAlerts.filter((a) => a.tierAtSend === "free").map((a) => a.recipientId)));
  if (freeAlertRecipients.length) {
    const nowPaid = await db
      .select({ id: profiles.userId })
      .from(profiles)
      .where(and(inArray(profiles.userId, freeAlertRecipients), ne(profiles.subscriptionTier, "free")));
    await upsert(dateStr, "proximity.free_to_paid_pct", Math.round((nowPaid.length / freeAlertRecipients.length) * 1000) / 10);
  } else {
    await upsert(dateStr, "proximity.free_to_paid_pct", 0);
  }
}

async function rollEvents(dateStr: string) {
  const { start, end } = dayRange(dateStr);
  const [created, published] = await Promise.all([
    db.select({ n: count() }).from(events).where(and(gte(events.createdAt, start), lt(events.createdAt, end))),
    db.select({ n: count() }).from(events).where(and(gte(events.createdAt, start), lt(events.createdAt, end), eq(events.status, "published"))),
  ]);
  await upsert(dateStr, "events.created", Number(created[0]?.n ?? 0));
  await upsert(dateStr, "events.published", Number(published[0]?.n ?? 0));
  const [attended] = await db
    .select({ n: count() })
    .from(eventAttendees)
    .where(and(gte(eventAttendees.createdAt, start), lt(eventAttendees.createdAt, end), eq(eventAttendees.status, "going")));
  await upsert(dateStr, "events.rsvps_going", Number(attended?.n ?? 0));
  // No-show rate: not buildable — eventAttendees has no day-of check-in field.
}

// ── moderation + LLM cost ────────────────────────────────────────────
async function rollModeration(dateStr: string) {
  const openNow = await db.select({ n: count() }).from(reports).where(inArray(reports.status, ["open", "investigating"]));
  await upsert(dateStr, "moderation.open_reports", Number(openNow[0]?.n ?? 0));

  // Snapshots (as-of-rollup-time, like open_reports above) — exist purely so
  // the Overview screen can say "was N yesterday" against today's live count,
  // rather than a bare, contextless zero.
  const investigatingNow = await db.select({ n: count() }).from(reports).where(eq(reports.status, "investigating"));
  await upsert(dateStr, "moderation.investigating_reports", Number(investigatingNow[0]?.n ?? 0));
  const safetyNow = await db
    .select({ n: count() })
    .from(reports)
    .where(and(inArray(reports.category, SAFETY_CATEGORIES as unknown as string[]), inArray(reports.status, ["open", "investigating"])));
  await upsert(dateStr, "moderation.safety_reports_open", Number(safetyNow[0]?.n ?? 0));
  const feedbackOpenNow = await db.select({ n: count() }).from(feedback).where(eq(feedback.status, "open"));
  await upsert(dateStr, "moderation.open_feedback", Number(feedbackOpenNow[0]?.n ?? 0));

  const { start, end } = dayRange(dateStr);
  const [actionsToday] = await db.select({ n: count() }).from(moderationActions).where(and(gte(moderationActions.createdAt, start), lt(moderationActions.createdAt, end)));
  await upsert(dateStr, "moderation.actions_taken", Number(actionsToday?.n ?? 0));

  const resolvedToday = await db
    .select({ createdAt: reports.createdAt, resolvedAt: reports.resolvedAt })
    .from(reports)
    .where(and(isNotNull(reports.resolvedAt), gte(reports.resolvedAt, start), lt(reports.resolvedAt, end)));
  if (resolvedToday.length) {
    const hours = resolvedToday.map((r) => (r.resolvedAt!.getTime() - r.createdAt!.getTime()) / 3600000).sort((a, b) => a - b);
    const median = hours[Math.floor(hours.length / 2)];
    await upsert(dateStr, "moderation.median_resolution_hours", Math.round(median * 10) / 10);
  }
}

async function rollLlmCost(dateStr: string) {
  const { start, end } = dayRange(dateStr);
  const [row] = await db.select({ total: sum(llmCallLog.costUsd) }).from(llmCallLog).where(and(gte(llmCallLog.createdAt, start), lt(llmCallLog.createdAt, end)));
  await upsert(dateStr, "llm.cost_usd_estimated", Number(row?.total ?? 0));
  const [activeUsers] = await db.select({ n: count() }).from(userActivityDaily).where(eq(userActivityDaily.date, dateStr));
  const n = Number(activeUsers?.n ?? 0);
  await upsert(dateStr, "llm.cost_per_active_user_usd_estimated", n ? Math.round((Number(row?.total ?? 0) / n) * 10000) / 10000 : 0);
}

/** Compute every metric for one date. Called for "yesterday" nightly, and for
 *  the trailing 30 days (funnel/retention improve as cohorts age) on boot. */
export async function computeDailyMetrics(dateStr: string): Promise<void> {
  await rollGrowth(dateStr);
  await rollFunnelForCohortDay(dateStr);
  await rollRetentionForCohortDay(dateStr);
  await rollTwin(dateStr);
  await rollMatching(dateStr);
  await rollMoney(dateStr);
  await rollProximity(dateStr);
  await rollEvents(dateStr);
  await rollModeration(dateStr);
  await rollLlmCost(dateStr);
}

export async function runNightlyRollup(): Promise<void> {
  await computeDailyMetrics(isoDaysAgo(1));
}

/** Boot-time catch-up: recompute the trailing N days so funnel/retention/DAU
 *  aren't blank the first time the console is opened after this ships. */
export async function backfillRecentMetrics(days = 30): Promise<void> {
  for (let i = 1; i <= days; i++) {
    await computeDailyMetrics(isoDaysAgo(i)).catch((e) => console.error(`[metrics] backfill ${isoDaysAgo(i)} failed:`, e));
  }
  // Today too, partial as it is — better than a blank overview all day.
  await computeDailyMetrics(isoDaysAgo(0)).catch((e) => console.error("[metrics] backfill today failed:", e));
}
