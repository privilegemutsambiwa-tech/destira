// Official events autopilot: keeps the calendar from ever being empty while
// members aren't yet hosting on their own. Every official-events sweep it
// checks how many official events are still ahead; below the target, it
// posts the next one from a rotating programme of simple Harare meetups at
// public places, a week or so out (official events need 72h notice, and the
// 48h headcount/lead rule in official-events.ts still applies to these).
//
// It steps back by itself once members host regularly: when enough
// member-hosted public events are coming up in the next two weeks, it posts
// nothing new. Settings live in app_settings and are changed from the
// console (Official events page).
import { db } from "./db";
import { appSettings, events } from "@shared/schema";
import { and, eq, gt, gte, lt, ne } from "drizzle-orm";
import { createOfficialEvent, DESTIRA_SYSTEM_USER_ID, type OfficialEventInput } from "./official-events";
import * as twinEventAlerts from "./services/twin-event-alerts";

const SETTINGS_KEY = "official_autopilot";
const HARARE_UTC_OFFSET = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Template extends Omit<OfficialEventInput, "startsAt" | "endsAt"> {
  /** 0 Sunday .. 6 Saturday, and the start time, Harare time. */
  weekday: number;
  hour: number;
  minute: number;
  hours: number;
}

const OWN_WAY = "Free to join. Pay for anything you order yourself.";

// Public, easy-to-find places; the lead confirms the exact spot in the event
// chat. Kept small and low-cost on purpose: the point is to meet people.
export const PROGRAMME: Template[] = [
  {
    title: "Saturday morning walk in Harare Gardens",
    description: `An easy walk round Harare Gardens, then coffee nearby for whoever wants it. Any pace, come on your own or bring a friend.\n\nMeet at the main entrance; the lead posts the exact spot in the event chat. ${OWN_WAY}`,
    kind: "outdoors",
    vibes: ["active", "outdoors", "early"],
    placeType: "outdoors",
    venueName: "Harare Gardens",
    suburb: "Harare CBD",
    city: "Harare",
    weekday: 6, hour: 7, minute: 30, hours: 2,
  },
  {
    title: "Board games afternoon in Avondale",
    description: `Card and board games for people who'd rather play than make small talk. Nobody needs to know the rules; someone always does.\n\nAt a café at Avondale Shopping Centre; the lead confirms which in the event chat. ${OWN_WAY}`,
    kind: "games",
    vibes: ["seated", "quiet"],
    placeType: "restaurant",
    venueName: "Avondale Shopping Centre",
    suburb: "Avondale",
    city: "Harare",
    weekday: 0, hour: 14, minute: 0, hours: 3,
    seatCount: 12,
  },
  {
    title: "Friday sundowner at Sam Levy's Village",
    description: `End the week with a drink and a few new faces. Small group, relaxed, no speeches.\n\nAt Sam Levy's Village in Borrowdale; the lead books a table and shares where in the event chat. ${OWN_WAY}`,
    kind: "food",
    vibes: ["seated", "late"],
    placeType: "restaurant",
    venueName: "Sam Levy's Village",
    suburb: "Borrowdale",
    city: "Harare",
    weekday: 5, hour: 17, minute: 30, hours: 2.5,
    seatCount: 12,
  },
  {
    title: "Sunday brunch and book swap in Chisipite",
    description: `Bring a book you've finished, leave with one you haven't, and talk about both over brunch. No book? Come anyway.\n\nAt a café at Chisipite shops; the lead confirms which in the event chat. ${OWN_WAY}`,
    kind: "books",
    vibes: ["seated", "quiet"],
    placeType: "restaurant",
    venueName: "Chisipite Shopping Centre",
    suburb: "Chisipite",
    city: "Harare",
    weekday: 0, hour: 10, minute: 0, hours: 2,
    seatCount: 10,
  },
];

export interface AutopilotSettings {
  enabled: boolean;
  /** Official events to keep ahead on the calendar. */
  keepAhead: number;
  /** Step back when at least this many member-hosted public events are coming up in the next 14 days. */
  memberEventsToStepBack: number;
  /** Which programme entry is posted next. */
  next: number;
}
const DEFAULTS: AutopilotSettings = { enabled: true, keepAhead: 2, memberEventsToStepBack: 4, next: 0 };

