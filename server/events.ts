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
  events, eventAttendees, profiles, groupMembers, blockedUsers, groups, suburbCentroids,
  twinNotifications, twinAlertLog, places, eventPhotos, eventContactViews,
  PRIVATE_RESIDENCE_MIN_ATTENDEES,
  type Event, type InsertEvent, type EventAttendee,
  type HostEventInput, type EventLocationTier, type Place, type EventPhoto,
} from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, and, ne, or, ilike, inArray, asc, desc, gte, lte, count, isNull } from "drizzle-orm";
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
// A host may put up to 3 events into the world per rolling 7 days (published or
// still in review). Keeps the calendar real and the review queue sane.
export class HostRateLimitError extends Error {
  constructor() { super("You've put up 3 events this week. Give it a few days."); }
}
export class ModeratorOnlyError extends Error {
  constructor() { super("Only a moderator can review events"); }
}
export class PhotoLimitError extends Error {
  constructor() { super("A place gets 6 photos, no more."); }
}
export class ContactNotReleasedError extends Error {
  constructor(msg = "Contact details unlock the day before, once you're confirmed as going.") { super(msg); }
}

export const HOST_WEEKLY_LIMIT = 3;

// ── v3: location tier (server-computed, never host-declared) ──
export function computeLocationTier(input: {
  placeVerified: boolean;
  isPrivateAddress: boolean;
}): EventLocationTier {
  if (input.isPrivateAddress) return "private_residence";
  if (input.placeVerified) return "venue_verified";
  return "venue_public_unverified";
}

export interface EventViewerCtx {
  isHost: boolean;
  myStatus: string | null;
  goingCount: number;
}

// The ONE place an event row is sanitised for a viewer. No event read path may
// return a raw row.
//   addressLine  — host always; a 'going' attendee only when the event is
//                  "confirmed viable" (private homes: >= minAttendees going AND
//                  an approved host video; everywhere else: always)
//   contactPhone / contactWhatsapp — host only in any payload; everyone else
//                  goes through GET /api/events/:id/contact (24h + going gate)
//   hostVideoUrl / poster — only once the video is 'approved'
export function serializeEvent<T extends Event>(row: T, ctx: EventViewerCtx) {
  const isPrivate = row.locationTier === "private_residence";
  const minNeeded = row.minAttendees ?? PRIVATE_RESIDENCE_MIN_ATTENDEES;
  const confirmedViable = !isPrivate || (ctx.goingCount >= minNeeded && row.hostVideoStatus === "approved");
  const addressVisible = ctx.isHost || (ctx.myStatus === "going" && confirmedViable);
  const approved = row.hostVideoStatus === "approved";

  return {
    ...row,
    addressLine: addressVisible ? row.addressLine : null,
    addressWithheld: !addressVisible && !!row.addressLine,
    contactPhone: ctx.isHost ? row.contactPhone : null,
    contactWhatsapp: ctx.isHost ? row.contactWhatsapp : null,
    contributionAmount: row.contributionAmount != null ? Number(row.contributionAmount) : null,
    hostVideoUrl: approved ? row.hostVideoUrl : null,
    hostVideoPosterUrl: approved ? row.hostVideoPosterUrl : null,
  };
}

export type SerializedEvent = ReturnType<typeof serializeEvent>;

// Comma-separated user ids in EVENT_MODERATOR_IDS may approve first events out
// of the pending_review queue. Empty = nobody (events stay held).
export function isEventModerator(userId: string): boolean {
  const ids = (process.env.EVENT_MODERATOR_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(userId);
}

export async function approveEvent(eventId: number, moderatorId: string): Promise<Event> {
  if (!isEventModerator(moderatorId)) throw new ModeratorOnlyError();
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new EventNotFoundError();
  if (event.status !== "pending_review") return event;
  const [updated] = await db
    .update(events)
    .set({ status: "published" })
    .where(eq(events.id, eventId))
    .returning();
  return updated;
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
export async function buildResonanceBlocks(
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

  return rows.map((event) => {
    const resonance = blocks.get(event.id) || { goingCount: 0, highReadCount: 0, notableAttendees: [] };
    const myStatus = myStatusByEvent.get(event.id) ?? null;
    return {
      ...serializeEvent(event, { isHost: event.hostUserId === viewerId, myStatus, goingCount: resonance.goingCount }),
      resonance,
      myStatus,
    };
  });
}

export async function getEventDetail(eventId: number, viewerId: string) {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new EventNotFoundError();

  const [blocks, [myRow], [flagRow]] = await Promise.all([
    buildResonanceBlocks([eventId], viewerId),
    db.select({ status: eventAttendees.status })
      .from(eventAttendees)
      .where(and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.userId, viewerId))),
    db.select({ id: twinAlertLog.id })
      .from(twinAlertLog)
      .where(and(eq(twinAlertLog.eventId, eventId), eq(twinAlertLog.userId, viewerId))),
  ]);

  const resonance = blocks.get(eventId) || { goingCount: 0, highReadCount: 0, notableAttendees: [] };
  const myStatus = (myRow?.status as AttendeeStatus | undefined) ?? null;
  const photos = await listEventPhotos(eventId);
  return {
    ...serializeEvent(event, { isHost: event.hostUserId === viewerId, myStatus, goingCount: resonance.goingCount }),
    resonance,
    myStatus,
    twinFlagged: !!flagRow,
    photos,
  };
}

