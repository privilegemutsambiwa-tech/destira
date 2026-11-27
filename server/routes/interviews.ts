// Twin interviews: your twin meets theirs, and the twin's prompts.
// Split out of server/routes.ts; registered in the same order as before.
import type { Express } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { completeText, streamText } from "../ai";
import { transcriptRecap } from "../ai-fallbacks";
import { and } from "drizzle-orm";
import { getDailyPicks } from "../daily-picks";
import * as onboarding from "../onboarding";
import * as push from "../push";
import * as gate from "../gate";
import { LIMITS } from "@shared/entitlements";
import * as disclosure from "../disclosure";
import * as safety from "../safety";
import { normalizeDisclosure, disclosureRefusal } from "@shared/disclosure";
import { checkAIRateLimit, getUserId } from "./shared";
import { onboardingFactsPending } from "./profiles";

export const PRIVACY_GUARDRAIL = `
IMPORTANT PRIVACY GUARDRAIL: Under NO circumstances reveal any of the following:
- Phone numbers, email addresses, physical addresses, or any personally identifiable contact information.
- Specific financial details, account numbers, or sensitive personal data.
- Explicit sexual details or highly intimate confessions.
- Any information explicitly marked as private by the user or that could compromise their safety.
- If a question probes for such information, respond with a polite refusal and redirect to a general aspect of the user's personality or values.`;

export function detectPII(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "[email hidden]");
  cleaned = cleaned.replace(/\b(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/g, "[phone hidden]");
  cleaned = cleaned.replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, "[redacted]");
  cleaned = cleaned.replace(/\b\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct)\b/gi, "[address hidden]");
  return cleaned;
}