export async function getAutopilotSettings(): Promise<AutopilotSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, SETTINGS_KEY));
  const v = (row?.value ?? {}) as Partial<AutopilotSettings>;
  const int = (x: unknown, min: number, max: number, d: number) =>
    typeof x === "number" && Number.isFinite(x) ? Math.min(max, Math.max(min, Math.round(x))) : d;
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : DEFAULTS.enabled,
    keepAhead: int(v.keepAhead, 1, 4, DEFAULTS.keepAhead),
    memberEventsToStepBack: int(v.memberEventsToStepBack, 1, 50, DEFAULTS.memberEventsToStepBack),
    next: int(v.next, 0, PROGRAMME.length - 1, 0),
  };
}

export async function updateAutopilotSettings(patch: Partial<AutopilotSettings>, by: string | null): Promise<AutopilotSettings> {
  const current = await getAutopilotSettings();
  const value = { ...current, ...patch };
  await db
    .insert(appSettings)
    .values({ key: SETTINGS_KEY, value, updatedBy: by, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: by, updatedAt: new Date() } });
  return getAutopilotSettings();
}

/** The first `weekday` at hh:mm Harare time that's at least `minDaysAhead` days away. */
export function nextSlot(t: Pick<Template, "weekday" | "hour" | "minute">, now: Date, minDaysAhead: number): Date {
  const earliest = now.getTime() + minDaysAhead * DAY_MS;
  // Midnight Harare of the earliest day, expressed in UTC.
  const local = new Date(earliest + HARARE_UTC_OFFSET * 3600_000);
  const dayStartUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - HARARE_UTC_OFFSET * 3600_000;
  for (let i = 0; i < 14; i++) {
    const day = dayStartUtc + i * DAY_MS;
    const weekday = new Date(day + HARARE_UTC_OFFSET * 3600_000).getUTCDay();
    const at = day + (t.hour * 60 + t.minute) * 60_000;
    if (weekday === t.weekday && at >= earliest) return new Date(at);
  }
  throw new Error("no slot found");
}

/** What the console shows: settings, plus why the autopilot is or isn't posting. */
export async function autopilotStatus(now = new Date()) {
  const settings = await getAutopilotSettings();
  const [officialAhead, memberAhead] = await Promise.all([
    db
      .select({ id: events.id, startsAt: events.startsAt })
      .from(events)
      .where(and(eq(events.isOfficial, true), eq(events.status, "published"), gt(events.startsAt, now))),
    db
      .select({ id: events.id })
      .from(events)
      .where(and(
        eq(events.isOfficial, false),
        ne(events.hostUserId, DESTIRA_SYSTEM_USER_ID),
        eq(events.status, "published"),
        eq(events.visibility, "public"),
        gte(events.startsAt, now),
        lt(events.startsAt, new Date(now.getTime() + 14 * DAY_MS)),
      )),
  ]);
  const steppedBack = memberAhead.length >= settings.memberEventsToStepBack;
  return {
    settings,
    officialAhead: officialAhead.length,
    officialDates: officialAhead.map((e) => e.startsAt),
    memberEventsNext14Days: memberAhead.length,
    steppedBack,
    nextUp: PROGRAMME[settings.next]?.title ?? null,
    programme: PROGRAMME.map((p) => p.title),
  };
}

const harareDay = (d: Date) => new Date(d.getTime() + HARARE_UTC_OFFSET * 3600_000).toISOString().slice(0, 10);

/** Called from the official-events sweep: posts as many as are missing,
 *  next in the programme first, five or more days out, never two official
 *  events on the same day. Returns what it posted. */
export async function runOfficialAutopilot(now = new Date()) {
  const status = await autopilotStatus(now);
  const { settings } = status;
  const posted: { id: number; title: string; startsAt: Date }[] = [];
  if (!settings.enabled || status.steppedBack) return posted;

  const takenDays = new Set(status.officialDates.map(harareDay));
  let next = settings.next;
  for (let missing = settings.keepAhead - status.officialAhead; missing > 0; missing--) {
    const { weekday, hour, minute, hours, ...input } = PROGRAMME[next];
    let startsAt = nextSlot({ weekday, hour, minute }, now, 5);
    while (takenDays.has(harareDay(startsAt))) startsAt = new Date(startsAt.getTime() + 7 * DAY_MS);
    takenDays.add(harareDay(startsAt));
    next = (next + 1) % PROGRAMME.length;
    // Move the rotation on before posting, so a failure never repeats the same one forever.
    await updateAutopilotSettings({ next }, null);

    const event = await createOfficialEvent({ ...input, startsAt, endsAt: new Date(startsAt.getTime() + hours * 3600_000) });
    void twinEventAlerts.runTwinEventAlerts(event.id).catch((err) => console.error("twin event alerts failed:", err));
    posted.push({ id: event.id, title: event.title, startsAt: event.startsAt });
  }
  return posted;
}