async function suburbCentroidFor(suburb: string, city: string): Promise<{ lat: string; lng: string } | null> {
  const [row] = await db
    .select({ lat: suburbCentroids.lat, lng: suburbCentroids.lng })
    .from(suburbCentroids)
    .where(eq(suburbCentroids.suburb, suburb));
  return row ?? null;
}

export async function createHostedEvent(hostUserId: string, data: HostEventInput): Promise<Event> {
  if (data.groupId != null) {
    const [membership] = await db.select().from(groupMembers).where(
      and(eq(groupMembers.groupId, data.groupId), eq(groupMembers.userId, hostUserId))
    );
    if (!membership) throw new NotGroupMemberError();
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = await db
    .select({ status: events.status })
    .from(events)
    .where(and(eq(events.createdByUserId, hostUserId), gte(events.createdAt, weekAgo)));
  const liveOrPending = recent.filter((r) => r.status === "published" || r.status === "pending_review");
  if (liveOrPending.length >= HOST_WEEKLY_LIMIT) throw new HostRateLimitError();

  // First time this user has ever hosted -> hold it for a look. After one
  // event has gone live, they publish straight away (still rate-limited).
  const [prior] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.createdByUserId, hostUserId), eq(events.status, "published")))
    .limit(1);

  // v3: resolve place, compute the tier (never trust the client), and pull
  // venue name / address / suburb from a matched place.
  let placeVerified = false;
  let venueName = data.venueName || null;
  let suburb = data.suburb;
  let city = data.city;
  let addressLine = (data.addressLine || "").trim() || null;
  if (data.placeId != null) {
    const [place] = await db.select().from(places).where(eq(places.id, data.placeId));
    if (place) {
      placeVerified = place.verifiedAt != null;
      venueName = venueName || place.name;
      suburb = place.suburb;
      city = place.city;
      addressLine = place.addressLine;
    }
  }
  const locationTier = computeLocationTier({ placeVerified, isPrivateAddress: data.isPrivateAddress });
  const minAttendees = locationTier === "private_residence" ? PRIVATE_RESIDENCE_MIN_ATTENDEES : null;
  // A private home never goes straight to 'published' — it needs the media /
  // ID / numbers checks (Events v3 Conversation Three) before it can run.
  const status = locationTier === "private_residence" ? "pending_review" : prior ? "published" : "pending_review";

  const centroid = await suburbCentroidFor(suburb, city);

  const [event] = await db
    .insert(events)
    .values({
      hostUserId,
      createdByUserId: hostUserId,
      status,
      title: data.title,
      description: data.description || null,
      kind: data.kind,
      vibes: data.vibes,
      placeType: data.placeType,
      venueName,
      suburb,
      city,
      lat: centroid?.lat ?? null,
      lng: centroid?.lng ?? null,
      startsAt: data.startsAt,
      endsAt: data.endsAt ?? null,
      seatModel: data.seatModel,
      seatCount: data.seatModel === "open" ? null : data.seatCount ?? null,
      isSober: data.isSober,
      accessibility: data.accessibility,
      visibility: data.visibility,
      groupId: data.groupId ?? null,
      placeId: data.placeId ?? null,
      addressLine,
      locationTier,
      minAttendees,
      costModel: data.costModel,
      contributionAmount: data.contributionAmount != null ? String(data.contributionAmount) : null,
      contributionCurrency: "USD",
      contributionNote: data.contributionNote || null,
      contactPhone: data.contactPhone || null,
      contactWhatsapp: data.contactWhatsapp || null,
    })
    .returning();
  return event;
}