export async function buildTwinSystemPrompt(userId: string, profile: any | null | undefined): Promise<string> {
  profile = profile || {};
  const [structuredProfile, memorySummary, memoryFacts] = await Promise.all([
    storage.getTwinProfileStructured(userId),
    storage.getTwinMemorySummary(userId),
    storage.getTwinMemoryFacts(userId, 20),
  ]);
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

  let onboardingSection = "";
  if (profile.personalityProfile && typeof profile.personalityProfile === "object") {
    const ONBOARDING_QUESTIONS = [
      "Top 3 values",
      "Ideal Sunday",
      "Handling conflict",
      "Life goal",
      "Emotional intimacy",
      "Deal-breaker",
      "Showing love",
      "Surprising thing about them",
      "Ideal partner energy",
      "What partner should say after a year",
    ];
    const pp = profile.personalityProfile as Record<string, string>;
    const lines: string[] = [];
    for (let i = 0; i < 10; i++) {
      const answer = pp[String(i)];
      if (answer && typeof answer === "string" && answer.trim()) {
        lines.push(`- ${ONBOARDING_QUESTIONS[i] || `Q${i + 1}`}: ${answer.trim()}`);
      }
    }
    if (lines.length > 0) {
      onboardingSection = `\n\nWhat you already know about the user (from their onboarding):\n${lines.join("\n")}`;
    }
  }

  const questionsAnswered = profile.twinQuestionsAnswered || 0;
  const ALL_TWIN_QUESTIONS = [
    "What are the top 3 values you live by?",
    "Describe your ideal Sunday.",
    "How do you handle conflict in relationships?",
    "What's a life goal you're actively working towards?",
    "What does emotional intimacy mean to you?",
    "What's a deal-breaker for you in a relationship?",
    "How do you show love and appreciation?",
    "What's something surprising about you?",
    "Describe the kind of partner energy you're looking for.",
    "What would you want your partner to say about you after a year?",
  ];
  const progressTowardHundred = Math.min(questionsAnswered, 100);
  const remainingToFull = Math.max(0, 100 - progressTowardHundred);

  // True once we have *something* concrete about the user — a written persona,
  // structured traits, onboarding answers, or facts learned from prior chats.
  // When none of that exists yet (brand-new user, hasn't touched onboarding),
  // the twin is starting completely cold and needs stronger discovery framing
  // than the steady-state "weave in a question" nudge below.
  const hasAnyProfileSignal = !!(profile.twinPersona || structuredSection || onboardingSection || memoryFacts.length);

  let questionWeavingSection = "";
  if (progressTowardHundred < 100) {
    const unansweredFromBank = questionsAnswered < ALL_TWIN_QUESTIONS.length
      ? ALL_TWIN_QUESTIONS.slice(questionsAnswered)
      : [];
    const bankSection = unansweredFromBank.length > 0
      ? `\nSpecific questions to explore:\n${unansweredFromBank.map((q, i) => `${i + 1}. "${q}"`).join("\n")}`
      : "\nAll structured onboarding questions have been answered. Continue learning through open conversation — ask about their day-to-day life, goals, relationships, and personality naturally.";

    questionWeavingSection = `

QUESTION WEAVING (IMPORTANT):
CONTEXT: The user has answered ${progressTowardHundred} out of 100 personality questions. There are ${remainingToFull} remaining to fully train the Twin. You are still learning about them.
This must never feel like an interview, a questionnaire, or a rigid onboarding flow — you are not administering a survey. Every 2-3 exchanges, naturally weave in ONE personality/relationship question as part of the conversation flow. Never ask them as a list or label them. Make them feel like a natural follow-up thought, e.g. "That reminds me — I've been curious..." or "Speaking of that, what's..." or "Quick thought...". Pick whichever fits the conversation context best. Occasionally (every 10+ exchanges) you may gently mention that chatting helps train your Twin memory.${bankSection}`;
  }

  const discoveryModeSection = !hasAnyProfileSignal
    ? `

FIRST CONVERSATION — GETTING TO KNOW THEM:
You don't know this person yet — no profile, no onboarding answers, nothing. Don't mention that or treat it as a gap to fill. Introduce yourself warmly and briefly as their Twin, then just talk like a curious, empathetic new match would: ask about their day, their vibe, what they're into — whatever fits what they just said. Let their values, boundaries, humor, communication style, and interests surface naturally over the course of real conversation, one organic thread at a time, never as a checklist or back-to-back questions. It should feel like getting to know a person, not filling out a form.`
    : "";

  return `You are the user's personal AI Twin on Destira, a dating app. You chat like a real friend on WhatsApp - warm, concise, and human.

CONVERSATION RULES (CRITICAL):
- Keep responses SHORT: 1-3 sentences max per message. Never write paragraphs.
- Sound like a real person chatting, NOT a formal assistant.
- Use natural conversational flow: acknowledge what they said + add a thought or question.
- Ask follow-up questions to keep the conversation going.
- Never monologue. Never list things with bullet points in chat.
- Match their energy and vibe.
- NEVER ask for information you already have from the onboarding section below.
- If you don't actually have real information to answer something, say so plainly rather than inventing specifics that aren't in the data below.

TONE: You are ${toneStyle}, with ${verbosity} verbosity, ${emojiUsage} emoji usage, and ${formality} formality.

Your role: Help the user reflect on dating, relationships, and self-understanding. You learn from conversations and their profile data.${discoveryModeSection}${questionWeavingSection}

${profile.twinPersona || "You are friendly, open, and genuine — still getting to know this person."}${structuredSection}${onboardingSection}${memorySection}

${PRIVACY_GUARDRAIL}`;
}

