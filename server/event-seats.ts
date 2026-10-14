// Live seat numbers for an event: how many are going and what's left, split
// by women and men when the event uses balanced seating ("quota"). Feeds the
// "6 women's seats left" badge on Status cards and the event panel shown on
// a Destira story that points at an event.
import { db } from "./db";
import { events, eventAttendees, profiles } from "@shared/schema";
import { and, eq, count, inArray } from "drizzle-orm";

export interface EventSeats {
  going: number;
  seatsLeft: number | null; // null = open event, no cap
  womenSeatsLeft: number | null; // only for balanced seating
  menSeatsLeft: number | null;
}

export interface StoryEventCard extends EventSeats {
  id: number;
  title: string;
  startsAt: string;
  venueName: string | null;
  suburb: string | null;
  city: string | null;
  status: string;
}

export async function getEventSeats(eventId: number): Promise<EventSeats | null> {
  const [e] = await db.select().from(events).where(eq(events.id, eventId));
  if (!e) return null;
  const going = and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.status, "going"));
  const [[{ n }], byGender] = await Promise.all([
    db.select({ n: count() }).from(eventAttendees).where(going),
    e.genderPolicy === "quota"
      ? db
          .select({ gender: profiles.gender, n: count() })
          .from(eventAttendees)
          .innerJoin(profiles, eq(profiles.userId, eventAttendees.userId))
          .where(and(going, inArray(profiles.gender, ["man", "woman"])))
          .groupBy(profiles.gender)
      : Promise.resolve([] as { gender: string | null; n: number }[]),
  ]);
  const goingCount = Number(n);
  const capped = e.seatModel === "capped" && e.seatCount != null;
  const of = (g: string) => Number(byGender.find((r) => r.gender === g)?.n ?? 0);
  const quota = e.genderPolicy === "quota";
  return {
    going: goingCount,
    seatsLeft: capped ? Math.max(0, (e.seatCount ?? 0) - goingCount) : null,
    womenSeatsLeft: quota && e.womenSlots != null ? Math.max(0, e.womenSlots - of("woman")) : null,
    menSeatsLeft: quota && e.menSlots != null ? Math.max(0, e.menSlots - of("man")) : null,
  };
}

/** What a story viewer needs to show "See the event". Null when the event is
 *  gone or no longer public. */
export async function getStoryEventCard(eventId: number): Promise<StoryEventCard | null> {
  const [e] = await db.select().from(events).where(eq(events.id, eventId));
  if (!e || e.visibility !== "public") return null;
  const seats = await getEventSeats(eventId);
  if (!seats) return null;
  return {
    id: e.id,
    title: e.title,
    startsAt: e.startsAt.toISOString(),
    venueName: e.locationTier === "private_residence" ? null : e.venueName,
    suburb: e.suburb,
    city: e.city,
    status: e.status,
    ...seats,
  };
}

/** Story posts may only point at events anyone could open. */
export async function canShareEventToStory(eventId: number): Promise<boolean> {
  const [e] = await db.select({ visibility: events.visibility, status: events.status }).from(events).where(eq(events.id, eventId));
  return !!e && e.visibility === "public" && e.status === "published";
}