// Host edits. status is deliberately not patchable here — it moves only via
// the review queue and the cancel path.
export async function updateEvent(eventId: number, hostUserId: string, data: Partial<InsertEvent>): Promise<Event> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new EventNotFoundError();
  if (event.hostUserId !== hostUserId) throw new NotEventHostError();
  const {
    status, cancelReason, cancelledAt, hostUserId: _h, createdByUserId: _c,
    // v3 — server-owned, never patchable by a host edit
    locationTier: _lt, minAttendees: _ma, infoScore: _is,
    hostVideoUrl: _hv, hostVideoPosterUrl: _hp, hostVideoDurationSec: _hd,
    hostVideoStatus: _hs, hostVideoRejectReason: _hr,
    ...safe
  } = data as any;
  const patch: Record<string, unknown> = { ...safe };
  if (typeof safe.suburb === "string" || typeof safe.city === "string") {
    const centroid = await suburbCentroidFor(
      (safe.suburb as string) ?? event.suburb ?? "",
      (safe.city as string) ?? event.city ?? "",
    );
    patch.lat = centroid?.lat ?? null;
    patch.lng = centroid?.lng ?? null;
  }
  const [updated] = await db.update(events).set(patch).where(eq(events.id, eventId)).returning();
  return updated;
}

export async function cancelHostedEvent(
  eventId: number,
  hostUserId: string,
  reason: string,
): Promise<Event> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new EventNotFoundError();
  if (event.hostUserId !== hostUserId) throw new NotEventHostError();
  if (event.status === "cancelled") return event;

  const [updated] = await db
    .update(events)
    .set({ status: "cancelled", cancelReason: reason, cancelledAt: new Date() })
    .where(eq(events.id, eventId))
    .returning();

  const affected = await db
    .select({ userId: eventAttendees.userId })
    .from(eventAttendees)
    .where(
      and(
        eq(eventAttendees.eventId, eventId),
        inArray(eventAttendees.status, ["going", "waitlisted", "requested"]),
      ),
    );
  if (affected.length > 0) {
    await db.insert(twinNotifications).values(
      affected.map((a) => ({
        userId: a.userId,
        type: "event_cancelled",
        title: `"${event.title}" was called off`,
        body: reason,
      })),
    );
  }
  return updated;
}

export type HostedEventRow = SerializedEvent & {
  goingCount: number;
};

// Everything the current user hosts or created, any status, soonest first.
export async function listHostedByUser(userId: string): Promise<HostedEventRow[]> {
  const rows = await db
    .select()
    .from(events)
    .where(or(eq(events.createdByUserId, userId), eq(events.hostUserId, userId)))
    .orderBy(desc(events.startsAt));
  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await db
        .select({ eventId: eventAttendees.eventId, c: count() })
        .from(eventAttendees)
        .where(and(inArray(eventAttendees.eventId, ids), eq(eventAttendees.status, "going")))
        .groupBy(eventAttendees.eventId)
    : [];
  const countById = new Map(counts.map((r) => [r.eventId, Number(r.c)]));
  return rows.map((r) => {
    const goingCount = countById.get(r.id) ?? 0;
    return {
      ...serializeEvent(r, { isHost: true, myStatus: null, goingCount }),
      goingCount,
    };
  });
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

// ── v3: places, venue photos, host video, contact release ──────────────

export async function listPlaces(q?: string, limit = 12): Promise<Place[]> {
  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    return db
      .select()
      .from(places)
      .where(or(ilike(places.name, like), ilike(places.suburb, like), ilike(places.addressLine, like)))
      .orderBy(asc(places.name))
      .limit(limit);
  }
  return db.select().from(places).orderBy(asc(places.name)).limit(limit);
}

export async function listEventPhotos(eventId: number): Promise<EventPhoto[]> {
  return db
    .select()
    .from(eventPhotos)
    .where(eq(eventPhotos.eventId, eventId))
    .orderBy(asc(eventPhotos.sortOrder), asc(eventPhotos.id));
}

async function requireHost(eventId: number, hostUserId: string): Promise<Event> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new EventNotFoundError();
  if (event.hostUserId !== hostUserId) throw new NotEventHostError();
  return event;
}

export async function addEventPhoto(
  eventId: number,
  hostUserId: string,
  photo: { url: string; width?: number | null; height?: number | null; caption?: string | null },
): Promise<EventPhoto> {
  await requireHost(eventId, hostUserId);
  const [{ c }] = await db.select({ c: count() }).from(eventPhotos).where(eq(eventPhotos.eventId, eventId));
  if (Number(c) >= 6) throw new PhotoLimitError();
  const [row] = await db
    .insert(eventPhotos)
    .values({
      eventId,
      url: photo.url,
      width: photo.width ?? null,
      height: photo.height ?? null,
      caption: photo.caption ? photo.caption.slice(0, 80) : null,
      sortOrder: Number(c),
    })
    .returning();
  return row;
}

