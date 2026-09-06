// Events service layer: small hosted gatherings attached to a group, with
// resonance signal (docs/redesign-handoff.md's Events build prompt).
//
// Everything that mutates event_attendees.status runs inside db.transaction()
// with the parent event row locked FOR UPDATE. That lock is what makes
// attendEvent/cancelEventAttendance safe under concurrency — two attendees
// racing for the last capped seat, or a double-tapped attend request, both
// serialize on the same event row instead of doing a read-then-write race.
import { db } from "./db";
import {
  events, eventAttendees, profiles, groupMembers, blockedUsers, groups,
  type Event, type InsertEvent, type EventAttendee,
} from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, and, ne, inArray, asc, gte, lte, count } from "drizzle-orm";
import { computeResonance } from "./resonance";

export class EventNotFoundError extends Error {
  constructor() { super("Event not found"); }
}
export class NotEventHostError extends Error {
  constructor() { super("Only the event host can do that"); }
}
export class NotGroupMemberError extends Error {
  constructor() { super("Must be a member of the group to host an event there"); }
}

type AttendeeStatus = "going" | "waitlisted" | "requested" | "declined" | "cancelled";

interface NotableAttendee {
  id: string;
  name: string;
  avatarUrl: string | null;
  score: number;
}
interface ResonanceBlock {
  goingCount: number;
  highReadCount: number;
  notableAttendees: NotableAttendee[];
}

// One batched pass: pulls every 'going' attendee for the given events, every
// profile those attendees need, and the viewer's blocked-pairs set, then
// builds the resonance block for each event in memory. Called once per
// request (list or detail), never per-event.
async function buildResonanceBlocks(
  eventIds: number[],
  viewerId: string,
): Promise<Map<number, ResonanceBlock>> {
  const blocks = new Map<number, ResonanceBlock>();
  if (eventIds.length === 0) return blocks;

  const attendeeRows = await db
    .select({ eventId: eventAttendees.eventId, userId: eventAttendees.userId })
    .from(eventAttendees)
    .where(and(inArray(eventAttendees.eventId, eventIds), eq(eventAttendees.status, "going")));

  for (const id of eventIds) blocks.set(id, { goingCount: 0, highReadCount: 0, notableAttendees: [] });
  if (attendeeRows.length === 0) return blocks;

  const attendeeUserIds = Array.from(new Set(attendeeRows.map((r) => r.userId)));

  const [profileRows, blockedByViewer, blockedOfViewer] = await Promise.all([
    db.select({
      userId: profiles.userId,
      displayName: profiles.displayName,
      coverPhotoUrl: profiles.coverPhotoUrl,
      isPublic: profiles.isPublic,
      personalityProfile: profiles.personalityProfile,
    }).from(profiles).where(inArray(profiles.userId, attendeeUserIds)),
    db.select({ blockedId: blockedUsers.blockedId }).from(blockedUsers).where(eq(blockedUsers.blockerId, viewerId)),
    db.select({ blockerId: blockedUsers.blockerId }).from(blockedUsers).where(eq(blockedUsers.blockedId, viewerId)),
  ]);

  const hiddenIds = new Set<string>([
    ...blockedByViewer.map((r) => r.blockedId),
    ...blockedOfViewer.map((r) => r.blockerId),
  ]);

  const profileById = new Map(profileRows.map((p) => [p.userId, p]));

  const byEvent = new Map<number, string[]>();
  for (const row of attendeeRows) {
    if (!byEvent.has(row.eventId)) byEvent.set(row.eventId, []);
    byEvent.get(row.eventId)!.push(row.userId);
  }

  byEvent.forEach((userIds, eventId) => {
    const visible = userIds
      .filter((uid) => uid !== viewerId && !hiddenIds.has(uid))
      .map((uid) => profileById.get(uid))
      .filter((p): p is NonNullable<typeof p> => !!p && p.isPublic === true);

    const scored = visible
      .map((p) => ({ profile: p, resonance: computeResonance(p.personalityProfile) }))
      .filter((r): r is { profile: typeof r.profile; resonance: NonNullable<typeof r.resonance> } => r.resonance != null)
      .sort((a, b) => b.resonance.score - a.resonance.score);

    blocks.set(eventId, {
      goingCount: userIds.length,
      highReadCount: scored.filter((r) => r.resonance.score >= 80).length,
      notableAttendees: scored.slice(0, 3).map((r) => ({
        id: r.profile.userId,
        name: r.profile.displayName || "Someone",
        avatarUrl: r.profile.coverPhotoUrl,
        score: r.resonance.score,
      })),
    });
  });

  return blocks;
}

