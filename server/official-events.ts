// Official events: platform-run gatherings (hosted by the "Destira" system
// user) that members join, with a volunteer "lead" who coordinates in the
// event chat. If an official event hasn't reached its minimum headcount and
// found a lead by 48h before it starts, the sweep calls it off so the feed
// never carries a dead event — an admin can then repost it with one click.
//
// Reuses the ordinary events machinery on purpose (feed, RSVP, event chat,
// twin alerts): an official event is just an event whose host is the system
// user, plus a handful of columns (isOfficial, leadUserId, sponsor*, minGoing).
import { db } from "./db";
import {
  events, eventAttendees, eventLeadApplications, profiles, twinNotifications, suburbCentroids,
  type Event, type EventLeadApplication,
} from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, and, ne, inArray, lte, isNull, desc, count, gte } from "drizzle-orm";
import { storage } from "./storage";
import { sendCategorizedPush } from "./push";
import { ensureEventChatGroup, EventNotFoundError, leadNamesFor } from "./events";

import { DESTIRA_SYSTEM_USER_ID } from "./system-user";
export { DESTIRA_SYSTEM_USER_ID };

export const OFFICIAL_MIN_GOING_DEFAULT = 5;
export const OFFICIAL_DEADLINE_HOURS = 48;
// An official event must be created at least this far ahead, so it can't be
// called off by the 48h rule the moment it goes live.
export const OFFICIAL_MIN_LEAD_TIME_HOURS = 72;
const HOUR_MS = 60 * 60 * 1000;

export class OfficialEventError extends Error {}

export async function ensureDestiraSystemUser(): Promise<string> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.id, DESTIRA_SYSTEM_USER_ID));
  if (!existing) {
    await db.insert(users).values({ id: DESTIRA_SYSTEM_USER_ID, firstName: "Destira" }).onConflictDoNothing();
  }
  const [profile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.userId, DESTIRA_SYSTEM_USER_ID));
  if (!profile) {
    // onboardingCompleted/isPublic stay false: every Discover and matching
    // query requires both, so this row can never surface as a person.
    await db.insert(profiles).values({
      userId: DESTIRA_SYSTEM_USER_ID,
      displayName: "Destira",
      groupNickname: "Destira",
      moderationStatus: "active",
      onboardingCompleted: false,
      isPublic: false,
    });
  }
  return DESTIRA_SYSTEM_USER_ID;
}

export interface OfficialEventInput {
  title: string;
  description?: string | null;
  kind: string;
  vibes: string[];
  placeType: string;
  venueName?: string | null;
  suburb: string;
  city: string;
  startsAt: Date;
  endsAt?: Date | null;
  coverImageUrl?: string | null;
  isSober?: boolean;
  sponsorName?: string | null;
  sponsorLogoUrl?: string | null;
  minGoing?: number;
  seatCount?: number | null; // null = open
}

async function suburbLatLng(suburb: string) {
  const [row] = await db
    .select({ lat: suburbCentroids.lat, lng: suburbCentroids.lng })
    .from(suburbCentroids)
    .where(eq(suburbCentroids.suburb, suburb));
  return row ?? null;
}

export async function createOfficialEvent(input: OfficialEventInput): Promise<Event> {
  if (input.startsAt.getTime() < Date.now() + OFFICIAL_MIN_LEAD_TIME_HOURS * HOUR_MS) {
    throw new OfficialEventError(
      `Official events need at least ${OFFICIAL_MIN_LEAD_TIME_HOURS} hours' notice so people have time to join before the ${OFFICIAL_DEADLINE_HOURS}h cut-off.`,
    );
  }
  const hostId = await ensureDestiraSystemUser();
  const centroid = await suburbLatLng(input.suburb);
  const [event] = await db
    .insert(events)
    .values({
      hostUserId: hostId,
      createdByUserId: hostId,
      status: "published",
      title: input.title,
      description: input.description || null,
      kind: input.kind,
      vibes: input.vibes,
      placeType: input.placeType,
      venueName: input.venueName || null,
      suburb: input.suburb,
      city: input.city,
      lat: centroid?.lat ?? null,
      lng: centroid?.lng ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      coverImageUrl: input.coverImageUrl || null,
      seatModel: input.seatCount ? "capped" : "open",
      seatCount: input.seatCount ?? null,
      isSober: input.isSober ?? false,
      accessibility: [],
      visibility: "public",
      locationTier: "venue_public_unverified",
      costModel: "free_hosted",
      genderPolicy: "mixed",
      isOfficial: true,
      sponsorName: input.sponsorName || null,
      sponsorLogoUrl: input.sponsorLogoUrl || null,
      minGoing: input.minGoing ?? OFFICIAL_MIN_GOING_DEFAULT,
    })
    .returning();

  // The chat exists from day one so people can talk before a lead is chosen.
  // Attendees are added to it as they RSVP (see attendEvent).
  await ensureEventChatGroup(event.id, hostId);
  const [withChat] = await db.select().from(events).where(eq(events.id, event.id));
  return withChat ?? event;
}