export async function deleteEventPhoto(eventId: number, photoId: number, hostUserId: string): Promise<EventPhoto | undefined> {
  await requireHost(eventId, hostUserId);
  const [deleted] = await db
    .delete(eventPhotos)
    .where(and(eq(eventPhotos.id, photoId), eq(eventPhotos.eventId, eventId)))
    .returning();
  return deleted;
}

// The host video is RECORDED IN-APP only — there is no file-upload path. The
// client posts the recorded blob + a captured poster frame; we store both and
// queue for review. No server transcode (no ffmpeg): the .webm is served as-is.
export async function setHostVideo(
  eventId: number,
  hostUserId: string,
  v: { url: string; posterUrl: string; durationSec: number },
): Promise<Event> {
  await requireHost(eventId, hostUserId);
  const [updated] = await db
    .update(events)
    .set({
      hostVideoUrl: v.url,
      hostVideoPosterUrl: v.posterUrl,
      hostVideoDurationSec: Math.round(v.durationSec),
      hostVideoStatus: "processing",
      hostVideoRejectReason: null,
    })
    .where(eq(events.id, eventId))
    .returning();
  return updated;
}

export async function reviewHostVideo(
  eventId: number,
  moderatorId: string,
  decision: "approve" | "reject",
  reason?: string,
): Promise<Event> {
  if (!isEventModerator(moderatorId)) throw new ModeratorOnlyError();
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new EventNotFoundError();
  const approved = decision === "approve";
  const [updated] = await db
    .update(events)
    .set({
      hostVideoStatus: approved ? "approved" : "rejected",
      hostVideoRejectReason: approved ? null : reason || "It didn't meet the guidelines",
    })
    .where(eq(events.id, eventId))
    .returning();
  await db.insert(twinNotifications).values({
    userId: event.hostUserId,
    type: approved ? "host_video_approved" : "host_video_rejected",
    title: approved
      ? `Your video for "${event.title}" is live`
      : `Your video for "${event.title}" wasn't approved`,
    body: approved
      ? "It now shows on the event page."
      : reason || "Record another one, or host with photos only.",
  });
  return updated;
}

// Released only to a 'going' attendee, and only within 24h before start (to 6h
// after). Every access is logged. The host always sees their own numbers.
export async function getEventContact(
  eventId: number,
  viewerId: string,
): Promise<{ phone: string | null; whatsapp: string | null }> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new EventNotFoundError();
  if (event.hostUserId === viewerId) {
    return { phone: event.contactPhone, whatsapp: event.contactWhatsapp };
  }
  const [att] = await db
    .select({ status: eventAttendees.status })
    .from(eventAttendees)
    .where(and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.userId, viewerId)));
  if (att?.status !== "going") throw new ContactNotReleasedError();
  const now = Date.now();
  const opensAt = event.startsAt.getTime() - 24 * 60 * 60 * 1000;
  const closesAt = event.startsAt.getTime() + 6 * 60 * 60 * 1000;
  if (now < opensAt || now > closesAt) throw new ContactNotReleasedError();
  await db.insert(eventContactViews).values({ eventId, viewerUserId: viewerId });
  return { phone: event.contactPhone, whatsapp: event.contactWhatsapp };
}

export async function listContactViews(
  eventId: number,
  hostUserId: string,
): Promise<Array<{ firstName: string; viewedAt: Date | null }>> {
  await requireHost(eventId, hostUserId);
  const rows = await db
    .select({ viewedAt: eventContactViews.viewedAt, name: profiles.displayName })
    .from(eventContactViews)
    .leftJoin(profiles, eq(profiles.userId, eventContactViews.viewerUserId))
    .where(eq(eventContactViews.eventId, eventId))
    .orderBy(desc(eventContactViews.viewedAt));
  return rows.map((r) => ({ firstName: (r.name || "Someone").split(" ")[0], viewedAt: r.viewedAt }));
}

