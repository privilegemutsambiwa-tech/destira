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

  const PRIVACY_GUARDRAIL = `
IMPORTANT PRIVACY GUARDRAIL: Under NO circumstances reveal any of the following:
- Phone numbers, email addresses, physical addresses, or any personally identifiable contact information.
- Specific financial details, account numbers, or sensitive personal data.
- Explicit sexual details or highly intimate confessions.
- Any information explicitly marked as private by the user or that could compromise their safety.
- If a question probes for such information, respond with a polite refusal and redirect to a general aspect of the user's personality or values.`;

  function detectPII(text: string): string {
    let cleaned = text;
    cleaned = cleaned.replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "[email hidden]");
    cleaned = cleaned.replace(/\b(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/g, "[phone hidden]");
    cleaned = cleaned.replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, "[redacted]");
    cleaned = cleaned.replace(/\b\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct)\b/gi, "[address hidden]");
    return cleaned;
  }

  async function buildTwinSystemPrompt(userId: string, profile: any): Promise<string> {
    const structuredProfile = await storage.getTwinProfileStructured(userId);
    const memorySummary = await storage.getTwinMemorySummary(userId);
    const memoryFacts = await storage.getTwinMemoryFacts(userId, 20);
    const toneProfile = structuredProfile?.twinToneProfile as any;

    const toneStyle = toneProfile?.tone_style || "supportive";
    const verbosity = toneProfile?.verbosity_level || "balanced";
    const emojiUsage = toneProfile?.emoji_usage || "minimal";
    const formality = toneProfile?.formality_level || "neutral";

    let structuredSection = "";
    if (structuredProfile) {
      const fields: string[] = [];
      if (structuredProfile.topValues?.length) fields.push(`Core Values: ${structuredProfile.topValues.join(", ")}`);
      if (structuredProfile.relationshipGoals) fields.push(`Relationship Goals: ${structuredProfile.relationshipGoals}`);
      if (structuredProfile.boundaries) fields.push(`Boundaries: ${structuredProfile.boundaries}`);
      if (structuredProfile.humorStyle) fields.push(`Humor Style: ${structuredProfile.humorStyle}`);
      if (structuredProfile.communicationStyle) fields.push(`Communication Style: ${structuredProfile.communicationStyle}`);
      if (structuredProfile.attachmentStyle) fields.push(`Attachment Style: ${structuredProfile.attachmentStyle}`);
      if (structuredProfile.interests?.length) fields.push(`Interests: ${structuredProfile.interests.join(", ")}`);
      if (structuredProfile.lifestylePatterns?.length) fields.push(`Lifestyle: ${structuredProfile.lifestylePatterns.join(", ")}`);
      if (structuredProfile.desiredPartnerTraits?.length) fields.push(`Desired Partner Traits: ${structuredProfile.desiredPartnerTraits.join(", ")}`);
      if (fields.length > 0) structuredSection = `\n\nUser's Structured Profile:\n${fields.join("\n")}`;
    }

    let memorySection = "";
    if (memorySummary) {
      memorySection += `\n\nUser's Recent Memory Summary:\n${memorySummary.summaryText}`;
    }
    if (memoryFacts.length > 0) {
      memorySection += `\n\nRecent Facts about User:\n${memoryFacts.map(f => `- ${f.factText}`).join("\n")}`;
    }

    return `You are the user's personal AI Twin, named VibeFlow Twin. Your purpose is to help the user understand themselves better, reflect on their dating life, and guide them towards meaningful connections. You are ${toneStyle}, with ${verbosity} verbosity, ${emojiUsage} emoji usage, and a ${formality} formality level. You learn from the user's conversations and structured profile data. Occasionally, you will ask one of the structured questions to deepen your understanding. Always prioritize the user's well-being and privacy. Do not give medical, legal, or financial advice.

${profile.twinPersona || "You are friendly, open, and genuine."}${structuredSection}${memorySection}

${PRIVACY_GUARDRAIL}`;
  }

  async function buildInterviewSystemPrompt(targetProfile: any): Promise<string> {
    const targetStructured = await storage.getTwinProfileStructured(targetProfile.userId);
    const targetFacts = await storage.getTwinMemoryFacts(targetProfile.userId, 10);

    let structuredSection = "";
    if (targetStructured) {
      const fields: string[] = [];
      if (targetStructured.topValues?.length) fields.push(`Core Values: ${targetStructured.topValues.join(", ")}`);
      if (targetStructured.relationshipGoals) fields.push(`Relationship Goals: ${targetStructured.relationshipGoals}`);
      if (targetStructured.humorStyle) fields.push(`Humor Style: ${targetStructured.humorStyle}`);
      if (targetStructured.communicationStyle) fields.push(`Communication Style: ${targetStructured.communicationStyle}`);
      if (targetStructured.interests?.length) fields.push(`Interests: ${targetStructured.interests.join(", ")}`);
      if (targetStructured.lifestylePatterns?.length) fields.push(`Lifestyle: ${targetStructured.lifestylePatterns.join(", ")}`);
      if (targetStructured.desiredPartnerTraits?.length) fields.push(`Desired Partner Traits: ${targetStructured.desiredPartnerTraits.join(", ")}`);
      if (fields.length > 0) structuredSection = `\n\nUser's Structured Profile:\n${fields.join("\n")}`;
    }

    let factsSection = "";
    if (targetFacts.length > 0) {
      const publicFacts = targetFacts.filter(f => f.source !== "private");
      if (publicFacts.length > 0) {
        factsSection = `\n\nRelevant Memory Facts:\n${publicFacts.map(f => `- ${f.factText}`).join("\n")}`;
      }
    }

    return `You are the AI Twin of another VibeFlow user named ${targetProfile.displayName}. Your purpose is to represent their personality, values, and dating preferences to an interviewer, without revealing any private or sensitive information. Respond as if you are that user, but always maintain a high-level, safe, and generalized persona. Your responses should be based only on the provided structured profile and memory facts. Do not invent information. If asked for private details, politely decline and pivot to a general aspect of the user's personality or values. Do not give medical, legal, or financial advice.

${targetProfile.twinPersona || "You are friendly, open, and genuine."}${structuredSection}${factsSection}

${PRIVACY_GUARDRAIL}`;
  }

  async function extractMemoryAfterChat(userId: string, recentMessages: { role: string; content: string }[]): Promise<void> {
    try {
      const lastFew = recentMessages.slice(-6);
      if (lastFew.length < 2) return;

      const completion = await openai.chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You analyze conversations to extract key facts and a brief summary. Return JSON with:
{"summary": "A 2-3 sentence rolling summary of the conversation themes",
 "facts": ["fact 1", "fact 2", ...],
 "structured_updates": {"top_values": [], "interests": [], "relationship_goals": "", "humor_style": "", "communication_style": "", "lifestyle_patterns": [], "desired_partner_traits": [], "boundaries": ""}}
Only include structured_updates fields if the conversation clearly reveals them. Facts should be specific, memorable insights. Return empty arrays/strings for fields not mentioned.`
          },
          { role: "user", content: JSON.stringify(lastFew) }
        ],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(completion.choices[0].message.content || "{}");

      if (result.summary) {
        await storage.upsertTwinMemorySummary(userId, result.summary);
      }
      if (result.facts && result.facts.length > 0) {
        for (const fact of result.facts.slice(0, 5)) {
          await storage.addTwinMemoryFact(userId, fact, "chat");
        }
      }
      if (result.structured_updates) {
        const updates: any = {};
        const su = result.structured_updates;
        if (su.top_values?.length) updates.topValues = su.top_values;
        if (su.interests?.length) updates.interests = su.interests;
        if (su.relationship_goals) updates.relationshipGoals = su.relationship_goals;
        if (su.humor_style) updates.humorStyle = su.humor_style;
        if (su.communication_style) updates.communicationStyle = su.communication_style;
        if (su.lifestyle_patterns?.length) updates.lifestylePatterns = su.lifestyle_patterns;
        if (su.desired_partner_traits?.length) updates.desiredPartnerTraits = su.desired_partner_traits;
        if (su.boundaries) updates.boundaries = su.boundaries;
        if (Object.keys(updates).length > 0) {
          await storage.upsertTwinProfileStructured(userId, updates);
        }
      }
    } catch (e) {
      console.error("Memory extraction error (non-blocking):", e);
    }
  }

  app.post("/api/interviews/:id/chat", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { message, stream: useStream } = req.body;
    const interviewId = parseInt(req.params.id);

    const interview = await storage.getInterview(interviewId);
    if (!interview) return res.status(404).json({ message: "Interview not found" });

    const targetProfile = await storage.getProfile(interview.targetId);
    if (!targetProfile) return res.status(404).json({ message: "Target profile not found" });

    let history: { role: string; content: string }[] = [];
    try {
      if (interview.transcript) history = JSON.parse(interview.transcript);
    } catch (e) { history = []; }

    history.push({ role: "user", content: message });

    const systemPrompt = await buildInterviewSystemPrompt(targetProfile);

    try {
      await storage.createAuditLog(userId, "interview_chat", { interviewId, targetId: interview.targetId });

      if (useStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        res.write(`data: ${JSON.stringify({ type: "typing" })}\n\n`);

        const stream = await openai.chat.completions.create({
          model: "openai/gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            ...history.map((h: any) => ({ role: h.role as "user" | "assistant", content: h.content }))
          ],
          stream: true,
        });

        let fullResponse = "";
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            fullResponse += delta;
            res.write(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`);
          }
        }

        fullResponse = detectPII(fullResponse);
        history.push({ role: "assistant", content: fullResponse });
        await storage.updateInterviewTranscript(interviewId, JSON.stringify(history));

        res.write(`data: ${JSON.stringify({ type: "done", content: fullResponse })}\n\n`);
        res.end();
      } else {
        const completion = await openai.chat.completions.create({
          model: "openai/gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            ...history.map((h: any) => ({ role: h.role as "user" | "assistant", content: h.content }))
          ],
        });

        let aiResponse = completion.choices[0].message.content || "I'd love to tell you more about that in person!";
        aiResponse = detectPII(aiResponse);
        history.push({ role: "assistant", content: aiResponse });
        await storage.updateInterviewTranscript(interviewId, JSON.stringify(history));
        res.json({ response: aiResponse });
      }
    } catch (e) {
      console.error("AI Twin chat error:", e);
      const fallback = "That's a great question! I'd love to share more about that when we connect in person.";
      history.push({ role: "assistant", content: fallback });
      await storage.updateInterviewTranscript(interviewId, JSON.stringify(history));
      if (useStream) {
        res.write(`data: ${JSON.stringify({ type: "done", content: fallback })}\n\n`);
        res.end();
      } else {
        res.json({ response: fallback });
      }
    }
  });

  app.post("/api/twin/chat", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { message, stream: useStream } = req.body;
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

      const systemPrompt = await buildTwinSystemPrompt(userId, profile);

      const nextQuestion = await storage.getNextQuestion(userId);
      let questionInjection = "";
      if (nextQuestion && Math.random() < 0.3) {
        questionInjection = `\n\nIMPORTANT: After responding to the user, naturally work in this question to help you understand them better: "${nextQuestion.text}" (Category: ${nextQuestion.category}). Frame it conversationally, e.g., "Before we continue—quick question to help me understand you better..." If the question doesn't fit the conversation flow, skip it.`;
        await storage.recordQuestionAsked(userId, nextQuestion.id);
      }

      await storage.createAuditLog(userId, "twin_chat", { messageLength: message.length });

      if (useStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        res.write(`data: ${JSON.stringify({ type: "typing" })}\n\n`);

        const stream = await openai.chat.completions.create({
          model: "openai/gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt + questionInjection },
            ...memoryMessages,
            { role: "user", content: message }
          ],
          stream: true,
        });

        let fullResponse = "";
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            fullResponse += delta;
            res.write(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`);
          }
        }

        fullResponse = detectPII(fullResponse);
        await storage.addTwinMemory(userId, fullResponse, "assistant");

        const allMsgs = [...memoryMessages, { role: "user", content: message }, { role: "assistant", content: fullResponse }];
        if (allMsgs.length % 6 === 0) {
          extractMemoryAfterChat(userId, allMsgs).catch(() => {});
        }

        res.write(`data: ${JSON.stringify({ type: "done", content: fullResponse })}\n\n`);

        if (nextQuestion) {
          res.write(`data: ${JSON.stringify({ type: "quick_replies", replies: ["Tell me more", "Give advice", "Ask me a question"] })}\n\n`);
        }

        res.end();
      } else {
        const completion = await openai.chat.completions.create({
          model: "openai/gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt + questionInjection },
            ...memoryMessages,
            { role: "user", content: message }
          ],
        });

        let aiResponse = completion.choices[0].message.content || "I hear you. Tell me more about what's on your mind.";
        aiResponse = detectPII(aiResponse);
        await storage.addTwinMemory(userId, aiResponse, "assistant");

        const allMsgs = [...memoryMessages, { role: "user", content: message }, { role: "assistant", content: aiResponse }];
        if (allMsgs.length % 6 === 0) {
          extractMemoryAfterChat(userId, allMsgs).catch(() => {});
        }

        res.json({ response: aiResponse, quickReplies: nextQuestion ? ["Tell me more", "Give advice", "Ask me a question"] : undefined });
      }
    } catch (e) {
      console.error("Twin self-chat error:", e);
      const fallback = "I'm here for you. Let's talk about what's on your mind.";
      await storage.addTwinMemory(userId, fallback, "assistant");
      if (useStream) {
        res.write(`data: ${JSON.stringify({ type: "done", content: fallback })}\n\n`);
        res.end();
      } else {
        res.json({ response: fallback });
      }
    }
  });

  app.get("/api/twin/memory", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const memory = await storage.getTwinMemory(userId, 50);
      const facts = await storage.getTwinMemoryFacts(userId, 20);
      const summary = await storage.getTwinMemorySummary(userId);
      res.json({ messages: memory, facts, summary });
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

  app.get("/api/twin/structured-profile", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const structured = await storage.getTwinProfileStructured(userId);
      res.json(structured || {});
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch structured profile" });
    }
  });

  app.put("/api/twin/structured-profile", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const updated = await storage.upsertTwinProfileStructured(userId, req.body);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ message: "Failed to update structured profile" });
    }
  });

  app.get("/api/twin/tone-profile", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const structured = await storage.getTwinProfileStructured(userId);
      res.json(structured?.twinToneProfile || { tone_style: "supportive", verbosity_level: "balanced", emoji_usage: "minimal", formality_level: "neutral" });
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch tone profile" });
    }
  });

  app.put("/api/twin/tone-profile", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const updated = await storage.upsertTwinProfileStructured(userId, { twinToneProfile: req.body });
      res.json(updated.twinToneProfile);
    } catch (e) {
      res.status(500).json({ message: "Failed to update tone profile" });
    }
  });

  app.post("/api/ai/profile/generate-about-me", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const profile = await storage.getProfile(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });
      const structured = await storage.getTwinProfileStructured(userId);
      const answers = await storage.getUserAnswers(userId);

      const completion = await openai.chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Generate an attractive, emotionally intelligent, and dating-appropriate "About Me" section (2-3 paragraphs) for a VibeFlow user. Base this solely on the provided profile data and question answers. Highlight their positive traits, interests, and what they seek in a partner. Ensure it is engaging and encourages connection. Strictly adhere to the privacy guardrail. Do not include any PII, exact locations, or sensitive information.\n\n${PRIVACY_GUARDRAIL}`
          },
          { role: "user", content: JSON.stringify({ bio: profile.bio, personality: profile.personalityProfile, displayName: profile.displayName, structured: structured || {}, answers: answers.slice(0, 20).map(a => a.answerText) }) }
        ],
      });

      let aboutMeText = completion.choices[0].message.content || "";
      aboutMeText = detectPII(aboutMeText);
      await storage.createAuditLog(userId, "generate_about_me", { length: aboutMeText.length });
      res.json({ aboutMeText, version: Date.now() });
    } catch (e) {
      console.error("About me generation error:", e);
      res.status(500).json({ message: "Failed to generate About Me" });
    }
  });

  app.post("/api/ai/profile/generate-summary", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const profile = await storage.getProfile(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });
      const structured = await storage.getTwinProfileStructured(userId);

      const completion = await openai.chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Generate a concise (2-4 lines) and elegant AI summary for a VibeFlow user's profile. This summary should capture their core personality, key values, and relationship style, designed to entice potential matches. Base it solely on the provided structured profile. Strictly adhere to the privacy guardrail. Do not include any PII or sensitive content.\n\n${PRIVACY_GUARDRAIL}`
          },
          { role: "user", content: JSON.stringify({ bio: profile.bio, personality: profile.personalityProfile, displayName: profile.displayName, structured: structured || {} }) }
        ],
      });

      let aiSummaryText = completion.choices[0].message.content || "";
      aiSummaryText = detectPII(aiSummaryText);
      await storage.createAuditLog(userId, "generate_summary", { length: aiSummaryText.length });
      res.json({ aiSummaryText, version: Date.now() });
    } catch (e) {
      console.error("Summary generation error:", e);
      res.status(500).json({ message: "Failed to generate summary" });
    }
  });

  app.get("/api/questions/next", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const question = await storage.getNextQuestion(userId);
      if (!question) return res.json({ question: null, allAnswered: true });
      res.json({ question });
    } catch (e) {
      res.status(500).json({ message: "Failed to get next question" });
    }
  });

  app.get("/api/questions", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const allQuestions = await storage.getQuestions();
      const answered = await storage.getUserAnswers(userId);
      const answeredIds = answered.map(a => a.questionId);
      res.json({ questions: allQuestions, answeredIds, totalAnswered: answered.length, total: allQuestions.length });
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch questions" });
    }
  });

  app.post("/api/questions/:questionId/answer", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const questionId = parseInt(req.params.questionId);
    const { answer, isPrivate } = req.body;
    try {
      const question = await storage.getQuestion(questionId);
      if (!question) return res.status(404).json({ message: "Question not found" });

      const existing = await storage.getUserAnswer(userId, questionId);
      if (existing) return res.status(400).json({ message: "Already answered" });

      const userAnswer = await storage.submitAnswer(userId, questionId, answer, null, null, isPrivate);

      storage.upsertTwinProfileStructured(userId, {}).catch(() => {});

      await storage.createAuditLog(userId, "answer_question", { questionId, category: question.category });
      res.json(userAnswer);
    } catch (e) {
      res.status(500).json({ message: "Failed to submit answer" });
    }
  });

  app.post("/api/questions/:questionId/skip", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const questionId = parseInt(req.params.questionId);
    try {
      const schedule = await storage.skipQuestion(userId, questionId);
      res.json(schedule);
    } catch (e) {
      res.status(500).json({ message: "Failed to skip question" });
    }
  });

  app.post("/api/twin/extract-profile", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const profile = await storage.getProfile(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const answers = await storage.getUserAnswers(userId);
      const personality = profile.personalityProfile;

      const completion = await openai.chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Analyze the user's profile data and question answers to extract structured personality traits. Return JSON with:
{"top_values": ["value1", "value2", ...], "relationship_goals": "...", "boundaries": "...", "humor_style": "...", "communication_style": "...", "attachment_style": "...", "interests": ["interest1", ...], "lifestyle_patterns": ["pattern1", ...], "desired_partner_traits": ["trait1", ...]}
Fill in what you can determine from the data. Use short, clear phrases. Limit arrays to 5 items max.`
          },
          { role: "user", content: JSON.stringify({ bio: profile.bio, personality, twinPersona: profile.twinPersona, answers: answers.map(a => a.answerText) }) }
        ],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(completion.choices[0].message.content || "{}");
      const updated = await storage.upsertTwinProfileStructured(userId, {
        topValues: result.top_values || [],
        relationshipGoals: result.relationship_goals || "",
        boundaries: result.boundaries || "",
        humorStyle: result.humor_style || "",
        communicationStyle: result.communication_style || "",
        attachmentStyle: result.attachment_style || "",
        interests: result.interests || [],
        lifestylePatterns: result.lifestyle_patterns || [],
        desiredPartnerTraits: result.desired_partner_traits || [],
      });

      await storage.createAuditLog(userId, "extract_profile", { fieldsUpdated: Object.keys(result).length });
      res.json(updated);
    } catch (e) {
      console.error("Profile extraction error:", e);
      res.status(500).json({ message: "Failed to extract profile" });
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
      const starred = await storage.getStarredMessages(groupId, userId);
      const starredMsgIds = new Set(starred.map((s: any) => s.messageId));
      const enriched = msgs.map(m => ({
        ...m,
        reactions: reactionsByMsg[m.id] || [],
        isStarred: starredMsgIds.has(m.id),
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

  app.get("/api/chat/threads", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const filter = (req.query.filter as string) || "all";
    try {
      const threads: any[] = [];

      if (filter === "all" || filter === "match" || filter === "matches") {
        const userMatches = await storage.getMatchesWithProfiles(userId);
        for (const m of userMatches) {
          if (m.status !== "matched") continue;
          const msgs = await storage.getDirectMessages(m.id, 1);
          const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
          threads.push({
            id: `match_${m.id}`,
            type: "match",
            matchId: m.id,
            name: m.otherProfile?.displayName || "Match",
            avatar: m.otherProfile?.coverPhotoUrl || null,
            lastMessage: lastMsg?.content || "Start chatting!",
            lastMessageAt: lastMsg?.createdAt || m.createdAt,
            unreadCount: 0,
            href: `/chat/${m.id}`,
          });
        }
      }

      if (filter === "all" || filter === "ai_twin_interview" || filter === "ai_twin") {
        const userInterviews = await storage.getInterviewsWithProfiles(userId);
        for (const iv of userInterviews) {
          let lastMsg = "";
          let lastAt = iv.createdAt;
          if (iv.transcript) {
            try {
              const parsed = JSON.parse(iv.transcript);
              if (parsed.length > 0) {
                const last = parsed[parsed.length - 1];
                lastMsg = last.content || "";
                lastAt = iv.createdAt;
              }
            } catch {}
          }
          threads.push({
            id: `interview_${iv.id}`,
            type: "ai_twin_interview",
            interviewId: iv.id,
            name: `${iv.targetProfile?.displayName || "Unknown"}'s AI Twin`,
            avatar: iv.targetProfile?.coverPhotoUrl || null,
            lastMessage: lastMsg || "Start interview",
            lastMessageAt: lastAt,
            unreadCount: 0,
            href: `/interviews/${iv.id}/chat`,
          });
        }
      }

      threads.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
      res.json(threads);
    } catch (e) {
      console.error("Chat threads error:", e);
      res.status(500).json({ message: "Failed to fetch chat threads" });
    }
  });

  app.get("/api/likes/incoming", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const userMatches = await storage.getMatchesWithProfiles(userId);
      const incoming = userMatches
        .filter((m: any) => m.status === "pending" && !m.isRequester)
        .map((m: any) => ({
          matchId: m.id,
          fromUserId: m.isRequester ? m.user2Id : m.user1Id,
          profile: m.otherProfile,
          createdAt: m.createdAt,
        }));

      const sub = await storage.getSubscription(userId);
      const tier = sub?.tier || "free";
      const isBlurred = tier === "free";

      res.json({
        likes: incoming.map((like: any) => ({
          ...like,
          profile: isBlurred ? {
            displayName: null,
            bio: null,
            coverPhotoUrl: like.profile?.coverPhotoUrl || null,
            age: like.profile?.age || null,
            location: like.profile?.location || null,
            blurred: true,
          } : {
            ...like.profile,
            blurred: false,
          },
        })),
        totalCount: incoming.length,
        isBlurred,
        tier,
      });
    } catch (e) {
      console.error("Likes incoming error:", e);
      res.status(500).json({ message: "Failed to fetch incoming likes" });
    }
  });

  app.post("/api/likes/:matchId/like-back", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const matchId = parseInt(req.params.matchId);
    try {
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      const updated = await storage.updateMatchStatus(matchId, "matched");
      res.json(updated);
    } catch (e) {
      res.status(500).json({ message: "Failed to like back" });
    }
  });

  app.get("/api/lounge/groups", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const filter = (req.query.filter as string) || "all";
    const search = (req.query.search as string) || "";
    try {
      let rawGroups;
      if (search) {
        rawGroups = await storage.searchGroups(search);
      } else {
        rawGroups = await storage.getGroups();
      }

      let allGroups = await Promise.all(rawGroups.map(async (g) => {
        const members = await storage.getGroupMembers(g.id);
        const isMember = members.some(m => m.userId === userId);
        const myRole = members.find(m => m.userId === userId)?.role;
        const msgs = await storage.getGroupMessages(g.id, 1);
        const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
        return {
          ...g,
          memberCount: members.length,
          isMember,
          myRole,
          lastMessage: lastMsg?.content || null,
          lastMessageNickname: lastMsg?.nickname || null,
          lastMessageAt: lastMsg?.createdAt || g.createdAt,
        };
      }));

      if (filter === "joined") {
        allGroups = allGroups.filter((g: any) => g.isMember);
      } else if (filter === "popular") {
        allGroups.sort((a: any, b: any) => (b.memberCount || 0) - (a.memberCount || 0));
      } else if (filter === "new") {
        allGroups.sort((a: any, b: any) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());
      }

      allGroups.sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());
      res.json(allGroups);
    } catch (e) {
      console.error("Lounge groups error:", e);
      res.status(500).json({ message: "Failed to fetch lounge groups" });
    }
  });

  app.get("/api/profiles/me/completion", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const completion = await storage.getProfileCompletion(userId);
      await storage.updateProfileCompletionScore(userId, completion.score);
      res.json(completion);
    } catch (e) {
      res.status(500).json({ message: "Failed to get profile completion" });
    }
  });

  app.post("/api/messages/:messageId/star", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const messageId = parseInt(req.params.messageId);
    const { groupId } = req.body;
    try {
      const starred = await storage.starMessage(messageId, userId, groupId);
      res.json(starred);
    } catch (e) {
      res.status(500).json({ message: "Failed to star message" });
    }
  });

  app.delete("/api/messages/:messageId/star", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const messageId = parseInt(req.params.messageId);
    try {
      await storage.unstarMessage(messageId, userId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to unstar message" });
    }
  });

  app.get("/api/groups/:id/starred", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const starred = await storage.getStarredMessages(groupId, userId);
      res.json(starred);
    } catch (e) {
      res.status(500).json({ message: "Failed to get starred messages" });
    }
  });

  app.patch("/api/groups/:id/settings", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const members = await storage.getGroupMembers(groupId);
      const member = members.find(m => m.userId === userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Only admins can update group settings" });
      }
      const { rulesText, canMembersEditInfo, canMembersSendMessages, canMembersAddOthers, postingPermission, mediaPermission } = req.body;
      const updates: any = {};
      if (rulesText !== undefined) updates.rulesText = rulesText;
      if (canMembersEditInfo !== undefined) updates.canMembersEditInfo = canMembersEditInfo;
      if (canMembersSendMessages !== undefined) updates.canMembersSendMessages = canMembersSendMessages;
      if (canMembersAddOthers !== undefined) updates.canMembersAddOthers = canMembersAddOthers;
      if (postingPermission !== undefined) updates.postingPermission = postingPermission;
      if (mediaPermission !== undefined) updates.mediaPermission = mediaPermission;
      const group = await storage.updateGroup(groupId, updates);
      res.json(group);
    } catch (e) {
      res.status(500).json({ message: "Failed to update group settings" });
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

  try {
    const existingQuestions = await storage.getQuestions();
    if (existingQuestions.length === 0) {
      const { seedQuestions } = await import("./seed-questions");
      await seedQuestions();
      console.log("100 Questions seeded.");
    }
  } catch (e) {
    console.error("Failed to seed questions on startup:", e);
  }

  return httpServer;
}