export async function listEvents(
  viewerId: string,
  filters: { groupId?: number; city?: string; from?: Date; to?: Date } = {},
): Promise<Array<Event & { resonance: ResonanceBlock; myStatus: AttendeeStatus | null }>> {
  const conditions = [eq(events.status, "published")];
  if (filters.groupId != null) conditions.push(eq(events.groupId, filters.groupId));
  if (filters.city) conditions.push(eq(events.city, filters.city));
  if (filters.from) conditions.push(gte(events.startsAt, filters.from));
  if (filters.to) conditions.push(lte(events.startsAt, filters.to));

  const rows = await db.select().from(events).where(and(...conditions)).orderBy(asc(events.startsAt));
  const eventIds = rows.map((r) => r.id);

  const [blocks, myRows] = await Promise.all([
    buildResonanceBlocks(eventIds, viewerId),
    eventIds.length
      ? db.select({ eventId: eventAttendees.eventId, status: eventAttendees.status })
          .from(eventAttendees)
          .where(and(inArray(eventAttendees.eventId, eventIds), eq(eventAttendees.userId, viewerId)))
      : Promise.resolve([]),
  ]);
  const myStatusByEvent = new Map(myRows.map((r) => [r.eventId, r.status as AttendeeStatus]));

  return rows.map((event) => ({
    ...event,
    resonance: blocks.get(event.id) || { goingCount: 0, highReadCount: 0, notableAttendees: [] },
    myStatus: myStatusByEvent.get(event.id) ?? null,
  }));
}

export async function getEventDetail(eventId: number, viewerId: string) {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new EventNotFoundError();

  const [blocks, [myRow]] = await Promise.all([
    buildResonanceBlocks([eventId], viewerId),
    db.select({ status: eventAttendees.status })
      .from(eventAttendees)
      .where(and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.userId, viewerId))),
  ]);

  return {
    ...event,
    resonance: blocks.get(eventId) || { goingCount: 0, highReadCount: 0, notableAttendees: [] },
    myStatus: (myRow?.status as AttendeeStatus | undefined) ?? null,
  };
}

export async function createEvent(hostUserId: string, data: InsertEvent): Promise<Event> {
  if (data.groupId != null) {
    const [membership] = await db.select().from(groupMembers).where(
      and(eq(groupMembers.groupId, data.groupId), eq(groupMembers.userId, hostUserId))
    );
    if (!membership) throw new NotGroupMemberError();
  }
  const [event] = await db.insert(events).values({ ...data, hostUserId }).returning();
  return event;
}

export async function updateEvent(eventId: number, hostUserId: string, data: Partial<InsertEvent>): Promise<Event> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new EventNotFoundError();
  if (event.hostUserId !== hostUserId) throw new NotEventHostError();
  const [updated] = await db.update(events).set(data).where(eq(events.id, eventId)).returning();
  return updated;
}

function seatStatusFor(seatModel: string, goingCount: number, seatCount: number | null): AttendeeStatus {
  if (seatModel === "curated") return "requested";
  if (seatModel === "capped" && seatCount != null && goingCount >= seatCount) return "waitlisted";
  return "going";
}