// Real Harare + Bulawayo venues — a host matching one of these gets the
// frictionless (venue_verified) path. Upserted by name (see upsertPlace) so a
// radius/coordinate tweak here also reaches a database that already ran this
// seed once — not just fresh installs.
const REAL_PLACES: Array<{
  name: string; addressLine: string; suburb: string; city: string;
  lat: string; lng: string; verified: boolean;
}> = [
  { name: "Corner Table", addressLine: "5 Aberdeen Rd, Avondale", suburb: "Avondale", city: "Harare", lat: "-17.796900", lng: "31.038900", verified: true },
  { name: "The Reading Room", addressLine: "12 King George Rd, Avondale", suburb: "Avondale", city: "Harare", lat: "-17.798000", lng: "31.040000", verified: true },
  { name: "Bottega Cafe", addressLine: "Sam Levy's Village, Borrowdale", suburb: "Borrowdale", city: "Harare", lat: "-17.750000", lng: "31.083300", verified: true },
  { name: "Amanzi Restaurant", addressLine: "158 Enterprise Rd, Highlands", suburb: "Highlands", city: "Harare", lat: "-17.790000", lng: "31.090000", verified: true },
  { name: "The Coffee Studio", addressLine: "Doon Estate, Msasa", suburb: "Msasa", city: "Harare", lat: "-17.840000", lng: "31.120000", verified: true },
  { name: "Cafe Nush", addressLine: "Sam Levy's Village, Borrowdale", suburb: "Borrowdale", city: "Harare", lat: "-17.750500", lng: "31.083800", verified: true },
  { name: "Alliance Francaise", addressLine: "328 Herbert Chitepo Ave, Milton Park", suburb: "Milton Park", city: "Harare", lat: "-17.820000", lng: "31.030000", verified: true },
  { name: "Mannenberg Jazz Club", addressLine: "Fife Ave Shopping Centre", suburb: "Belgravia", city: "Harare", lat: "-17.810000", lng: "31.045000", verified: true },
  { name: "Harare Sports Club", addressLine: "Josiah Tongogara Ave", suburb: "Belgravia", city: "Harare", lat: "-17.808000", lng: "31.047000", verified: true },
  { name: "Book Cafe (Alliance)", addressLine: "Josiah Tongogara Ave", suburb: "Belgravia", city: "Harare", lat: "-17.809000", lng: "31.046000", verified: true },
  { name: "The Bulawayo Club", addressLine: "Cnr 8th Ave & Fort St", suburb: "CBD", city: "Bulawayo", lat: "-20.150000", lng: "28.583000", verified: true },
  { name: "Indaba Book Cafe", addressLine: "Cnr Joshua Nkomo & 12th Ave", suburb: "CBD", city: "Bulawayo", lat: "-20.152000", lng: "28.585000", verified: true },
  { name: "The Cornerstone", addressLine: "Hillside Rd, Hillside", suburb: "Hillside", city: "Bulawayo", lat: "-20.170000", lng: "28.610000", verified: true },
  { name: "Kelvin's Restaurant", addressLine: "Kumalo Shopping Centre", suburb: "Kumalo", city: "Bulawayo", lat: "-20.150000", lng: "28.600000", verified: true },
];

// Small real venues (cafes, clubs) — a slightly generous radius over the
// building footprint so "resolved" doesn't miss someone at the next table
// because their GPS fix drifted 100m, without being so wide it swallows the
// block next door.
const REAL_PLACE_RADIUS_M = 180;

// Insert a place the first time it's seen; on every later run, update its
// coordinates/radius/type/name to match the current seed data instead of
// leaving old rows stuck at whatever was seeded originally. Matched by name,
// since `places` has no unique constraint to upsert against in SQL.
async function upsertPlace(p: {
  name: string; addressLine: string; suburb: string; city: string;
  lat: string; lng: string; placeType?: string; radiusM: number; verified: boolean;
}): Promise<void> {
  const [existing] = await db.select({ id: places.id }).from(places).where(eq(places.name, p.name)).limit(1);
  const values = {
    addressLine: p.addressLine,
    suburb: p.suburb,
    city: p.city,
    lat: p.lat,
    lng: p.lng,
    placeType: p.placeType ?? "venue",
    radiusM: p.radiusM,
    verifiedAt: p.verified ? new Date() : null,
  };
  if (existing) {
    await db.update(places).set(values).where(eq(places.id, existing.id));
  } else {
    await db.insert(places).values({ name: p.name, ...values });
  }
}

export async function seedPlaces(): Promise<void> {
  for (const p of REAL_PLACES) {
    await upsertPlace({ ...p, radiusM: REAL_PLACE_RADIUS_M });
  }
}

