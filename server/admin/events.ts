// Admin console surface for the one review gate the app still holds
// pre-publish: a private-residence event, waiting on its host-verification
// video/ID check before it can go live. Everything else auto-publishes at
// creation (see server/events.ts createHostedEvent) and is handled reactively
// through the reports queue instead.
import type { Express } from "express";
import { adminRoute } from "./auth";
import { auditAdmin } from "./audit";
import * as eventsService from "../events";
import * as official from "../official-events";
import * as twinEventAlerts from "../services/twin-event-alerts";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { eventKindEnum, eventVibeEnum, eventPlaceTypeEnum } from "@shared/schema";

const officialEventSchema = z.object({
  title: z.string().trim().min(4).max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  kind: eventKindEnum,
  vibes: z.array(eventVibeEnum).max(7).default([]),
  placeType: eventPlaceTypeEnum,
  venueName: z.string().trim().max(120).optional().or(z.literal("")),
  suburb: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional().nullable(),
  coverImageUrl: z.string().trim().max(500).optional().or(z.literal("")),
  isSober: z.boolean().default(false),
  sponsorName: z.string().trim().max(80).optional().or(z.literal("")),
  sponsorLogoUrl: z.string().trim().max(500).optional().or(z.literal("")),
  minGoing: z.coerce.number().int().min(2).max(200).default(official.OFFICIAL_MIN_GOING_DEFAULT),
  seatCount: z.coerce.number().int().min(2).max(500).nullable().optional(),
}).refine((d) => !d.endsAt || d.endsAt.getTime() > d.startsAt.getTime(), {
  message: "End time has to be after the start",
  path: ["endsAt"],
});

function handleOfficialError(e: unknown, res: any, fallback: string) {
  if (e instanceof official.OfficialEventError) return res.status(400).json({ message: e.message });
  if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
  console.error(`[admin] ${fallback}:`, e);
  return res.status(500).json({ message: fallback });
}

export function registerAdminEventRoutes(app: Express) {
  // ── Official events (platform-run, with a volunteer lead) ──────────────
  adminRoute(app, "get", "/api/admin/events/official", "support", async (_req, res) => {
    try {
      res.json({ events: await official.listOfficialEventsForAdmin() });
    } catch (e) {
      handleOfficialError(e, res, "Failed to load official events");
    }
  });

  adminRoute(app, "post", "/api/admin/events/official", "admin", async (req, res) => {
    const parsed = officialEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid event data", errors: parsed.error.flatten() });
    }
    try {
      const event = await official.createOfficialEvent(parsed.data);
      await auditAdmin(req, (req as any).admin.userId, "event.official_create", { targetType: "event", targetId: event.id, details: { title: event.title, city: event.city } });
      void twinEventAlerts.runTwinEventAlerts(event.id).catch((err) => console.error("twin event alerts failed:", err));
      res.status(201).json(event);
    } catch (e) {
      handleOfficialError(e, res, "Failed to create official event");
    }
  });

  adminRoute(app, "post", "/api/admin/events/:id/repost", "admin", async (req, res) => {
    const eventId = Number(req.params.id);
    const startsAt = new Date(req.body?.startsAt);
    if (Number.isNaN(startsAt.getTime())) return res.status(400).json({ message: "Pick a new date" });
    try {
      const event = await official.repostOfficialEvent(eventId, startsAt);
      await auditAdmin(req, (req as any).admin.userId, "event.official_repost", { targetType: "event", targetId: event.id, details: { from: eventId } });
      void twinEventAlerts.runTwinEventAlerts(event.id).catch((err) => console.error("twin event alerts failed:", err));
      res.status(201).json(event);
    } catch (e) {
      handleOfficialError(e, res, "Failed to repost event");
    }
  });

  adminRoute(app, "post", "/api/admin/events/:id/lead/:appId/approve", "admin", async (req, res) => {
    const eventId = Number(req.params.id);
    const appId = Number(req.params.appId);
    try {
      const event = await official.approveLeadApplication(eventId, appId);
      await auditAdmin(req, (req as any).admin.userId, "event.lead_approve", { targetType: "event", targetId: eventId, details: { applicationId: appId } });
      res.json(event);
    } catch (e) {
      handleOfficialError(e, res, "Failed to approve lead");
    }
  });

  adminRoute(app, "post", "/api/admin/events/:id/lead/:appId/reject", "admin", async (req, res) => {
    const eventId = Number(req.params.id);
    const appId = Number(req.params.appId);
    try {
      await official.rejectLeadApplication(eventId, appId);
      await auditAdmin(req, (req as any).admin.userId, "event.lead_reject", { targetType: "event", targetId: eventId, details: { applicationId: appId } });
      res.json({ ok: true });
    } catch (e) {
      handleOfficialError(e, res, "Failed to reject lead");
    }
  });

  // Admin picks a lead directly (e.g. a sponsor's rep) by their member email.
  adminRoute(app, "post", "/api/admin/events/:id/assign-lead", "admin", async (req, res) => {
    const eventId = Number(req.params.id);
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!email) return res.status(400).json({ message: "Enter the member's email" });
    try {
      const [member] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
      if (!member) return res.status(404).json({ message: "No member with that email" });
      const userId = member.id;
      const event = await official.setEventLead(eventId, userId);
      await auditAdmin(req, (req as any).admin.userId, "event.lead_assign", { targetType: "event", targetId: eventId, details: { leadUserId: userId } });
      res.json(event);
    } catch (e) {
      handleOfficialError(e, res, "Failed to assign lead");
    }
  });

  adminRoute(app, "get", "/api/admin/events/pending", "support", async (req, res) => {
    try {
      const pending = await eventsService.listPendingReviewEvents();
      res.json({ events: pending });
    } catch (e) {
      console.error("[admin] pending events list error:", e);
      res.status(500).json({ message: "Failed to load pending events" });
    }
  });

  adminRoute(app, "post", "/api/admin/events/:id/approve", "support", async (req, res) => {
    const eventId = Number(req.params.id);
    try {
      await auditAdmin(req, (req as any).admin.userId, "event.approve", { targetType: "event", targetId: eventId });
      const event = await eventsService.adminApproveEvent(eventId);
      res.json(event);
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      console.error("[admin] approve event error:", e);
      res.status(500).json({ message: "Failed to approve event" });
    }
  });

  adminRoute(app, "post", "/api/admin/events/:id/reject", "support", async (req, res) => {
    const eventId = Number(req.params.id);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 2000) : "";
    if (!reason) return res.status(400).json({ message: "A reason is required" });
    try {
      await auditAdmin(req, (req as any).admin.userId, "event.reject", { targetType: "event", targetId: eventId, details: { reason } });
      const event = await eventsService.adminRejectEvent(eventId, reason);
      res.json(event);
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      console.error("[admin] reject event error:", e);
      res.status(500).json({ message: "Failed to reject event" });
    }
  });
}