export async function attendEvent(
  eventId: number,
  userId: string,
): Promise<{ status: AttendeeStatus; waitlistPosition?: number }> {
  return db.transaction(async (tx) => {
    const [event] = await tx.select().from(events).where(eq(events.id, eventId)).for("update");
    if (!event) throw new EventNotFoundError();

    const [existing] = await tx.select().from(eventAttendees).where(
      and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.userId, userId))
    );

    // Idempotent: an active row already reflects a decision — return it as-is
    // rather than re-running allocation (double-tap / retry safety).
    if (existing && ["going", "waitlisted", "requested"].includes(existing.status)) {
      const status = existing.status as AttendeeStatus;
      if (status !== "waitlisted") return { status };
      const position = await waitlistPosition(tx, eventId, existing.id);
      return { status, waitlistPosition: position };
    }

    const [{ count: goingCount }] = await tx
      .select({ count: count() })
      .from(eventAttendees)
      .where(and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.status, "going")));

    const status = seatStatusFor(event.seatModel, Number(goingCount), event.seatCount);
    const decidedAt = status === "requested" ? null : new Date();

    let row: EventAttendee;
    if (existing) {
      [row] = await tx.update(eventAttendees)
        .set({ status, decidedAt })
        .where(eq(eventAttendees.id, existing.id))
        .returning();
    } else {
      [row] = await tx.insert(eventAttendees)
        .values({ eventId, userId, status, decidedAt })
        .returning();
    }

    if (status !== "waitlisted") return { status };
    return { status, waitlistPosition: await waitlistPosition(tx, eventId, row.id) };
  });
}

export async function cancelEventAttendance(
  eventId: number,
  userId: string,
): Promise<{ status: AttendeeStatus; promotedUserId?: string }> {
  return db.transaction(async (tx) => {
    const [event] = await tx.select().from(events).where(eq(events.id, eventId)).for("update");
    if (!event) throw new EventNotFoundError();

    const [existing] = await tx.select().from(eventAttendees).where(
      and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.userId, userId))
    );
    if (!existing || existing.status === "cancelled" || existing.status === "declined") {
      return { status: "cancelled" as AttendeeStatus };
    }

    const wasGoing = existing.status === "going";
    await tx.update(eventAttendees)
      .set({ status: "cancelled", decidedAt: new Date() })
      .where(eq(eventAttendees.id, existing.id));

    if (!wasGoing || event.seatModel !== "capped") return { status: "cancelled" };

    const [oldestWaitlisted] = await tx.select().from(eventAttendees).where(
      and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.status, "waitlisted"))
    ).orderBy(asc(eventAttendees.createdAt)).limit(1);

    if (!oldestWaitlisted) return { status: "cancelled" };

    await tx.update(eventAttendees)
      .set({ status: "going", decidedAt: new Date() })
      .where(eq(eventAttendees.id, oldestWaitlisted.id));

    return { status: "cancelled", promotedUserId: oldestWaitlisted.userId };
  });
}

export async function getEventAttendeesList(eventId: number, requesterId: string) {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new EventNotFoundError();
  const isHost = event.hostUserId === requesterId;

  const rows = await db.select({
    userId: eventAttendees.userId,
    status: eventAttendees.status,
    createdAt: eventAttendees.createdAt,
    displayName: profiles.displayName,
    coverPhotoUrl: profiles.coverPhotoUrl,
    isPublic: profiles.isPublic,
    subscriptionTier: profiles.subscriptionTier,
  })
    .from(eventAttendees)
    .leftJoin(profiles, eq(profiles.userId, eventAttendees.userId))
    .where(and(eq(eventAttendees.eventId, eventId), ne(eventAttendees.status, "cancelled")))
    .orderBy(asc(eventAttendees.createdAt));

  if (isHost) return rows;

  const [blockedByViewer, blockedOfViewer] = await Promise.all([
    db.select({ blockedId: blockedUsers.blockedId }).from(blockedUsers).where(eq(blockedUsers.blockerId, requesterId)),
    db.select({ blockerId: blockedUsers.blockerId }).from(blockedUsers).where(eq(blockedUsers.blockedId, requesterId)),
  ]);
  const hiddenIds = new Set([...blockedByViewer.map((r) => r.blockedId), ...blockedOfViewer.map((r) => r.blockerId)]);

  return rows.filter((r) => r.userId === requesterId || (r.isPublic === true && !hiddenIds.has(r.userId)));
}

