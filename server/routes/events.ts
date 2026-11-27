// Events: browse, host, attend, photos, resources and contact.
// Split out of server/routes.ts; registered in the same order as before.
import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { and } from "drizzle-orm";
import { updateEventSchema } from "@shared/schema";
import path from "path";
import sharp from "sharp";
import { putObject, deleteObject, generateFilename, keyFromUploadUrl } from "../storage/objectStorage";
import * as eventsService from "../events";
import * as officialEvents from "../official-events";
import * as eventsFeed from "../events-feed";
import * as twinEventAlerts from "../services/twin-event-alerts";
import { updateEventPreferencesSchema, eventSearchQuerySchema, hostEventSchema, cancelEventSchema, places, suburbCentroids } from "@shared/schema";
import * as gate from "../gate";
import * as emailTemplates from "../email/templates";
import { REPORT_CATEGORIES } from "@shared/admin";
import { reports as reportsTable } from "@shared/schema";
import { upload, uploadVideo, getUserId } from "./shared";

export function registerEventsRoutes(app: Express) {
  // ---- Events ----
  app.get("/api/events", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const groupId = req.query.groupId ? parseInt(req.query.groupId as string, 10) : undefined;
      const city = typeof req.query.city === "string" ? req.query.city : undefined;
      const from = req.query.from ? new Date(req.query.from as string) : undefined;
      const to = req.query.to ? new Date(req.query.to as string) : undefined;
      const list = await eventsService.listEvents(userId, { groupId, city, from, to });
      res.json(list);
    } catch (e) {
      console.error("List events error:", e);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  // The default Events view: filtered by the caller's saved event_preferences,
  // sorted by fit, capped at 30. Registered before /:id so "feed" / "search"
  // aren't parsed as an event id.
  app.get("/api/events/feed", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const result = await eventsFeed.getEventsFeed(userId);
      res.json(result);
    } catch (e) {
      console.error("Events feed error:", e);
      res.status(500).json({ message: "Failed to load your events feed" });
    }
  });

  // Explicit search — ignores saved preferences, sorts by date, hard cap 30.
  app.get("/api/events/search", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const parsed = eventSearchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid search", errors: parsed.error.flatten() });
    }
    try {
      const result = await eventsFeed.searchEvents(userId, parsed.data);
      res.json(result);
    } catch (e) {
      console.error("Events search error:", e);
      res.status(500).json({ message: "Search failed" });
    }
  });

  app.get("/api/event-preferences", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      res.json(await eventsFeed.getOrCreatePreferences(userId));
    } catch (e) {
      console.error("Get event preferences error:", e);
      res.status(500).json({ message: "Failed to load preferences" });
    }
  });

  // Live count for the distance slider on the preferences screen.
  app.get("/api/events/count", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const km = Math.max(1, Math.min(100, parseInt(String(req.query.distanceKm ?? "15"), 10) || 15));
    try {
      res.json({ count: await eventsFeed.countEventsWithinDistance(userId, km), distanceKm: km });
    } catch (e) {
      console.error("Events count error:", e);
      res.status(500).json({ message: "Failed to count events" });
    }
  });

  // Events the caller hosts or created — any status. Registered before /:id.
  app.get("/api/events/my-seats", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      res.json(await eventsService.listMySeats(userId));
    } catch (e) {
      console.error("List my seats error:", e);
      res.status(500).json({ message: "Failed to load your seats" });
    }
  });

  app.get("/api/events/mine", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      res.json(await eventsService.listHostedByUser(userId));
    } catch (e) {
      console.error("List hosted events error:", e);
      res.status(500).json({ message: "Failed to load your events" });
    }
  });

  app.patch("/api/event-preferences", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const parsed = updateEventPreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid preferences", errors: parsed.error.flatten() });
    }
    try {
      res.json(await eventsFeed.updatePreferences(userId, parsed.data));
    } catch (e) {
      console.error("Update event preferences error:", e);
      res.status(500).json({ message: "Failed to save preferences" });
    }
  });

  app.get("/api/events/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    try {
      const event = await eventsService.getEventDetail(eventId, userId);
      res.json(event);
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      console.error("Get event error:", e);
      res.status(500).json({ message: "Failed to fetch event" });
    }
  });

  // Official events: "I'll lead this" (admin approves in the console) and my
  // own application state for the detail page.
  app.get("/api/events/:id/lead", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    try {
      const application = await officialEvents.getMyLeadApplication(eventId, userId);
      res.json({ application: application ? { status: application.status, note: application.note } : null });
    } catch (e) {
      console.error("Get lead application error:", e);
      res.status(500).json({ message: "Failed to load" });
    }
  });

  app.post("/api/events/:id/lead/apply", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 500) : "";
    try {
      const application = await officialEvents.applyToLead(eventId, userId, note);
      res.status(201).json({ application: { status: application.status, note: application.note } });
    } catch (e) {
      if (e instanceof officialEvents.OfficialEventError) return res.status(400).json({ message: e.message });
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      console.error("Apply to lead error:", e);
      res.status(500).json({ message: "Failed to send your offer" });
    }
  });

  app.post("/api/events", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    if (await gate.denyIfGated(res, userId, "host_event")) return;
    const parsed = hostEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid event data", errors: parsed.error.flatten() });
    }
    try {
      const event = await eventsService.createHostedEvent(userId, parsed.data);
      if (event.status === "published") {
        void twinEventAlerts
          .runTwinEventAlerts(event.id)
          .catch((err) => console.error("twin event alerts failed:", err));
      }
      res.status(201).json(event);
    } catch (e) {
      if (e instanceof eventsService.NotGroupMemberError) return res.status(403).json({ message: e.message });
      if (e instanceof eventsService.HostRateLimitError) return res.status(429).json({ message: e.message });
      console.error("Create event error:", e);
      res.status(500).json({ message: "Failed to create event" });
    }
  });

  // Moderator action: move a first event out of pending_review. Gated by
  // EVENT_MODERATOR_IDS. Firing the twin alerts here mirrors the publish path.
  app.post("/api/events/:id/approve", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    try {
      const event = await eventsService.approveEvent(eventId, userId);
      if (event.status === "published") {
        void twinEventAlerts
          .runTwinEventAlerts(event.id)
          .catch((err) => console.error("twin event alerts failed:", err));
      }
      res.json(event);
    } catch (e) {
      if (e instanceof eventsService.ModeratorOnlyError) return res.status(403).json({ message: e.message });
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      console.error("Approve event error:", e);
      res.status(500).json({ message: "Failed to approve event" });
    }
  });

  // Distinct from POST /api/users/:id/report — reporting an event cites the
  // event as evidence (the admin console's "unpublish_event" moderation
  // action already knows how to act on that) but, unlike a profile report,
  // deliberately does NOT auto-block the host: someone flagging one event
  // (wrong address, feels unsafe, whatever) isn't necessarily saying they
  // never want to interact with that person again.
  app.post("/api/events/:id/report", async (req, res) => {
    const reporterId = getUserId(req);
    if (!reporterId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 1000) : "";
    const category = (REPORT_CATEGORIES as readonly string[]).includes(req.body?.category) ? req.body.category : "other";
    try {
      const event = await eventsService.getEventDetail(eventId, reporterId).catch(() => null);
      if (!event) return res.status(404).json({ message: "Event not found" });
      if (event.hostUserId === reporterId) return res.status(400).json({ message: "You can't report your own event" });
      await storage.createAuditLog(reporterId, "event_reported", { eventId, reason, category });
      const [newReport] = await db
        .insert(reportsTable)
        .values({
          reporterId,
          subjectId: event.hostUserId,
          category,
          freeText: reason || null,
          evidence: [{ type: "event", id: String(eventId) }],
        })
        .returning();
      const isSafety = category === "safety_escalation" || category === "underage_concern";
      emailTemplates.alertReportFiled({ reportId: newReport.id, category, isSafety }).catch(() => {});
      res.json({ success: true });
    } catch (err) {
      console.error("Event report submission error:", err);
      res.status(500).json({ message: "Failed to submit report" });
    }
  });

  app.post("/api/events/:id/cancel", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    const parsed = cancelEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "A reason is required", errors: parsed.error.flatten() });
    }
    try {
      const event = await eventsService.cancelHostedEvent(eventId, userId, parsed.data.reason);
      res.json(event);
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof eventsService.NotEventHostError) return res.status(403).json({ message: e.message });
      console.error("Cancel event error:", e);
      res.status(500).json({ message: "Failed to cancel event" });
    }
  });

  app.patch("/api/events/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    const parsed = updateEventSchema.safeParse({
      ...req.body,
      startsAt: req.body?.startsAt ? new Date(req.body.startsAt) : undefined,
      endsAt: req.body?.endsAt ? new Date(req.body.endsAt) : undefined,
    });
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid event data", errors: parsed.error.flatten() });
    }
    try {
      const event = await eventsService.updateEvent(eventId, userId, parsed.data);
      res.json(event);
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof eventsService.NotEventHostError) return res.status(403).json({ message: e.message });
      console.error("Update event error:", e);
      res.status(500).json({ message: "Failed to update event" });
    }
  });

  app.post("/api/events/:id/attend", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    try {
      const result = await eventsService.attendEvent(eventId, userId);
      res.json(result);
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof eventsService.GenderPolicyError) return res.status(403).json({ message: e.message });
      if (e instanceof eventsService.TicketRequiredError) return res.status(402).json({ code: "ticket_required", message: e.message });
      console.error("Attend event error:", e);
      res.status(500).json({ message: "Failed to join event" });
    }
  });

  app.delete("/api/events/:id/attend", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    try {
      const result = await eventsService.cancelEventAttendance(eventId, userId);
      res.json(result);
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      console.error("Cancel event attendance error:", e);
      res.status(500).json({ message: "Failed to cancel" });
    }
  });

  // Host-only, idempotent: creates the event's private attendee chat the
  // first time it's called, or just hands back the existing group id.
  app.post("/api/events/:id/chat/ensure", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    try {
      const groupId = await eventsService.ensureEventChatGroup(eventId, userId);
      res.json({ groupId });
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof eventsService.NotEventHostError) return res.status(403).json({ message: e.message });
      console.error("Ensure event chat error:", e);
      res.status(500).json({ message: "Failed to set up the event chat" });
    }
  });

  app.get("/api/events/:id/attendees", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    try {
      const attendees = await eventsService.getEventAttendeesList(eventId, userId);
      res.json(attendees);
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      console.error("List attendees error:", e);
      res.status(500).json({ message: "Failed to fetch attendees" });
    }
  });

  // Suburb typeahead + reverse lookup for the signup essentials "area" screen.
  app.get("/api/geo/suburbs", async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    const lat = req.query.lat != null ? Number(req.query.lat) : null;
    const lng = req.query.lng != null ? Number(req.query.lng) : null;
    try {
      const rows = await db
        .select({ suburb: suburbCentroids.suburb, city: suburbCentroids.city, lat: suburbCentroids.lat, lng: suburbCentroids.lng })
        .from(suburbCentroids);
      const shaped = rows.map((r) => ({
        suburb: r.suburb,
        city: r.city,
        label: `${r.suburb}, ${r.city}`,
        lat: r.lat != null ? Number(r.lat) : null,
        lng: r.lng != null ? Number(r.lng) : null,
      }));
      if (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
        const km = (a: number, b: number, c: number, d: number) => {
          const R = 6371, dLat = ((c - a) * Math.PI) / 180, dLng = ((d - b) * Math.PI) / 180;
          const s = Math.sin(dLat / 2) ** 2 + Math.cos((a * Math.PI) / 180) * Math.cos((c * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
          return 2 * R * Math.asin(Math.sqrt(s));
        };
        const nearest = shaped
          .filter((s) => s.lat != null && s.lng != null)
          .sort((x, y) => km(lat, lng, x.lat!, x.lng!) - km(lat, lng, y.lat!, y.lng!))
          .slice(0, 1);
        return res.json(nearest);
      }
      const list = q ? shaped.filter((s) => s.label.toLowerCase().includes(q)) : shaped;
      res.json(list.slice(0, 12));
    } catch (e) {
      console.error("Suburb lookup error:", e);
      res.status(500).json({ message: "Failed to load suburbs" });
    }
  });

  // ── Events v3: places, venue photos, host video, contact release ──

  app.get("/api/places", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    try {
      res.json(await eventsService.listPlaces(q));
    } catch (e) {
      console.error("List places error:", e);
      res.status(500).json({ message: "Failed to load places" });
    }
  });

  // Venue photos. EXIF (incl. GPS) is stripped by re-encoding through sharp —
  // sharp drops all metadata unless withMetadata() is called. Only the
  // 480/960/1600 webp variants are stored; the original buffer is never
  // written anywhere.
  app.post("/api/events/:id/photos", upload.single("image"), async (req: any, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    if (!req.file) return res.status(400).json({ message: "No image file provided" });
    const buf = req.file.buffer as Buffer;
    try {
      const base = generateFilename(req.file.originalname).replace(/\.[^.]+$/, "");
      const meta = await sharp(buf).rotate().metadata();
      const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
      if (longEdge < 1000) {
        return res.status(422).json({ message: `That image is ${longEdge}px on the long edge — venue photos need at least 1000px.` });
      }
      for (const w of [480, 960, 1600]) {
        const resized = await sharp(buf).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
        await putObject(`${base}-${w}.webp`, resized, "image/webp");
      }
      const caption = typeof req.body?.caption === "string" ? req.body.caption : null;
      const photo = await eventsService.addEventPhoto(eventId, userId, {
        url: `/uploads/${base}-1600.webp`,
        width: meta.width ?? null,
        height: meta.height ?? null,
        caption,
      });
      res.status(201).json(photo);
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof eventsService.NotEventHostError) return res.status(403).json({ message: e.message });
      if (e instanceof eventsService.PhotoLimitError) return res.status(422).json({ message: e.message });
      console.error("Event photo error:", e);
      res.status(500).json({ message: "Failed to add photo" });
    }
  });

  app.delete("/api/events/:id/photos/:photoId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    const photoId = parseInt(req.params.photoId, 10);
    if (Number.isNaN(eventId) || Number.isNaN(photoId)) return res.status(400).json({ message: "Invalid id" });
    try {
      const photo = await eventsService.deleteEventPhoto(eventId, photoId, userId);
      res.json({ success: true });
      // Only the -1600 variant is tracked in the DB row (see POST above),
      // but upload wrote -480/-960 siblings too — clean up all three.
      const key1600 = keyFromUploadUrl(photo?.url);
      if (key1600 && key1600.endsWith("-1600.webp")) {
        const base = key1600.slice(0, -"-1600.webp".length);
        await Promise.allSettled([480, 960, 1600].map((w) => deleteObject(`${base}-${w}.webp`)));
      }
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof eventsService.NotEventHostError) return res.status(403).json({ message: e.message });
      console.error("Delete event photo error:", e);
      res.status(500).json({ message: "Failed to remove photo" });
    }
  });

  // What "going" attendees are volunteering to bring — visible to every
  // other attendee, not just the host. No auth restriction on the read side
  // beyond being logged in: this is the same audience that can already see
  // who's going.
  app.get("/api/events/:id/resources", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    try {
      const resources = await eventsService.listEventResources(eventId);
      res.json(resources);
    } catch (e) {
      console.error("List event resources error:", e);
      res.status(500).json({ message: "Failed to fetch resources" });
    }
  });

  app.post("/api/events/:id/resources", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    if (!description) return res.status(400).json({ message: "Say what you're bringing" });
    try {
      const pledge = await eventsService.addEventResource(eventId, userId, description);
      res.status(201).json(pledge);
    } catch (e) {
      if (e instanceof eventsService.NotGoingError) return res.status(403).json({ message: e.message });
      if (e instanceof eventsService.ResourcePledgeLimitError) return res.status(422).json({ message: e.message });
      console.error("Add event resource error:", e);
      res.status(500).json({ message: "Failed to add that" });
    }
  });

  app.delete("/api/events/:id/resources/:pledgeId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    const pledgeId = parseInt(req.params.pledgeId, 10);
    if (Number.isNaN(eventId) || Number.isNaN(pledgeId)) return res.status(400).json({ message: "Invalid id" });
    try {
      const deleted = await eventsService.deleteEventResource(eventId, pledgeId, userId);
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ success: true });
    } catch (e) {
      console.error("Delete event resource error:", e);
      res.status(500).json({ message: "Failed to remove that" });
    }
  });

  // Host video — RECORDED IN-APP ONLY. The client posts the recorded webm blob
  // plus a captured poster frame and the measured duration. No file-picker path
  // exists on the client; there is no server transcode (no ffmpeg).
  app.post(
    "/api/events/:id/host-video",
    uploadVideo.fields([{ name: "video", maxCount: 1 }, { name: "poster", maxCount: 1 }]),
    async (req: any, res) => {
      const userId = getUserId(req);
      if (!userId) return res.sendStatus(401);
      const eventId = parseInt(req.params.id, 10);
      if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
      const video = req.files?.video?.[0];
      const poster = req.files?.poster?.[0];
      if (!video) return res.status(400).json({ message: "No video provided" });
      const durationSec = Number(req.body?.durationSec);
      if (!Number.isFinite(durationSec) || durationSec < 10 || durationSec > 60) {
        return res.status(422).json({ message: "The video needs to be between 10 and 60 seconds." });
      }
      try {
        const videoFilename = generateFilename(video.originalname, ".webm");
        await putObject(videoFilename, video.buffer, video.mimetype);
        let posterFilename = "";
        if (poster) {
          posterFilename = generateFilename(poster.originalname);
          await putObject(posterFilename, poster.buffer, poster.mimetype);
        }
        const updated = await eventsService.setHostVideo(eventId, userId, {
          url: `/uploads/${videoFilename}`,
          posterUrl: posterFilename ? `/uploads/${posterFilename}` : "",
          durationSec,
        });
        res.status(201).json({ hostVideoStatus: updated.hostVideoStatus });
      } catch (e) {
        if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
        if (e instanceof eventsService.NotEventHostError) return res.status(403).json({ message: e.message });
        console.error("Host video error:", e);
        res.status(500).json({ message: "Failed to save video" });
      }
    },
  );

  app.post("/api/events/:id/host-video/review", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    const { decision, reason } = req.body ?? {};
    if (decision !== "approve" && decision !== "reject") {
      return res.status(400).json({ message: "decision must be 'approve' or 'reject'" });
    }
    try {
      const updated = await eventsService.reviewHostVideo(
        eventId,
        userId,
        decision,
        typeof reason === "string" ? reason : undefined,
      );
      res.json({ hostVideoStatus: updated.hostVideoStatus });
    } catch (e) {
      if (e instanceof eventsService.ModeratorOnlyError) return res.status(403).json({ message: e.message });
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      console.error("Review host video error:", e);
      res.status(500).json({ message: "Failed to review video" });
    }
  });

  // Contact release — 'going' attendees only, 24h before start to 6h after,
  // every access logged. The host always sees their own numbers.
  app.get("/api/events/:id/contact", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    try {
      res.json(await eventsService.getEventContact(eventId, userId));
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof eventsService.ContactNotReleasedError) return res.status(403).json({ message: e.message });
      console.error("Event contact error:", e);
      res.status(500).json({ message: "Failed to load contact" });
    }
  });

  app.get("/api/events/:id/contact-views", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    try {
      res.json(await eventsService.listContactViews(eventId, userId));
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof eventsService.NotEventHostError) return res.status(403).json({ message: e.message });
      console.error("List contact views error:", e);
      res.status(500).json({ message: "Failed to load contact views" });
    }
  });

  // Unauthenticated by design (dev convenience — no session needed to reset
  // local sample data), which is exactly why it must never be reachable in
  // production: it's a public POST anyone could hit, and its only effect
  // (once real groups exist) is a harmless no-op, but there's no legitimate
  // reason to expose it there at all.
  app.post("/api/demo/seed", async (req, res) => {
    if (process.env.NODE_ENV === "production") return res.sendStatus(404);
    try {
      await storage.seedDemoData();
      res.json({ message: "Demo data seeded successfully" });
    } catch (e) {
      console.error("Seed error:", e);
      res.status(500).json({ message: "Failed to seed demo data" });
    }
  });
}