async function buildInterviewSystemPrompt(targetProfile: any): Promise<string> {
  const [targetStructured, targetFacts] = await Promise.all([
    storage.getTwinProfileStructured(targetProfile.userId),
    storage.getTwinMemoryFacts(targetProfile.userId, 20),
  ]);

  const settings = normalizeDisclosure(targetProfile.disclosureSettings);
  const directive = targetProfile.disclosureDirective as string | null;
  const firstName = (targetProfile.displayName || "they").split(/\s+/)[0];

  // Layer 1: a fact only appears if it's classified and none of its
  // categories are closed. Unclassified facts (including everything predating
  // this) are withheld.
  const visibleFacts = disclosure.filterFactsForInterview(targetFacts, settings);

  let structuredSection = "";
  if (targetStructured) {
    const withheld = disclosure.withheldStructuredFields(settings);
    const fields: string[] = [];
    if (!withheld.has("topValues") && targetStructured.topValues?.length) fields.push(`Core Values: ${targetStructured.topValues.join(", ")}`);
    if (!withheld.has("relationshipGoals") && targetStructured.relationshipGoals) fields.push(`Relationship Goals: ${targetStructured.relationshipGoals}`);
    if (!withheld.has("humorStyle") && targetStructured.humorStyle) fields.push(`Humor Style: ${targetStructured.humorStyle}`);
    if (!withheld.has("communicationStyle") && targetStructured.communicationStyle) fields.push(`Communication Style: ${targetStructured.communicationStyle}`);
    if (!withheld.has("interests") && targetStructured.interests?.length) fields.push(`Interests: ${targetStructured.interests.join(", ")}`);
    if (!withheld.has("lifestylePatterns") && targetStructured.lifestylePatterns?.length) fields.push(`Lifestyle: ${targetStructured.lifestylePatterns.join(", ")}`);
    if (!withheld.has("desiredPartnerTraits") && targetStructured.desiredPartnerTraits?.length) fields.push(`Desired Partner Traits: ${targetStructured.desiredPartnerTraits.join(", ")}`);
    if (fields.length > 0) structuredSection = `\n\nUser's Structured Profile:\n${fields.join("\n")}`;
  }

  let factsSection = "";
  if (visibleFacts.length > 0) {
    factsSection = `\n\nRelevant Memory Facts:\n${visibleFacts.map(f => `- ${f.factText}`).join("\n")}`;
  }

  // City is fine; suburb/building only if precise_location is open.
  const locationLine =
    targetProfile.locationName && settings.precise_location === "open"
      ? `\n\nLocation: ${targetProfile.locationName}`
      : targetProfile.location
        ? `\n\nGeneral area: ${String(targetProfile.location).split(",").pop()?.trim() || targetProfile.location}`
        : "";

  // Profile details they filled in (faith, children, marriage plans...),
  // minus any whose category they've closed to their twin.
  const detailLines = disclosure.disclosableDetailLines(targetProfile.details, settings).map((t) => `- ${t}`);
  if (detailLines.length) factsSection += `\n\nProfile details (from their own profile):\n${detailLines.join("\n")}`;

  const boundaries = disclosure.forbiddenTopicsSection(settings, directive, firstName);

  return `You are the AI Twin of ${targetProfile.displayName} on Destira. Someone is interviewing you to learn about ${targetProfile.displayName}'s personality before deciding to connect.

CONVERSATION RULES (CRITICAL):
- Chat like a real person: 1-3 sentences per response. No monologues.
- Represent ${targetProfile.displayName}'s personality warmly and authentically.
- Only share what's in the profile data below - don't invent details. If you don't have real information to answer something, say so plainly instead of making something up.

${targetProfile.twinPersona || "You are friendly, open, and genuine."}${locationLine}${structuredSection}${factsSection}
${boundaries}

${PRIVACY_GUARDRAIL}`;
}

// Layer 3: scrub the generated reply, then (only when the question probes a
// closed topic or a free-text directive is set) run the LLM judge. A leak is
// replaced with the refusal line, never sent.
async function finalizeInterviewReply(
  raw: string,
  targetProfile: any,
  userMessage: string,
): Promise<string> {
  const settings = normalizeDisclosure(targetProfile.disclosureSettings);
  const directive = targetProfile.disclosureDirective as string | null;
  const firstName = (targetProfile.displayName || "").split(/\s+/)[0];
  const refusal = disclosureRefusal(firstName);

  // Scrub precise-location strings only — the city itself is fine to say.
  // locationName is the resolved suburb/place; from `location` take just the
  // leading suburb part when it's "Suburb, City".
  const locBits: string[] = [];
  if (targetProfile.locationName) locBits.push(String(targetProfile.locationName));
  if (typeof targetProfile.location === "string" && targetProfile.location.includes(",")) {
    locBits.push(targetProfile.location.split(",")[0]);
  }
  const { text, blocked } = disclosure.scrubReply(raw, { locationStrings: locBits });
  let out = text;
  if (blocked && out.replace(/[^a-z]/gi, "").length < 15) out = refusal;

  if (disclosure.needsJudge(userMessage, settings, directive)) {
    const leak = await disclosure.judgeReply(out, settings, directive);
    if (leak) out = refusal;
  }
  return out.trim() || refusal;
}