async function waitlistPosition(tx: any, eventId: number, attendeeRowId: number): Promise<number> {
  const waitlisted = await tx.select({ id: eventAttendees.id })
    .from(eventAttendees)
    .where(and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.status, "waitlisted")))
    .orderBy(asc(eventAttendees.createdAt));
  const idx = waitlisted.findIndex((r: { id: number }) => r.id === attendeeRowId);
  return idx === -1 ? waitlisted.length : idx + 1;
}

// Idempotent, mirrors storage.seedDemoData()'s "if any exist, skip" pattern.
// One event per seat model, each hosted by a demo user and attached to a
// real seeded group, a few days out from whenever the server boots.
export async function seedEvents(): Promise<void> {
  const existing = await db.select({ id: events.id }).from(events).limit(1);
  if (existing.length > 0) return;

  const wantedGroups = ["Adventure Seekers", "Book Club", "Foodies Unite"];
  const groupRows = await db.select({ id: groups.id, name: groups.name }).from(groups).where(
    inArray(groups.name, wantedGroups)
  );
  const groupIdByName = new Map(groupRows.map((g) => [g.name, g.id]));

  const inDays = (n: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    d.setHours(hour, 0, 0, 0);
    return d;
  };

  const seeds: InsertEvent[] = [
    {
      groupId: groupIdByName.get("Adventure Seekers") ?? null,
      title: "Sunrise trail run, then breakfast",
      description: "Easy 5k out, coffee and eggs after. Bring layers — it's cold before the sun's up.",
      venueName: "Trailhead Cafe",
      suburb: "Borrowdale",
      city: "Harare",
      startsAt: inDays(3, 6),
      endsAt: inDays(3, 8),
      seatModel: "open",
      seatCount: null,
      emberFirstPick: false,
      status: "published",
    },
    {
      groupId: groupIdByName.get("Book Club") ?? null,
      title: "This month's pick — small room, real conversation",
      description: "8 seats, no more. If you haven't finished the book, come anyway.",
      venueName: "The Reading Room",
      suburb: "Avondale",
      city: "Harare",
      startsAt: inDays(5, 19),
      endsAt: inDays(5, 21),
      seatModel: "capped",
      seatCount: 8,
      emberFirstPick: false,
      status: "published",
    },
    {
      groupId: groupIdByName.get("Foodies Unite") ?? null,
      title: "Table for six — long dinner",
      description: "Seats picked for conversation, not first-come. Tell us a bit about yourself when you request.",
      venueName: "Corner Table",
      suburb: "Milton Park",
      city: "Harare",
      startsAt: inDays(8, 19),
      endsAt: inDays(8, 22),
      seatModel: "curated",
      seatCount: 6,
      emberFirstPick: true,
      status: "published",
    },
  ];

  const hosts = ["demo_sarah_001", "demo_james_002", "demo_elena_003"];
  for (let i = 0; i < seeds.length; i++) {
    const [row] = await db.insert(events).values({ ...seeds[i], hostUserId: hosts[i] }).returning();
    // Host attends their own event so the resonance block has at least one
    // real 'going' row to show once other seeded users RSVP later.
    await db.insert(eventAttendees).values({
      eventId: row.id,
      userId: hosts[i],
      status: seeds[i].seatModel === "curated" ? "requested" : "going",
      decidedAt: seeds[i].seatModel === "curated" ? null : new Date(),
    });
  }
}
