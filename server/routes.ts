import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, PhotoNotFoundError, PhotoTooSmallError, genderMatchesSeeking } from "./storage";
import { setupAuth, registerAuthRoutes, authStorage, createSessionUser, hashPassword, verifyPassword } from "./replit_integrations/auth";
import { z } from "zod";
import { ai, AI_MODEL, completeText } from "./ai";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { db } from "./db";
import { sql, eq, and, gt, lt, gte, desc, isNull, isNotNull, inArray } from "drizzle-orm";
import { groupMembers, blockedUsers, profiles, twinMemory as twinMemoryTable, twinMemoryFacts, twinMemorySummary, updateEventSchema, twinNotifications, userPhotos } from "@shared/schema";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import {
  UPLOAD_DIR,
  putObject,
  getObjectBuffer,
  deleteObject,
  getSignedUrl,
  generateFilename,
  isObjectStorageEnabled,
  keyFromUploadUrl,
} from "./storage/objectStorage";
import type { TwinProfileStructured } from "@shared/schema";
import * as eventsService from "./events";
import * as eventsFeed from "./events-feed";
import * as twinEventAlerts from "./services/twin-event-alerts";
import * as onboarding from "./onboarding";
import * as payments from "./payments";
import * as proximity from "./services/twin-proximity-alerts";
import * as push from "./push";
import { updateEventPreferencesSchema, eventSearchQuerySchema, hostEventSchema, cancelEventSchema, reminderKindEnum, initiatePaymentSchema, locationReportSchema, updateProximitySettingsSchema, proximityAlerts, placeInvisibility, pushSubscriptions, places, suburbCentroids } from "@shared/schema";
import * as gate from "./gate";
import { gateCopy } from "@shared/entitlements";
import { updatePhotoRoleSchema, updatePhotoFocalSchema, profilePromptsSchema } from "@shared/schema";
import * as referralsService from "./referrals";
import { referralClaimSchema } from "@shared/schema";
import * as disclosure from "./disclosure";
import * as groupInvite from "./group-invite";
import { registerAdminConsole } from "./admin";
import * as emailTemplates from "./email/templates";
import { setAdminLockoutHook } from "./admin/auth";
import { trackActivity } from "./admin/activity";
import { requestOutcomeMiddleware, recordRequestOutcome } from "./admin/error-rate";
import { logLlmCall } from "./admin/llm-log";
import { runNightlyRollup, backfillRecentMetrics } from "./admin/metrics-rollup";
import { sendDailyDigest, sendWeeklyDigest } from "./email/digest";
import { REPORT_CATEGORIES, FEEDBACK_CATEGORIES } from "@shared/admin";
import { reports as reportsTable, feedback as feedbackTable } from "@shared/schema";
import { ageFromDob, MIN_AGE } from "@shared/essentials";
import {
  normalizeDisclosure,
  disclosureRefusal,
  DISCLOSURE_CATEGORY_KEYS,
  DISCLOSURE_STATES,
  DIRECTIVE_MAX,
} from "@shared/disclosure";

const aiRateLimits = new Map<string, number[]>();
function checkAIRateLimit(userId: string, maxPerMinute: number = 10): boolean {
  const now = Date.now();
  const timestamps = aiRateLimits.get(userId) || [];
  const recent = timestamps.filter(t => now - t < 60000);
  if (recent.length >= maxPerMinute) return false;
  recent.push(now);
  aiRateLimits.set(userId, recent);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of aiRateLimits.entries()) {
    const recent = timestamps.filter(t => now - t < 60000);
    if (recent.length === 0) aiRateLimits.delete(key);
    else aiRateLimits.set(key, recent);
  }
}, 300000);