// "Run it again": copies an (usually cancelled) official event to a new date.
export async function repostOfficialEvent(eventId: number, startsAt: Date): Promise<Event> {
  const [old] = await db.select().from(events).where(eq(events.id, eventId));
  if (!old || !old.isOfficial) throw new EventNotFoundError();
  const durationMs = old.endsAt ? old.endsAt.getTime() - old.startsAt.getTime() : null;
  return createOfficialEvent({
    title: old.title,
    description: old.description,
    kind: old.kind ?? "outdoors",
    vibes: old.vibes ?? [],
    placeType: old.placeType ?? "venue",
    venueName: old.venueName,
    suburb: old.suburb ?? "",
    city: old.city ?? "",
    startsAt,
    endsAt: durationMs != null ? new Date(startsAt.getTime() + durationMs) : null,
    coverImageUrl: old.coverImageUrl,
    isSober: old.isSober,
    sponsorName: old.sponsorName,
    sponsorLogoUrl: old.sponsorLogoUrl,
    minGoing: old.minGoing ?? OFFICIAL_MIN_GOING_DEFAULT,
    seatCount: old.seatModel === "capped" ? old.seatCount : null,
  });
}

// ── leads ─────────────────────────────────────────────────────────────

async function requireOfficialPublished(eventId: number): Promise<Event> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new EventNotFoundError();
  if (!event.isOfficial) throw new OfficialEventError("Only official events have a lead.");
  if (event.status !== "published") throw new OfficialEventError("This event isn't open any more.");
  return event;
}

export async function applyToLead(eventId: number, userId: string, note: string): Promise<EventLeadApplication> {
  const event = await requireOfficialPublished(eventId);
  if (event.leadUserId) throw new OfficialEventError("This event already has a lead.");
  const [going] = await db
    .select({ id: eventAttendees.id })
    .from(eventAttendees)
    .where(and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.userId, userId), eq(eventAttendees.status, "going")));
  if (!going) throw new OfficialEventError("RSVP to the event first, then offer to lead it.");

  const [row] = await db
    .insert(eventLeadApplications)
    .values({ eventId, userId, note: note || null })
    .onConflictDoUpdate({
      target: [eventLeadApplications.eventId, eventLeadApplications.userId],
      // A rejected applicant may re-apply with a fresh note; an approved one is final.
      set: { note: note || null, status: "pending", decidedAt: null },
      setWhere: ne(eventLeadApplications.status, "approved"),
    })
    .returning();
  return row;
}

export async function getMyLeadApplication(eventId: number, userId: string): Promise<EventLeadApplication | null> {
  const [row] = await db
    .select()
    .from(eventLeadApplications)
    .where(and(eq(eventLeadApplications.eventId, eventId), eq(eventLeadApplications.userId, userId)));
  return row ?? null;
}

async function displayNameFor(userId: string): Promise<string> {
  const profile = await storage.getProfile(userId);
  return profile?.groupNickname || profile?.displayName || "A member";
}