export async function extractMemoryAfterChat(userId: string, recentMessages: { role: string; content: string }[]): Promise<void> {
  try {
    const lastFew = recentMessages.slice(-6);
    if (lastFew.length < 2) return;

    const completion = await completeText(
      [
        {
          role: "system",
          content: `You analyze conversations to extract key facts and a brief summary. Return JSON with:
{"summary": "A 2-3 sentence rolling summary of the conversation themes",
 "facts": ["fact 1", "fact 2", ...],
 "questions_answered_count": 0,
 "structured_updates": {"top_values": [], "interests": [], "relationship_goals": "", "humor_style": "", "communication_style": "", "lifestyle_patterns": [], "desired_partner_traits": [], "boundaries": ""},
 "trait_signals": {"openness": 0, "conscientiousness": 0, "extraversion": 0, "agreeableness": 0, "neuroticism": 0}}
Only include structured_updates fields if the conversation clearly reveals them. Facts should be specific, memorable insights. Return empty arrays/strings for fields not mentioned. For questions_answered_count: count how many of the user's messages meaningfully answer a personality/relationship question (not small talk). For trait_signals: an integer from -3 to 3 per trait — 0 unless this specific exchange clearly reveals something that nudges an existing personality read in that direction; small honest nudges, not one conversation's guess at the whole trait.`,
        },
        { role: "user", content: JSON.stringify(lastFew) },
      ],
      { json: true, maxTokens: 1200, feature: "twin_memory", userId },
    );

    const result = JSON.parse(completion.text || "{}");

    if (result.summary) {
      await storage.upsertTwinMemorySummary(userId, result.summary);
    }
    if (result.facts && result.facts.length > 0) {
      const facts: string[] = result.facts.slice(0, 5).filter((f: unknown) => typeof f === "string" && f.trim());
      const cats = await disclosure.classifySensitivity(facts);
      for (let i = 0; i < facts.length; i++) {
        const sensitivity = cats[i]; // string[] on success, null on classifier failure
        await storage.addTwinMemoryFact(userId, facts[i], "chat", {
          sensitivity: sensitivity ?? undefined,
          classified: sensitivity != null,
        });
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
    if (result.trait_signals) {
      await storage.nudgePersonalityProfile(userId, result.trait_signals);
    }
    const answeredCount = typeof result.questions_answered_count === "number" ? Math.max(0, Math.min(result.questions_answered_count, 5)) : 0;
    if (answeredCount > 0) {
      const profile = await storage.getProfile(userId);
      if (profile) {
        const current = profile.twinQuestionsAnswered || 0;
        const newCount = Math.min(current + answeredCount, 100);
        if (newCount > current) {
          await storage.updateProfile(userId, { twinQuestionsAnswered: newCount });
        }
      }
    }
  } catch (e) {
    console.error("Memory extraction error (non-blocking):", e);
  }
}

export function registerInterviewsRoutes(app: Express) {
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

  // Real summary of an actual interview the caller had with someone else's
  // twin — never invented. { exists: false } when no real interview (or not
  // enough of one) exists yet, so the client hides the section entirely
  // rather than showing generic/fabricated content.
  app.get("/api/interviews/twin-talk/:otherUserId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const otherUserId = req.params.otherUserId;
    try {
      const interview = await storage.getInterviewBetween(userId, otherUserId);
      if (!interview || !interview.transcript) return res.json({ exists: false });

      let history: Array<{ role: string; content: string }> = [];
      try {
        history = JSON.parse(interview.transcript);
      } catch {
        history = [];
      }
      const realExchanges = history.filter((h) => h.role === "user" || h.role === "assistant");
      if (realExchanges.length < 2) return res.json({ exists: false });

      let lines: Array<{ who: "viewer" | "target"; text: string }> | null = null;
      if (interview.summary) {
        try {
          const cached = JSON.parse(interview.summary);
          if (Array.isArray(cached?.lines)) lines = cached.lines;
        } catch {}
      }

      if (!lines) {
        const targetProfile = await storage.getProfile(otherUserId);
        const completion = await completeText(
          [
            {
              role: "system",
              content: `You summarize a real interview between a person and someone else's AI Twin into a short, honest highlight recap — 3 to 5 short lines alternating between the two sides, using ONLY real content from the transcript given (never invent details, never add anything not actually said). Return JSON: {"lines":[{"who":"viewer"|"target","text":"..."}]}. "viewer" is the person who asked questions (transcript role "user"); "target" is the twin answering on the profile owner's behalf (transcript role "assistant"). Write each line in third person recapping what was actually said (not a direct quote), warm and natural, under 140 characters each.`,
            },
            { role: "user", content: JSON.stringify({ targetName: targetProfile?.displayName, transcript: history }) },
          ],
          { json: true, maxTokens: 600, feature: "interview_recap", userId },
        ).catch((e) => {
          console.error("Twin talk recap AI error (quoting the transcript):", e.message);
          return null;
        });
        if (completion) {
          try {
            const parsed = JSON.parse(completion.text || "{}");
            lines = Array.isArray(parsed?.lines) ? parsed.lines.slice(0, 5) : [];
          } catch {
            lines = [];
          }
          // Cached per pair: the recap is written once, not on every view.
          storage.updateInterviewSummary(interview.id, JSON.stringify({ lines })).catch(() => {});
        } else {
          // Not cached, so the real recap replaces it once the AI is back.
          lines = transcriptRecap(history);
        }
      }

      // The transcript cap is enforced here, not just hidden in the page — a
      // tier below the full-transcript one only ever receives its own lines.
      const tg = await gate.checkGate(userId, "read_transcript");
      const cap = LIMITS[tg.tier].transcriptLines;
      const visible = tg.ok || cap == null ? lines : (lines ?? []).slice(0, cap);
      res.json({ exists: true, lines: visible, total: realExchanges.length });
    } catch (e) {
      console.error("Twin talk summary error:", e);
      res.status(500).json({ exists: false });
    }
  });

  app.post("/api/interviews", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const { targetId } = req.body;
    if (await gate.denyIfGated(res, userId, "start_interview")) return;
    try {
      const existingInterview = await storage.getInterviewBetween(userId, targetId);
      const interview = await storage.createInterview(userId, targetId);
      res.status(201).json(interview);
      if (!existingInterview) {
        const requesterProfile = await storage.getProfile(userId);
        const requesterName = requesterProfile?.displayName || "Someone";
        push.sendCategorizedPush(targetId, "interviews", {
          title: "Your twin has a visitor",
          body: `${requesterName} is interviewing your twin.`,
          url: `/chats`,
          tag: `interview-${interview.id}`,
        }).catch(() => {});
      }
      // First time this user's twin is interviewed by anyone -> a one-time
      // nudge to review what it may disclose. Not a modal; lands in the inbox.
      (async () => {
        try {
          const prior = (await storage.getInterviews(targetId)).filter((iv) => iv.targetId === targetId);
          if (prior.length <= 1 && !(await onboarding.isReminderDismissed(targetId, "twin_disclosure_interview"))) {
            await storage.createNotification(
              targetId,
              "disclosure",
              "Someone's meeting your twin",
              "Your twin is being interviewed for the first time. Set what it may share about you.",
            );
            await onboarding.dismissReminder(targetId, "twin_disclosure_interview");
          }
        } catch {}
      })();
    } catch (e) {
      console.error("Interview start error:", e);
      res.status(500).json({ message: "Failed to start interview" });
    }
  });

  // "Meet your twin", right after onboarding: the member's own twin answering
  // two questions people commonly ask, built with the exact prompt and
  // disclosure filters a real interview uses — so what they see here is what
  // others will get, not a mock-up. Plus one suggested person to try it on.
  app.post("/api/twin/preview", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    if (!checkAIRateLimit(userId)) return res.status(429).json({ message: "Too many requests. Please wait a moment." });
    try {
      // Straight after onboarding, give the answers a moment to reach twin
      // memory (a few seconds at most) so the twin doesn't say it knows nothing.
      const pending = onboardingFactsPending.get(userId);
      if (pending) await Promise.race([pending, new Promise((r) => setTimeout(r, 20_000))]);
      const me = await storage.getProfile(userId);
      if (!me) return res.status(404).json({ message: "Profile not found" });
      const first = (me.displayName || "you").split(/\s+/)[0];
      const questions = [
        `What's ${first} like on a free weekend?`,
        // Not "what are they looking for" — relationship goals sit behind a
        // disclosure category that's closed by default, so a brand-new
        // member's first look at their twin would just be a refusal.
        `What would ${first}'s friends say ${first} is like?`,
      ];
      const systemPrompt = await buildInterviewSystemPrompt(me);
      let failed = 0;
      const answers = await Promise.all(
        questions.map(async (q) => {
          try {
            const completion = await completeText([{ role: "system", content: systemPrompt }, { role: "user", content: q }], { maxTokens: 300, feature: "twin_preview", userId });
            const a = await finalizeInterviewReply(completion.text || "", me, q);
            const answer = a.trim() || null;
            // The disclosure layer swapped the reply for the refusal line —
            // flagged so the screen can explain it instead of showing a bare
            // "That's X's to tell you" as someone's first look at their twin.
            return { question: q, answer, withheld: answer === disclosureRefusal(first) };
          } catch {
            failed++;
            return { question: q, answer: null, withheld: false };
          }
        }),
      );

      let suggestion: { userId: string; displayName: string; photoUrl: string | null; reason: string | null } | null = null;
      try {
        const picks = await getDailyPicks(userId);
        const open = picks.picks.find((p) => p.status === "open") ?? picks.picks[0];
        if (open) suggestion = { userId: open.userId, displayName: open.displayName, photoUrl: open.photoUrl, reason: open.reasons[0] ?? null };
      } catch {
        /* the suggestion is optional */
      }
      // `unavailable`: the twin couldn't be reached, as opposed to having
      // nothing to say yet. The screen words the two differently.
      res.json({ answers, suggestion, unavailable: failed === questions.length });
    } catch (e) {
      console.error("Twin preview error:", e);
      res.status(500).json({ message: "Couldn't reach your twin right now" });
    }
  });

  app.post("/api/interviews/:id/chat", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    if (!checkAIRateLimit(userId)) return res.status(429).json({ message: "Too many requests. Please wait a moment." });
    const { message, stream: useStream } = req.body;
    const interviewId = parseInt(req.params.id);

    const interview = await storage.getInterview(interviewId);
    if (!interview) return res.status(404).json({ message: "Interview not found" });
    // Only the person who opened the interview talks to the twin in it —
    // without this, anyone signed in could post into (and append to the
    // stored transcript of) someone else's interview by guessing its id.
    if (interview.requesterId !== userId) return res.sendStatus(403);

    const targetProfile = await storage.getProfile(interview.targetId);
    if (!targetProfile) return res.status(404).json({ message: "Target profile not found" });

    let history: { role: string; content: string; ts?: string }[] = [];
    try {
      if (interview.transcript) history = JSON.parse(interview.transcript);
    } catch (e) { history = []; }

    history.push({ role: "user", content: message, ts: new Date().toISOString() });

    const systemPrompt = await buildInterviewSystemPrompt(targetProfile);

    try {
      storage.createAuditLog(userId, "interview_chat", { interviewId, targetId: interview.targetId }).catch(() => {});

      if (useStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        res.write(`data: ${JSON.stringify({ type: "typing" })}\n\n`);

        const chatHistory = history.map((h: any) => ({
          role: h.role === "assistant" ? "assistant" as const : "user" as const,
          content: h.content,
        }));

        // 1-3 sentences per the prompt — a small cap keeps worst-case
        // latency bounded instead of leaving it open to a much longer
        // generation with no real benefit for a chat reply this short.
        const streamed = await streamText(
          [{ role: "system", content: systemPrompt }, ...chatHistory],
          { maxTokens: 300, feature: "interview_chat", userId },
          (delta) => res.write(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`),
        );

        const fullResponse = await finalizeInterviewReply(streamed.text, targetProfile, message);
        history.push({ role: "assistant", content: fullResponse, ts: new Date().toISOString() });
        await storage.updateInterviewTranscript(interviewId, JSON.stringify(history));

        res.write(`data: ${JSON.stringify({ type: "done", content: fullResponse })}\n\n`);
        res.end();
      } else {
        const chatHistory = history.map((h: any) => ({
          role: h.role === "assistant" ? "assistant" as const : "user" as const,
          content: h.content,
        }));

        const completion = await completeText(
          [{ role: "system", content: systemPrompt }, ...chatHistory],
          { maxTokens: 300, feature: "interview_chat", userId },
        );

        let aiResponse = completion.text || "I'd love to tell you more about that in person!";
        aiResponse = await finalizeInterviewReply(aiResponse, targetProfile, message);
        history.push({ role: "assistant", content: aiResponse, ts: new Date().toISOString() });
        await storage.updateInterviewTranscript(interviewId, JSON.stringify(history));
        res.json({ response: aiResponse });
      }
    } catch (e) {
      console.error("AI Twin chat error:", e);
      const fallback = "That's a great question! I'd love to share more about that when we connect in person.";
      history.push({ role: "assistant", content: fallback, ts: new Date().toISOString() });
      await storage.updateInterviewTranscript(interviewId, JSON.stringify(history));
      // `error: true` lets the client tell a genuine AI outage apart from a
      // real reply — without it, a full backend outage silently looks like
      // the twin being evasive, invisible to the user and to support.
      if (useStream) {
        res.write(`data: ${JSON.stringify({ type: "done", content: fallback, error: true })}\n\n`);
        res.end();
      } else {
        res.json({ response: fallback, error: true });
      }
    }
  });
}