// Proximity gazetteer: campuses, malls, office parks, transit ranks. Curated on
// purpose — "someone at UZ" is only uncanny if it's a real named place, not a
// reverse-geocoded road. Grows via user-declared "I'm at…" places.
//
// Radii here are deliberately generous relative to the footprint of each
// place type — the original 80–400m band meant a real user in Harare rarely
// actually landed inside one, so proximity alerts almost never fired even
// for people genuinely nearby. Widening trades a little precision (someone
// across the road from a mall may register as "at" it) for the feature
// actually doing its job. Upserted by name — see upsertPlace — so widening a
// radius here also reaches a database that already ran this seed.
const PROXIMITY_PLACES: Array<{
  name: string; addressLine: string; suburb: string; city: string;
  lat: string; lng: string; placeType: string; radiusM: number;
}> = [
  { name: "University of Zimbabwe", addressLine: "630 Churchill Ave, Mount Pleasant", suburb: "Mount Pleasant", city: "Harare", lat: "-17.784200", lng: "31.052900", placeType: "campus", radiusM: 600 },
  { name: "Harare Institute of Technology", addressLine: "Ganges Rd, Belvedere", suburb: "Belvedere", city: "Harare", lat: "-17.848000", lng: "31.010000", placeType: "campus", radiusM: 500 },
  { name: "Africa University", addressLine: "Old Mutare Rd", suburb: "Mutare", city: "Mutare", lat: "-18.878000", lng: "32.640000", placeType: "campus", radiusM: 600 },
  { name: "National University of Science & Technology", addressLine: "Cnr Gwanda Rd & Cecil Ave", suburb: "Ascot", city: "Bulawayo", lat: "-20.176000", lng: "28.635000", placeType: "campus", radiusM: 600 },
  { name: "Midlands State University", addressLine: "Senga Rd", suburb: "Senga", city: "Gweru", lat: "-19.520000", lng: "29.830000", placeType: "campus", radiusM: 600 },
  { name: "Sam Levy's Village", addressLine: "Borrowdale Rd", suburb: "Borrowdale", city: "Harare", lat: "-17.749800", lng: "31.083500", placeType: "mall", radiusM: 250 },
  { name: "Westgate Shopping Centre", addressLine: "Bulawayo Rd", suburb: "Westgate", city: "Harare", lat: "-17.777000", lng: "30.973000", placeType: "mall", radiusM: 250 },
  { name: "Eastgate Mall", addressLine: "Robert Mugabe Rd", suburb: "CBD", city: "Harare", lat: "-17.829000", lng: "31.052000", placeType: "mall", radiusM: 200 },
  { name: "Joina City", addressLine: "Cnr Jason Moyo Ave & Julius Nyerere Way", suburb: "CBD", city: "Harare", lat: "-17.831000", lng: "31.047000", placeType: "mall", radiusM: 180 },
  { name: "Avondale Shopping Centre", addressLine: "King George Rd", suburb: "Avondale", city: "Harare", lat: "-17.797500", lng: "31.038500", placeType: "mall", radiusM: 200 },
  { name: "Arundel Village", addressLine: "Quorn Ave", suburb: "Mount Pleasant", city: "Harare", lat: "-17.773000", lng: "31.058000", placeType: "mall", radiusM: 200 },
  { name: "Bradfield Shopping Centre", addressLine: "Percy Ibbotson Ave", suburb: "Bradfield", city: "Bulawayo", lat: "-20.170000", lng: "28.600000", placeType: "mall", radiusM: 200 },
  { name: "Msasa Industrial Park", addressLine: "Mutare Rd", suburb: "Msasa", city: "Harare", lat: "-17.845000", lng: "31.115000", placeType: "office", radiusM: 350 },
  { name: "Newlands Office Park", addressLine: "Enterprise Rd", suburb: "Newlands", city: "Harare", lat: "-17.796000", lng: "31.075000", placeType: "office", radiusM: 250 },
  { name: "Eastgate / Rezende St taxi rank", addressLine: "Rezende St", suburb: "CBD", city: "Harare", lat: "-17.830500", lng: "31.051000", placeType: "transit", radiusM: 200 },
  { name: "Fourth Street Bus Terminus", addressLine: "Fourth St", suburb: "CBD", city: "Harare", lat: "-17.826000", lng: "31.049000", placeType: "transit", radiusM: 200 },
  { name: "Mbare Musika", addressLine: "Chaminuka Rd", suburb: "Mbare", city: "Harare", lat: "-17.855000", lng: "31.033000", placeType: "transit", radiusM: 300 },
  { name: "Renkini Bus Terminus", addressLine: "6th Ave Extension", suburb: "CBD", city: "Bulawayo", lat: "-20.163000", lng: "28.585000", placeType: "transit", radiusM: 250 },
];

export async function seedProximityPlaces(): Promise<void> {
  for (const p of PROXIMITY_PLACES) {
    await upsertPlace({ ...p, verified: true });
  }
}

