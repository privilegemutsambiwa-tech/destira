// Twin event alerts: when a freshly-published event scores at or above a
// user's notifyThreshold — using the SAME resonance-free scorer the feed uses
// (scoreEventForUser, no attendee data) — their twin sends them ONE chat
// message about it. The point is that it must never nag:
//
//   a. one alert per (user, event), ever   (unique index is the race backstop)
//   b. at most one alert to a user per 24h
//   c. at most three alerts to a user per rolling 7 days
//   d. nothing between 21:00 and 08:00 local (UTC+2 for every current suburb;
//      no deferred queue — the next qualifying publish re-evaluates)
//
// evaluateGates() is the whole dedupe decision as a pure function so
// scripts/assert-twin-alerts.ts can check each gate in isolation.

import { db } from "../db";
import {
  events,
  eventPreferences,
  twinAlertLog,
  twinMemory,
  twinNotifications,
  type Event,
} from "@shared/schema";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import { scoreEventForUser } from "../events-fit";
import { buildContext } from "../events-feed";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_UTC_OFFSET_HOURS = 2; // Zimbabwe (CAT) — every seeded suburb
const WEEKLY_CAP = 3;
const MAX_SENDS_PER_RUN = 200;

export function localHourFor(now: Date, offsetHours = DEFAULT_UTC_OFFSET_HOURS): number {
  return (((now.getUTCHours() + offsetHours) % 24) + 24) % 24;
}

export interface GateState {
  everSentForEvent: boolean;
  msSinceLastAlert: number | null; // null = never alerted
  alertsInLast7d: number;
  localHour: number;
}

export function evaluateGates(s: GateState): { send: boolean; blockedBy: string | null } {
  if (s.everSentForEvent) return { send: false, blockedBy: "already-sent-for-event" };
  if (s.msSinceLastAlert != null && s.msSinceLastAlert < DAY_MS) return { send: false, blockedBy: "within-24h" };
  if (s.alertsInLast7d >= WEEKLY_CAP) return { send: false, blockedBy: "weekly-cap" };
  if (s.localHour >= 21 || s.localHour < 8) return { send: false, blockedBy: "quiet-hours" };
  return { send: true, blockedBy: null };
}

// Deterministic per (user, event) so re-runs pick the same voice.
export function templateIndex(userId: string, eventId: number): number {
  let sum = 0;
  for (let i = 0; i < userId.length; i++) sum = (sum + userId.charCodeAt(i)) % 997;
  return (sum + eventId) % 4;
}

function relativeWhen(startsAt: Date, now: Date): string {
  const days = Math.round((startsAt.getTime() - now.getTime()) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return startsAt.toLocaleDateString("en-US", { weekday: "long" });
  return `on ${startsAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

type TemplateEvent = Pick<Event, "title" | "suburb" | "city" | "kind" | "startsAt">;

export function renderTemplate(variant: number, event: TemplateEvent, now = new Date()): string {
  const where = event.suburb || event.city || "nearby";
  const when = relativeWhen(event.startsAt, now);
  const kind = event.kind ?? "something";
  switch (((variant % 4) + 4) % 4) {
    case 0:
      return `Something just went up that reads like you — "${event.title}", ${where}, ${when}. Worth a look.`;
    case 1:
      return `New ${kind} thing on the calendar I'd have picked for you: "${event.title}", ${when} in ${where}.`;
    case 2:
      return `"${event.title}" (${kind}, ${where}) lines up closely with what you've told me you want out of a night. It's ${when}.`;
    default:
      return `You keep coming back to ${kind}. "${event.title}" in ${where} ${when} is close to the mark.`;
  }
}

export async function runTwinEventAlerts(eventId: number): Promise<{ sent: number; considered: number }> {
  if (process.env.EVENT_ALERTS_ENABLED === "0") return { sent: 0, considered: 0 };

  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event || event.status !== "published") return { sent: 0, considered: 0 };
  if (event.startsAt.getTime() <= Date.now()) return { sent: 0, considered: 0 };

  const prefRows = await db
    .select()
    .from(eventPreferences)
    .where(eq(eventPreferences.notifyOnGoodMatch, true));

  const now = new Date();
  const hour = localHourFor(now);
  let sent = 0;
  let considered = 0;

  for (const prefs of prefRows) {
    if (sent >= MAX_SENDS_PER_RUN) break;
    if (prefs.userId === event.hostUserId || prefs.userId === event.createdByUserId) continue;

    const ctx = await buildContext(prefs.userId);
    const r = scoreEventForUser(event, prefs, ctx);
    if (!r.pass || r.score < (prefs.notifyThreshold ?? 82)) continue;
    considered += 1;

    const [everRow] = await db
      .select({ id: twinAlertLog.id })
      .from(twinAlertLog)
      .where(and(eq(twinAlertLog.userId, prefs.userId), eq(twinAlertLog.eventId, eventId)))
      .limit(1);

    const recent = await db
      .select({ id: twinAlertLog.id })
      .from(twinAlertLog)
      .where(and(eq(twinAlertLog.userId, prefs.userId), gte(twinAlertLog.sentAt, new Date(now.getTime() - DAY_MS))))
      .limit(1);

    const [{ c: weekCount }] = await db
      .select({ c: count() })
      .from(twinAlertLog)
      .where(and(eq(twinAlertLog.userId, prefs.userId), gte(twinAlertLog.sentAt, new Date(now.getTime() - 7 * DAY_MS))));

    const gate = evaluateGates({
      everSentForEvent: !!everRow,
      msSinceLastAlert: recent.length > 0 ? 0 : null,
      alertsInLast7d: Number(weekCount),
      localHour: hour,
    });
    if (!gate.send) continue;

    const variant = templateIndex(prefs.userId, eventId);
    const claimed = await db
      .insert(twinAlertLog)
      .values({ userId: prefs.userId, eventId, fitScore: r.score, template: `v${variant}` })
      .onConflictDoNothing()
      .returning({ id: twinAlertLog.id });
    if (claimed.length === 0) continue; // lost the race

    const message = renderTemplate(variant, event, now);
    await db.insert(twinMemory).values({
      userId: prefs.userId,
      message,
      role: "assistant",
      useForTraining: false,
    });
    await db.insert(twinNotifications).values({
      userId: prefs.userId,
      type: "twin_event_flag",
      title: "Your twin flagged an event",
      body: message,
    });
    sent += 1;
  }

  if (sent > 0) console.log(`[twin-alerts] event ${eventId}: ${sent}/${considered} sent`);
  return { sent, considered };
}
