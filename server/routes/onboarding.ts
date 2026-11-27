// The 100 questions, onboarding, gates, the twin's daily note and reminders.
// Split out of server/routes.ts; registered in the same order as before.
import type { Express } from "express";
import { storage } from "../storage";
import { completeText } from "../ai";
import { estimatePersonalityFromAnswers } from "../personality";
import { db } from "../db";
import { eq, and, gte, desc } from "drizzle-orm";
import { twinNotifications } from "@shared/schema";
import * as onboarding from "../onboarding";
import { reminderKindEnum } from "@shared/schema";
import * as gate from "../gate";
import { interviews as interviewsTable } from "@shared/schema";
import { getUserId } from "./shared";
import { addOnboardingFacts, extractStructuredFromOnboarding, onboardingFactsPending } from "./profiles";

export function registerOnboardingRoutes(app: Express) {
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

  // ── Onboarding: DB-driven, skippable, resumable ──

  app.get("/api/onboarding", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const [questions, readiness, profile] = await Promise.all([
        onboarding.getOnboardingQuestions(userId),
        onboarding.getTwinReadiness(userId),
        storage.getProfile(userId),
      ]);
      res.json({ questions, readiness, nickname: profile?.groupNickname ?? "" });
    } catch (e) {
      console.error("Onboarding load error:", e);
      res.status(500).json({ message: "Failed to load onboarding" });
    }
  });

  app.post("/api/onboarding/answer", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const questionId = Number(req.body?.questionId);
    if (!Number.isInteger(questionId)) return res.status(400).json({ message: "questionId required" });
    const answerText = typeof req.body?.answerText === "string" ? req.body.answerText.trim() : undefined;
    const selectedOptions = Array.isArray(req.body?.selectedOptions)
      ? req.body.selectedOptions.filter((s: unknown) => typeof s === "string")
      : undefined;
    if (!answerText && !selectedOptions?.length) {
      return res.status(400).json({ message: "An answer is required" });
    }
    try {
      await onboarding.saveOnboardingAnswer(userId, questionId, {
        answerText,
        selectedOptions,
        isPrivate: !!req.body?.isPrivate,
      });
      storage.upsertTwinProfileStructured(userId, {}).catch(() => {});
      res.json(await onboarding.getTwinReadiness(userId));
    } catch (e: any) {
      if (e?.message === "Not an onboarding question") return res.status(400).json({ message: e.message });
      console.error("Onboarding answer error:", e);
      res.status(500).json({ message: "Failed to save answer" });
    }
  });

  // Leaving onboarding by ANY route flips onboardingCompleted so nobody is
  // trapped. Generates the twin only once the answer floor is met.
  app.post("/api/onboarding/complete", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const nick = typeof req.body?.groupNickname === "string" ? req.body.groupNickname.trim() : undefined;
    const isPublic = typeof req.body?.isPublic === "boolean" ? req.body.isPublic : true;
    const timezone = typeof req.body?.timezone === "string" ? req.body.timezone : undefined;
    try {
      if (nick && /^[a-zA-Z0-9_]{3,20}$/.test(nick)) {
        const taken = await storage.isGroupNicknameTakenByOther(nick, userId);
        if (taken) return res.status(409).json({ message: "This nickname is already taken" });
      }
      await onboarding.completeOnboarding(userId, nick, isPublic, timezone);
      const readiness = await onboarding.getTwinReadiness(userId);

      if (readiness.twinReady) {
        const profile = await storage.getProfile(userId);
        if (profile && !profile.twinPersona) {
          const qs = await onboarding.getOnboardingQuestions(userId);
          const answers = qs
            .filter((q) => q.answered)
            .map((q) => ({ q: q.text, a: q.answerText || (q.selectedOptions || []).join(", ") }));
          // The answers go into twin memory now, alongside the persona
          // rather than after it: the next screen asks the twin about them.
          const facts = addOnboardingFacts(userId, answers);
          onboardingFactsPending.set(userId, facts);
          facts.finally(() => onboardingFactsPending.delete(userId));
          completeText(
            [
              {
                role: "system",
                content: `You are an expert personality profiler for a dating app called Destira. From the user's answers, write a warm first-person AI Twin persona ("I'm [name]'s AI Twin."). Cover values, interests, communication style, what they look for in a partner, and personality. 2-3 paragraphs.`,
              },
              { role: "user", content: JSON.stringify(answers) },
            ],
            { maxTokens: 900, feature: "twin_persona", userId },
          )
            .then((r) => storage.updateProfile(userId, { twinPersona: r.text || "" }))
            .then(() => extractStructuredFromOnboarding(userId, answers))
            .catch((err) => console.error("Twin gen on complete failed:", err));

          // Independent of the twin persona above — the Discover resonance
          // panel used to be exclusive to hardcoded demo accounts (see
          // server/personality.ts) because real onboarding never produced
          // numeric traits at all. This gives every real profile the same
          // real, answer-grounded read the moment they have enough answers
          // to ground it in.
          if (!profile.personalityProfile) {
            estimatePersonalityFromAnswers(answers)
              .then((traits) => traits && storage.updateProfile(userId, { personalityProfile: traits } as any))
              .catch((err) => console.error("Personality estimate on complete failed:", err));
          }
        }
      }
      res.json(readiness);
    } catch (e) {
      console.error("Onboarding complete error:", e);
      res.status(500).json({ message: "Failed to finish onboarding" });
    }
  });

  // What one gated feature looks like for the caller right now — powers the
  // client useGate() hook and the <Gated> block.
  app.get("/api/gate/:feature", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const feature = req.params.feature as any;
      const g = await gate.checkGate(userId, feature);
      // Carry the composed refusal copy so the client sheet / <Gated> card and
      // the server 403 body all render the same strings.
      const copy = gate.gateCopyFor(g, feature);
      res.json({ ...g, action: copy.action, line: copy.line, requiredTierName: copy.requiredTierName, requiredPrice: copy.requiredPrice });
    } catch (e) {
      res.status(400).json({ message: "Unknown feature" });
    }
  });

  // Set once, client-side, so "your likes reset at midnight" is true for the
  // user's actual clock. No-op if already set to the same value.
  app.post("/api/profile/timezone", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const tz = typeof req.body?.timezone === "string" ? req.body.timezone : "";
    if (tz.length < 2 || tz.length > 64) return res.status(400).json({ message: "bad tz" });
    try {
      await storage.updateProfile(userId, { timezone: tz } as any);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Failed to save timezone" });
    }
  });

  // The twin orb's sheet on Discover (docs/destira-upgrade-prompt.md §5.1):
  // only what the twin really did. The sheet shows counts; who asked (and
  // what) is in Chats, where the member is already told and can read each
  // conversation. Notices are the twin's own real notifications.
  app.get("/api/twin/today", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [recent, weekRows, notices, readiness] = await Promise.all([
        db.select({ requesterId: interviewsTable.requesterId, transcript: interviewsTable.transcript })
          .from(interviewsTable)
          .where(and(eq(interviewsTable.targetId, userId), gte(interviewsTable.updatedAt, dayAgo))),
        db.selectDistinct({ requesterId: interviewsTable.requesterId })
          .from(interviewsTable)
          .where(and(eq(interviewsTable.targetId, userId), gte(interviewsTable.updatedAt, weekAgo))),
        db.select({ id: twinNotifications.id, title: twinNotifications.title, body: twinNotifications.body, createdAt: twinNotifications.createdAt })
          .from(twinNotifications)
          .where(and(eq(twinNotifications.userId, userId), gte(twinNotifications.createdAt, weekAgo)))
          .orderBy(desc(twinNotifications.createdAt))
          .limit(3),
        onboarding.getTwinReadiness(userId),
      ]);
      let answered = 0;
      for (const row of recent) {
        try {
          const turns = JSON.parse(row.transcript || "[]");
          if (Array.isArray(turns)) answered += turns.filter((t: any) => t?.role === "assistant").length;
        } catch {}
      }
      res.json({
        askedToday: new Set(recent.map((r) => r.requesterId)).size,
        answeredInThoseChats: answered,
        askedThisWeek: weekRows.length,
        notices,
        readinessPct: readiness.pct,
        answeredCount: readiness.answeredCount,
      });
    } catch (e) {
      console.error("Twin today error:", e);
      res.status(500).json({ message: "Failed to load" });
    }
  });

  app.get("/api/twin/readiness", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const [readiness, dismissed] = await Promise.all([
        onboarding.getTwinReadiness(userId),
        onboarding.isReminderDismissed(userId, "discover_readiness_strip"),
      ]);
      res.json({ ...readiness, discoverStripDismissed: dismissed });
    } catch (e) {
      console.error("Readiness error:", e);
      res.status(500).json({ message: "Failed to load readiness" });
    }
  });

  app.get("/api/reminders/:kind", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const parsed = reminderKindEnum.safeParse(req.params.kind);
    if (!parsed.success) return res.status(400).json({ message: "Unknown reminder" });
    try {
      res.json({ dismissed: await onboarding.isReminderDismissed(userId, parsed.data) });
    } catch (e) {
      res.status(500).json({ message: "Failed" });
    }
  });

  app.post("/api/reminders/:kind/dismiss", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const parsed = reminderKindEnum.safeParse(req.params.kind);
    if (!parsed.success) return res.status(400).json({ message: "Unknown reminder" });
    try {
      await onboarding.dismissReminder(userId, parsed.data);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to dismiss" });
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

      const userAnswer = await storage.submitAnswer(userId, questionId, answer, null, undefined, isPrivate);

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

      const completion = await completeText(
        [
          {
            role: "system",
            content: `Analyze the user's profile data and question answers to extract structured personality traits. Return JSON with:
{"top_values": ["value1", "value2", ...], "relationship_goals": "...", "boundaries": "...", "humor_style": "...", "communication_style": "...", "attachment_style": "...", "interests": ["interest1", ...], "lifestyle_patterns": ["pattern1", ...], "desired_partner_traits": ["trait1", ...]}
Fill in what you can determine from the data. Use short, clear phrases. Limit arrays to 5 items max.`,
          },
          { role: "user", content: JSON.stringify({ bio: profile.bio, personality, twinPersona: profile.twinPersona, answers: answers.map(a => a.answerText) }) },
        ],
        { json: true, maxTokens: 800, feature: "twin_extract_profile", userId },
      ).catch((e) => {
        console.error("Profile extraction AI error (keeping what's there):", e.message);
        return null;
      });
      // No AI: leave the structured profile as it is rather than blank it.
      if (!completion) return res.json({ ...((await storage.getTwinProfileStructured(userId)) ?? {}), fallback: true });

      const result = JSON.parse(completion.text || "{}");
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
}
