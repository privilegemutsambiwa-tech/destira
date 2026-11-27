// Private chat requests and room media.
// Split out of server/routes.ts; registered in the same order as before.
import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and, inArray } from "drizzle-orm";
import { blockedUsers, profiles } from "@shared/schema";
import * as gate from "../gate";
import { notifyMatch, getUserId } from "./shared";

export function registerChatRequestsRoutes(app: Express) {
  // Chat requests (DM request system)
  app.post("/api/chat-requests", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { targetId, groupId } = req.body;
    if (!targetId || !groupId) return res.status(400).json({ message: "targetId and groupId required" });
    try {
      const requesterProfile = await storage.getProfile(userId);
      const targetProfile = await storage.getProfile(targetId);
      if (!targetProfile) return res.status(404).json({ message: "Target user not found" });
      if (userId === targetId) return res.status(400).json({ message: "Cannot send request to yourself" });

      const requesterMember = await storage.getGroupMember(groupId, userId);
      if (!requesterMember) return res.status(403).json({ message: "Must be a group member to send chat requests" });

      const targetMember = await storage.getGroupMember(groupId, targetId);
      if (!targetMember) return res.status(403).json({ message: "Target user is not a member of this group" });

      const existingMatch = await storage.getMatchBetweenUsers(userId, targetId);
      if (existingMatch) return res.json({ status: "already_matched", match: existingMatch });

      const isBlockedByTarget = await db.select().from(blockedUsers)
        .where(and(eq(blockedUsers.blockerId, targetId), eq(blockedUsers.blockedId, userId)));
      const isBlockedByRequester = await db.select().from(blockedUsers)
        .where(and(eq(blockedUsers.blockerId, userId), eq(blockedUsers.blockedId, targetId)));
      if (isBlockedByTarget.length > 0 || isBlockedByRequester.length > 0) {
        return res.status(403).json({ message: "Cannot send chat request to this user" });
      }

      const requesterTier = requesterProfile?.subscriptionTier || "free";
      if (requesterTier === "vip") {
        const match = await storage.createMatch(userId, targetId);
        await storage.updateMatchStatus(match.id, "matched");
        void notifyMatch(match);
        return res.json({ status: "matched", match });
      }

      // Paying tiers only, and metered by tier — free's limit is 0, so this
      // rejects every free-tier attempt from the very first one.
      if (await gate.denyIfGated(res, userId, "group_chat_request")) return;

      const existingRequests = await storage.getChatRequests(userId);
      const pendingToTarget = existingRequests.find(
        r => r.requesterId === userId && r.targetId === targetId && r.status === "pending" &&
          r.expiresAt && new Date(r.expiresAt) > new Date()
      );
      if (pendingToTarget) return res.status(409).json({ message: "You already have a pending request to this user" });

      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const chatReq = await storage.createChatRequest(userId, targetId, groupId, expiresAt);
      const senderNickname = requesterProfile?.groupNickname || requesterProfile?.displayName || "Someone";
      await storage.createNotification(targetId, "chat_request", "Private Chat Request",
        `${senderNickname} wants to chat privately with you`);
      res.status(201).json(chatReq);
    } catch (e) {
      res.status(500).json({ message: "Failed to create chat request" });
    }
  });

  app.get("/api/chat-requests", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const requests = await storage.getChatRequests(userId);
      const enriched = await Promise.all(requests.map(async (r) => {
        const senderProfile = await storage.getProfile(r.requesterId);
        return {
          ...r,
          isIncoming: r.targetId === userId,
          senderNickname: senderProfile?.groupNickname || senderProfile?.displayName || "Someone",
          senderAvatarUrl: null,
        };
      }));
      res.json(enriched);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch chat requests" });
    }
  });

  app.patch("/api/chat-requests/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const requestId = parseInt(req.params.id);
    const { action } = req.body;
    if (!action || !["accept", "decline"].includes(action)) return res.status(400).json({ message: "action must be accept or decline" });
    try {
      const chatReq = await storage.getChatRequest(requestId);
      if (!chatReq) return res.status(404).json({ message: "Request not found" });
      if (chatReq.targetId !== userId) return res.status(403).json({ message: "Not authorized" });
      if (chatReq.expiresAt && new Date(chatReq.expiresAt) < new Date()) {
        return res.status(410).json({ message: "Request expired" });
      }
      await storage.updateChatRequestStatus(requestId, action === "accept" ? "accepted" : "declined");
      if (action === "accept") {
        const existing = await storage.getMatchBetweenUsers(chatReq.requesterId, chatReq.targetId);
        const wasAlreadyMatched = existing?.status === "matched";
        let match = existing;
        if (!match) {
          match = await storage.createMatch(chatReq.requesterId, chatReq.targetId);
        }
        await storage.updateMatchStatus(match.id, "matched");
        if (!wasAlreadyMatched) void notifyMatch(match);
        await storage.createNotification(chatReq.requesterId, "chat_request_accepted", "Chat Request Accepted", "Your private chat request was accepted!");
        return res.json({ status: "accepted", matchId: match.id });
      }
      await storage.createNotification(chatReq.requesterId, "chat_request_declined", "Chat Request Declined", "Your private chat request was declined.");
      res.json({ status: "declined" });
    } catch (e) {
      res.status(500).json({ message: "Failed to process chat request" });
    }
  });

  // Media gallery for group
  app.get("/api/groups/:id/media", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const media = await storage.getMediaMessages(parseInt(req.params.id));
      res.json(media);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch media" });
    }
  });

  // Delete own message
  app.delete("/api/messages/:messageId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const msg = await storage.getGroupMessage(parseInt(req.params.messageId));
      if (!msg) return res.status(404).json({ message: "Message not found" });
      if (msg.userId !== userId) return res.status(403).json({ message: "Can only delete own messages" });
      const deleted = await storage.deleteMessageForEveryone(msg.id);
      res.json(deleted);
    } catch (e) {
      res.status(500).json({ message: "Failed to delete message" });
    }
  });

  // Group messages with reactions (enriched)
  app.get("/api/groups/:id/messages-enriched", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      // Members only, and only messages from after they joined.
      const msgs = await storage.getVisibleGroupMessages(groupId, userId, 200);
      const msgIds = msgs.map(m => m.id);
      const uniqueUserIds = [...new Set(msgs.map(m => m.userId))];
      // Polled every few seconds by every open group chat: one query each,
      // side by side, not one profile lookup per sender in turn.
      const [reactions, starred, senderProfiles] = await Promise.all([
        msgIds.length > 0 ? storage.getReactionsForMessages(msgIds) : Promise.resolve([]),
        storage.getStarredMessages(groupId, userId),
        uniqueUserIds.length > 0
          ? db
              .select({ userId: profiles.userId, subscriptionTier: profiles.subscriptionTier, gender: profiles.gender })
              .from(profiles)
              .where(inArray(profiles.userId, uniqueUserIds))
          : Promise.resolve([]),
      ]);
      const reactionsByMsg: Record<number, any[]> = {};
      for (const r of reactions) {
        if (!reactionsByMsg[r.messageId]) reactionsByMsg[r.messageId] = [];
        reactionsByMsg[r.messageId].push(r);
      }
      const starredMsgIds = new Set(starred.map((s: any) => s.messageId));
      const profilesMap: Record<string, any> = {};
      for (const p of senderProfiles) profilesMap[p.userId] = p;
      const enriched = msgs.map(m => ({
        ...m,
        originalContent: null,
        mediaKey: null,
        reactions: reactionsByMsg[m.id] || [],
        isStarred: starredMsgIds.has(m.id),
        subscriptionTier: profilesMap[m.userId]?.subscriptionTier || "free",
        // Groups exist to find love, unlike a generic-interest chat — knowing
        // who's replying is part of the point, not incidental. Bare gender
        // only (no self-describe text, no age) — the smallest signal that
        // answers "is this a man or a woman replying" without over-exposing
        // anyone's profile inside a room they may not have fully opened up in.
        gender: profilesMap[m.userId]?.gender || null,
      }));
      res.json(enriched);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch enriched messages" });
    }
  });
}
