// Admin console surface for the one review gate the app still holds
// pre-publish: a private-residence event, waiting on its host-verification
// video/ID check before it can go live. Everything else auto-publishes at
// creation (see server/events.ts createHostedEvent) and is handled reactively
// through the reports queue instead.
import type { Express } from "express";
import { adminRoute } from "./auth";
import { auditAdmin } from "./audit";
import * as eventsService from "../events";

export function registerAdminEventRoutes(app: Express) {
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