// Buffers in memory rather than writing to local disk — putObject() below
// sends that buffer to Supabase Storage (or local disk as a dev fallback,
// see server/storage/objectStorage.ts) instead of multer writing it itself.
const upload = multer({
  storage: multer.memoryStorage(),
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

// Separate instance for host-video: that route takes a `video` field
// (recorded webm/mp4, up to 60s) alongside a `poster` image field, which the
// image-only fileFilter above would reject outright. 50MB covers a 60s
// in-app recording at a reasonable bitrate with headroom.
const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed =
      file.fieldname === "poster"
        ? ["image/jpeg", "image/png", "image/webp"]
        : ["video/webm", "video/mp4"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported ${file.fieldname} type: ${file.mimetype}`));
    }
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  app.use(trackActivity());
  app.use(requestOutcomeMiddleware());
  registerAuthRoutes(app);
  registerAdminConsole(app);
  setAdminLockoutHook((email, n) => {
    emailTemplates.alertAdminLockout({ email, attempts: n }).catch(() => {});
  });

  function getUserId(req: any): string | null {
    if (!req.isAuthenticated()) return null;
    return (req.user as any).claims.sub;
  }

  // A render crash caught by a client ErrorBoundary would otherwise be
  // invisible — no server request ever fails, so nothing shows up anywhere.
  // This logs it server-side and counts it in the admin overview's error
  // rate (recordRequestOutcome(500)) even though the response to the client
  // itself is a clean 204, not a failure.
  app.post("/api/client-errors", (req, res) => {
    const { message, stack, componentStack, url } = req.body || {};
    console.error("[client-error]", {
      userId: getUserId(req),
      url,
      message,
      stack,
      componentStack,
    });
    recordRequestOutcome(500);
    res.sendStatus(204);
  });

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
      const filter = typeof req.query.filter === "string" ? req.query.filter : undefined;
      const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
      const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
      const userLat = lat !== undefined && !isNaN(lat) ? lat : undefined;
      const userLng = lng !== undefined && !isNaN(lng) ? lng : undefined;
      const discoverable = await storage.getDiscoverableProfiles(userId, filter, userLat, userLng);
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
      const response = await completeText(
        [
          { role: "system", content: `You are an expert personality profiler for a dating app called Destira. Based on the user's answers to soul-mapping questions, create a rich, warm, first-person AI Twin persona description. Write in first person as "I'm [the user]'s AI Twin." Include key values, interests, communication style, what they look for in a partner, and personality traits. Keep it to 2-3 paragraphs.` },
          { role: "user", content: JSON.stringify(answers) },
        ],
        { maxTokens: 8192 },
      );
      const twinPersona = response.text || "A thoughtful person who values authentic connections.";
      res.json({ twinPersona });
    } catch (e) {
      console.error("Twin generation error:", e);
      res.json({ twinPersona: "A thoughtful and genuine person who values authentic connections. They believe in being real over being perfect, and they're looking for someone who shares that philosophy." });
    }
  });

  app.post("/api/profile/polish-bio", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    if (!checkAIRateLimit(userId)) return res.status(429).json({ message: "Too many requests. Please wait a moment." });
    const { bio } = req.body;
    if (!bio || typeof bio !== "string") return res.status(400).json({ message: "bio is required" });
    try {
      const profile = await storage.getProfile(userId);
      const response = await completeText(
        [
          { role: "system", content: `You are polishing a dating app bio for someone named ${profile?.displayName || "the user"}. Keep their authentic voice and core ideas but make it sparkle — tighten the prose, remove filler, add warmth. Return ONLY the polished bio text, no explanations, no quotes. Max 300 characters.` },
          { role: "user", content: bio },
        ],
        { maxTokens: 512 },
      );
      const polished = (response.text || bio).trim().slice(0, 300);
      res.json({ polished });
    } catch (e) {
      console.error("Polish bio error:", e);
      res.status(500).json({ message: "Failed to polish bio" });
    }
  });

  // Up to 3 short prompts the twin can quote. Free-form { q, a } — the question
  // bank lives on the client.
  app.patch("/api/profile/prompts", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const parsed = profilePromptsSchema.safeParse(req.body?.prompts);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid prompts", errors: parsed.error.flatten() });
    }
    try {
      const row = await storage.updateProfilePrompts(userId, parsed.data);
      res.json(row);
    } catch (e) {
      console.error("Update prompts error:", e);
      res.status(500).json({ message: "Failed to save prompts" });
    }
  });

  // "This week" block — derived counts, honestly labelled.
  app.get("/api/profile/week", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      res.json(await storage.getProfileWeekStats(userId));
    } catch (e) {
      console.error("Week stats error:", e);
      res.status(500).json({ message: "Failed to load week stats" });
    }
  });

  app.post("/api/profiles/generate-summary", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const profile = await storage.getProfile(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });
      const memoryFacts = await storage.getTwinMemoryFacts(userId, 15);
      const memorySummary = await storage.getTwinMemorySummary(userId);
      const contextData = {
        displayName: profile.displayName,
        bio: profile.aboutMe || profile.bio,
        personality: profile.personalityProfile,
        twinPersona: profile.twinPersona,
        memoryFacts: memoryFacts.map(f => f.factText),
        memorySummary: memorySummary?.summaryText,
      };
      const response = await completeText(
        [
          { role: "system", content: `Generate two warm, genuine summaries for a dating profile using all available context (bio, personality answers, Twin memory facts, and conversation themes). Return JSON with: {"aboutSummary": "A 3-4 sentence warm, witty 'About Me' summary that captures their authentic personality and what makes them interesting as a partner", "personalitySummary": "A 3-4 sentence personality passage based on their traits, values, and how they show up in relationships"}. Draw from the memory facts and conversation themes to make it specific and real — avoid generic platitudes.` },
          { role: "user", content: JSON.stringify(contextData) },
        ],
        { json: true, maxTokens: 8192 },
      );
      const summaries = JSON.parse(response.text || "{}");
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

  async function seedOnboardingIntoTwinMemory(userId: string, personalityProfile: Record<string, string>): Promise<void> {
    try {
      const ONBOARDING_QUESTIONS = [
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

      const obFacts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const answer = personalityProfile[String(i)];
        if (answer && typeof answer === "string" && answer.trim()) {
          const question = ONBOARDING_QUESTIONS[i] || `Onboarding question ${i + 1}`;
          obFacts.push(`${question} → ${answer.trim()}`);
        }
      }
      if (obFacts.length) {
        const obCats = await disclosure.classifySensitivity(obFacts);
        for (let i = 0; i < obFacts.length; i++) {
          await storage.addTwinMemoryFact(userId, obFacts[i], "onboarding", {
            sensitivity: obCats[i] ?? undefined,
            classified: obCats[i] != null,
          });
        }
      }

      const profile = await storage.getProfile(userId);
      if (profile) {
        const extraction = await completeText(
          [
            {
              role: "system",
              content: `Analyze the user's onboarding answers to extract structured personality traits. Return JSON with:
{"top_values": ["value1", "value2", ...], "relationship_goals": "...", "boundaries": "...", "humor_style": "...", "communication_style": "...", "attachment_style": "...", "interests": ["interest1", ...], "lifestyle_patterns": ["pattern1", ...], "desired_partner_traits": ["trait1", ...]}
Fill in what you can determine from the data. Use short, clear phrases. Limit arrays to 5 items max.`,
            },
            { role: "user", content: JSON.stringify({ personality: personalityProfile, twinPersona: profile.twinPersona }) },
          ],
          { json: true, maxTokens: 8192 },
        );
        const extracted = JSON.parse(extraction.text || "{}");
        const structuredUpdates: Partial<TwinProfileStructured> = {
          ...(extracted.top_values?.length ? { topValues: extracted.top_values } : {}),
          ...(extracted.relationship_goals ? { relationshipGoals: extracted.relationship_goals } : {}),
          ...(extracted.boundaries ? { boundaries: extracted.boundaries } : {}),
          ...(extracted.humor_style ? { humorStyle: extracted.humor_style } : {}),
          ...(extracted.communication_style ? { communicationStyle: extracted.communication_style } : {}),
          ...(extracted.attachment_style ? { attachmentStyle: extracted.attachment_style } : {}),
          ...(extracted.interests?.length ? { interests: extracted.interests } : {}),
          ...(extracted.lifestyle_patterns?.length ? { lifestylePatterns: extracted.lifestyle_patterns } : {}),
          ...(extracted.desired_partner_traits?.length ? { desiredPartnerTraits: extracted.desired_partner_traits } : {}),
        };
        if (Object.keys(structuredUpdates).length > 0) {
          await storage.upsertTwinProfileStructured(userId, structuredUpdates);
        }
      }
    } catch (e) {
      console.error("Onboarding twin seeding error (non-blocking):", e);
    }
  }

  app.post("/api/profiles", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    // Age gate: if a date of birth is supplied, it must be 18+, and we derive
    // `age` from it so a client can't send a mismatched value.
    if (typeof req.body?.dateOfBirth === "string" && req.body.dateOfBirth) {
      const derived = ageFromDob(req.body.dateOfBirth);
      if (derived == null) return res.status(400).json({ message: "Enter a valid date of birth." });
      if (derived < MIN_AGE) return res.status(422).json({ message: "You need to be 18 or older to use Destira." });
      req.body.age = derived;
    }
    try {
      const existing = await storage.getProfile(userId);
      const isCompletingOnboarding = req.body.onboardingCompleted && req.body.personalityProfile;
      const onboardingCount = isCompletingOnboarding
        ? Object.values(req.body.personalityProfile as Record<string, string>).filter(
            (v): v is string => typeof v === "string" && v.trim().length > 0
          ).length
        : undefined;
      const bodyWithCount = onboardingCount !== undefined
        ? { ...req.body, twinQuestionsAnswered: onboardingCount }
        : req.body;

      const { subscriptionTier: _stripped, ...safeBody } = bodyWithCount;
      const safeCounted = onboardingCount !== undefined
        ? { ...safeBody, twinQuestionsAnswered: onboardingCount }
        : safeBody;

      if (safeCounted.groupNickname) {
        const nick = safeCounted.groupNickname.trim();
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(nick)) {
          return res.status(400).json({ message: "Nickname must be 3-20 characters: letters, numbers, and underscores only" });
        }
        const takenByOther = await storage.isGroupNicknameTakenByOther(nick, userId);
        if (takenByOther) {
          return res.status(409).json({ message: "This nickname is already taken" });
        }
        safeCounted.groupNickname = nick;
      }

      if (existing) {
        const updated = await storage.updateProfile(userId, safeCounted);
        if (isCompletingOnboarding && !existing.onboardingCompleted) {
          seedOnboardingIntoTwinMemory(userId, req.body.personalityProfile).catch(() => {});
        }
        referralsService.checkQualification(userId).catch(() => {});
        return res.json(updated);
      }
      const profile = await storage.createProfile({ ...safeCounted, userId });
      if (isCompletingOnboarding) {
        seedOnboardingIntoTwinMemory(userId, req.body.personalityProfile).catch(() => {});
      }
      referralsService.checkQualification(userId).catch(() => {});
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
      const { subscriptionTier: _s, ...safeUpdate } = req.body;
      if (typeof safeUpdate.dateOfBirth === "string" && safeUpdate.dateOfBirth) {
        const derived = ageFromDob(safeUpdate.dateOfBirth);
        if (derived == null) return res.status(400).json({ message: "Enter a valid date of birth." });
        if (derived < MIN_AGE) return res.status(422).json({ message: "You need to be 18 or older." });
        safeUpdate.age = derived;
      }
      if (safeUpdate.groupNickname) {
        const nick = safeUpdate.groupNickname.trim();
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(nick)) {
          return res.status(400).json({ message: "Nickname must be 3-20 characters: letters, numbers, and underscores only" });
        }
        const takenByOther = await storage.isGroupNicknameTakenByOther(nick, userId);
        if (takenByOther) {
          return res.status(409).json({ message: "This nickname is already taken" });
        }
        safeUpdate.groupNickname = nick;
      }
      const updated = await storage.updateProfile(userId, safeUpdate);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Error updating profile" });
    }
  });

  // Check group-nickname availability. MUST stay above "/api/profiles/:userId"
  // or Express matches this as a userId of "check-nickname".
  app.get("/api/profiles/check-nickname", async (req, res) => {
    const nickname = (req.query.nickname as string || "").trim();
    if (!nickname) return res.status(400).json({ message: "nickname required" });
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(nickname)) {
      return res.json({
        available: false,
        reason: "3-20 chars, letters/numbers/underscores only",
        suggestions: [],
      });
    }
    try {
      const taken = await storage.isGroupNicknameTaken(nickname);
      if (!taken) return res.json({ available: true, suggestions: [] });
      const suggestions = await storage.suggestAvailableGroupNicknames(nickname, 3);
      res.json({ available: false, suggestions });
    } catch (e) {
      console.error("check-nickname error:", e);
      res.status(500).json({ message: "Failed to check nickname" });
    }
  });

  app.get("/api/profiles/:userId", async (req, res) => {
    const viewerId = getUserId(req);
    if (!viewerId) return res.sendStatus(401);
    const profile = await storage.getProfileWithUser(req.params.userId);
    if (!profile) return res.status(404).json({ message: "Profile not found" });
    res.json(profile);
  });

  // Public, non-empty text answers from another user's soul-mapping — used on
  // the /u/:userId profile view. Private answers are never returned.
  app.get("/api/profiles/:userId/answers", async (req, res) => {
    const viewerId = getUserId(req);
    if (!viewerId) return res.sendStatus(401);
    try {
      res.json(await storage.getPublicAnswers(req.params.userId));
    } catch (e) {
      console.error("Public answers error:", e);
      res.status(500).json({ message: "Failed to load answers" });
    }
  });

  // The groups another user is in, each flagged with whether the viewer is also
  // a member (for the JOIN / YOU'RE IN IT state). Private groups the viewer
  // isn't in are omitted.
  app.get("/api/profiles/:userId/groups", async (req, res) => {
    const viewerId = getUserId(req);
    if (!viewerId) return res.sendStatus(401);
    try {
      res.json(await storage.getGroupsForUser(req.params.userId, viewerId));
    } catch (e) {
      console.error("Profile groups error:", e);
      res.status(500).json({ message: "Failed to load groups" });
    }
  });

  // ── Twin Proximity Alerts ────────────────────────────────────────────
  // The foreground client calls this on a place-change or every ~10 min while
  // the tab is visible. We resolve the point to one of our curated verified
  // places (or nothing), store the LATEST ping only (no trail), and — if it
  // resolved — kick the alert job without blocking the response.
  app.post("/api/location/report", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const parsed = locationReportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid body" });
    try {
      const resolved = await proximity.resolvePlace(parsed.data.lat, parsed.data.lng);
      await db
        .update(profiles)
        .set({
          locationLat: String(parsed.data.lat),
          locationLng: String(parsed.data.lng),
          locationName: resolved?.name ?? null,
          currentPlaceId: resolved?.id ?? null,
          locationUpdatedAt: new Date(),
        })
        .where(eq(profiles.userId, userId));
      if (resolved) {
        proximity
          .runProximityForReporter(userId)
          .catch((e) => console.error("[proximity] run failed:", e));
      }
      res.json({
        resolved: !!resolved,
        place: resolved ? { id: resolved.id, name: resolved.name, type: resolved.placeType } : null,
      });
    } catch (e) {
      console.error("Location report error:", e);
      res.status(500).json({ message: "Failed to report location" });
    }
  });

  // The recipient's live alerts. Identity (name/photo/profile link) is attached
  // ONLY when the caller is Spark+ — the free branch of serializeAlert carries
  // zero identifying data. The distance bucket is byte-identical either way.
  app.get("/api/proximity/alerts", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const now = new Date();
      const rows = await db
        .select()
        .from(proximityAlerts)
        .where(
          and(
            eq(proximityAlerts.recipientId, userId),
            gt(proximityAlerts.expiresAt, now),
            isNull(proximityAlerts.dismissedAt),
          ),
        )
        .orderBy(desc(proximityAlerts.createdAt));

      const g = await gate.checkGate(userId, "proximity_identity");
      const canSeeIdentity = g.ok;

      const placeIds = Array.from(new Set(rows.map((r) => r.placeId)));
      const placeRows = placeIds.length
        ? await db
            .select({ id: places.id, name: places.name, placeType: places.placeType })
            .from(places)
            .where(inArray(places.id, placeIds))
        : [];
      const placeById = new Map(placeRows.map((p) => [p.id, p]));

      const subjectById = new Map<
        string,
        { userId: string; firstName: string; portraitUrl: string | null }
      >();
      if (canSeeIdentity) {
        const subjectIds = Array.from(
          new Set(rows.map((r) => r.subjectId).filter((x): x is string => !!x)),
        );
        if (subjectIds.length) {
          const [profRows, photoRows] = await Promise.all([
            db
              .select({ userId: profiles.userId, displayName: profiles.displayName })
              .from(profiles)
              .where(inArray(profiles.userId, subjectIds)),
            db
              .select({ userId: userPhotos.userId, photoUrl: userPhotos.photoUrl })
              .from(userPhotos)
              .where(and(inArray(userPhotos.userId, subjectIds), eq(userPhotos.role, "portrait"))),
          ]);
          const portraitByUser = new Map(photoRows.map((p) => [p.userId, p.photoUrl]));
          for (const p of profRows) {
            subjectById.set(p.userId, {
              userId: p.userId,
              firstName: (p.displayName ?? "Someone").split(/\s+/)[0] || "Someone",
              portraitUrl: portraitByUser.get(p.userId) ?? null,
            });
          }
        }
      }

      const alerts = rows.map((r) => {
        const place = placeById.get(r.placeId) ?? { name: "a place nearby", placeType: r.placeType };
        const subject = canSeeIdentity ? subjectById.get(r.subjectId ?? "") ?? null : null;
        return proximity.serializeAlert(r, place, canSeeIdentity, subject);
      });

      let upsell: { kind: string; line: string; href: string } | null = null;
      if (!canSeeIdentity && rows.length > 0) {
        const dismissed = await onboarding.isReminderDismissed(userId, "proximity_upsell");
        if (!dismissed) {
          upsell = {
            kind: "proximity_upsell",
            line: "Spark shows you who these alerts are about — and lets you ask their twin.",
            href: "/plans",
          };
        }
      }

      res.json({ alerts, canSeeIdentity, upsell });
    } catch (e) {
      console.error("Proximity alerts error:", e);
      res.status(500).json({ message: "Failed to load alerts" });
    }
  });

  app.post("/api/proximity/alerts/:id/seen", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      await db
        .update(proximityAlerts)
        .set({ seenAt: new Date() })
        .where(
          and(
            eq(proximityAlerts.id, req.params.id),
            eq(proximityAlerts.recipientId, userId),
            isNull(proximityAlerts.seenAt),
          ),
        );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed" });
    }
  });

  app.post("/api/proximity/alerts/:id/dismiss", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      await db
        .update(proximityAlerts)
        .set({ dismissedAt: new Date() })
        .where(and(eq(proximityAlerts.id, req.params.id), eq(proximityAlerts.recipientId, userId)));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed" });
    }
  });

  // Current proximity config for the Settings panel: mode/floor/quiet hours,
  // where we think you are right now, any pause, and your per-place hides.
  app.get("/api/proximity/settings", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const [p] = await db
        .select({
          proximityMode: profiles.proximityMode,
          proximityFloor: profiles.proximityFloor,
          proximityQuietStart: profiles.proximityQuietStart,
          proximityQuietEnd: profiles.proximityQuietEnd,
          proximityPausedUntil: profiles.proximityPausedUntil,
          currentPlaceId: profiles.currentPlaceId,
          isVerified: profiles.isVerified,
        })
        .from(profiles)
        .where(eq(profiles.userId, userId));
      if (!p) return res.status(404).json({ message: "No profile" });

      let currentPlace: { id: number; name: string; type: string } | null = null;
      if (p.currentPlaceId) {
        const [pl] = await db
          .select({ id: places.id, name: places.name, placeType: places.placeType })
          .from(places)
          .where(eq(places.id, p.currentPlaceId));
        if (pl) currentPlace = { id: pl.id, name: pl.name, type: pl.placeType };
      }

      const hides = await db
        .select({ placeId: placeInvisibility.placeId })
        .from(placeInvisibility)
        .where(eq(placeInvisibility.userId, userId));
      const hidePlaceIds = hides.map((h) => h.placeId);
      const hidePlaces = hidePlaceIds.length
        ? await db
            .select({ id: places.id, name: places.name })
            .from(places)
            .where(inArray(places.id, hidePlaceIds))
        : [];

      res.json({
        mode: p.proximityMode,
        floor: p.proximityFloor,
        quietStart: p.proximityQuietStart,
        quietEnd: p.proximityQuietEnd,
        pausedUntil: p.proximityPausedUntil,
        isVerified: !!p.isVerified,
        currentPlace,
        invisibleAt: hidePlaces,
      });
    } catch (e) {
      console.error("Proximity settings read error:", e);
      res.status(500).json({ message: "Failed" });
    }
  });

  app.patch("/api/proximity/settings", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const parsed = updateProximitySettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid body" });
    const patch: Record<string, unknown> = {};
    if (parsed.data.proximityMode !== undefined) patch.proximityMode = parsed.data.proximityMode;
    if (parsed.data.proximityFloor !== undefined) patch.proximityFloor = parsed.data.proximityFloor;
    if (parsed.data.proximityQuietStart !== undefined)
      patch.proximityQuietStart = parsed.data.proximityQuietStart;
    if (parsed.data.proximityQuietEnd !== undefined)
      patch.proximityQuietEnd = parsed.data.proximityQuietEnd;
    if (Object.keys(patch).length === 0) return res.json({ ok: true });
    try {
      await db.update(profiles).set(patch).where(eq(profiles.userId, userId));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed" });
    }
  });

  // "Be invisible at this place." No body → the place we currently resolve you
  // to. Effective on the next evaluation, not the next poll.
  app.post("/api/proximity/invisible", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const body = z.object({ placeId: z.number().int().optional() }).safeParse(req.body ?? {});
    if (!body.success) return res.status(400).json({ message: "Invalid body" });
    try {
      let placeId = body.data.placeId;
      if (!placeId) {
        const [p] = await db
          .select({ currentPlaceId: profiles.currentPlaceId })
          .from(profiles)
          .where(eq(profiles.userId, userId));
        placeId = p?.currentPlaceId ?? undefined;
      }
      if (!placeId) return res.status(400).json({ message: "No place to hide at" });
      await db
        .insert(placeInvisibility)
        .values({ userId, placeId })
        .onConflictDoNothing();
      res.json({ ok: true, placeId });
    } catch (e) {
      res.status(500).json({ message: "Failed" });
    }
  });

  app.delete("/api/proximity/invisible/:placeId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const placeId = Number(req.params.placeId);
    if (!Number.isInteger(placeId)) return res.status(400).json({ message: "Bad placeId" });
    try {
      await db
        .delete(placeInvisibility)
        .where(and(eq(placeInvisibility.userId, userId), eq(placeInvisibility.placeId, placeId)));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed" });
    }
  });

  // Global pause — indistinguishable to anyone else from a dried-up feed.
  app.post("/api/proximity/pause", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const body = z.object({ hours: z.number().int().min(1).max(168).optional() }).safeParse(req.body ?? {});
    if (!body.success) return res.status(400).json({ message: "Invalid body" });
    try {
      const until = new Date(Date.now() + (body.data.hours ?? 8) * 60 * 60 * 1000);
      await db.update(profiles).set({ proximityPausedUntil: until }).where(eq(profiles.userId, userId));
      res.json({ ok: true, pausedUntil: until });
    } catch (e) {
      res.status(500).json({ message: "Failed" });
    }
  });

  app.delete("/api/proximity/pause", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      await db.update(profiles).set({ proximityPausedUntil: null }).where(eq(profiles.userId, userId));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed" });
    }
  });

  // ── Web push ─────────────────────────────────────────────────────────
  app.get("/api/push/vapid-public-key", (_req, res) => {
    res.json({ key: push.vapidPublicKey(), configured: push.pushConfigured() });
  });

  app.post("/api/push/subscribe", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const parsed = z
      .object({
        endpoint: z.string().url(),
        keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid subscription" });
    try {
      await db
        .insert(pushSubscriptions)
        .values({
          userId,
          endpoint: parsed.data.endpoint,
          p256dh: parsed.data.keys.p256dh,
          auth: parsed.data.keys.auth,
          userAgent: (req.headers["user-agent"] as string | undefined)?.slice(0, 255) ?? null,
        })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: { userId, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, lastSeenAt: new Date() },
        });
      res.json({ ok: true });
    } catch (e) {
      console.error("Push subscribe error:", e);
      res.status(500).json({ message: "Failed" });
    }
  });

  app.post("/api/push/unsubscribe", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const parsed = z.object({ endpoint: z.string().url() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid body" });
    try {
      await db
        .delete(pushSubscriptions)
        .where(
          and(eq(pushSubscriptions.endpoint, parsed.data.endpoint), eq(pushSubscriptions.userId, userId)),
        );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed" });
    }
  });

  // The bucket (server/storage/objectStorage.ts) is private, so every fetch —
  // whether it ends up served from Supabase Storage or the local dev
  // fallback — goes through here rather than a public static mount. This
  // only gates "is someone logged in at all"; per-resource visibility (e.g.
  // a private profile's photos) is enforced where URLs are handed out, e.g.
  // GET /api/photos/:userId below.
  app.get("/uploads/*key", async (req: any, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const parts = req.params.key;
    const key = Array.isArray(parts) ? parts.join("/") : String(parts ?? "");
    if (!key || key.includes("..")) return res.sendStatus(400);

    if (isObjectStorageEnabled) {
      const url = await getSignedUrl(key);
      if (!url) return res.sendStatus(404);
      return res.redirect(url);
    }
    res.sendFile(path.join(UPLOAD_DIR, key), (err: unknown) => {
      if (err) res.sendStatus(404);
    });
  });

  app.post("/api/uploads/image", upload.single("image"), async (req: any, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    if (!req.file) return res.status(400).json({ message: "No image file provided" });

    const filename: string = generateFilename(req.file.originalname);
    const url = `/uploads/${filename}`;
    const base = filename.replace(/\.[^.]+$/, "");
    let variants: { w800?: string; w1600?: string } | undefined;

    // Strip EXIF (incl. GPS) before storing the original — done entirely in
    // memory from the upload buffer, then handed to putObject() (Supabase
    // Storage, or the local dev fallback). sharp drops all metadata unless
    // withMetadata() is called. Best-effort: on any failure the untouched
    // original still gets stored and serves.
    try {
      const cleaned = await sharp(req.file.buffer).rotate().toBuffer();
      await putObject(filename, cleaned, req.file.mimetype);
    } catch (e) {
      console.error("[uploads] EXIF strip failed, storing original:", e);
      await putObject(filename, req.file.buffer, req.file.mimetype);
    }

    // Webp derivatives Discover / profile galleries actually render. Kept
    // separate from the block above so a failure here never overwrites the
    // already-stored original with something worse.
    try {
      const mk = async (w: number, q: number) => {
        const name = `${base}.w${w}.webp`;
        const resized = await sharp(req.file.buffer).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: q }).toBuffer();
        await putObject(name, resized, "image/webp");
        return `/uploads/${name}`;
      };
      variants = { w800: await mk(800, 78), w1600: await mk(1600, 80) };
    } catch (e) {
      console.error("[uploads] variant generation failed:", e);
    }

    res.json({ url, filename, variants });
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
    const { photoUrl, orderIndex, isMainProfilePhoto, width, height, variants } = req.body ?? {};
    if (typeof photoUrl !== "string" || !photoUrl) {
      return res.status(400).json({ message: "photoUrl is required" });
    }
    const safeVariants =
      variants && typeof variants === "object"
        ? {
            ...(typeof variants.w800 === "string" ? { w800: variants.w800 } : {}),
            ...(typeof variants.w1600 === "string" ? { w1600: variants.w1600 } : {}),
          }
        : undefined;
    try {
      const photo = await storage.addUserPhoto(userId, photoUrl, orderIndex || 0, {
        isMain: !!isMainProfilePhoto,
        width: Number.isFinite(width) ? Math.round(width) : undefined,
        height: Number.isFinite(height) ? Math.round(height) : undefined,
        variants: safeVariants && Object.keys(safeVariants).length ? safeVariants : undefined,
      });
      res.status(201).json(photo);
    } catch (e) {
      res.status(500).json({ message: "Failed to add photo" });
    }
  });

  app.patch("/api/photos/:id/role", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const photoId = parseInt(req.params.id, 10);
    if (Number.isNaN(photoId)) return res.status(400).json({ message: "Invalid photo id" });
    const parsed = updatePhotoRoleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid role", errors: parsed.error.flatten() });
    try {
      const result = await storage.setPhotoRole(userId, photoId, parsed.data.role);
      const photos = await storage.getUserPhotos(userId);
      res.json({ ...result, photos });
    } catch (e) {
      if (e instanceof PhotoNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof PhotoTooSmallError) return res.status(422).json({ message: e.message });
      console.error("Set photo role error:", e);
      res.status(500).json({ message: "Failed to update photo role" });
    }
  });

  app.patch("/api/photos/:id/focal", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const photoId = parseInt(req.params.id, 10);
    if (Number.isNaN(photoId)) return res.status(400).json({ message: "Invalid photo id" });
    const parsed = updatePhotoFocalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid focal point", errors: parsed.error.flatten() });
    try {
      const photo = await storage.setPhotoFocal(userId, photoId, parsed.data.target, parsed.data.x, parsed.data.y);
      res.json(photo);
    } catch (e) {
      if (e instanceof PhotoNotFoundError) return res.status(404).json({ message: e.message });
      console.error("Set photo focal error:", e);
      res.status(500).json({ message: "Failed to update focal point" });
    }
  });

  app.delete("/api/photos/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const photo = await storage.deleteUserPhoto(userId, parseInt(req.params.id));
      res.json({ success: true });
      // Bucket cleanup happens after the response — a failure here shouldn't
      // turn a successful delete into a 500, it just leaves an orphaned
      // object for a future sweep.
      if (photo) {
        const keys = [photo.photoUrl, photo.variants?.w800, photo.variants?.w1600]
          .map(keyFromUploadUrl)
          .filter((k): k is string => k !== null);
        await Promise.allSettled(keys.map((k) => deleteObject(k)));
      }
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
      const blockedByTarget = await storage.isBlocked(targetId, userId);
      if (blockedByTarget) return res.status(403).json({ message: "Cannot connect with this user" });
      const userBlockedTarget = await storage.isBlocked(userId, targetId);
      if (userBlockedTarget) return res.status(403).json({ message: "You have blocked this user" });

      const currentLikes = await storage.getDailyLikeCount(userId);
      const g = await gate.checkGate(userId, "daily_likes", { countOverride: currentLikes });
      if (!g.ok) return res.status(403).json(gate.gateBody(g, "daily_likes"));

      const existing = await storage.getActiveMatchBetweenUsers(userId, targetId);
      if (existing) {
        return res.status(409).json({ message: "Match request already exists", match: existing });
      }
      await storage.incrementDailyLikes(userId);
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
    if (await gate.denyIfGated(res, userId, "start_interview")) return;
    try {
      const interview = await storage.createInterview(userId, targetId);
      res.status(201).json(interview);
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

  async function buildTwinSystemPrompt(userId: string, profile: any | null | undefined): Promise<string> {
    profile = profile || {};
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

TONE: You are ${toneStyle}, with ${verbosity} verbosity, ${emojiUsage} emoji usage, and ${formality} formality.

Your role: Help the user reflect on dating, relationships, and self-understanding. You learn from conversations and their profile data.${discoveryModeSection}${questionWeavingSection}

${profile.twinPersona || "You are friendly, open, and genuine — still getting to know this person."}${structuredSection}${onboardingSection}${memorySection}

${PRIVACY_GUARDRAIL}`;
  }

  async function buildInterviewSystemPrompt(targetProfile: any): Promise<string> {
    const targetStructured = await storage.getTwinProfileStructured(targetProfile.userId);
    const targetFacts = await storage.getTwinMemoryFacts(targetProfile.userId, 20);

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

    const boundaries = disclosure.forbiddenTopicsSection(settings, directive, firstName);

    return `You are the AI Twin of ${targetProfile.displayName} on Destira. Someone is interviewing you to learn about ${targetProfile.displayName}'s personality before deciding to connect.

CONVERSATION RULES (CRITICAL):
- Chat like a real person: 1-3 sentences per response. No monologues.
- Represent ${targetProfile.displayName}'s personality warmly and authentically.
- Only share what's in the profile data below - don't invent details.

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

  async function extractMemoryAfterChat(userId: string, recentMessages: { role: string; content: string }[]): Promise<void> {
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
 "structured_updates": {"top_values": [], "interests": [], "relationship_goals": "", "humor_style": "", "communication_style": "", "lifestyle_patterns": [], "desired_partner_traits": [], "boundaries": ""}}
Only include structured_updates fields if the conversation clearly reveals them. Facts should be specific, memorable insights. Return empty arrays/strings for fields not mentioned. For questions_answered_count: count how many of the user's messages meaningfully answer a personality/relationship question (not small talk).`,
          },
          { role: "user", content: JSON.stringify(lastFew) },
        ],
        { json: true, maxTokens: 8192 },
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

  app.post("/api/interviews/:id/chat", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    if (!checkAIRateLimit(userId)) return res.status(429).json({ message: "Too many requests. Please wait a moment." });
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

        const chatHistory = history.map((h: any) => ({
          role: h.role === "assistant" ? "assistant" as const : "user" as const,
          content: h.content,
        }));

        const stream = await ai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "system", content: systemPrompt }, ...chatHistory],
          max_tokens: 8192,
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

        fullResponse = await finalizeInterviewReply(fullResponse, targetProfile, message);
        history.push({ role: "assistant", content: fullResponse });
        await storage.updateInterviewTranscript(interviewId, JSON.stringify(history));
        logLlmCall({ callType: "interview_chat", userId, fallbackInputText: message, fallbackOutputText: fullResponse }).catch(() => {});

        res.write(`data: ${JSON.stringify({ type: "done", content: fullResponse })}\n\n`);
        res.end();
      } else {
        const chatHistory = history.map((h: any) => ({
          role: h.role === "assistant" ? "assistant" as const : "user" as const,
          content: h.content,
        }));

        const completion = await completeText(
          [{ role: "system", content: systemPrompt }, ...chatHistory],
          { maxTokens: 8192 },
        );

        let aiResponse = completion.text || "I'd love to tell you more about that in person!";
        aiResponse = await finalizeInterviewReply(aiResponse, targetProfile, message);
        history.push({ role: "assistant", content: aiResponse });
        await storage.updateInterviewTranscript(interviewId, JSON.stringify(history));
        logLlmCall({
          callType: "interview_chat",
          userId,
          usageMetadata: completion.usage,
          fallbackInputText: message,
          fallbackOutputText: aiResponse,
        }).catch(() => {});
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
    if (!checkAIRateLimit(userId)) return res.status(429).json({ message: "Too many requests. Please wait a moment." });
    const { message, stream: useStream } = req.body;
    try {
      // No gate on profile/twinPersona/onboarding completeness — buildTwinSystemPrompt
      // fills in sensible defaults and steers the twin to get to know the user
      // conversationally when this data is thin or missing.
      const profile = await storage.getProfile(userId);
      const memory = await storage.getTwinMemory(userId, 20);
      const memoryMessages = memory.reverse().map(m => ({
        role: m.role as "user" | "assistant",
        content: m.message,
      }));
      await storage.addTwinMemory(userId, message, "user");

      const systemPrompt = await buildTwinSystemPrompt(userId, profile);

      await storage.createAuditLog(userId, "twin_chat", { messageLength: message.length });

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

        const stream = await ai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "system", content: systemPrompt }, ...chatMsgs],
          max_tokens: 8192,
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

        extractMemoryAfterChat(userId, [{ role: "user", content: message }, { role: "assistant", content: fullResponse }]).catch(() => {});
        logLlmCall({ callType: "twin_chat", userId, fallbackInputText: message, fallbackOutputText: fullResponse }).catch(() => {});

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
          { maxTokens: 8192 },
        );

        let aiResponse = completion.text || "I hear you. Tell me more about what's on your mind.";
        aiResponse = detectPII(aiResponse);
        await storage.addTwinMemory(userId, aiResponse, "assistant");

        extractMemoryAfterChat(userId, [{ role: "user", content: message }, { role: "assistant", content: aiResponse }]).catch(() => {});
        logLlmCall({
          callType: "twin_chat",
          userId,
          usageMetadata: completion.usage,
          fallbackInputText: message,
          fallbackOutputText: aiResponse,
        }).catch(() => {});

        res.json({ response: aiResponse });
      }
    } catch (e) {
      console.error("Twin Chat Error:", e);
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
        { maxTokens: 8192 },
      );

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
        { maxTokens: 8192 },
      );

      let aiSummaryText = completion.text || "";
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
          completeText(
            [
              {
                role: "system",
                content: `You are an expert personality profiler for a dating app called Destira. From the user's answers, write a warm first-person AI Twin persona ("I'm [name]'s AI Twin."). Cover values, interests, communication style, what they look for in a partner, and personality. 2-3 paragraphs.`,
              },
              { role: "user", content: JSON.stringify(answers) },
            ],
            { maxTokens: 8192 },
          )
            .then((r) => storage.updateProfile(userId, { twinPersona: r.text || "" }))
            .then(() => {
              const map = Object.fromEntries(answers.map((x, i) => [i, x.a]));
              return seedOnboardingIntoTwinMemory(userId, map as Record<string, string>);
            })
            .catch((err) => console.error("Twin gen on complete failed:", err));
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
      const copy = gateCopy(feature, {
        tier: g.tier,
        limit: g.limit,
        used: g.used,
        resetLabel: gate.resetLabelFromISO(g.resetAt),
      });
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
        { json: true, maxTokens: 8192 },
      );

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
    if (await gate.denyIfGated(res, userId, "create_group")) return;
    const { name, description, type, iconUrl, categoryTags, privacyMode, mediaEnabled, stickersEnabled, postingPermission, inviteDirectJoinEnabled } = req.body;
    try {
      const group = await storage.createGroupFull({
        name, description: description || "", type: type || "custom",
        ownerId: userId, iconUrl, categoryTags, privacyMode,
        mediaEnabled, stickersEnabled, postingPermission, inviteDirectJoinEnabled,
      });
      const creatorProfile = await storage.getProfile(userId);
      const adjectives = ["Curious", "Dreamy", "Bold", "Gentle", "Witty", "Bright", "Calm", "Warm"];
      const nouns = ["Phoenix", "River", "Cloud", "Star", "Wave", "Spark", "Moon", "Breeze"];
      const fallbackNick = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
      const nickname = creatorProfile?.groupNickname || creatorProfile?.displayName || fallbackNick;
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

      const gj = await gate.checkGate(userId, "join_group");
      if (!gj.ok) {
        return res.status(403).json(gate.gateBody(gj, "join_group"));
      }

      if (group.privacyMode === "request-to-join") {
        const request = await storage.createJoinRequest(groupId, userId);
        return res.json({ status: "requested", request });
      }

      if (group.privacyMode === "invite-only") {
        return res.status(403).json({ message: "This group is invite-only" });
      }

      const adjectives = ["Curious", "Dreamy", "Bold", "Gentle", "Witty", "Bright", "Calm", "Warm"];
      const nouns = ["Phoenix", "River", "Cloud", "Star", "Wave", "Spark", "Moon", "Breeze"];
      const fallbackNickname = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
      const joinerProfile = await storage.getProfile(userId);
      const nickname = joinerProfile?.groupNickname || fallbackNickname;
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
      if (status === "approved") {
        const pending = await storage.getJoinRequests(groupId);
        const target = pending.find((r) => r.id === requestId);
        if (target) {
          const gj = await gate.checkGate(target.userId, "join_group");
          if (!gj.ok) {
            return res.status(403).json({
              groupCapped: true,
              message: `They're in ${gj.used} rooms already, the most their plan allows. They'll need to leave one before joining this one.`,
            });
          }
        }
      }
      const processed = await storage.processJoinRequest(requestId, userId, status);
      if (status === "approved") {
        const joinerProfile = await storage.getProfile(processed.userId);
        const adjectives = ["Curious", "Dreamy", "Bold", "Gentle", "Witty", "Bright", "Calm", "Warm"];
        const nouns = ["Phoenix", "River", "Cloud", "Star", "Wave", "Spark", "Moon", "Breeze"];
        const fallbackNickname = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
        const approvedNickname = joinerProfile?.groupNickname || fallbackNickname;
        await storage.joinGroup(groupId, processed.userId, approvedNickname);
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
      const group = await storage.getGroup(groupId);
      if (!group) return res.status(404).json({ message: "Group not found" });
      const member = await storage.getGroupMember(groupId, userId);
      const isOwner = group.ownerId === userId;
      const isAdmin = member?.role === "owner" || member?.role === "admin";
      const memberCanInvite = !!member && (group.canMembersAddOthers || group.privacyMode === "open");
      if (!isOwner && !isAdmin && !memberCanInvite) {
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
      if (isMember) return res.status(409).json({ message: "Already a member", groupId: link.groupId });

      const inviteGroup = await storage.getGroup(link.groupId);
      if (!inviteGroup) return res.status(404).json({ message: "Invalid or expired invite link" });

      if (typeof inviteGroup.maxMembers === "number") {
        const currentCount = (await storage.getGroupMembers(link.groupId)).length;
        if (currentCount >= inviteGroup.maxMembers) {
          return res.status(409).json({ message: "group_full", groupName: inviteGroup.name });
        }
      }

      const gj = await gate.checkGate(userId, "join_group");
      if (!gj.ok) {
        return res.status(403).json(gate.gateBody(gj, "join_group"));
      }

      if (inviteGroup.privacyMode === "request-to-join") {
        const joinRequest = await storage.createJoinRequest(link.groupId, userId);
        return res.json({ status: "requested", groupId: link.groupId, groupName: inviteGroup.name, request: joinRequest });
      }

      const inviteJoinerProfile = await storage.getProfile(userId);
      const adjectives = ["Curious", "Dreamy", "Bold", "Gentle", "Witty", "Bright", "Calm", "Warm"];
      const nouns = ["Phoenix", "River", "Cloud", "Star", "Wave", "Spark", "Moon", "Breeze"];
      const fallbackNickname = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
      const inviteNickname = inviteJoinerProfile?.groupNickname || fallbackNickname;
      const member = await storage.joinGroup(link.groupId, userId, inviteNickname);
      res.json({ ...member, groupId: link.groupId, groupName: inviteGroup.name });
    } catch (e) {
      res.status(500).json({ message: "Failed to join via invite" });
    }
  });

  // The /join/:token OG/share-preview HTML itself is handled in
  // server/vite.ts (dev) and server/static.ts (prod) — NOT here. Both of
  // those already read/produce the page's index.html on every request
  // (Vite's own transformIndexHtml in dev, the built file in prod); this
  // used to duplicate that by reading client/index.html directly, which
  // skips Vite's transform and — in dev — drops the @vitejs/plugin-react
  // preamble it injects, which breaks React mounting entirely (blank page).
  // Enriching the HTML those two already produce, instead of generating a
  // competing copy, is both correct and avoids a second rendering stack.

  // Public (auth optional) — the join page's own data fetch. Same
  // token-resolution as the OG route above it in group-invite.ts, so what a
  // crawler is told and what this page shows can never drift apart.
  app.get("/api/groups/join-by-invite/:token/preview", async (req, res) => {
    const userId = getUserId(req);
    try {
      // The client sends the full "<groupId>-<token>" composite (same shape
      // as the URL param everywhere else — see the POST join handler and
      // the /join/:token OG route above), so it needs the same stripping.
      const rawParam = req.params.token || "";
      const dashIdx = rawParam.indexOf("-");
      const token = dashIdx > 0 ? rawParam.slice(dashIdx + 1) : rawParam;
      const resolution = await groupInvite.resolveInvite(token);
      if (!resolution.valid || !resolution.group) {
        return res.json({ valid: false, reason: resolution.reason ?? "invalid" });
      }
      const { group, memberCount, isFull, approvalRequired } = resolution;
      const isMember = userId ? await storage.isGroupMember(group.id, userId) : false;
      res.json({
        valid: true,
        groupId: group.id,
        name: group.name,
        description: group.description,
        photoUrl: groupInvite.groupHeroPhotoUrl(group),
        memberCount,
        categoryTags: group.categoryTags ?? [],
        approvalRequired,
        isFull,
        isMember,
        createdAt: group.createdAt,
      });
    } catch (e) {
      console.error("Invite preview error:", e);
      res.status(500).json({ valid: false, reason: "invalid" });
    }
  });

  // Public share-card image for a group's invite (og:image target). Cached
  // to disk by group id + content hash — see group-invite.ts. The hash in
  // the URL both cache-busts on change and makes the URL itself immutable,
  // which is friendlier to crawlers that cache aggressively per-URL.
  app.get("/api/groups/:id/share-card/:hash.jpg", async (req, res) => {
    try {
      const groupId = parseInt(req.params.id);
      const group = await storage.getGroup(groupId);
      if (!group) return res.status(404).end();
      const members = await storage.getGroupMembers(groupId);
      const jpg = await groupInvite.getOrRenderShareCard(group, members.length);
      if (!jpg) return res.redirect(302, "/brand/og-default.png");
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      res.send(jpg);
    } catch (e) {
      console.error("Share card error:", e);
      res.redirect(302, "/brand/og-default.png");
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
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      // Members only, and only what was sent after they joined.
      const msgs = await storage.getVisibleGroupMessages(groupId, userId);
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

      let displayNickname = member.nickname;
      if (!displayNickname) {
        const profile = await storage.getProfile(userId);
        displayNickname = profile?.groupNickname || profile?.displayName || "Anonymous";
      }
      const msg = await storage.sendGroupMessage(groupId, userId, displayNickname, content, {
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
      const filename = generateFilename(req.file.originalname);
      await putObject(filename, req.file.buffer, req.file.mimetype);
      const url = `/uploads/${filename}`;
      await storage.updateGroup(groupId, { groupPhotoUrl: url });
      res.json({ url });
    } catch (e) {
      res.status(500).json({ message: "Failed to upload group photo" });
    }
  });

  // Group icon upload
  app.post("/api/groups/:id/upload-icon", upload.single("image"), async (req: any, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Not authorized" });
      }
      if (!req.file) return res.status(400).json({ message: "No image provided" });
      const filename = generateFilename(req.file.originalname);
      await putObject(filename, req.file.buffer, req.file.mimetype);
      const url = `/uploads/${filename}`;
      await storage.updateGroup(groupId, { iconUrl: url });
      res.json({ url });
    } catch (e) {
      res.status(500).json({ message: "Failed to upload group icon" });
    }
  });

  // Group banner upload
  app.post("/api/groups/:id/upload-banner", upload.single("image"), async (req: any, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Not authorized" });
      }
      if (!req.file) return res.status(400).json({ message: "No image provided" });
      const filename = generateFilename(req.file.originalname);
      await putObject(filename, req.file.buffer, req.file.mimetype);
      const url = `/uploads/${filename}`;
      await storage.updateGroup(groupId, { bannerUrl: url });
      res.json({ url });
    } catch (e) {
      res.status(500).json({ message: "Failed to upload group banner" });
    }
  });

  // Toggle mute for current user in group
  app.post("/api/groups/:id/mute", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member) return res.status(403).json({ message: "Not a member" });
      const newMuted = !member.isMuted;
      await storage.updateGroupMemberMute(groupId, userId, newMuted);
      res.json({ isMuted: newMuted });
    } catch (e) {
      res.status(500).json({ message: "Failed to toggle mute" });
    }
  });

  // Add member to group (user search + add)
  app.post("/api/groups/:id/members/add", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    const { targetUserId } = req.body;
    if (!targetUserId) return res.status(400).json({ message: "targetUserId required" });
    try {
      const requester = await storage.getGroupMember(groupId, userId);
      if (!requester) return res.status(403).json({ message: "Not a member" });
      const group = await storage.getGroup(groupId);
      if (!group) return res.status(404).json({ message: "Group not found" });
      if (!group.canMembersAddOthers && requester.role === "member") {
        return res.status(403).json({ message: "Only admins can add members" });
      }
      const alreadyMember = await storage.isGroupMember(groupId, targetUserId);
      if (alreadyMember) return res.status(409).json({ message: "Already a member" });
      const gj = await gate.checkGate(targetUserId, "join_group");
      if (!gj.ok) {
        return res.status(403).json({
          groupCapped: true,
          message: `They're in ${gj.used} rooms already, the most their plan allows. They'll need to leave one before joining this one.`,
        });
      }
      const targetProfile = await storage.getProfile(targetUserId);
      const nickname = targetProfile?.groupNickname || targetProfile?.displayName || "Anonymous";
      const member = await storage.joinGroup(groupId, targetUserId, nickname);
      await storage.createNotification(targetUserId, "group_added", "Added to Group", `You've been added to "${group.name}"`);
      res.status(201).json(member);
    } catch (e) {
      res.status(500).json({ message: "Failed to add member" });
    }
  });

  // Search group messages
  app.get("/api/groups/:id/messages/search", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const groupId = parseInt(req.params.id);
    const query = (req.query.q as string || "").toLowerCase().trim();
    if (!query) return res.json([]);
    try {
      const member = await storage.getGroupMember(groupId, userId);
      if (!member) return res.status(403).json({ message: "Not a member" });
      const msgs = await storage.getGroupMessages(groupId, 500, member.joinedAt ?? undefined);
      const results = msgs.filter(m =>
        !m.deletedForEveryone && !m.isDeletedByAdmin &&
        m.content.toLowerCase().includes(query)
      ).slice(-50);
      res.json(results);
    } catch (e) {
      res.status(500).json({ message: "Failed to search messages" });
    }
  });

  // User search for adding to groups
  app.get("/api/users/search", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const query = (req.query.q as string || "").trim();
    if (query.length < 2) return res.json([]);
    try {
      const results = await storage.searchUsers(query, userId);
      res.json(results);
    } catch (e) {
      res.status(500).json({ message: "Failed to search users" });
    }
  });

  // PATCH /api/groups/:id for admin settings (alias PUT)
  app.patch("/api/groups/:id", async (req, res) => {
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
        return res.json({ status: "matched", match });
      }

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
        let match = existing;
        if (!match) {
          match = await storage.createMatch(chatReq.requesterId, chatReq.targetId);
        }
        await storage.updateMatchStatus(match.id, "matched");
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
      const reactions = msgIds.length > 0 ? await storage.getReactionsForMessages(msgIds) : [];
      const reactionsByMsg: Record<number, any[]> = {};
      for (const r of reactions) {
        if (!reactionsByMsg[r.messageId]) reactionsByMsg[r.messageId] = [];
        reactionsByMsg[r.messageId].push(r);
      }
      const starred = await storage.getStarredMessages(groupId, userId);
      const starredMsgIds = new Set(starred.map((s: any) => s.messageId));
      const uniqueUserIds = [...new Set(msgs.map(m => m.userId))];
      const profilesMap: Record<string, any> = {};
      for (const uid of uniqueUserIds) {
        const profile = await storage.getProfile(uid);
        if (profile) profilesMap[uid] = profile;
      }
      const enriched = msgs.map(m => ({
        ...m,
        reactions: reactionsByMsg[m.id] || [],
        isStarred: starredMsgIds.has(m.id),
        subscriptionTier: profilesMap[m.userId]?.subscriptionTier || "free",
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
      const tier = await gate.getEffectiveTier(userId);
      res.json(sub ? { ...sub, tier } : { tier, status: "active" });
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch subscription" });
    }
  });

  // ── Payments (EcoCash via Paynow first; card via Paynow/Stripe) ──
  // The client sends a plan tier, NEVER an amount. The server resolves the
  // price, initiates, and only a poll/webhook confirmation activates the plan.

  app.post("/api/payments/initiate", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const parsed = initiatePaymentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payment request" });
    const { tier, period, method, phone, sourceFeature } = parsed.data;
    if ((method === "ecocash" || method === "onemoney" || method === "innbucks") && !/^0?7\d{8}$/.test((phone || "").replace(/\D/g, ""))) {
      return res.status(400).json({ message: "Enter the wallet number as 07XX XXX XXX." });
    }
    try {
      const email = (req as any).user?.claims?.email || (await storage.getProfile(userId))?.displayName;
      const result = await payments.initiatePayment(userId, tier, period, method, phone, typeof email === "string" ? email : undefined, sourceFeature);
      res.json(result);
    } catch (e: any) {
      console.error("Payment initiate error:", e);
      const notConfigured = e?.message?.includes("not configured");
      if (!notConfigured) {
        emailTemplates.alertGatewayUnreachable({ provider: method, error: String(e?.message || e) }).catch(() => {});
      }
      res.status(502).json({ message: notConfigured ? "Payments aren't switched on yet." : "Couldn't reach the payment gateway. Try again." });
    }
  });

  app.get("/api/payments/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
    try {
      const row = await payments.refreshPayment(id);
      if (!row || row.userId !== userId) return res.status(404).json({ message: "Not found" });
      res.json({
        id: row.id,
        status: row.status,
        tier: row.tier,
        period: row.period,
        amount: row.amount,
        provider: row.provider,
        phoneNumberMasked: row.phoneNumberMasked,
        failureReason: row.failureReason,
        rawStatus: row.rawStatus,
      });
    } catch (e) {
      console.error("Payment status error:", e);
      res.status(500).json({ message: "Couldn't check that payment" });
    }
  });

  // Paynow posts application/x-www-form-urlencoded to our resulturl. This — not
  // the client — is what activates a plan.
  app.post("/api/payments/webhook/paynow", async (req, res) => {
    try {
      const parsed = payments.webhookProvider().handleWebhook((req.body || {}) as Record<string, string>);
      if (!parsed) {
        emailTemplates.alertWebhookSignatureFailure({ provider: "paynow" }).catch(() => {});
        return res.status(400).send("bad signature");
      }
      if (parsed.status === "paid") {
        await payments.activateFromPayment(Number(parsed.reference));
      }
      res.status(200).send("ok");
    } catch (e) {
      console.error("Paynow webhook error:", e);
      res.status(200).send("ok"); // never make the gateway retry-storm us
    }
  });

  app.delete("/api/subscription", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const { endsAt } = await payments.cancelSubscription(userId);
      res.json({ cancelled: true, endsAt });
    } catch (e) {
      res.status(500).json({ message: "Couldn't cancel" });
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

  // People whose twin talked to yours and who asked to meet. Never gated —
  // the landing page promises we don't sell back people who already liked you,
  // so full profiles always, no blur, no tier check.
  app.get("/api/likes/incoming", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const canSee = (await gate.checkGate(userId, "see_who_asked")).ok;
      const userMatches = await storage.getMatchesWithProfiles(userId);
      const pendingRaw = userMatches.filter((m: any) => m.status === "pending" && !m.isRequester);

      // Old data (or a race before the create-match dedupe) can leave more
      // than one pending row for the same pair — collapse to one per person,
      // keeping their most recent ask, so nobody shows up twice.
      const byRequester = new Map<string, any>();
      for (const m of pendingRaw.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())) {
        if (!byRequester.has(m.user1Id)) byRequester.set(m.user1Id, m);
      }
      const pending = [...byRequester.values()];

      // Below Spark you get the COUNT, not the people — no names, no photos, no
      // userId (so the row can't be opened). Never a fake blur.
      const likes = pending.map((m: any) => {
        if (!canSee) return { matchId: m.id, createdAt: m.createdAt, masked: true, profile: null, fromUserId: null };
        return {
          matchId: m.id,
          fromUserId: m.isRequester ? m.user2Id : m.user1Id,
          profile: m.otherProfile ? { ...m.otherProfile, blurred: false } : null,
          createdAt: m.createdAt,
        };
      });

      res.json({ likes, totalCount: pending.length, seeWhoAsked: canSee });
    } catch (e) {
      console.error("Likes incoming error:", e);
      res.status(500).json({ message: "Failed to fetch incoming likes" });
    }
  });

  // Your outgoing asks — mirror of the incoming filter, requester side.
  app.get("/api/likes/outgoing", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const userMatches = await storage.getMatchesWithProfiles(userId);
      const asks = userMatches
        .filter((m: any) => m.isRequester && m.status !== "unmatched")
        .map((m: any) => ({
          matchId: m.id,
          toUserId: m.isRequester ? m.user2Id : m.user1Id,
          profile: m.otherProfile ? { ...m.otherProfile, blurred: false } : null,
          status: m.status,
          createdAt: m.createdAt,
        }));

      res.json({ asks, totalCount: asks.length });
    } catch (e) {
      console.error("Likes outgoing error:", e);
      res.status(500).json({ message: "Failed to fetch outgoing likes" });
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
        const myMember = members.find(m => m.userId === userId);
        const isMember = Boolean(myMember);
        const myRole = myMember?.role;
        const isMuted = myMember?.isMuted ?? false;
        // Only members get a message preview, and only from after they joined.
        const msgs = myMember
          ? await storage.getGroupMessages(g.id, 1, myMember.joinedAt ?? undefined)
          : [];
        const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
        return {
          ...g,
          memberCount: members.length,
          isMember,
          myRole,
          isMuted,
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
      const {
        rulesText, canMembersEditInfo, canMembersSendMessages, canMembersAddOthers,
        postingPermission, mediaPermission, privacyMode, maxMembers
      } = req.body;
      const updates: any = {};
      if (rulesText !== undefined) updates.rulesText = rulesText;
      if (canMembersEditInfo !== undefined) updates.canMembersEditInfo = Boolean(canMembersEditInfo);
      if (canMembersSendMessages !== undefined) updates.canMembersSendMessages = Boolean(canMembersSendMessages);
      if (canMembersAddOthers !== undefined) updates.canMembersAddOthers = Boolean(canMembersAddOthers);
      if (postingPermission !== undefined && ["everyone", "admins_only"].includes(postingPermission)) updates.postingPermission = postingPermission;
      if (mediaPermission !== undefined && ["everyone", "admin_only"].includes(mediaPermission)) updates.mediaPermission = mediaPermission;
      if (privacyMode !== undefined && ["open", "request-to-join", "invite-only"].includes(privacyMode)) updates.privacyMode = privacyMode;
      if (maxMembers !== undefined) updates.maxMembers = Math.max(2, Math.min(5000, parseInt(maxMembers) || 500));
      const group = await storage.updateGroup(groupId, updates);
      res.json(group);
    } catch (e) {
      res.status(500).json({ message: "Failed to update group settings" });
    }
  });

  // ============ STORIES ============
  
  // Create a story (upload image)
  app.post("/api/stories", upload.single("media"), async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const caption = req.body.caption || "";
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const story = await storage.createStory(userId, expiresAt);
      
      let mediaUrl = "";
      if (req.file) {
        const filename = generateFilename(req.file.originalname);
        await putObject(filename, req.file.buffer, req.file.mimetype);
        mediaUrl = `/uploads/${filename}`;
      } else if (req.body.mediaUrl) {
        mediaUrl = req.body.mediaUrl;
      }
      
      if (mediaUrl) {
        await storage.addStoryMedia(story.id, "image", mediaUrl, caption);
      }
      
      const media = await storage.getStoryMedia(story.id);
      res.json({ ...story, media });
    } catch (e) {
      console.error("Create story error:", e);
      res.status(500).json({ message: "Failed to create story" });
    }
  });

  // Get all active stories (grouped by user)
  app.get("/api/stories", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      await storage.deleteExpiredStories();
      const activeStories = await storage.getActiveStories();
      res.json(activeStories);
    } catch (e) {
      res.status(500).json({ message: "Failed to get stories" });
    }
  });

  app.get("/api/stories/feed", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      await storage.deleteExpiredStories();
      const requesterProfile = await storage.getProfile(userId);
      const seekingGenders = (requesterProfile?.seekingGenders ?? []) as string[];
      const seeAllGenders = seekingGenders.length === 0 || seekingGenders.includes("everyone");
      const groupedStories = await storage.getActiveStories();
      const flatStories = groupedStories.flatMap((group: any) =>
        group.stories.map((s: any) => ({ ...s, userId: group.userId }))
      );
      const enrichedAll = await Promise.all(flatStories.map(async (s: any) => {
        const profile = await storage.getProfileWithUser(s.userId);
        const media = await storage.getStoryMedia(s.id);
        const likes = await storage.getStoryLikes(s.id);
        const views = await storage.getStoryViews(s.id);
        return {
          ...s,
          displayName: profile?.displayName || "User",
          photoUrl: profile?.coverPhotoUrl || profile?.user?.profileImageUrl || "",
          gender: profile?.gender ?? null,
          media,
          likeCount: likes.length,
          viewCount: views.length,
        };
      }));
      const enriched = enrichedAll.filter((s) =>
        s.userId === userId || seeAllGenders || genderMatchesSeeking(s.gender, seekingGenders)
      );
      res.json(enriched);
    } catch (e) {
      console.error("Get stories feed error:", e);
      res.status(500).json({ message: "Failed to get stories feed" });
    }
  });

  // Get my stories
  app.get("/api/stories/mine", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const myStories = await storage.getUserStories(userId);
      const result = await Promise.all(myStories.map(async (s) => {
        const media = await storage.getStoryMedia(s.id);
        const likes = await storage.getStoryLikes(s.id);
        const views = await storage.getStoryViews(s.id);
        const comments = await storage.getStoryComments(s.id);
        return { ...s, media, likeCount: likes.length, viewCount: views.length, commentCount: comments.length };
      }));
      res.json(result);
    } catch (e) {
      res.status(500).json({ message: "Failed to get your stories" });
    }
  });

  // Get a specific story with media
  app.get("/api/stories/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const story = await storage.getStory(parseInt(req.params.id));
      if (!story) return res.status(404).json({ message: "Story not found" });
      const media = await storage.getStoryMedia(story.id);
      const likes = await storage.getStoryLikes(story.id);
      const views = await storage.getStoryViews(story.id);
      let comments: any[] = [];
      if (story.userId === userId) {
        comments = await storage.getStoryComments(story.id);
      }
      res.json({ ...story, media, likes, views, comments, likeCount: likes.length, viewCount: views.length });
    } catch (e) {
      res.status(500).json({ message: "Failed to get story" });
    }
  });

  // Like a story
  app.post("/api/stories/:id/like", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      await storage.likeStory(parseInt(req.params.id), userId);
      res.json({ liked: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to like story" });
    }
  });

  // Unlike a story
  app.delete("/api/stories/:id/like", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      await storage.unlikeStory(parseInt(req.params.id), userId);
      res.json({ liked: false });
    } catch (e) {
      res.status(500).json({ message: "Failed to unlike story" });
    }
  });

  // Comment on a story
  app.post("/api/stories/:id/comment", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const { text } = req.body;
      if (!text?.trim()) return res.status(400).json({ message: "Comment text required" });
      const comment = await storage.addStoryComment(parseInt(req.params.id), userId, text.trim());
      res.json(comment);
    } catch (e) {
      res.status(500).json({ message: "Failed to add comment" });
    }
  });

  // View a story (track view)
  app.post("/api/stories/:id/view", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      await storage.addStoryView(parseInt(req.params.id), userId);
      res.json({ viewed: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to record view" });
    }
  });

  // Create a text-only story
  app.post("/api/stories/text", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const { textContent, caption } = req.body;
      if (!textContent?.trim()) return res.status(400).json({ message: "textContent is required" });
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const story = await storage.createStory(userId, expiresAt);
      await storage.addStoryMedia(story.id, "text", null, caption || undefined, textContent.trim());
      const media = await storage.getStoryMedia(story.id);
      res.json({ ...story, media });
    } catch (e) {
      console.error("Create text story error:", e);
      res.status(500).json({ message: "Failed to create text story" });
    }
  });

  // Delete own story
  app.delete("/api/stories/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const story = await storage.getStory(parseInt(req.params.id));
      if (!story) return res.status(404).json({ message: "Story not found" });
      if (story.userId !== userId) return res.sendStatus(403);
      await storage.deleteStory(parseInt(req.params.id));
      res.json({ deleted: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to delete story" });
    }
  });

  // ============ PLANS ============

  // Get all active plans
  app.get("/api/plans", async (req, res) => {
    try {
      const allPlans = await storage.getPlans();
      res.json(allPlans);
    } catch (e) {
      res.status(500).json({ message: "Failed to get plans" });
    }
  });

  // Get a specific plan
  app.get("/api/plans/:id", async (req, res) => {
    try {
      const plan = await storage.getPlan(parseInt(req.params.id));
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      res.json(plan);
    } catch (e) {
      res.status(500).json({ message: "Failed to get plan" });
    }
  });

  // Block / unblock
  app.post("/api/users/block/:targetUserId", async (req, res) => {
    const blockerId = getUserId(req);
    if (!blockerId) return res.sendStatus(401);
    try {
      const { targetUserId } = req.params;
      const entry = await storage.blockUser(blockerId, targetUserId);
      res.json(entry);
    } catch (err) {
      res.status(500).json({ message: "Failed to block user" });
    }
  });

  app.delete("/api/users/block/:targetUserId", async (req, res) => {
    const blockerId = getUserId(req);
    if (!blockerId) return res.sendStatus(401);
    try {
      const { targetUserId } = req.params;
      await storage.unblockUser(blockerId, targetUserId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to unblock user" });
    }
  });

  // Report is distinct from block: it files a record for review. It also blocks
  // — you shouldn't keep seeing someone you've reported — but the reverse isn't
  // true, so they're separate controls in the UI.
  app.post("/api/users/:targetUserId/report", async (req, res) => {
    const reporterId = getUserId(req);
    if (!reporterId) return res.sendStatus(401);
    const { targetUserId } = req.params;
    if (targetUserId === reporterId) return res.status(400).json({ message: "You can't report yourself" });
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 1000) : "";
    const category = (REPORT_CATEGORIES as readonly string[]).includes(req.body?.category) ? req.body.category : "other";
    // Evidence ids are optional and client-supplied today (no picker UI yet) —
    // {type: "direct_message"|"group_message", id}. Never raw content.
    const evidence = Array.isArray(req.body?.evidence)
      ? req.body.evidence
          .filter((e: any) => e && typeof e.type === "string" && (typeof e.id === "string" || typeof e.id === "number"))
          .slice(0, 10)
          .map((e: any) => ({ type: e.type, id: String(e.id) }))
      : [];
    try {
      // The report is what actually persists and reaches the console queue.
      // The old audit-log-only trail stays too — belt and suspenders, cheap.
      await storage.createAuditLog(reporterId, "user_reported", { targetUserId, reason, category });
      const [newReport] = await db.insert(reportsTable).values({ reporterId, subjectId: targetUserId, category, freeText: reason || null, evidence }).returning();
      const isSafety = category === "safety_escalation" || category === "underage_concern";
      emailTemplates.alertReportFiled({ reportId: newReport.id, category, isSafety }).catch(() => {});
      // Auto-block so the reporter never has to see this person again — the
      // report persists independently of the block, and can't be undone by it.
      await storage.blockUser(reporterId, targetUserId).catch(() => {});
      res.json({ success: true });
    } catch (err) {
      console.error("Report submission error:", err);
      res.status(500).json({ message: "Failed to submit report" });
    }
  });

  // Settings → send feedback. Different job from a report: no target user, no
  // block, just a note to the operator. Surfaced in its own console queue.
  app.post("/api/feedback", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const category = (FEEDBACK_CATEGORIES as readonly string[]).includes(req.body?.category) ? req.body.category : "other";
    const freeText = typeof req.body?.freeText === "string" ? req.body.freeText.trim().slice(0, 4000) : "";
    if (!freeText) return res.status(400).json({ message: "Tell us a bit more" });
    const contactBackConsent = req.body?.contactBackConsent === true;
    const appVersion = typeof req.body?.appVersion === "string" ? req.body.appVersion.slice(0, 40) : null;
    const platform = typeof req.body?.platform === "string" ? req.body.platform.slice(0, 40) : null;
    try {
      await db.insert(feedbackTable).values({ userId, category, freeText, contactBackConsent, appVersion, platform });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to send feedback" });
    }
  });

  app.get("/api/users/blocked", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const blocked = await storage.getBlockedUsers(userId);
      const enriched = await Promise.all(blocked.map(async (b) => {
        const p = await storage.getProfile(b.blockedId);
        const photos = await storage.getUserPhotos(b.blockedId);
        const mainPhoto = photos.find(ph => ph.isMainProfilePhoto)?.photoUrl || photos[0]?.photoUrl || null;
        return { ...b, displayName: p?.displayName || b.blockedId, photoUrl: mainPhoto };
      }));
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ message: "Failed to get blocked users" });
    }
  });

  // Referrals — bringing a friend gets you profile views, never an extra read.
  app.get("/api/referrals/me", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const summary = await referralsService.getReferralSummary(userId);
      const origin = `${req.protocol}://${req.get("host")}`;
      res.json({ ...summary, url: `${origin}/?ref=${summary.code}` });
    } catch (err) {
      console.error("Referral summary error:", err);
      res.status(500).json({ message: "Failed to load referrals" });
    }
  });

  app.post("/api/referrals/claim", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const parsed = referralClaimSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid code" });
    }
    try {
      const result = await referralsService.claimCode(userId, parsed.data.code);
      if (!result.ok) {
        const msg =
          result.reason === "self"
            ? "That is your own code."
            : result.reason === "already"
              ? "You have already been referred."
              : "That code is not valid.";
        return res.status(409).json({ message: msg, reason: result.reason });
      }
      const summary = await referralsService.getReferralSummary(userId);
      res.json(summary);
    } catch (err) {
      console.error("Referral claim error:", err);
      res.status(500).json({ message: "Failed to claim code" });
    }
  });

  // Support tickets
  app.post("/api/support/tickets", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const { subject, message } = req.body;
      if (!subject || !message) return res.status(400).json({ message: "Subject and message required" });
      const ticket = await storage.createSupportTicket(userId, subject, message);
      res.json(ticket);
    } catch (err) {
      res.status(500).json({ message: "Failed to submit ticket" });
    }
  });

  // Data export
  app.get("/api/account/export-data", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const profile = await storage.getProfile(userId);
      const matches = await storage.getMatches(userId);
      const twinMemory = await storage.getTwinMemory(userId, 200);
      res.setHeader("Content-Disposition", "attachment; filename=destira-data.json");
      res.setHeader("Content-Type", "application/json");
      res.json({ profile, matches, twinMemory, exportedAt: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ message: "Failed to export data" });
    }
  });

  // Change password — verifies the current password (scrypt) and stores a
  // freshly-salted hash on the user's account. This is the same credential
  // /api/auth/login checks, so changing it here actually re-secures sign-in.
  app.post("/api/account/change-password", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new password are required" });
      }
      if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
        return res.status(400).json({ message: "Invalid input" });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters" });
      }
      const user = await authStorage.getUser(userId);
      if (!user) return res.status(404).json({ message: "Account not found" });
      if (user.passwordHash) {
        const valid = await verifyPassword(currentPassword, user.passwordHash);
        if (!valid) {
          return res.status(401).json({ message: "Current password is incorrect" });
        }
      }
      const newHash = await hashPassword(newPassword);
      await authStorage.updateUser(userId, { passwordHash: newHash });
      res.json({ success: true, message: "Password updated successfully" });
    } catch (err) {
      console.error("Change password error:", err);
      res.status(500).json({ message: "Failed to update password" });
    }
  });

  // Change email — requires the current password as re-authentication since
  // there's no email service configured to send a verification link yet.
  // Once one is connected, this can move to token-in-email + confirm.
  app.post("/api/account/change-email", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const { newEmail, currentPassword } = req.body;
      if (typeof newEmail !== "string" || typeof currentPassword !== "string" || !currentPassword) {
        return res.status(400).json({ message: "New email and current password are required" });
      }
      const normalizedEmail = newEmail.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ message: "Enter a valid email address" });
      }
      const user = await authStorage.getUser(userId);
      if (!user) return res.status(404).json({ message: "Account not found" });
      const valid = await verifyPassword(currentPassword, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }
      const existing = await authStorage.getUserByEmail(normalizedEmail);
      if (existing && existing.id !== userId) {
        return res.status(409).json({ message: "That email is already in use" });
      }
      const updated = await authStorage.updateUser(userId, { email: normalizedEmail });
      res.json({ success: true, email: updated.email });
    } catch (err: any) {
      if (err?.code === "23505") {
        return res.status(409).json({ message: "That email is already in use" });
      }
      console.error("Change email error:", err);
      res.status(500).json({ message: "Failed to update email" });
    }
  });

  // Delete account
  app.delete("/api/account", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const { confirmation } = req.body;
      if (confirmation !== "DELETE") return res.status(400).json({ message: "Type DELETE to confirm" });
      await storage.deleteAllUserData(userId);
      req.logout?.(() => {});
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // Clear Twin memory
  app.delete("/api/twin/memory", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      await db.delete(twinMemoryTable).where(eq(twinMemoryTable.userId, userId));
      await db.delete(twinMemoryFacts).where(eq(twinMemoryFacts.userId, userId));
      await db.delete(twinMemorySummary).where(eq(twinMemorySummary.userId, userId));
      await storage.updateProfile(userId, { twinQuestionsAnswered: 10 });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to clear Twin memory" });
    }
  });

  // Tier limits check — preflight only; authoritative enforcement is on /api/matches
  app.post("/api/likes", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const currentCount = await storage.getDailyLikeCount(userId);
      const g = await gate.checkGate(userId, "daily_likes", { countOverride: currentCount });
      if (!g.ok) return res.status(403).json(gate.gateBody(g, "daily_likes"));
      res.json({ success: true, count: currentCount, limit: g.limit });
    } catch (err) {
      res.status(500).json({ message: "Failed to check like limit" });
    }
  });

  // Verification status update
  app.post("/api/profile/verify", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      await storage.updateProfile(userId, { verificationStatus: "pending", isVerified: false });
      res.json({ success: true, verificationStatus: "pending" });
      setTimeout(async () => {
        try {
          await storage.updateProfile(userId, { verificationStatus: "verified", isVerified: true });
        } catch {
          // Auto-approve failed silently
        }
      }, 60 * 1000);
    } catch (err) {
      res.status(500).json({ message: "Failed to submit verification" });
    }
  });

  // Twin Tone settings — persisted in twinProfileStructured.twinToneProfile
  app.post("/api/settings/twin-tone", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const { twinToneProfile } = req.body;
      if (!twinToneProfile || typeof twinToneProfile !== "object") {
        return res.status(400).json({ message: "twinToneProfile object required" });
      }
      await storage.upsertTwinProfileStructured(userId, { twinToneProfile });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to save Twin tone" });
    }
  });

  // Discovery preferences
  app.post("/api/settings/discovery", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const { maxDistanceKm, ageMinPreference, ageMaxPreference, seekingGenders } = req.body;
      await storage.updateProfile(userId, {
        ...(maxDistanceKm != null && { maxDistanceKm }),
        ...(ageMinPreference != null && { ageMinPreference }),
        ...(ageMaxPreference != null && { ageMaxPreference }),
        ...(Array.isArray(seekingGenders) && { seekingGenders }),
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to save discovery preferences" });
    }
  });

  // ---- Events ----
  app.get("/api/events", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const groupId = req.query.groupId ? parseInt(req.query.groupId as string, 10) : undefined;
      const city = typeof req.query.city === "string" ? req.query.city : undefined;
      const from = req.query.from ? new Date(req.query.from as string) : undefined;
      const to = req.query.to ? new Date(req.query.to as string) : undefined;
      const list = await eventsService.listEvents(userId, { groupId, city, from, to });
      res.json(list);
    } catch (e) {
      console.error("List events error:", e);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  // The default Events view: filtered by the caller's saved event_preferences,
  // sorted by fit, capped at 30. Registered before /:id so "feed" / "search"
  // aren't parsed as an event id.
  app.get("/api/events/feed", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const result = await eventsFeed.getEventsFeed(userId);
      res.json(result);
    } catch (e) {
      console.error("Events feed error:", e);
      res.status(500).json({ message: "Failed to load your events feed" });
    }
  });

  // Explicit search — ignores saved preferences, sorts by date, hard cap 30.
  app.get("/api/events/search", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const parsed = eventSearchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid search", errors: parsed.error.flatten() });
    }
    try {
      const result = await eventsFeed.searchEvents(userId, parsed.data);
      res.json(result);
    } catch (e) {
      console.error("Events search error:", e);
      res.status(500).json({ message: "Search failed" });
    }
  });

  app.get("/api/event-preferences", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      res.json(await eventsFeed.getOrCreatePreferences(userId));
    } catch (e) {
      console.error("Get event preferences error:", e);
      res.status(500).json({ message: "Failed to load preferences" });
    }
  });

  // Live count for the distance slider on the preferences screen.
  app.get("/api/events/count", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const km = Math.max(1, Math.min(100, parseInt(String(req.query.distanceKm ?? "15"), 10) || 15));
    try {
      res.json({ count: await eventsFeed.countEventsWithinDistance(userId, km), distanceKm: km });
    } catch (e) {
      console.error("Events count error:", e);
      res.status(500).json({ message: "Failed to count events" });
    }
  });

  // Events the caller hosts or created — any status. Registered before /:id.
  app.get("/api/events/mine", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      res.json(await eventsService.listHostedByUser(userId));
    } catch (e) {
      console.error("List hosted events error:", e);
      res.status(500).json({ message: "Failed to load your events" });
    }
  });

  app.patch("/api/event-preferences", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const parsed = updateEventPreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid preferences", errors: parsed.error.flatten() });
    }
    try {
      res.json(await eventsFeed.updatePreferences(userId, parsed.data));
    } catch (e) {
      console.error("Update event preferences error:", e);
      res.status(500).json({ message: "Failed to save preferences" });
    }
  });

  app.get("/api/events/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    try {
      const event = await eventsService.getEventDetail(eventId, userId);
      res.json(event);
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      console.error("Get event error:", e);
      res.status(500).json({ message: "Failed to fetch event" });
    }
  });

  app.post("/api/events", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    if (await gate.denyIfGated(res, userId, "host_event")) return;
    const parsed = hostEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid event data", errors: parsed.error.flatten() });
    }
    try {
      const event = await eventsService.createHostedEvent(userId, parsed.data);
      if (event.status === "published") {
        void twinEventAlerts
          .runTwinEventAlerts(event.id)
          .catch((err) => console.error("twin event alerts failed:", err));
      }
      res.status(201).json(event);
    } catch (e) {
      if (e instanceof eventsService.NotGroupMemberError) return res.status(403).json({ message: e.message });
      if (e instanceof eventsService.HostRateLimitError) return res.status(429).json({ message: e.message });
      console.error("Create event error:", e);
      res.status(500).json({ message: "Failed to create event" });
    }
  });

  // Moderator action: move a first event out of pending_review. Gated by
  // EVENT_MODERATOR_IDS. Firing the twin alerts here mirrors the publish path.
  app.post("/api/events/:id/approve", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    try {
      const event = await eventsService.approveEvent(eventId, userId);
      if (event.status === "published") {
        void twinEventAlerts
          .runTwinEventAlerts(event.id)
          .catch((err) => console.error("twin event alerts failed:", err));
      }
      res.json(event);
    } catch (e) {
      if (e instanceof eventsService.ModeratorOnlyError) return res.status(403).json({ message: e.message });
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      console.error("Approve event error:", e);
      res.status(500).json({ message: "Failed to approve event" });
    }
  });

  app.post("/api/events/:id/cancel", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    const parsed = cancelEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "A reason is required", errors: parsed.error.flatten() });
    }
    try {
      const event = await eventsService.cancelHostedEvent(eventId, userId, parsed.data.reason);
      res.json(event);
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof eventsService.NotEventHostError) return res.status(403).json({ message: e.message });
      console.error("Cancel event error:", e);
      res.status(500).json({ message: "Failed to cancel event" });
    }
  });

  app.patch("/api/events/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    const parsed = updateEventSchema.safeParse({
      ...req.body,
      startsAt: req.body?.startsAt ? new Date(req.body.startsAt) : undefined,
      endsAt: req.body?.endsAt ? new Date(req.body.endsAt) : undefined,
    });
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid event data", errors: parsed.error.flatten() });
    }
    try {
      const event = await eventsService.updateEvent(eventId, userId, parsed.data);
      res.json(event);
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof eventsService.NotEventHostError) return res.status(403).json({ message: e.message });
      console.error("Update event error:", e);
      res.status(500).json({ message: "Failed to update event" });
    }
  });

  app.post("/api/events/:id/attend", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    try {
      const result = await eventsService.attendEvent(eventId, userId);
      res.json(result);
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      console.error("Attend event error:", e);
      res.status(500).json({ message: "Failed to join event" });
    }
  });

  app.delete("/api/events/:id/attend", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    try {
      const result = await eventsService.cancelEventAttendance(eventId, userId);
      res.json(result);
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      console.error("Cancel event attendance error:", e);
      res.status(500).json({ message: "Failed to cancel" });
    }
  });

  app.get("/api/events/:id/attendees", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    try {
      const attendees = await eventsService.getEventAttendeesList(eventId, userId);
      res.json(attendees);
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      console.error("List attendees error:", e);
      res.status(500).json({ message: "Failed to fetch attendees" });
    }
  });

  // Suburb typeahead + reverse lookup for the signup essentials "area" screen.
  app.get("/api/geo/suburbs", async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    const lat = req.query.lat != null ? Number(req.query.lat) : null;
    const lng = req.query.lng != null ? Number(req.query.lng) : null;
    try {
      const rows = await db
        .select({ suburb: suburbCentroids.suburb, city: suburbCentroids.city, lat: suburbCentroids.lat, lng: suburbCentroids.lng })
        .from(suburbCentroids);
      const shaped = rows.map((r) => ({
        suburb: r.suburb,
        city: r.city,
        label: `${r.suburb}, ${r.city}`,
        lat: r.lat != null ? Number(r.lat) : null,
        lng: r.lng != null ? Number(r.lng) : null,
      }));
      if (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
        const km = (a: number, b: number, c: number, d: number) => {
          const R = 6371, dLat = ((c - a) * Math.PI) / 180, dLng = ((d - b) * Math.PI) / 180;
          const s = Math.sin(dLat / 2) ** 2 + Math.cos((a * Math.PI) / 180) * Math.cos((c * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
          return 2 * R * Math.asin(Math.sqrt(s));
        };
        const nearest = shaped
          .filter((s) => s.lat != null && s.lng != null)
          .sort((x, y) => km(lat, lng, x.lat!, x.lng!) - km(lat, lng, y.lat!, y.lng!))
          .slice(0, 1);
        return res.json(nearest);
      }
      const list = q ? shaped.filter((s) => s.label.toLowerCase().includes(q)) : shaped;
      res.json(list.slice(0, 12));
    } catch (e) {
      console.error("Suburb lookup error:", e);
      res.status(500).json({ message: "Failed to load suburbs" });
    }
  });

  // ── Events v3: places, venue photos, host video, contact release ──

  app.get("/api/places", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    try {
      res.json(await eventsService.listPlaces(q));
    } catch (e) {
      console.error("List places error:", e);
      res.status(500).json({ message: "Failed to load places" });
    }
  });

  // Venue photos. EXIF (incl. GPS) is stripped by re-encoding through sharp —
  // sharp drops all metadata unless withMetadata() is called. Only the
  // 480/960/1600 webp variants are stored; the original buffer is never
  // written anywhere.
  app.post("/api/events/:id/photos", upload.single("image"), async (req: any, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    if (!req.file) return res.status(400).json({ message: "No image file provided" });
    const buf = req.file.buffer as Buffer;
    try {
      const base = generateFilename(req.file.originalname).replace(/\.[^.]+$/, "");
      const meta = await sharp(buf).rotate().metadata();
      const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
      if (longEdge < 1000) {
        return res.status(422).json({ message: `That image is ${longEdge}px on the long edge — venue photos need at least 1000px.` });
      }
      for (const w of [480, 960, 1600]) {
        const resized = await sharp(buf).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
        await putObject(`${base}-${w}.webp`, resized, "image/webp");
      }
      const caption = typeof req.body?.caption === "string" ? req.body.caption : null;
      const photo = await eventsService.addEventPhoto(eventId, userId, {
        url: `/uploads/${base}-1600.webp`,
        width: meta.width ?? null,
        height: meta.height ?? null,
        caption,
      });
      res.status(201).json(photo);
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof eventsService.NotEventHostError) return res.status(403).json({ message: e.message });
      if (e instanceof eventsService.PhotoLimitError) return res.status(422).json({ message: e.message });
      console.error("Event photo error:", e);
      res.status(500).json({ message: "Failed to add photo" });
    }
  });

  app.delete("/api/events/:id/photos/:photoId", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    const photoId = parseInt(req.params.photoId, 10);
    if (Number.isNaN(eventId) || Number.isNaN(photoId)) return res.status(400).json({ message: "Invalid id" });
    try {
      const photo = await eventsService.deleteEventPhoto(eventId, photoId, userId);
      res.json({ success: true });
      // Only the -1600 variant is tracked in the DB row (see POST above),
      // but upload wrote -480/-960 siblings too — clean up all three.
      const key1600 = keyFromUploadUrl(photo?.url);
      if (key1600 && key1600.endsWith("-1600.webp")) {
        const base = key1600.slice(0, -"-1600.webp".length);
        await Promise.allSettled([480, 960, 1600].map((w) => deleteObject(`${base}-${w}.webp`)));
      }
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof eventsService.NotEventHostError) return res.status(403).json({ message: e.message });
      console.error("Delete event photo error:", e);
      res.status(500).json({ message: "Failed to remove photo" });
    }
  });

  // Host video — RECORDED IN-APP ONLY. The client posts the recorded webm blob
  // plus a captured poster frame and the measured duration. No file-picker path
  // exists on the client; there is no server transcode (no ffmpeg).
  app.post(
    "/api/events/:id/host-video",
    uploadVideo.fields([{ name: "video", maxCount: 1 }, { name: "poster", maxCount: 1 }]),
    async (req: any, res) => {
      const userId = getUserId(req);
      if (!userId) return res.sendStatus(401);
      const eventId = parseInt(req.params.id, 10);
      if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
      const video = req.files?.video?.[0];
      const poster = req.files?.poster?.[0];
      if (!video) return res.status(400).json({ message: "No video provided" });
      const durationSec = Number(req.body?.durationSec);
      if (!Number.isFinite(durationSec) || durationSec < 10 || durationSec > 60) {
        return res.status(422).json({ message: "The video needs to be between 10 and 60 seconds." });
      }
      try {
        const videoFilename = generateFilename(video.originalname, ".webm");
        await putObject(videoFilename, video.buffer, video.mimetype);
        let posterFilename = "";
        if (poster) {
          posterFilename = generateFilename(poster.originalname);
          await putObject(posterFilename, poster.buffer, poster.mimetype);
        }
        const updated = await eventsService.setHostVideo(eventId, userId, {
          url: `/uploads/${videoFilename}`,
          posterUrl: posterFilename ? `/uploads/${posterFilename}` : "",
          durationSec,
        });
        res.status(201).json({ hostVideoStatus: updated.hostVideoStatus });
      } catch (e) {
        if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
        if (e instanceof eventsService.NotEventHostError) return res.status(403).json({ message: e.message });
        console.error("Host video error:", e);
        res.status(500).json({ message: "Failed to save video" });
      }
    },
  );

  app.post("/api/events/:id/host-video/review", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    const { decision, reason } = req.body ?? {};
    if (decision !== "approve" && decision !== "reject") {
      return res.status(400).json({ message: "decision must be 'approve' or 'reject'" });
    }
    try {
      const updated = await eventsService.reviewHostVideo(
        eventId,
        userId,
        decision,
        typeof reason === "string" ? reason : undefined,
      );
      res.json({ hostVideoStatus: updated.hostVideoStatus });
    } catch (e) {
      if (e instanceof eventsService.ModeratorOnlyError) return res.status(403).json({ message: e.message });
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      console.error("Review host video error:", e);
      res.status(500).json({ message: "Failed to review video" });
    }
  });

  // Contact release — 'going' attendees only, 24h before start to 6h after,
  // every access logged. The host always sees their own numbers.
  app.get("/api/events/:id/contact", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    try {
      res.json(await eventsService.getEventContact(eventId, userId));
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof eventsService.ContactNotReleasedError) return res.status(403).json({ message: e.message });
      console.error("Event contact error:", e);
      res.status(500).json({ message: "Failed to load contact" });
    }
  });

  app.get("/api/events/:id/contact-views", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) return res.status(400).json({ message: "Invalid event id" });
    try {
      res.json(await eventsService.listContactViews(eventId, userId));
    } catch (e) {
      if (e instanceof eventsService.EventNotFoundError) return res.status(404).json({ message: e.message });
      if (e instanceof eventsService.NotEventHostError) return res.status(403).json({ message: e.message });
      console.error("List contact views error:", e);
      res.status(500).json({ message: "Failed to load contact views" });
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

  // "View Demo" on the landing page: seeds sample data and drops the visitor
  // straight into a dedicated guest account (not a real signup, and not the
  // shared auto-login the app used to have for every visitor).
  app.post("/api/demo/login", async (req: any, res) => {
    try {
      await storage.seedDemoData();
      const demoUser = await authStorage.upsertUser({
        id: "demo-guest",
        email: "demo-guest@vibeflow.app",
        firstName: "Demo",
        lastName: "Guest",
      });
      req.login(createSessionUser(demoUser), (err: any) => {
        if (err) {
          console.error("[demo] req.login failed:", err);
          return res.status(500).json({ message: "Failed to start demo" });
        }
        res.json({ success: true });
      });
    } catch (e) {
      console.error("Demo login error:", e);
      res.status(500).json({ message: "Failed to start demo" });
    }
  });

  try {
    await storage.seedDemoData();
    console.log("Demo data seeded.");
  } catch (e) {
    console.error("Failed to seed demo data on startup:", e);
  }

  // Dev convenience only: seed one real (password-protected) local account
  // so you don't have to sign up by hand on every fresh checkout. This does
  // NOT auto-log anyone in — you still sign in with these credentials at
  // /login, so different browser sessions stay distinct accounts.
  if (process.env.NODE_ENV !== "production") {
    try {
      const devEmail = (process.env.DEV_USER_EMAIL || "demo@vibeflow.local").trim().toLowerCase();
      const existingDev = await authStorage.getUserByEmail(devEmail);
      if (!existingDev) {
        const devPassword = process.env.DEV_USER_PASSWORD || "VibeFlow123!";
        const devUser = await authStorage.createUser({
          email: devEmail,
          passwordHash: await hashPassword(devPassword),
          firstName: "Demo",
          lastName: "User",
        });
        // Give it a completed profile so login lands in the app, not onboarding.
        await storage.createProfile({
          userId: devUser.id,
          displayName: "Demo",
          bio: "Local demo account for exploring Destira.",
          age: 29,
          gender: "other",
          location: "Harare",
          personalityProfile: { openness: 82, conscientiousness: 74, extraversion: 61, agreeableness: 79, neuroticism: 33 },
          twinPersona: "I'm Demo's AI Twin. Demo is curious, direct, and here to see how the app feels from the inside.",
          onboardingCompleted: true,
          isPublic: true,
        } as any);
        console.log(`[dev] Seeded a local login: ${devEmail} / ${devPassword} (set DEV_USER_EMAIL / DEV_USER_PASSWORD to change).`);
      }
    } catch (e) {
      console.error("Failed to seed dev user:", e);
    }
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

  try {
    await eventsService.seedSuburbCentroids();
    await eventsService.seedPlaces();
    await eventsService.seedProximityPlaces();
    await eventsService.seedNeighborhoodPlaces();
    await eventsService.seedEvents();
    await eventsService.backfillSeedEventsV2();
    console.log("Demo events + suburb centroids + places seeded.");
  } catch (e) {
    console.error("Failed to seed events on startup:", e);
  }

  // No location trail: null out pings older than 30 min so "where you were" is
  // never reconstructable. Runs on boot and every 10 min.
  const sweep = () =>
    proximity
      .sweepStaleLocations()
      .then((n) => n > 0 && console.log(`[proximity] swept ${n} stale ping(s)`))
      .catch((e) => console.error("[proximity] sweep failed:", e));

  // Payments taken but never confirmed by the gateway — the "user paid, got
  // nothing" case. Checked every 5 min; alerts once per payment (see
  // sweepStuckPayments), never auto-fails it.
  const sweepPayments = () =>
    payments
      .sweepStuckPayments()
      .then((n) => n > 0 && console.log(`[payments] ${n} stuck payment(s) alerted`))
      .catch((e) => console.error("[payments] stuck sweep failed:", e));

  // Metrics: backfill the trailing 30 days once on boot (so the console
  // isn't blank the first time it's opened), then a real nightly rollup +
  // digest every 24h. No cron dependency — same setInterval shape as every
  // other periodic job in this file; "nightly" here means "roughly once a
  // day, whenever the process happened to boot," which is an acceptable
  // trade for a single-process local/small-scale deploy.
  const initialBackfill = () =>
    backfillRecentMetrics(30).catch((e) => console.error("[metrics] initial backfill failed:", e));

  // Staggered, not simultaneous: firing all three of these (plus the 30-day
  // metrics backfill, the heaviest) in the same tick as app.listen() means
  // they compete with the pool for connections at the exact moment the
  // first real requests arrive — on a high-latency connection this queued
  // real traffic behind them for 10s+. Spacing them out gives early
  // requests a clear run at the pool; the jobs themselves don't care when
  // in the first minute they run.
  sweep();
  setInterval(sweep, 10 * 60 * 1000);
  setTimeout(sweepPayments, 5_000);
  setInterval(sweepPayments, 5 * 60 * 1000);
  setTimeout(initialBackfill, 12_000);
  setInterval(() => {
    runNightlyRollup()
      .then(() => sendDailyDigest())
      .then(() => {
        if (new Date().getDay() === 1) return sendWeeklyDigest(); // Monday
      })
      .catch((e) => console.error("[metrics] nightly rollup/digest failed:", e));
  }, 24 * 60 * 60 * 1000);

  // Clean up expired stories periodically
  setInterval(async () => {
    try {
      await storage.deleteExpiredStories();
    } catch (e) {
      console.error("Failed to clean expired stories:", e);
    }
  }, 60 * 60 * 1000); // Every hour

  return httpServer;
}
