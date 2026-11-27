// Notifications and direct messages.
// Split out of server/routes.ts; registered in the same order as before.
import type { Express } from "express";
import { storage } from "../storage";
import { and } from "drizzle-orm";
import * as push from "../push";
import * as safety from "../safety";
import { presentDirectMessages, findByClientId, cleanClientId, stoppedTyping } from "../dm-extras";
import { DM_TEXT_MAX } from "@shared/dm";
import { getUserId } from "./shared";

export function registerMessagesRoutes(app: Express) {
  app.get("/api/notifications", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const notifications = await storage.getNotifications(userId);
      res.json(notifications);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread-count", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const count = await storage.getUnreadNotificationCount(userId);
      res.json({ count });
    } catch (e) {
      res.status(500).json({ message: "Failed to get unread count" });
    }
  });

  app.put("/api/notifications/:id/read", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      await storage.markNotificationRead(parseInt(req.params.id), userId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to mark notification read" });
    }
  });

  app.get("/api/messages/:matchId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const matchId = parseInt(req.params.matchId);
    try {
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      if (match.user1Id !== userId && match.user2Id !== userId) return res.sendStatus(403);
      if (match.status !== "matched") return res.status(400).json({ message: "Not matched yet" });
      const msgs = await storage.getDirectMessages(matchId);
      // Viewing the thread is what clears its unread count on the chat list.
      storage.markDirectMessagesRead(matchId, userId).catch(() => {});
      res.json(await presentDirectMessages(msgs, userId));
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Called explicitly by the chat screen so the client can await it (the
  // read side effect on GET /api/messages/:matchId above is fire-and-forget
  // and isn't something the UI can key an optimistic update off of).
  app.put("/api/matches/:matchId/read", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const matchId = parseInt(req.params.matchId);
    try {
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      if (match.user1Id !== userId && match.user2Id !== userId) return res.sendStatus(403);
      await storage.markDirectMessagesRead(matchId, userId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to mark as read" });
    }
  });

  app.post("/api/messages/:matchId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const matchId = parseInt(req.params.matchId);
    const { content } = req.body;
    if (typeof content !== "string" || !content.trim()) return res.status(400).json({ message: "A message can't be empty" });
    if (content.length > DM_TEXT_MAX) return res.status(400).json({ message: "That message is too long" });
    // Set by the outbox, so a retry of a message that did arrive isn't sent twice.
    const clientId = cleanClientId(req.body?.clientId);
    try {
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      if (match.user1Id !== userId && match.user2Id !== userId) return res.sendStatus(403);
      if (match.status !== "matched") return res.status(400).json({ message: "Not matched yet" });
      if (await safety.blockIfHeld(res, userId)) return;
      const dup = await findByClientId(matchId, clientId);
      if (dup) return res.status(200).json((await presentDirectMessages([dup], userId))[0]);
      let msg;
      try {
        msg = await storage.sendDirectMessage(matchId, userId, content, { clientId });
      } catch (e) {
        msg = await findByClientId(matchId, clientId);
        if (!msg) throw e;
        return res.status(200).json((await presentDirectMessages([msg], userId))[0]);
      }
      stoppedTyping(matchId, userId);
      res.status(201).json((await presentDirectMessages([msg], userId))[0]);
      const recipientId = match.user1Id === userId ? match.user2Id : match.user1Id;
      safety.scanText({ senderId: userId, text: content, source: "dm", refId: msg.id, recipientId }).catch(() => {});
      const senderProfile = await storage.getProfile(userId);
      const senderName = senderProfile?.displayName || "Someone";
      push.sendCategorizedPush(recipientId, "messages", {
        title: senderName,
        body: typeof content === "string" ? content.slice(0, 140) : "Sent you a message",
        url: `/chat/${matchId}`,
        tag: `dm-${matchId}`,
      }).catch(() => {});
    } catch (e) {
      res.status(500).json({ message: "Failed to send message" });
    }
  });
}