// Neighborhood-level coverage. The gazetteer above skews heavily toward the
// affluent northern suburbs and a handful of CBD landmarks — it has zero
// points anywhere near Chitungwiza or Harare's high-density southwestern
// suburbs, despite those holding a huge share of the population. These are
// suburb-centroid accuracy (not a single building), so the radius is large
// on purpose: this is "someone's in this neighborhood right now," a coarser
// claim than "someone's at this specific mall." Coordinates from public
// gazetteer sources (Wikipedia / GPS lookup sites), verified before adding —
// see the PR description for sources.
const NEIGHBORHOOD_PLACES: Array<{
  name: string; addressLine: string; suburb: string; city: string;
  lat: string; lng: string;
}> = [
  { name: "Chitungwiza Town Centre", addressLine: "Chitungwiza", suburb: "Chitungwiza", city: "Chitungwiza", lat: "-17.993890", lng: "31.048060" },
  { name: "Highfield", addressLine: "Highfield", suburb: "Highfield", city: "Harare", lat: "-17.895300", lng: "30.990800" },
  { name: "Glen View", addressLine: "Glen View", suburb: "Glen View", city: "Harare", lat: "-17.902700", lng: "30.944200" },
  { name: "Kuwadzana", addressLine: "Kuwadzana", suburb: "Kuwadzana", city: "Harare", lat: "-17.833300", lng: "30.933300" },
  { name: "Epworth", addressLine: "Epworth", suburb: "Epworth", city: "Harare", lat: "-17.890000", lng: "31.147500" },
  { name: "Nkulumane", addressLine: "Nkulumane", suburb: "Nkulumane", city: "Bulawayo", lat: "-20.186700", lng: "28.510400" },
  { name: "Sakubva", addressLine: "Sakubva", suburb: "Sakubva", city: "Mutare", lat: "-18.983300", lng: "32.650000" },
  { name: "Gweru CBD", addressLine: "Gweru CBD", suburb: "CBD", city: "Gweru", lat: "-19.450000", lng: "29.816700" },
];
const NEIGHBORHOOD_RADIUS_M = 800;

