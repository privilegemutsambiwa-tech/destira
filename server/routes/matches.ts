// Likes, passes, matches and unmatching.
// Split out of server/routes.ts; registered in the same order as before.
import type { Express } from "express";
import { storage } from "../storage";
import { and } from "drizzle-orm";
import * as push from "../push";
import * as gate from "../gate";
import * as safety from "../safety";
import { undoOrRewind } from "../discover-perks";
import { loveBlockedReason } from "../friends";
import { notifyMatch, getUserId } from "./shared";

export function registerMatchesRoutes(app: Express) {
  app.get("/api/matches", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const matchesWithProfiles = await storage.getMatchesWithProfiles(userId);
      res.json(matchesWithProfiles);
    } catch (e) {
      console.error("Matches error:", e);
      res.status(500).json({ message: "Failed to fetch matches" });
    }
  });

  // "Not interested" from the Discover deck, persisted so this person never
  // comes back into the feed, the same permanence a like already has.
  // Counted against daily_passes (free only), so nobody can pass through the
  // whole deck to see everyone; a repeat of a pass already recorded (a retry
  // from a weak connection) is never refused.
  app.post("/api/discover/pass", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const targetId = typeof req.body?.targetId === "string" ? req.body.targetId : undefined;
    if (!targetId) return res.status(400).json({ message: "targetId is required" });
    try {
      const already = await storage.hasDiscoverPass(userId, targetId);
      if (!already) {
        const g = await gate.checkGate(userId, "daily_passes");
        if (!g.ok) return res.status(403).json(gate.gateBody(g, "daily_passes"));
      }
      await storage.recordDiscoverPass(userId, targetId);
      res.json({ ok: true });
    } catch (e) {
      console.error("Discover pass error:", e);
      res.status(500).json({ message: "Failed to record pass" });
    }
  });

  // Free for everyone right after the pass: an accidental pass shouldn't
  // cost money to take back. Later it's a rewind (server/discover-perks.ts).
  app.delete("/api/discover/pass/:targetId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const r = await undoOrRewind(userId, String(req.params.targetId));
      res.status(r.status).json(r.body);
    } catch (e) {
      console.error("Undo pass error:", e);
      res.status(500).json({ message: "Couldn't undo that pass" });
    }
  });

  app.post("/api/matches", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { targetId } = req.body;
    if (await safety.blockIfHeld(res, userId)) return;
    try {
      const blockedByTarget = await storage.isBlocked(targetId, userId);
      if (blockedByTarget) return res.status(403).json({ message: "Cannot connect with this user" });
      const userBlockedTarget = await storage.isBlocked(userId, targetId);
      if (userBlockedTarget) return res.status(403).json({ message: "You have blocked this user" });
      // Friends is never romantic: no likes to or from someone here for friends only.
      const notDating = await loveBlockedReason(userId, targetId);
      if (notDating) return res.status(403).json({ message: notDating });

      const existing = await storage.getActiveMatchBetweenUsers(userId, targetId);
      // They liked the caller first and the caller just liked them back from
      // Discover — that's a mutual match, same as the Likes page's like-back
      // (which isn't counted against the daily cap either).
      if (existing && existing.status === "pending" && existing.user1Id === targetId && existing.user2Id === userId) {
        const updated = await storage.updateMatchStatus(existing.id, "matched");
        void notifyMatch(updated);
        return res.status(200).json({ ...updated, mutual: true });
      }

      const currentLikes = await storage.getDailyLikeCount(userId);
      const g = await gate.checkGate(userId, "daily_likes", { countOverride: currentLikes });
      if (!g.ok) return res.status(403).json(gate.gateBody(g, "daily_likes"));

      if (existing) {
        return res.status(409).json({ message: "Match request already exists", match: existing });
      }
      await storage.incrementDailyLikes(userId);
      const match = await storage.createMatch(userId, targetId);
      res.status(201).json(match);
      safety.checkLikeBurst(userId).catch(() => {});
      // No name — "who" stays a paid feature (see_who_asked). One tag, so a
      // run of likes collapses into a single notification instead of a pile.
      push.sendCategorizedPush(targetId, "matches", {
        title: "Someone liked you",
        body: "See it on your Likes page. Like them back and it's a match.",
        // The Likes page ("Liked you" tab), where the like is waiting.
        url: "/matches",
        tag: "likes-waiting",
      }).catch(() => {});
    } catch (e) {
      console.error("Match create error:", e);
      res.status(500).json({ message: "Failed to create match" });
    }
  });

  app.put("/api/matches/:id/respond", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const matchId = parseInt(req.params.id);
    const { action } = req.body;
    try {
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      if (match.user2Id !== userId) return res.status(403).json({ message: "Not authorized" });
      const status = action === "accept" ? "matched" : "rejected";
      const updated = await storage.updateMatchStatus(matchId, status);
      if (status === "matched" && match.status !== "matched") void notifyMatch(updated);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ message: "Failed to respond to match" });
    }
  });

  app.put("/api/matches/:id/soft-delete", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const matchId = parseInt(req.params.id);
    try {
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      if (match.user1Id !== userId && match.user2Id !== userId) return res.sendStatus(403);
      const updated = await storage.softDeleteChat(matchId, userId);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ message: "Failed to delete chat" });
    }
  });

  app.put("/api/matches/:id/unmatch", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const matchId = parseInt(req.params.id);
    try {
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      if (match.user1Id !== userId && match.user2Id !== userId) return res.sendStatus(403);
      const updated = await storage.unmatch(matchId);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ message: "Failed to unmatch" });
    }
  });
}
