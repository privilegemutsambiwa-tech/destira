import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { z } from "zod";
import OpenAI from "openai";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { db } from "./db";
import { sql } from "drizzle-orm";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname) || ".jpg";
      cb(null, `${uniqueSuffix}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, WebP, and GIF images are allowed"));
    }
  },
});

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  function getUserId(req: any): string | null {
    if (!req.isAuthenticated()) return null;
    return (req.user as any).claims.sub;
  }

  app.get("/api/profiles/me", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const profile = await storage.getProfile(userId);
    if (!profile) return res.status(404).json({ message: "Profile not found" });
    res.json(profile);
  });

  app.get("/api/profiles/discover", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const discoverable = await storage.getDiscoverableProfiles(userId);
      res.json(discoverable);
    } catch (e) {
      console.error("Discover error:", e);
      res.status(500).json({ message: "Failed to fetch profiles" });
    }
  });

  app.post("/api/profiles/generate-twin", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { answers } = req.body;
    try {
      const response = await openai.chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert personality profiler for a dating app called VibeFlow. Based on the user's answers to soul-mapping questions, create a rich, warm, first-person AI Twin persona description. Write in first person as "I'm [the user]'s AI Twin." Include key values, interests, communication style, what they look for in a partner, and personality traits. Keep it to 2-3 paragraphs.`
          },
          { role: "user", content: JSON.stringify(answers) }
        ]
      });
      const twinPersona = response.choices[0].message.content || "A thoughtful person who values authentic connections.";
      res.json({ twinPersona });
    } catch (e) {
      console.error("Twin generation error:", e);
      res.json({ twinPersona: "A thoughtful and genuine person who values authentic connections. They believe in being real over being perfect, and they're looking for someone who shares that philosophy." });
    }
  });

  app.post("/api/profiles/generate-summary", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const profile = await storage.getProfile(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });
      const response = await openai.chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Generate two short summaries for a dating profile. Return JSON with: {"aboutSummary": "A 1-2 sentence witty 'About Me' summary", "personalitySummary": "A 1-2 sentence personality passage based on their traits"}. Make them warm, genuine, and engaging.`
          },
          { role: "user", content: JSON.stringify({ bio: profile.bio, personality: profile.personalityProfile, displayName: profile.displayName }) }
        ],
        response_format: { type: "json_object" }
      });
      const summaries = JSON.parse(response.choices[0].message.content || "{}");
      await storage.updateProfile(userId, {
        aboutSummary: summaries.aboutSummary,
        personalitySummary: summaries.personalitySummary,
      });
      res.json(summaries);
    } catch (e) {
      console.error("Summary generation error:", e);
      res.status(500).json({ message: "Failed to generate summary" });
    }
  });

  app.post("/api/profiles", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const existing = await storage.getProfile(userId);
      if (existing) {
        const updated = await storage.updateProfile(userId, req.body);
        return res.json(updated);
      }
      const profile = await storage.createProfile({ ...req.body, userId });
      res.status(201).json(profile);
    } catch (err) {
      console.error("Profile create error:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.put("/api/profiles/:userId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    if (req.params.userId !== userId) return res.sendStatus(403);
    try {
      const updated = await storage.updateProfile(userId, req.body);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Error updating profile" });
    }
  });

  app.get("/api/profiles/:userId", async (req, res) => {
    const profile = await storage.getProfileWithUser(req.params.userId);
    if (!profile) return res.status(404).json({ message: "Profile not found" });
    res.json(profile);
  });

  app.use("/uploads", (await import("express")).default.static(UPLOAD_DIR));

  app.post("/api/uploads/image", upload.single("image"), (req: any, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    if (!req.file) return res.status(400).json({ message: "No image file provided" });
    const url = `/uploads/${req.file.filename}`;
    res.json({ url, filename: req.file.filename });
  });

  app.get("/api/photos/:userId", async (req, res) => {
    const currentUserId = getUserId(req);
    if (!currentUserId) return res.sendStatus(401);
    try {
      const targetUserId = req.params.userId;
      if (targetUserId !== currentUserId) {
        const profile = await storage.getProfile(targetUserId);
        if (profile && !profile.isPublic) {
          return res.json([]);
        }
      }
      const photos = await storage.getUserPhotos(targetUserId);
      res.json(photos);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch photos" });
    }
  });

  app.post("/api/photos", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { photoUrl, orderIndex, isMainProfilePhoto } = req.body;
    try {
      const photo = await storage.addUserPhoto(userId, photoUrl, orderIndex || 0, isMainProfilePhoto);
      res.status(201).json(photo);
    } catch (e) {
      res.status(500).json({ message: "Failed to add photo" });
    }
  });

  app.delete("/api/photos/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      await storage.deleteUserPhoto(parseInt(req.params.id));
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to delete photo" });
    }
  });

  app.put("/api/photos/reorder", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { photoIds } = req.body;
    try {
      await storage.reorderUserPhotos(userId, photoIds);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to reorder photos" });
    }
  });

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

  app.post("/api/matches", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { targetId } = req.body;
    try {
      const existing = await storage.getMatchBetweenUsers(userId, targetId);
      if (existing) {
        return res.status(409).json({ message: "Match request already exists", match: existing });
      }
      const match = await storage.createMatch(userId, targetId);
      res.status(201).json(match);
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

  app.get("/api/interviews", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const interviewsWithProfiles = await storage.getInterviewsWithProfiles(userId);
      res.json(interviewsWithProfiles);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch interviews" });
    }
  });

  app.post("/api/interviews", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { targetId } = req.body;
    try {
      const interview = await storage.createInterview(userId, targetId);
      res.status(201).json(interview);
    } catch (e) {
      console.error("Interview start error:", e);
      res.status(500).json({ message: "Failed to start interview" });
    }
  });

  app.post("/api/interviews/:id/chat", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { message } = req.body;
    const interviewId = parseInt(req.params.id);

    const interview = await storage.getInterview(interviewId);
    if (!interview) return res.status(404).json({ message: "Interview not found" });

    const targetProfile = await storage.getProfile(interview.targetId);
    if (!targetProfile) return res.status(404).json({ message: "Target profile not found" });

    let history: { role: string; content: string }[] = [];
    try {
      if (interview.transcript) {
        history = JSON.parse(interview.transcript);
      }
    } catch (e) {
      history = [];
    }

    history.push({ role: "user", content: message });

    try {
      const completion = await openai.chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an AI Twin representing ${targetProfile.displayName} on a dating app called VibeFlow. ${targetProfile.twinPersona || "You are friendly, open, and genuine."}

Stay in character as ${targetProfile.displayName}'s AI Twin. Be warm, engaging, and authentic. Share personality traits, values, and interests naturally. Keep responses conversational (2-4 sentences). Be friendly but respectful.`
          },
          ...history.map((h: any) => ({ role: h.role as "user" | "assistant", content: h.content }))
        ]
      });

      const aiResponse = completion.choices[0].message.content || "I'd love to tell you more about that in person!";
      history.push({ role: "assistant", content: aiResponse });

      await storage.updateInterviewTranscript(interviewId, JSON.stringify(history));

      res.json({ response: aiResponse });
    } catch (e) {
      console.error("AI Twin chat error:", e);
      const fallbacks = [
        "That's a great question! I'd love to share more about that when we connect in person.",
        "I'm reflecting on that... my human self would have a lot to say about it!",
        "Hmm, let me think about that one. What about you?",
      ];
      const fallback = fallbacks[Math.floor(Math.random() * fallbacks.length)];
      history.push({ role: "assistant", content: fallback });
      await storage.updateInterviewTranscript(interviewId, JSON.stringify(history));
      res.json({ response: fallback });
    }
  });

  app.post("/api/twin/chat", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { message } = req.body;
    try {
      const profile = await storage.getProfile(userId);
      if (!profile || !profile.twinPersona) {
        return res.status(400).json({ message: "Complete onboarding first" });
      }
      const memory = await storage.getTwinMemory(userId, 20);
      const memoryMessages = memory.reverse().map(m => ({
        role: m.role as "user" | "assistant",
        content: m.message,
      }));
      await storage.addTwinMemory(userId, message, "user");

      const completion = await openai.chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are the AI Twin of the user on VibeFlow. ${profile.twinPersona}

You are chatting with your human self. Be reflective, insightful, supportive. Help them understand themselves better. Reference past conversations when relevant. Keep responses conversational (2-4 sentences).`
          },
          ...memoryMessages,
          { role: "user", content: message }
        ]
      });

      const aiResponse = completion.choices[0].message.content || "I hear you. Tell me more about what's on your mind.";
      await storage.addTwinMemory(userId, aiResponse, "assistant");
      res.json({ response: aiResponse });
    } catch (e) {
      console.error("Twin self-chat error:", e);
      const fallback = "I'm here for you. Let's talk about what's on your mind.";
      await storage.addTwinMemory(userId, fallback, "assistant");
      res.json({ response: fallback });
    }
  });

  app.get("/api/twin/memory", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const memory = await storage.getTwinMemory(userId, 50);
      res.json(memory);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch twin memory" });
    }
  });

  app.put("/api/twin/training-opt-out", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { useForTraining } = req.body;
    try {
      await storage.updateTwinTrainingOptOut(userId, useForTraining);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to update training preference" });
    }
  });

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
      await storage.markNotificationRead(parseInt(req.params.id));
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
      res.json(msgs);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/messages/:matchId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const matchId = parseInt(req.params.matchId);
    const { content } = req.body;
    try {
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      if (match.user1Id !== userId && match.user2Id !== userId) return res.sendStatus(403);
      if (match.status !== "matched") return res.status(400).json({ message: "Not matched yet" });
      const msg = await storage.sendDirectMessage(matchId, userId, content);
      res.status(201).json(msg);
    } catch (e) {
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.get("/api/groups", async (req, res) => {
    const userId = getUserId(req);
    const search = req.query.search as string | undefined;
    try {
      let allGroups;
      if (search) {
        allGroups = await storage.searchGroups(search);
      } else {
        allGroups = await storage.getGroups();
      }
      const groupsWithCounts = await Promise.all(allGroups.map(async (g) => {
        const members = await storage.getGroupMembers(g.id);
        const isMember = userId ? members.some(m => m.userId === userId) : false;
        const myRole = userId ? members.find(m => m.userId === userId)?.role : undefined;
        return { ...g, memberCount: members.length, isMember, myRole };
      }));
      res.json(groupsWithCounts);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch groups" });
    }
  });

  app.post("/api/groups", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { name, description, type, iconUrl, categoryTags, privacyMode, mediaEnabled, stickersEnabled, postingPermission, inviteDirectJoinEnabled } = req.body;
    try {
      const group = await storage.createGroupFull({
        name, description: description || "", type: type || "custom",
        ownerId: userId, iconUrl, categoryTags, privacyMode,
        mediaEnabled, stickersEnabled, postingPermission, inviteDirectJoinEnabled,
      });
      const adjectives = ["Curious", "Dreamy", "Bold", "Gentle", "Witty", "Bright", "Calm", "Warm"];
      const nouns = ["Phoenix", "River", "Cloud", "Star", "Wave", "Spark", "Moon", "Breeze"];
      const nickname = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
      await storage.joinGroup(group.id, userId, nickname);
      await storage.updateGroupMemberRole(group.id, userId, "owner");
      res.status(201).json(group);
    } catch (e) {
      console.error("Group create error:", e);
      res.status(500).json({ message: "Failed to create group" });
    }
  });

  app.get("/api/groups/:id", async (req, res) => {
    const groupId = parseInt(req.params.id);
    const userId = getUserId(req);
    try {
      const group = await storage.getGroup(groupId);
      if (!group) return res.status(404).json({ message: "Group not found" });
      const members = await storage.getGroupMembers(groupId);
      const isMember = userId ? members.some(m => m.userId === userId) : false;
      const myRole = userId ? members.find(m => m.userId === userId)?.role : undefined;
      res.json({ ...group, memberCount: members.length, members, isMember, myRole });
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch group" });
    }
  });

  app.put("/api/groups/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Only admins can edit group settings" });
      }
      const updated = await storage.updateGroup(groupId, req.body);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ message: "Failed to update group" });
    }
  });

  app.delete("/api/groups/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member || member.role !== "owner") {
        return res.status(403).json({ message: "Only owner can delete group" });
      }
      await storage.deleteGroup(groupId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to delete group" });
    }
  });

  app.post("/api/groups/:id/join", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const isMember = await storage.isGroupMember(groupId, userId);
      if (isMember) return res.status(409).json({ message: "Already a member" });

      const group = await storage.getGroup(groupId);
      if (!group) return res.status(404).json({ message: "Group not found" });

      if (group.privacyMode === "request-to-join") {
        const request = await storage.createJoinRequest(groupId, userId);
        return res.json({ status: "requested", request });
      }

      if (group.privacyMode === "invite-only") {
        return res.status(403).json({ message: "This group is invite-only" });
      }

      const adjectives = ["Curious", "Dreamy", "Bold", "Gentle", "Witty", "Bright", "Calm", "Warm"];
      const nouns = ["Phoenix", "River", "Cloud", "Star", "Wave", "Spark", "Moon", "Breeze"];
      const nickname = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
      const member = await storage.joinGroup(groupId, userId, nickname);
      res.json(member);
    } catch (e) {
      res.status(500).json({ message: "Failed to join group" });
    }
  });

  app.get("/api/groups/:id/join-requests", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const requests = await storage.getJoinRequests(groupId);
      res.json(requests);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch join requests" });
    }
  });

  app.put("/api/groups/:id/join-requests/:requestId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    const requestId = parseInt(req.params.requestId);
    const { status } = req.body;
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const processed = await storage.processJoinRequest(requestId, userId, status);
      if (status === "approved") {
        const adjectives = ["Curious", "Dreamy", "Bold", "Gentle", "Witty", "Bright", "Calm", "Warm"];
        const nouns = ["Phoenix", "River", "Cloud", "Star", "Wave", "Spark", "Moon", "Breeze"];
        const nickname = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
        await storage.joinGroup(groupId, processed.userId, nickname);
      }
      res.json(processed);
    } catch (e) {
      res.status(500).json({ message: "Failed to process join request" });
    }
  });

  app.post("/api/groups/:id/invite-link", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const token = crypto.randomBytes(16).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const link = await storage.createInviteLink(groupId, userId, token, expiresAt);
      res.json(link);
    } catch (e) {
      res.status(500).json({ message: "Failed to create invite link" });
    }
  });

  app.get("/api/groups/:id/invite-links", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const links = await storage.getGroupInviteLinks(groupId);
      res.json(links);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch invite links" });
    }
  });

  app.post("/api/groups/join-by-invite/:token", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { token } = req.params;
    try {
      const link = await storage.getInviteLink(token);
      if (!link || !link.isActive) return res.status(404).json({ message: "Invalid or expired invite link" });
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        return res.status(410).json({ message: "Invite link expired" });
      }
      const isMember = await storage.isGroupMember(link.groupId, userId);
      if (isMember) return res.status(409).json({ message: "Already a member" });

      const adjectives = ["Curious", "Dreamy", "Bold", "Gentle", "Witty", "Bright", "Calm", "Warm"];
      const nouns = ["Phoenix", "River", "Cloud", "Star", "Wave", "Spark", "Moon", "Breeze"];
      const nickname = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
      const member = await storage.joinGroup(link.groupId, userId, nickname);
      res.json(member);
    } catch (e) {
      res.status(500).json({ message: "Failed to join via invite" });
    }
  });

  app.delete("/api/groups/:id/invite-links/:linkId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      await storage.revokeInviteLink(parseInt(req.params.linkId));
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to revoke invite link" });
    }
  });

  app.get("/api/groups/:id/members", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const members = await storage.getGroupMembers(groupId);
      res.json(members);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch members" });
    }
  });

  app.put("/api/groups/:id/members/:memberId/role", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    const { role, targetUserId } = req.body;
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member || member.role !== "owner") {
        return res.status(403).json({ message: "Only owner can change roles" });
      }
      const updated = await storage.updateGroupMemberRole(groupId, targetUserId, role);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  app.delete("/api/groups/:id/members/:targetUserId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    const { targetUserId } = req.params;
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Not authorized" });
      }
      await storage.removeGroupMember(groupId, targetUserId);
      await storage.createModerationLog({ groupId, userId: targetUserId, action: "removed", moderatedBy: userId });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to remove member" });
    }
  });

  app.delete("/api/groups/:id/messages/:messageId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    const messageId = parseInt(req.params.messageId);
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const deleted = await storage.deleteGroupMessage(messageId);
      await storage.createModerationLog({ groupId, messageId, userId: deleted.userId, action: "message_deleted", moderatedBy: userId });
      res.json(deleted);
    } catch (e) {
      res.status(500).json({ message: "Failed to delete message" });
    }
  });

  app.get("/api/groups/:id/messages", async (req, res) => {
    const groupId = parseInt(req.params.id);
    try {
      const msgs = await storage.getGroupMessages(groupId);
      res.json(msgs);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/groups/:id/messages", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    const { content, contentType, mediaUrl, replyToMessageId } = req.body;
    try {
      const members = await storage.getGroupMembers(groupId);
      const member = members.find(m => m.userId === userId);
      if (!member) return res.status(403).json({ message: "Must join group first" });

      const group = await storage.getGroup(groupId);
      if (group?.postingPermission === "admins_only" && member.role === "member") {
        return res.status(403).json({ message: "Only admins can post in this group" });
      }

      if ((contentType === "image" || contentType === "video") && group?.mediaPermission === "admin_only" && member.role === "member") {
        return res.status(403).json({ message: "Only admins can post media in this group" });
      }

      const msg = await storage.sendGroupMessage(groupId, userId, member.nickname || "Anonymous", content, {
        contentType, mediaUrl, replyToMessageId
      });
      res.status(201).json(msg);
    } catch (e) {
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.post("/api/groups/:id/leave", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      await storage.removeGroupMember(groupId, userId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to leave group" });
    }
  });

  // Poll endpoints
  app.post("/api/groups/:id/polls", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    const { question, options, allowMultiple } = req.body;
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member) return res.status(403).json({ message: "Must join group first" });
      if (!question || !options || options.length < 2 || options.length > 12) {
        return res.status(400).json({ message: "Poll needs a question and 2-12 options" });
      }
      const result = await storage.createPoll(groupId, userId, question, options, !!allowMultiple);
      res.status(201).json(result);
    } catch (e) {
      res.status(500).json({ message: "Failed to create poll" });
    }
  });

  app.get("/api/polls/:pollId", async (req, res) => {
    try {
      const result = await storage.getPoll(parseInt(req.params.pollId));
      if (!result) return res.status(404).json({ message: "Poll not found" });
      res.json(result);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch poll" });
    }
  });

  app.get("/api/messages/:messageId/poll", async (req, res) => {
    try {
      const result = await storage.getPollByMessageId(parseInt(req.params.messageId));
      if (!result) return res.status(404).json({ message: "Poll not found" });
      res.json(result);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch poll" });
    }
  });

  app.post("/api/polls/:pollId/vote", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { optionId } = req.body;
    try {
      const vote = await storage.votePoll(parseInt(req.params.pollId), optionId, userId);
      res.status(201).json(vote);
    } catch (e) {
      res.status(500).json({ message: "Failed to vote" });
    }
  });

  app.delete("/api/polls/:pollId/vote", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { optionId } = req.body;
    try {
      await storage.removePollVote(parseInt(req.params.pollId), optionId, userId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to remove vote" });
    }
  });

  // Reaction endpoints
  app.post("/api/messages/:messageId/reactions", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { reaction } = req.body;
    try {
      const r = await storage.addReaction(parseInt(req.params.messageId), userId, reaction);
      res.status(201).json(r);
    } catch (e) {
      res.status(500).json({ message: "Failed to add reaction" });
    }
  });

  app.delete("/api/messages/:messageId/reactions", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { reaction } = req.body;
    try {
      await storage.removeReaction(parseInt(req.params.messageId), userId, reaction);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to remove reaction" });
    }
  });

  app.get("/api/messages/:messageId/reactions", async (req, res) => {
    try {
      const reactions = await storage.getReactions(parseInt(req.params.messageId));
      res.json(reactions);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch reactions" });
    }
  });

  // Group photo upload
  app.post("/api/groups/:id/photo", upload.single("image"), async (req: any, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Not authorized" });
      }
      if (!req.file) return res.status(400).json({ message: "No image provided" });
      const url = `/uploads/${req.file.filename}`;
      await storage.updateGroup(groupId, { groupPhotoUrl: url } as any);
      res.json({ url });
    } catch (e) {
      res.status(500).json({ message: "Failed to upload group photo" });
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
      const msgs = await storage.getGroupMessages(groupId, 200);
      const msgIds = msgs.map(m => m.id);
      const reactions = msgIds.length > 0 ? await storage.getReactionsForMessages(msgIds) : [];
      const reactionsByMsg: Record<number, any[]> = {};
      for (const r of reactions) {
        if (!reactionsByMsg[r.messageId]) reactionsByMsg[r.messageId] = [];
        reactionsByMsg[r.messageId].push(r);
      }
      const enriched = msgs.map(m => ({
        ...m,
        reactions: reactionsByMsg[m.id] || [],
      }));
      res.json(enriched);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch enriched messages" });
    }
  });

  app.get("/api/subscription", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const sub = await storage.getSubscription(userId);
      res.json(sub || { tier: "free", status: "active" });
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch subscription" });
    }
  });

  app.get("/api/entitlements", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const ents = await storage.getEntitlements(userId);
      res.json(ents);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch entitlements" });
    }
  });

  app.get("/api/stripe/publishable-key", async (_req, res) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (e) {
      console.error("Failed to get publishable key:", e);
      res.status(500).json({ message: "Failed to get Stripe config" });
    }
  });

  app.get("/api/stripe/products", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          p.metadata as product_metadata,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency,
          pr.recurring,
          pr.active as price_active
        FROM stripe.products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = true
        ORDER BY pr.unit_amount ASC
      `);

      const productsMap = new Map<string, any>();
      for (const row of result.rows) {
        const r = row as any;
        if (!productsMap.has(r.product_id)) {
          productsMap.set(r.product_id, {
            id: r.product_id,
            name: r.product_name,
            description: r.product_description,
            metadata: r.product_metadata,
            prices: [],
          });
        }
        if (r.price_id) {
          productsMap.get(r.product_id).prices.push({
            id: r.price_id,
            unit_amount: r.unit_amount,
            currency: r.currency,
            recurring: r.recurring,
          });
        }
      }

      res.json(Array.from(productsMap.values()));
    } catch (e) {
      console.error("Failed to fetch Stripe products:", e);
      res.json([]);
    }
  });

  app.post("/api/stripe/checkout", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);

    const { priceId } = req.body;
    if (!priceId) return res.status(400).json({ message: "priceId is required" });

    try {
      const stripe = await getUncachableStripeClient();
      const userClaims = (req as any).user?.claims;
      const email = userClaims?.email || undefined;

      let customerId: string | undefined;

      if (email) {
        const customers = await stripe.customers.list({ email, limit: 1 });
        if (customers.data.length > 0) {
          customerId = customers.data[0].id;
        }
      }

      if (!customerId) {
        const customer = await stripe.customers.create({
          email,
          metadata: { userId },
        });
        customerId = customer.id;
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: `${baseUrl}/billing?success=true`,
        cancel_url: `${baseUrl}/billing?canceled=true`,
        metadata: { userId },
      });

      res.json({ url: session.url });
    } catch (e: any) {
      console.error("Checkout error:", e);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  app.post("/api/stripe/portal", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);

    try {
      const stripe = await getUncachableStripeClient();
      const userClaims = (req as any).user?.claims;
      const email = userClaims?.email;

      if (!email) return res.status(400).json({ message: "No email on account" });

      const customers = await stripe.customers.list({ email, limit: 1 });
      if (customers.data.length === 0) {
        return res.status(404).json({ message: "No Stripe customer found" });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripe.billingPortal.sessions.create({
        customer: customers.data[0].id,
        return_url: `${baseUrl}/billing`,
      });

      res.json({ url: session.url });
    } catch (e: any) {
      console.error("Portal error:", e);
      res.status(500).json({ message: "Failed to create portal session" });
    }
  });

  app.post("/api/demo/seed", async (req, res) => {
    try {
      await storage.seedDemoData();
      res.json({ message: "Demo data seeded successfully" });
    } catch (e) {
      console.error("Seed error:", e);
      res.status(500).json({ message: "Failed to seed demo data" });
    }
  });

  try {
    await storage.seedDemoData();
    console.log("Demo data seeded.");
  } catch (e) {
    console.error("Failed to seed demo data on startup:", e);
  }

  return httpServer;
}