export async function seedNeighborhoodPlaces(): Promise<void> {
  for (const p of NEIGHBORHOOD_PLACES) {
    await upsertPlace({ ...p, placeType: "suburb", radiusM: NEIGHBORHOOD_RADIUS_M, verified: true });
  }
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
      kind: "outdoors",
      vibes: ["active", "early", "outdoors"],
      placeType: "outdoors",
      visibility: "public",
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
      kind: "books",
      vibes: ["quiet", "seated"],
      placeType: "venue",
      visibility: "public",
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
      kind: "food",
      vibes: ["seated", "late"],
      placeType: "restaurant",
      visibility: "public",
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

// Suburb centroids for distance math when an event has no explicit lat/lng.
// Approximate; good enough for dev.
const SUBURB_CENTROIDS: Array<{ suburb: string; city: string; lat: number; lng: number }> = [
  // Harare
  { suburb: "Avondale", city: "Harare", lat: -17.7969, lng: 31.0389 },
  { suburb: "Avondale West", city: "Harare", lat: -17.79, lng: 31.028 },
  { suburb: "Belgravia", city: "Harare", lat: -17.81, lng: 31.045 },
  { suburb: "Borrowdale", city: "Harare", lat: -17.75, lng: 31.0833 },
  { suburb: "Borrowdale Brooke", city: "Harare", lat: -17.706, lng: 31.106 },
  { suburb: "Chisipite", city: "Harare", lat: -17.772, lng: 31.121 },
  { suburb: "Greendale", city: "Harare", lat: -17.807, lng: 31.13 },
  { suburb: "Greystone Park", city: "Harare", lat: -17.735, lng: 31.11 },
  { suburb: "Harare CBD", city: "Harare", lat: -17.8292, lng: 31.0522 },
  { suburb: "Highlands", city: "Harare", lat: -17.79, lng: 31.09 },
  { suburb: "Hatfield", city: "Harare", lat: -17.87, lng: 31.09 },
  { suburb: "Kamfinsa", city: "Harare", lat: -17.795, lng: 31.13 },
  { suburb: "Marlborough", city: "Harare", lat: -17.74, lng: 31.0 },
  { suburb: "Mabelreign", city: "Harare", lat: -17.77, lng: 30.98 },
  { suburb: "Milton Park", city: "Harare", lat: -17.82, lng: 31.03 },
  { suburb: "Mount Pleasant", city: "Harare", lat: -17.7667, lng: 31.05 },
  { suburb: "Msasa", city: "Harare", lat: -17.84, lng: 31.12 },
  { suburb: "Newlands", city: "Harare", lat: -17.8, lng: 31.0667 },
  { suburb: "Eastlea", city: "Harare", lat: -17.83, lng: 31.08 },
  { suburb: "Braeside", city: "Harare", lat: -17.845, lng: 31.07 },
  { suburb: "Mbare", city: "Harare", lat: -17.858, lng: 31.03 },
  { suburb: "Highfield", city: "Harare", lat: -17.88, lng: 30.98 },
  { suburb: "Glen View", city: "Harare", lat: -17.92, lng: 30.95 },
  { suburb: "Budiriro", city: "Harare", lat: -17.9, lng: 30.9 },
  { suburb: "Kuwadzana", city: "Harare", lat: -17.84, lng: 30.9 },
  { suburb: "Warren Park", city: "Harare", lat: -17.82, lng: 30.95 },
  { suburb: "Westgate", city: "Harare", lat: -17.76, lng: 30.96 },
  { suburb: "Ashdown Park", city: "Harare", lat: -17.775, lng: 30.985 },
  { suburb: "Mufakose", city: "Harare", lat: -17.87, lng: 30.94 },
  { suburb: "Waterfalls", city: "Harare", lat: -17.9, lng: 31.02 },
  { suburb: "Hatcliffe", city: "Harare", lat: -17.68, lng: 31.08 },
  { suburb: "Ruwa", city: "Harare", lat: -17.89, lng: 31.24 },
  { suburb: "Chitungwiza", city: "Harare", lat: -18.0128, lng: 31.0756 },
  { suburb: "Norton", city: "Harare", lat: -17.883, lng: 30.7 },
  { suburb: "Epworth", city: "Harare", lat: -17.89, lng: 31.15 },
  // Bulawayo
  { suburb: "Bulawayo CBD", city: "Bulawayo", lat: -20.1594, lng: 28.5886 },
  { suburb: "Hillside", city: "Bulawayo", lat: -20.17, lng: 28.61 },
  { suburb: "Suburbs", city: "Bulawayo", lat: -20.16, lng: 28.58 },
  { suburb: "Kumalo", city: "Bulawayo", lat: -20.15, lng: 28.6 },
  { suburb: "Famona", city: "Bulawayo", lat: -20.155, lng: 28.59 },
  { suburb: "Bradfield", city: "Bulawayo", lat: -20.18, lng: 28.6 },
  { suburb: "Hillside South", city: "Bulawayo", lat: -20.19, lng: 28.62 },
  { suburb: "Northend", city: "Bulawayo", lat: -20.14, lng: 28.58 },
  { suburb: "Pumula", city: "Bulawayo", lat: -20.22, lng: 28.55 },
  { suburb: "Nkulumane", city: "Bulawayo", lat: -20.21, lng: 28.53 },
  { suburb: "Luveve", city: "Bulawayo", lat: -20.12, lng: 28.53 },
  { suburb: "Entumbane", city: "Bulawayo", lat: -20.19, lng: 28.52 },
  // Other cities
  { suburb: "Mutare CBD", city: "Mutare", lat: -18.9707, lng: 32.6709 },
  { suburb: "Murambi", city: "Mutare", lat: -18.95, lng: 32.64 },
  { suburb: "Dangamvura", city: "Mutare", lat: -19.0, lng: 32.68 },
  { suburb: "Gweru CBD", city: "Gweru", lat: -19.4614, lng: 29.8022 },
  { suburb: "Kwekwe CBD", city: "Kwekwe", lat: -18.9281, lng: 29.8149 },
  { suburb: "Masvingo CBD", city: "Masvingo", lat: -20.0637, lng: 30.8277 },
  { suburb: "Kadoma CBD", city: "Kadoma", lat: -18.335, lng: 29.9155 },
  { suburb: "Chinhoyi CBD", city: "Chinhoyi", lat: -17.3667, lng: 30.2 },
  { suburb: "Victoria Falls", city: "Victoria Falls", lat: -17.9243, lng: 25.8572 },
];

export async function seedSuburbCentroids(): Promise<void> {
  for (const c of SUBURB_CENTROIDS) {
    await db
      .insert(suburbCentroids)
      .values({ suburb: c.suburb, city: c.city, lat: String(c.lat), lng: String(c.lng) })
      .onConflictDoNothing();
  }
}

// One-time backfill for pre-v2 seed events (columns added by drizzle-kit push
// land as null on existing rows). Idempotent — only touches rows where kind IS
// NULL and the title matches a known seed.
export async function backfillSeedEventsV2(): Promise<void> {
  const v2 = [
    { title: "Sunrise trail run, then breakfast", kind: "outdoors", vibes: ["active", "early", "outdoors"], placeType: "outdoors" },
    { title: "This month's pick — small room, real conversation", kind: "books", vibes: ["quiet", "seated"], placeType: "venue" },
    { title: "Table for six — long dinner", kind: "food", vibes: ["seated", "late"], placeType: "restaurant" },
  ];
  for (const e of v2) {
    await db
      .update(events)
      .set({ kind: e.kind, vibes: e.vibes, placeType: e.placeType, visibility: "public" })
      .where(and(eq(events.title, e.title), isNull(events.kind)));
  }
}
