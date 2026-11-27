// Twin chat, reply help in a chat, twin memory, tone and disclosure.
// Split out of server/routes.ts; registered in the same order as before.
import type { Express } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { completeText, streamText } from "../ai";
import { cannedAboutMe, cannedAiSummary, cannedReplies } from "../ai-fallbacks";
import { and } from "drizzle-orm";
import { profiles } from "@shared/schema";
import * as onboarding from "../onboarding";
import * as gate from "../gate";
import * as disclosure from "../disclosure";
import { openerFacts, fallbackOpeners } from "../openers";
import { normalizeDisclosure, DISCLOSURE_CATEGORY_KEYS, DISCLOSURE_STATES, DIRECTIVE_MAX } from "@shared/disclosure";
import { checkAIRateLimit, getUserId } from "./shared";
import { PRIVACY_GUARDRAIL, buildTwinSystemPrompt, detectPII, extractMemoryAfterChat } from "./interviews";

const openerCache = new Map<string, { options: string[]; until: number }>();

export function registerTwinRoutes(app: Express) {
  // "Help me reply" and first-message openers in a direct chat
  // (docs/destira-upgrade-prompt.md §7.9). Three short drafts in the
  // member's own voice, from the real conversation, both profiles and, when
  // there was one, the member's real interview with the other person's
  // twin. Never sent by the server: the member picks one, edits, sends.
  app.post("/api/chat/:matchId/suggest", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    if (!checkAIRateLimit(userId)) return res.status(429).json({ message: "Too many requests. Please wait a moment." });
    const matchId = parseInt(req.params.matchId);
    try {
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      if (match.user1Id !== userId && match.user2Id !== userId) return res.sendStatus(403);
      if (match.status !== "matched") return res.status(400).json({ message: "Not matched yet" });
      const otherId = match.user1Id === userId ? match.user2Id : match.user1Id;
      const [me, them, msgs, interview, interestMap] = await Promise.all([
        storage.getProfile(userId),
        storage.getProfile(otherId),
        storage.getDirectMessages(matchId),
        storage.getInterviewBetween(userId, otherId),
        storage.getInterestsForUsers([userId, otherId]),
      ]);
      const recent = msgs.filter((m: any) => !m.unsentAt).slice(-12).map((m: any) => ({ from: m.senderId === userId ? "me" : "them", text: String(m.content).slice(0, 500) }));
      let twinNotes: string[] = [];
      if (interview?.summary) {
        try {
          const lines = JSON.parse(interview.summary)?.lines;
          if (Array.isArray(lines)) twinNotes = lines.map((l: any) => String(l.text)).slice(0, 5);
        } catch {}
      }
      const opening = recent.length === 0;
      // An empty chat asks for openers by itself, so the same three are
      // reused for a few hours instead of a new AI call on every visit.
      const cacheKey = `${matchId}:${userId}`;
      const cached = opening ? openerCache.get(cacheKey) : undefined;
      if (cached && cached.until > Date.now()) return res.json({ options: cached.options });
      const facts = opening
        ? await openerFacts(me, them, interestMap.get(userId) ?? [], interestMap.get(otherId) ?? [])
        : null;
      const context = {
        me: { name: me?.displayName, about: me?.aboutMe || me?.bio, interests: interestMap.get(userId) ?? [] },
        them: { name: them?.displayName, about: them?.aboutMe || them?.bio, city: them?.location, interests: interestMap.get(otherId) ?? [] },
        ...(facts ? { theirPromptAnswers: facts.promptAnswers, eventsTheyreGoingTo: facts.goingTo, whatWeShare: [...facts.shared, ...facts.sharedInterests.map((i) => `both into ${i}`)] } : {}),
        whatTheirTwinToldMe: twinNotes,
        conversation: recent,
      };
      const completion = await completeText(
        [
          {
            role: "system",
            content: `You help someone on a dating app write ${opening ? "a first message to a new match" : "their next reply"}. Write exactly three different short options (under 160 characters each) in "me"'s voice: warm, specific, natural, a little playful, no pickup lines, no emojis unless the conversation already uses them. Use only facts in the context; never invent details about either person. ${opening ? "Each should open with something real and different: one from their prompt answers if they have any, one from an event they're going to if any, one from something you share; otherwise their profile, interests or what their twin said. End each with an easy question." : "Reply to what they last said."} Return JSON: {"options":["...","...","..."]}.`,
          },
          { role: "user", content: JSON.stringify(context) },
        ],
        { json: true, maxTokens: 400, feature: opening ? "chat_openers" : "chat_reply", userId },
      ).catch((e) => {
        // Openers still come from the profile when the AI is down; replies
        // from a few safe, general ones.
        console.error("Chat suggest AI error (using canned options):", e.message);
        return null;
      });
      if (!completion && !opening) {
        const lastTheirs = [...recent].reverse().find((m) => m.from === "them")?.text;
        return res.json({ options: cannedReplies(lastTheirs), fallback: true });
      }
      let options: string[] = [];
      try {
        const parsed = JSON.parse(completion?.text || "{}");
        if (Array.isArray(parsed?.options)) options = parsed.options.map((o: any) => String(o).trim()).filter(Boolean).slice(0, 3);
      } catch {}
      // No AI answer: openers written from the same facts.
      if (opening && options.length < 3 && facts) options = fallbackOpeners(facts, them?.displayName || "there", them?.location);
      if (opening && options.length) {
        if (openerCache.size > 5000) openerCache.clear();
        openerCache.set(cacheKey, { options, until: Date.now() + 6 * 60 * 60 * 1000 });
      }
      res.json({ options });
    } catch (e) {
      console.error("Chat suggest error:", e);
      res.status(500).json({ message: "Couldn't think of anything just now" });
    }
  });

  app.post("/api/twin/chat", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    if (!checkAIRateLimit(userId)) return res.status(429).json({ message: "Too many requests. Please wait a moment." });
    const { message, stream: useStream } = req.body;
    try {
      // No gate on profile/twinPersona/onboarding completeness — buildTwinSystemPrompt
      // fills in sensible defaults and steers the twin to get to know the user
      // conversationally when this data is thin or missing.
      const [profile, memory] = await Promise.all([
        storage.getProfile(userId),
        storage.getTwinMemory(userId, 20),
      ]);
      const memoryMessages = memory.reverse().map(m => ({
        role: m.role as "user" | "assistant",
        content: m.message,
      }));
      await storage.addTwinMemory(userId, message, "user");

      const systemPrompt = await buildTwinSystemPrompt(userId, profile);

      storage.createAuditLog(userId, "twin_chat", { messageLength: message.length }).catch(() => {});

      if (useStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        res.write(`data: ${JSON.stringify({ type: "typing" })}\n\n`);

        const chatMsgs = [
          ...memoryMessages.map((m: any) => ({
            role: m.role === "assistant" ? "assistant" as const : "user" as const,
            content: m.content,
          })),
          { role: "user" as const, content: message },
        ];

        const streamed = await streamText(
          [{ role: "system", content: systemPrompt }, ...chatMsgs],
          { maxTokens: 300, presencePenalty: 0.3, frequencyPenalty: 0.3, feature: "twin_chat", userId },
          (delta) => res.write(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`),
        );

        const fullResponse = detectPII(streamed.text);
        await storage.addTwinMemory(userId, fullResponse, "assistant");

        extractMemoryAfterChat(userId, [{ role: "user", content: message }, { role: "assistant", content: fullResponse }]).catch(() => {});

        res.write(`data: ${JSON.stringify({ type: "done", content: fullResponse })}\n\n`);
        res.end();
      } else {
        const chatMsgs = [
          ...memoryMessages.map((m: any) => ({
            role: m.role === "assistant" ? "assistant" as const : "user" as const,
            content: m.content,
          })),
          { role: "user" as const, content: message },
        ];

        const completion = await completeText(
          [{ role: "system", content: systemPrompt }, ...chatMsgs],
          { maxTokens: 300, presencePenalty: 0.3, frequencyPenalty: 0.3, feature: "twin_chat", userId },
        );

        let aiResponse = completion.text || "I hear you. Tell me more about what's on your mind.";
        aiResponse = detectPII(aiResponse);
        await storage.addTwinMemory(userId, aiResponse, "assistant");

        extractMemoryAfterChat(userId, [{ role: "user", content: message }, { role: "assistant", content: aiResponse }]).catch(() => {});

        res.json({ response: aiResponse });
      }
    } catch (e) {
      console.error("Twin Chat Error:", e);
      const fallback = "I'm here for you. Let's talk about what's on your mind.";
      await storage.addTwinMemory(userId, fallback, "assistant");
      // `error: true` lets the client tell a genuine AI outage apart from a
      // real reply — see the matching comment on /api/interviews/:id/chat.
      if (useStream) {
        res.write(`data: ${JSON.stringify({ type: "done", content: fallback, error: true })}\n\n`);
        res.end();
      } else {
        res.json({ response: fallback, error: true });
      }
    }
  });

  app.post("/api/twin/extract-trait", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    if (!checkAIRateLimit(userId)) return res.status(429).json({ message: "Too many requests. Please wait a moment." });
    const schema = z.object({
      userMessage: z.string(),
      assistantMessage: z.string().optional(),
      incrementCount: z.number().int().min(0).max(5).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid body" });
    const { userMessage, assistantMessage, incrementCount } = parsed.data;
    try {
      const messages = [
        { role: "user", content: userMessage },
        ...(assistantMessage ? [{ role: "assistant", content: assistantMessage }] : []),
      ];
      extractMemoryAfterChat(userId, messages).catch(() => {});
      if (incrementCount && incrementCount > 0) {
        const profile = await storage.getProfile(userId);
        if (profile) {
          const current = profile.twinQuestionsAnswered || 0;
          const newCount = Math.min(current + incrementCount, 100);
          if (newCount > current) {
            await storage.updateProfile(userId, { twinQuestionsAnswered: newCount });
          }
        }
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to extract trait" });
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

  // What the twin may disclose in an interview.
  app.get("/api/twin/disclosure", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const profile = await storage.getProfile(userId);
      res.json({
        settings: normalizeDisclosure(profile?.disclosureSettings),
        directive: profile?.disclosureDirective ?? "",
      });
    } catch (e) {
      res.status(500).json({ message: "Failed to load disclosure settings" });
    }
  });

  app.put("/api/twin/disclosure", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const body = req.body ?? {};
    const patch: Record<string, unknown> = {};

    if (body.settings && typeof body.settings === "object") {
      const clean: Record<string, string> = {};
      for (const k of DISCLOSURE_CATEGORY_KEYS) {
        const v = body.settings[k];
        // Only the three real states; anything else falls back to closed. The
        // hard-coded-never list is not represented here and can't be turned on.
        clean[k] = (DISCLOSURE_STATES as readonly string[]).includes(v) ? v : "closed";
      }
      patch.disclosureSettings = clean;
    }
    if (typeof body.directive === "string") {
      if (body.directive.length > DIRECTIVE_MAX) {
        return res.status(400).json({ message: `Keep it under ${DIRECTIVE_MAX} characters.` });
      }
      patch.disclosureDirective = body.directive.trim() || null;
    }
    if (Object.keys(patch).length === 0) return res.status(400).json({ message: "Nothing to update" });

    try {
      const updated = await storage.updateProfile(userId, patch as any);
      res.json({
        settings: normalizeDisclosure(updated.disclosureSettings),
        directive: updated.disclosureDirective ?? "",
      });
    } catch (e) {
      res.status(500).json({ message: "Failed to save disclosure settings" });
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

      const completion = await completeText(
        [
          { role: "system", content: `Generate an attractive, emotionally intelligent, and dating-appropriate "About Me" section (2-3 paragraphs) for a Destira user. Base this solely on the provided profile data and question answers. Highlight their positive traits, interests, and what they seek in a partner. Ensure it is engaging and encourages connection. Strictly adhere to the privacy guardrail. Do not include any PII, exact locations, or sensitive information.\n\n${PRIVACY_GUARDRAIL}` },
          { role: "user", content: JSON.stringify({ bio: profile.bio, personality: profile.personalityProfile, displayName: profile.displayName, structured: structured || {}, answers: answers.slice(0, 20).map(a => a.answerText) }) },
        ],
        { maxTokens: 700, feature: "profile_about_me", userId },
      ).catch((e) => {
        console.error("About me AI error (using a draft from their answers):", e.message);
        return null;
      });
      if (!completion) return res.json({ aboutMeText: cannedAboutMe(profile, structured), version: Date.now(), fallback: true });

      let aboutMeText = completion.text || "";
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

      const completion = await completeText(
        [
          { role: "system", content: `Generate a concise (2-4 lines) and elegant AI summary for a Destira user's profile. This summary should capture their core personality, key values, and relationship style, designed to entice potential matches. Base it solely on the provided structured profile. Strictly adhere to the privacy guardrail. Do not include any PII or sensitive content.\n\n${PRIVACY_GUARDRAIL}` },
          { role: "user", content: JSON.stringify({ bio: profile.bio, personality: profile.personalityProfile, displayName: profile.displayName, structured: structured || {} }) },
        ],
        { maxTokens: 300, feature: "profile_ai_summary", userId },
      ).catch((e) => {
        console.error("AI summary error (using a summary from their answers):", e.message);
        return null;
      });
      if (!completion) return res.json({ aiSummaryText: cannedAiSummary(profile, structured), version: Date.now(), fallback: true });

      let aiSummaryText = completion.text || "";
      aiSummaryText = detectPII(aiSummaryText);
      await storage.createAuditLog(userId, "generate_summary", { length: aiSummaryText.length });
      res.json({ aiSummaryText, version: Date.now() });
    } catch (e) {
      console.error("Summary generation error:", e);
      res.status(500).json({ message: "Failed to generate summary" });
    }
  });
}
