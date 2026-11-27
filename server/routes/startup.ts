// Once every route is registered: demo and dev seeds, then the periodic sweeps.
// Split out of server/routes.ts; runs at the same point as before.
import { storage } from "../storage";
import { authStorage, hashPassword } from "../replit_integrations/auth";
import { and } from "drizzle-orm";
import * as eventsService from "../events";
import * as officialEvents from "../official-events";
import { runOfficialAutopilot } from "../official-autopilot";
import { ensureVideoCallsTable, sweepVideoCalls } from "../video-calls";
import * as onboarding from "../onboarding";
import * as payments from "../payments";
import * as proximity from "../services/twin-proximity-alerts";
import { places } from "@shared/schema";
import { startOfficialStoriesSweep } from "../official-stories";
import { runNightlyRollup, backfillRecentMetrics } from "../admin/metrics-rollup";
import { sendDailyDigest, sendWeeklyDigest } from "../email/digest";

export async function startBackgroundWork() {
  // No guest login: a dating app can't have one shared account that any
  // visitor walks into. (POST /api/demo/login used to do that.)

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
      const { seedQuestions } = await import("../seed-questions");
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
  // Official events: call off any that missed their headcount/lead by the 48h
  // mark, and nudge going attendees when one still has no lead. Then the
  // autopilot tops the calendar back up (server/official-autopilot.ts).
  const sweepOfficial = () =>
    officialEvents
      .sweepOfficialEvents()
      .then((n) => n > 0 && console.log(`[official-events] ${n} event(s) called off`))
      .catch((e) => console.error("[official-events] sweep failed:", e))
      .then(() => runOfficialAutopilot())
      .then((posted) => posted?.forEach((p) => console.log(`[official-autopilot] posted #${p.id} "${p.title}" for ${p.startsAt.toISOString()}`)))
      .catch((e) => console.error("[official-autopilot] failed:", e));
  setTimeout(sweepOfficial, 8_000);
  setInterval(sweepOfficial, 15 * 60 * 1000);
  // Video calls: the table on first boot, then close rings nobody answered
  // and calls both phones have gone quiet on (so they stop counting minutes).
  ensureVideoCallsTable().catch((e) => console.error("[video] couldn't create video_calls:", e));
  setInterval(() => {
    sweepVideoCalls().catch((e) => console.error("[video] sweep failed:", e));
  }, 30_000);
  startOfficialStoriesSweep();
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
}
