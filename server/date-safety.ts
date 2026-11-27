// Date safety kit (docs/destira-3-upgrade-prompt.md Part B6). A member turns
// on "Check on me" for a confirmed date; an hour after the agreed time they
// get "All good?" and answer I'm fine or Get help (pages/DateSafetyCheck.tsx).
// Private: the other person never sees any of it. The trusted contact's
// number stays on the member's phone; Destira only keeps on/off and the answer.
import type { Express } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import * as push from "./push";
import { dateSafetyChecks, datePlans } from "@shared/schema";
import { presentPlan } from "./dates";
import { SAFETY_ANSWERS, SAFETY_CHECK_WINDOW_MS, safetyCheckAt, safetyDue, type SafetyAnswer, type SafetyCheckView } from "@shared/date-safety";

const rows = (r: any) => (r?.rows ?? r ?? []) as any[];

export async function ensureDateSafetyTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS date_safety_checks (
      id serial PRIMARY KEY,
      plan_id integer NOT NULL,
      user_id varchar NOT NULL,
      check_at timestamp NOT NULL,
      pushed_at timestamp,
      answer text,
      answered_at timestamp,
      created_at timestamp NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS date_safety_plan_user_idx ON date_safety_checks (plan_id, user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS date_safety_due_idx ON date_safety_checks (check_at)`);
}

/** The plan, if this member is one of the two people in its match. */
async function planFor(planId: number, userId: string) {
  if (!Number.isFinite(planId)) return null;
  const [p] = await db.select().from(datePlans).where(eq(datePlans.id, planId));
  if (!p) return null;
  const m = await storage.getMatch(p.matchId);
  if (!m || (m.user1Id !== userId && m.user2Id !== userId)) return null;
  const otherId = m.user1Id === userId ? m.user2Id : m.user1Id;
  return { p, otherId };
}

async function viewOf(planId: number, userId: string): Promise<SafetyCheckView> {
  const [c] = await db.select().from(dateSafetyChecks).where(and(eq(dateSafetyChecks.planId, planId), eq(dateSafetyChecks.userId, userId)));
  return {
    planId,
    on: !!c,
    checkAt: c ? c.checkAt.toISOString() : null,
    answer: (c?.answer as SafetyAnswer) ?? null,
    due: c ? safetyDue(c.checkAt, c.answer) : false,
  };
}

/** "All good?" to everyone whose check-in time has come. Claimed row by row,
 *  so a restart or a second server never asks twice. */
export async function runSafetyChecks(now = new Date()): Promise<number> {
  const due = rows(await db.execute(sql`
    select c.id, c.user_id, c.plan_id
    from date_safety_checks c join date_plans dp on dp.id = c.plan_id
    where c.pushed_at is null and c.answer is null
      and c.check_at <= ${now}
      and c.check_at > ${new Date(now.getTime() - SAFETY_CHECK_WINDOW_MS)}
      and dp.status = 'confirmed'
    limit 200
  `));
  let sent = 0;
  for (const r of due) {
    const claimed = await db.update(dateSafetyChecks).set({ pushedAt: sql`now()` })
      .where(and(eq(dateSafetyChecks.id, r.id), isNull(dateSafetyChecks.pushedAt))).returning({ id: dateSafetyChecks.id });
    if (claimed.length === 0) continue;
    // Not a categorised push: a safety check-in is never held or batched.
    await push.sendPush(r.user_id, {
      title: "All good?",
      body: "You asked us to check on you. Tap I'm fine, or Get help.",
      url: `/date-check/${r.plan_id}`,
      tag: `date-safety-${r.plan_id}`,
    });
    await storage.createNotification(r.user_id, "safety", "All good?", "You asked us to check on you during your date.", `/date-check/${r.plan_id}`).catch(() => {});
    sent++;
  }
  return sent;
}

let started = false;
export function startSafetyCheckSweep() {
  if (started) return;
  started = true;
  const tick = () => runSafetyChecks()
    .then((n) => n > 0 && console.log(`[date-safety] ${n} check-in(s) sent`))
    .catch((e) => console.error("[date-safety] sweep failed:", e));
  // Every minute: an hour in means an hour in, not whenever an hourly job runs.
  setTimeout(tick, 20_000);
  setInterval(tick, 60_000);
}

export function registerDateSafetyRoutes(app: Express, getUserId: (req: any) => string | null) {
  // This member's check-in for a date, with the date itself for the check page.
  app.get("/api/dates/plan/:id/safety", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const found = await planFor(parseInt(req.params.id), userId);
      if (!found) return res.sendStatus(404);
      const other = await storage.getProfile(found.otherId);
      res.setHeader("Cache-Control", "no-store");
      res.json({ ...(await viewOf(found.p.id, userId)), plan: presentPlan(found.p), otherName: other?.displayName || "your date" });
    } catch (e) {
      res.status(500).json({ message: "Couldn't load" });
    }
  });

  // Turn "Check on me" on or off. Only for a confirmed date that hasn't started.
  app.post("/api/dates/plan/:id/safety", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const on = req.body?.on === true;
    try {
      const found = await planFor(parseInt(req.params.id), userId);
      if (!found) return res.sendStatus(404);
      const { p } = found;
      if (p.status !== "confirmed" || !p.startsAt) return res.status(409).json({ message: "Only for a confirmed date" });
      if (on) {
        if (p.startsAt.getTime() <= Date.now()) return res.status(409).json({ message: "This date has already started" });
        const checkAt = safetyCheckAt(p.startsAt);
        await db.insert(dateSafetyChecks).values({ planId: p.id, userId, checkAt })
          .onConflictDoUpdate({ target: [dateSafetyChecks.planId, dateSafetyChecks.userId], set: { checkAt, pushedAt: null, answer: null, answeredAt: null } });
      } else {
        await db.delete(dateSafetyChecks).where(and(eq(dateSafetyChecks.planId, p.id), eq(dateSafetyChecks.userId, userId)));
      }
      res.json(await viewOf(p.id, userId));
    } catch (e) {
      res.status(500).json({ message: "Couldn't save that" });
    }
  });

  // I'm fine / Get help. Answerable from the check-in time on (earlier too,
  // if they open it early, so a member is never stuck without the button).
  app.post("/api/dates/plan/:id/safety/answer", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const answer = req.body?.answer as SafetyAnswer;
    if (!(SAFETY_ANSWERS as readonly string[]).includes(answer)) return res.status(400).json({ message: "Pick an answer" });
    try {
      const found = await planFor(parseInt(req.params.id), userId);
      if (!found) return res.sendStatus(404);
      const updated = await db.update(dateSafetyChecks).set({ answer, answeredAt: sql`now()`, pushedAt: sql`coalesce(pushed_at, now())` })
        .where(and(eq(dateSafetyChecks.planId, found.p.id), eq(dateSafetyChecks.userId, userId))).returning({ id: dateSafetyChecks.id });
      if (updated.length === 0) return res.status(409).json({ message: "Check on me isn't on for this date" });
      if (answer === "help") console.warn(`[date-safety] member asked for help on date plan ${found.p.id}`);
      res.json(await viewOf(found.p.id, userId));
    } catch (e) {
      res.status(500).json({ message: "Couldn't save that" });
    }
  });
}
