// The moments that bring someone back, each once and each behind its own
// switch (docs/destira-3-upgrade-prompt.md Part I). All of them go through
// server/push.ts, so the daily budget, quiet hours and digests apply.
//   - unread message: once, when a message has waited 2 hours
//   - event tomorrow, and event in 2 hours, for everyone going
//   - someone you liked just said they're going to an event you're going to
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "./db";
import { blockedUsers, eventAttendees, events, matches, profiles } from "@shared/schema";
import { notify, sendCategorizedPush } from "./push";

const rows = (r: any) => (r?.rows ?? r ?? []) as any[];
const firstName = (n: string | null | undefined) => (n || "Someone").trim().split(/\s+/)[0] || "Someone";

async function blockedEitherWay(a: string, b: string): Promise<boolean> {
  const [r] = await db.select({ id: blockedUsers.id }).from(blockedUsers).where(or(
    and(eq(blockedUsers.blockerId, a), eq(blockedUsers.blockedId, b)),
    and(eq(blockedUsers.blockerId, b), eq(blockedUsers.blockedId, a)),
  )).limit(1);
  return !!r;
}

/**
 * The newest message in each live chat: when it has sat unread for 2 hours
 * (and less than a day), its recipient gets one reminder. Never a second one
 * for the same message.
 */
export async function runUnreadReminders(): Promise<number> {
  const due = rows(await db.execute(sql`
    select * from (
      select distinct on (dm.match_id)
        dm.id, dm.match_id, dm.sender_id, dm.unsent_at, m.user1_id, m.user2_id,
        dm.created_at <= now() - interval '2 hours' as old_enough,
        case when dm.sender_id = m.user1_id
          then coalesce(m.user2_last_read_at, 'epoch'::timestamp) >= dm.created_at
          else coalesce(m.user1_last_read_at, 'epoch'::timestamp) >= dm.created_at end as seen,
        case when dm.sender_id = m.user1_id then m.user2_deleted_chat else m.user1_deleted_chat end as gone
      from direct_messages dm
      join matches m on m.id = dm.match_id
      where m.status = 'matched' and dm.created_at > now() - interval '24 hours'
      order by dm.match_id, dm.created_at desc, dm.id desc
    ) latest
    where old_enough and not seen and unsent_at is null and coalesce(gone, false) = false
  `));
  let sent = 0;
  for (const r of due) {
    const to = r.sender_id === r.user1_id ? r.user2_id : r.user1_id;
    if (await blockedEitherWay(to, r.sender_id)) continue;
    const [p] = await db.select({ name: profiles.displayName }).from(profiles).where(eq(profiles.userId, r.sender_id));
    const outcome = await sendCategorizedPush(to, "unread", {
      title: `${firstName(p?.name)} is waiting on your reply`,
      body: "Their message has been there a couple of hours.",
      url: `/chat/${r.match_id}`,
      tag: `dm-${r.match_id}`,
    }, { dedupeKey: `unread-${r.id}` });
    if (outcome === "sent") sent++;
  }
  return sent;
}

const harareTime = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Harare" });

/**
 * For everyone going: the day before (20 to 28 hours out) and 2 hours before
 * (90 to 150 minutes out). An event created inside a window simply gets the
 * later reminder.
 */
export async function runEventReminders(): Promise<number> {
  const soon = rows(await db.execute(sql`
    select id, title, starts_at,
      case when starts_at > now() + interval '20 hours' then 'day' else '2h' end as which
    from events
    where status = 'published'
      and ((starts_at > now() + interval '20 hours' and starts_at <= now() + interval '28 hours')
        or (starts_at > now() + interval '90 minutes' and starts_at <= now() + interval '150 minutes'))
  `));
  let sent = 0;
  for (const e of soon) {
    const startsAt = new Date(e.starts_at);
    const going = await db.select({ userId: eventAttendees.userId }).from(eventAttendees)
      .where(and(eq(eventAttendees.eventId, e.id), eq(eventAttendees.status, "going")));
    for (const { userId } of going) {
      const day = e.which === "day";
      const outcome = await notify(userId, "event_reminders", {
        type: "event_reminder",
        title: day ? `Tomorrow: ${e.title}` : `In 2 hours: ${e.title}`,
        body: day
          ? `Starts at ${harareTime(startsAt)}. The details and the chat are on the event page.`
          : `Starts at ${harareTime(startsAt)}. Tap for the place and who's going.`,
        url: `/events/${e.id}`,
        tag: `event-reminder-${e.id}`,
      }, { dedupeKey: `event-${e.which}-${e.id}` });
      if (outcome === "sent") sent++;
    }
  }
  return sent;
}

/**
 * Someone just said they're going: anyone already going who liked them hears
 * about it, by name (they can see the guest list anyway). Once per pair per
 * event.
 */
export async function notifyLikersGoing(eventId: number, userId: string): Promise<number> {
  const [event] = await db.select({ title: events.title, status: events.status, startsAt: events.startsAt }).from(events).where(eq(events.id, eventId));
  if (!event || event.status !== "published" || event.startsAt <= new Date()) return 0;
  const likers = await db.select({ userId: matches.user1Id }).from(matches)
    .innerJoin(eventAttendees, and(eq(eventAttendees.userId, matches.user1Id), eq(eventAttendees.eventId, eventId), eq(eventAttendees.status, "going")))
    .where(and(eq(matches.user2Id, userId), ne(matches.user1Id, userId), inArray(matches.status, ["pending", "matched"])));
  if (!likers.length) return 0;
  const [me] = await db.select({ name: profiles.displayName }).from(profiles).where(eq(profiles.userId, userId));
  let n = 0;
  for (const l of likers) {
    if (await blockedEitherWay(l.userId, userId)) continue;
    const outcome = await notify(l.userId, "event_likes", {
      type: "event_like",
      title: `${firstName(me?.name)} is going to ${event.title} too`,
      body: "Someone you liked. Maybe say hi there?",
      url: `/events/${eventId}`,
      tag: `event-like-${eventId}`,
    }, { dedupeKey: `event-like-${eventId}-${userId}` });
    if (outcome !== "duplicate") n++;
  }
  return n;
}

let timer: NodeJS.Timeout | null = null;
/** Every 10 minutes. The windows above are wider than that, so nothing is missed. */
export function startReminderSweeps(): void {
  if (timer) return;
  const tick = async () => {
    await runUnreadReminders().catch((e) => console.error("[reminders] unread failed:", e));
    await runEventReminders().catch((e) => console.error("[reminders] events failed:", e));
  };
  setTimeout(tick, 2 * 60_000);
  timer = setInterval(tick, 10 * 60_000);
}