// Makes `userId` the lead: sets events.leadUserId, closes the other pending
// applications, promotes them to admin of the event chat and tells them.
export async function setEventLead(eventId: number, userId: string): Promise<Event> {
  const event = await requireOfficialPublished(eventId);
  if (event.leadUserId && event.leadUserId !== userId) {
    throw new OfficialEventError("This event already has a lead. Remove them first.");
  }
  const [updated] = await db
    .update(events)
    .set({ leadUserId: userId })
    .where(eq(events.id, eventId))
    .returning();

  await db
    .update(eventLeadApplications)
    .set({ status: "approved", decidedAt: new Date() })
    .where(and(eq(eventLeadApplications.eventId, eventId), eq(eventLeadApplications.userId, userId)));
  await db
    .update(eventLeadApplications)
    .set({ status: "rejected", decidedAt: new Date() })
    .where(and(
      eq(eventLeadApplications.eventId, eventId),
      eq(eventLeadApplications.status, "pending"),
      ne(eventLeadApplications.userId, userId),
    ));

  // Make sure the lead is an attendee and a chat admin.
  await db
    .insert(eventAttendees)
    .values({ eventId, userId, status: "going", decidedAt: new Date() })
    .onConflictDoUpdate({
      target: [eventAttendees.eventId, eventAttendees.userId],
      set: { status: "going", decidedAt: new Date() },
    });
  const chatId = updated.chatGroupId ?? (await ensureEventChatGroup(eventId, event.hostUserId));
  const nickname = await displayNameFor(userId);
  if (!(await storage.getGroupMember(chatId, userId))) {
    await storage.joinGroup(chatId, userId, nickname);
  }
  await storage.updateGroupMemberRole(chatId, userId, "admin");
  await storage
    .sendGroupMessage(
      chatId,
      event.hostUserId,
      "Destira",
      `${nickname} is leading this one. Use this chat to plan the details together.`,
    )
    .catch(() => {});

  await db.insert(twinNotifications).values({
    userId,
    type: "event_lead_approved",
    title: `You're leading "${updated.title}"`,
    body: "Thanks for stepping up. Open the event chat to start planning with everyone who's coming.",
  });
  sendCategorizedPush(userId, "events", {
    title: `You're leading "${updated.title}"`,
    body: "Thanks for stepping up. Open the event chat to start planning.",
    url: `/events/${eventId}`,
    tag: `event-lead-${eventId}`,
  }).catch(() => {});
  return updated;
}

export async function rejectLeadApplication(eventId: number, applicationId: number): Promise<void> {
  await db
    .update(eventLeadApplications)
    .set({ status: "rejected", decidedAt: new Date() })
    .where(and(eq(eventLeadApplications.id, applicationId), eq(eventLeadApplications.eventId, eventId)));
}

export async function approveLeadApplication(eventId: number, applicationId: number): Promise<Event> {
  const [app] = await db
    .select()
    .from(eventLeadApplications)
    .where(and(eq(eventLeadApplications.id, applicationId), eq(eventLeadApplications.eventId, eventId)));
  if (!app) throw new OfficialEventError("Application not found.");
  return setEventLead(eventId, app.userId);
}

// ── admin listing ─────────────────────────────────────────────────────

export async function listOfficialEventsForAdmin() {
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.isOfficial, true), ne(events.status, "draft")))
    .orderBy(desc(events.startsAt))
    .limit(100);
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];

  const [goingRows, appRows] = await Promise.all([
    db
      .select({ eventId: eventAttendees.eventId, n: count() })
      .from(eventAttendees)
      .where(and(inArray(eventAttendees.eventId, ids), eq(eventAttendees.status, "going")))
      .groupBy(eventAttendees.eventId),
    db
      .select({
        id: eventLeadApplications.id,
        eventId: eventLeadApplications.eventId,
        userId: eventLeadApplications.userId,
        note: eventLeadApplications.note,
        status: eventLeadApplications.status,
        createdAt: eventLeadApplications.createdAt,
        name: profiles.displayName,
        nickname: profiles.groupNickname,
      })
      .from(eventLeadApplications)
      .leftJoin(profiles, eq(profiles.userId, eventLeadApplications.userId))
      .where(inArray(eventLeadApplications.eventId, ids)),
  ]);
  const goingBy = new Map(goingRows.map((r) => [r.eventId, Number(r.n)]));
  const leadNames = await leadNamesFor(rows.map((r) => r.leadUserId));

  return rows.map((e) => ({
    ...e,
    goingCount: goingBy.get(e.id) ?? 0,
    leadName: e.leadUserId ? leadNames.get(e.leadUserId) ?? null : null,
    applications: appRows
      .filter((a) => a.eventId === e.id)
      .map((a) => ({
        id: a.id,
        userId: a.userId,
        name: a.nickname || a.name || "Member",
        note: a.note,
        status: a.status,
        createdAt: a.createdAt,
      })),
  }));
}

