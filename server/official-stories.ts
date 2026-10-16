// The official Destira status: every day, 2 or 3 stories from the Destira
// account, released through the day (morning, midday, evening, Harare time)
// and shown first in everyone's story row.
//
// Content comes from official_story_items, managed in the console:
//   1. anything scheduled for today, then
//   2. evergreen items in rotation, least recently shown first,
// skipping items tied to an event that's already past or called off.
// Each day's set is made once (official_story_days), whichever server
// instance gets there first; a day with nothing to show is retried later.
import { db } from "./db";
import { officialStoryItems, officialStoryDays, stories, storyMedia, storyViews, storyLikes, events, appSettings } from "@shared/schema";
import { and, asc, count, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { DESTIRA_SYSTEM_USER_ID, ensureDestiraSystemUser } from "./official-events";

const SETTINGS_KEY = "official_stories_per_day";
const SLOTS: Record<2 | 3, string[]> = { 2: ["08:00", "18:00"], 3: ["07:00", "12:30", "18:00"] };
const TZ_OFFSET = "+02:00"; // Harare, all year

export function harareDay(at = new Date()): string {
  return at.toLocaleDateString("en-CA", { timeZone: "Africa/Harare" });
}
const atHarare = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00${TZ_OFFSET}`);
function nextDay(day: string): string {
  const d = new Date(`${day}T12:00:00${TZ_OFFSET}`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function getPerDay(): Promise<2 | 3> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, SETTINGS_KEY));
  return row?.value === 2 ? 2 : 3;
}

export async function setPerDay(n: 2 | 3, adminUserId: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: SETTINGS_KEY, value: n, updatedBy: adminUserId })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: n, updatedBy: adminUserId, updatedAt: new Date() } });
}

type Item = typeof officialStoryItems.$inferSelect;

/** Today's picks, in release order. */
async function pickItems(day: string, count: number): Promise<Item[]> {
  const all = await db.select().from(officialStoryItems).where(eq(officialStoryItems.active, true));
  // An item about an event is only worth showing while the event is ahead.
  const eventIds = all.map((i) => i.eventId).filter((x): x is number => x != null);
  const live = new Set<number>();
  if (eventIds.length) {
    const rows = await db
      .select({ id: events.id, startsAt: events.startsAt, status: events.status })
      .from(events)
      .where(inArray(events.id, eventIds));
    for (const r of rows) if (r.status === "published" && r.startsAt > new Date()) live.add(r.id);
  }
  const usable = all.filter((i) => i.eventId == null || live.has(i.eventId));

  const scheduled = usable.filter((i) => i.scheduledFor === day).sort((a, b) => a.id - b.id);
  const taken = new Set(scheduled.map((i) => i.id));
  const rotation = usable
    .filter((i) => i.evergreen && !taken.has(i.id))
    .sort(
      (a, b) =>
        (a.lastShownOn ?? "").localeCompare(b.lastShownOn ?? "") ||
        a.timesShown - b.timesShown ||
        a.id - b.id,
    );
  return [...scheduled, ...rotation].slice(0, count);
}

let ensuredDay: string | null = null;

/** Makes today's official stories if they don't exist yet. Cheap to call
 *  often: after the first success it's a string compare until midnight. */
export async function ensureTodaysOfficialStories(now = new Date()): Promise<number> {
  const day = harareDay(now);
  if (ensuredDay === day) return 0;
  const [done] = await db.select().from(officialStoryDays).where(eq(officialStoryDays.day, day));
  if (done) {
    ensuredDay = day;
    return 0;
  }
  const perDay = await getPerDay();
  const items = await pickItems(day, perDay);
  if (!items.length) return 0; // nothing in the library yet: try again later

  // Claim the day first, so two instances never both make a set.
  const [claimed] = await db.insert(officialStoryDays).values({ day }).onConflictDoNothing().returning();
  if (!claimed) {
    ensuredDay = day;
    return 0;
  }
  await ensureDestiraSystemUser();
  const slots = SLOTS[perDay];
  const expiresAt = atHarare(nextDay(day), "06:30");
  const ids: number[] = [];
  for (const [i, item] of items.entries()) {
    const [story] = await db
      .insert(stories)
      .values({
        userId: DESTIRA_SYSTEM_USER_ID,
        expiresAt,
        publishAt: atHarare(day, slots.at(i) ?? slots.at(-1)!),
        officialItemId: item.id,
      })
      .returning();
    await db.insert(storyMedia).values({
      storyId: story.id,
      type: item.mediaType,
      url: item.mediaUrl,
      caption: item.caption,
      eventId: item.eventId,
      ctaLabel: item.ctaLabel,
      ctaUrl: item.ctaUrl,
      durationSec: item.durationSec,
    });
    await db
      .update(officialStoryItems)
      .set({ timesShown: sql`${officialStoryItems.timesShown} + 1`, lastShownOn: day })
      .where(eq(officialStoryItems.id, item.id));
    ids.push(story.id);
  }
  await db.update(officialStoryDays).set({ storyIds: ids }).where(eq(officialStoryDays.day, day));
  ensuredDay = day;
  return ids.length;
}

/** Console: throw away today's set and make it again from the library now
 *  (after uploading something new, or changing the per-day count). */
export async function rebuildToday(now = new Date()): Promise<number> {
  const day = harareDay(now);
  const from = atHarare(day, "00:00");
  const to = atHarare(nextDay(day), "00:00");
  const today = await db
    .select({ id: stories.id })
    .from(stories)
    .where(
      and(
        eq(stories.userId, DESTIRA_SYSTEM_USER_ID),
        isNotNull(stories.officialItemId),
        gte(stories.publishAt, from),
        lt(stories.publishAt, to),
      ),
    );
  if (today.length) {
    // Likes, views and media go with them (ON DELETE CASCADE).
    await db.delete(stories).where(inArray(stories.id, today.map((s) => s.id)));
  }
  await db.delete(officialStoryDays).where(eq(officialStoryDays.day, day));
  ensuredDay = null;
  return ensureTodaysOfficialStories(now);
}

/** Console: today's official stories with how they're doing. */
export async function todaysOfficialStories(now = new Date()) {
  const day = harareDay(now);
  const from = atHarare(day, "00:00");
  const to = atHarare(nextDay(day), "00:00");
  const rows = await db
    .select({ id: stories.id, publishAt: stories.publishAt, itemId: stories.officialItemId })
    .from(stories)
    .where(and(eq(stories.userId, DESTIRA_SYSTEM_USER_ID), gte(stories.publishAt, from), lt(stories.publishAt, to)))
    .orderBy(asc(stories.publishAt));
  const out = [];
  for (const r of rows) {
    const [[views], [likes]] = await Promise.all([
      db.select({ n: count() }).from(storyViews).where(eq(storyViews.storyId, r.id)),
      db.select({ n: count() }).from(storyLikes).where(eq(storyLikes.storyId, r.id)),
    ]);
    out.push({ storyId: r.id, itemId: r.itemId, publishAt: r.publishAt.toISOString(), views: Number(views?.n ?? 0), likes: Number(likes?.n ?? 0) });
  }
  return { day, stories: out };
}

export function startOfficialStoriesSweep() {
  const run = () =>
    ensureTodaysOfficialStories()
      .then((n) => {
        if (n) console.log(`[official-stories] made ${n} for ${harareDay()}`);
      })
      .catch((e) => console.error("[official-stories] sweep failed:", e));
  setTimeout(run, 25_000);
  setInterval(run, 10 * 60 * 1000);
}