// ── the sweep ─────────────────────────────────────────────────────────

async function goingUserIds(eventId: number): Promise<string[]> {
  const rows = await db
    .select({ userId: eventAttendees.userId })
    .from(eventAttendees)
    .where(and(eq(eventAttendees.eventId, eventId), inArray(eventAttendees.status, ["going", "waitlisted", "requested"])));
  return rows.map((r) => r.userId);
}

// Returns how many events were called off. Idempotent: the status flip is a
// conditional UPDATE ... RETURNING, so a second run (or a second instance)
// finds nothing left to cancel and sends nothing.
export async function sweepOfficialEvents(now = new Date()): Promise<number> {
  let cancelled = 0;

  // 1. Called off: inside the 48h window without enough people or a lead.
  const due = await db
    .select()
    .from(events)
    .where(and(
      eq(events.isOfficial, true),
      eq(events.status, "published"),
      lte(events.startsAt, new Date(now.getTime() + OFFICIAL_DEADLINE_HOURS * HOUR_MS)),
    ));
  for (const event of due) {
    if (event.startsAt.getTime() <= now.getTime()) continue; // already underway/over: not ours to cancel
    const min = event.minGoing ?? OFFICIAL_MIN_GOING_DEFAULT;
    const [{ n }] = await db
      .select({ n: count() })
      .from(eventAttendees)
      .where(and(eq(eventAttendees.eventId, event.id), eq(eventAttendees.status, "going")));
    const going = Number(n);
    const missing: string[] = [];
    if (going < min) missing.push(`only ${going} of the ${min} people needed had joined`);
    if (!event.leadUserId) missing.push("nobody had stepped up to lead it");
    if (missing.length === 0) continue;

    const reason = `Called off because ${missing.join(" and ")} by the ${OFFICIAL_DEADLINE_HOURS}-hour mark.`;
    const [claimed] = await db
      .update(events)
      .set({ status: "cancelled", cancelReason: reason, cancelledAt: now })
      .where(and(eq(events.id, event.id), eq(events.status, "published")))
      .returning();
    if (!claimed) continue;
    cancelled += 1;

    const audience = await goingUserIds(event.id);
    if (audience.length > 0) {
      await db.insert(twinNotifications).values(
        audience.map((userId) => ({
          userId,
          type: "event_cancelled",
          title: `"${event.title}" was called off`,
          body: `${reason} Thanks for signing up. We'll bring it back for another date.`,
        })),
      );
      for (const userId of audience) {
        sendCategorizedPush(userId, "events", {
          title: `"${event.title}" was called off`,
          body: "Not enough people or no lead in time. We'll bring it back for another date.",
          url: `/events/${event.id}`,
          tag: `event-cancel-${event.id}`,
        }).catch(() => {});
      }
    }
  }

  // 2. One gentle nudge ~5 days out if there's still no lead.
  const nudgeWindow = new Date(now.getTime() + 5 * 24 * HOUR_MS);
  const needLead = await db
    .select()
    .from(events)
    .where(and(
      eq(events.isOfficial, true),
      eq(events.status, "published"),
      isNull(events.leadUserId),
      isNull(events.leadNudgedAt),
      lte(events.startsAt, nudgeWindow),
      gte(events.startsAt, now),
    ));
  for (const event of needLead) {
    const [claimed] = await db
      .update(events)
      .set({ leadNudgedAt: now })
      .where(and(eq(events.id, event.id), isNull(events.leadNudgedAt)))
      .returning({ id: events.id });
    if (!claimed) continue;
    for (const userId of await goingUserIds(event.id)) {
      sendCategorizedPush(userId, "events", {
        title: `"${event.title}" still needs a lead`,
        body: "Want to run it? Open the event and tap \"I'll lead this\". Without a lead it gets called off.",
        url: `/events/${event.id}`,
        tag: `event-needs-lead-${event.id}`,
      }).catch(() => {});
    }
  }

  return cancelled;
}
