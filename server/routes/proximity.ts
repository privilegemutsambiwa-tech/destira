// Location, "someone worth meeting is here" alerts and push sign-up.
// Split out of server/routes.ts; registered in the same order as before.
import type { Express } from "express";
import { z } from "zod";
import { db } from "../db";
import { eq, and, gt, desc, isNull, inArray } from "drizzle-orm";
import { profiles, userPhotos } from "@shared/schema";
import path from "path";
import * as onboarding from "../onboarding";
import * as proximity from "../services/twin-proximity-alerts";
import * as push from "../push";
import { locationReportSchema, updateProximitySettingsSchema, proximityAlerts, placeInvisibility, pushSubscriptions, deviceTokens, places } from "@shared/schema";
import * as gate from "../gate";
import { getUserId } from "./shared";

// Settings → Notifications → "Send a test notification": proves the whole
// path to this member's phones and browsers. Says what's missing instead
// of failing silently. At most once every 30 seconds per member.
const lastPushTest = new Map<string, number>();

export function registerProximityRoutes(app: Express) {
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

  app.post("/api/push/test", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const last = lastPushTest.get(userId) ?? 0;
    if (Date.now() - last < 30_000) return res.status(429).json({ message: "Give it a few seconds before trying again." });
    lastPushTest.set(userId, Date.now());
    try {
      const [phones, browsers] = await Promise.all([
        db.select({ id: deviceTokens.id }).from(deviceTokens).where(eq(deviceTokens.userId, userId)),
        db.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)),
      ]);
      await push.sendPush(userId, {
        title: "Destira",
        body: "Notifications are working. You'll hear about matches, messages and events here.",
        url: "/settings",
        tag: "push-test",
      });
      res.json({
        phones: push.appPushConfigured() ? phones.length : 0,
        browsers: push.pushConfigured() ? browsers.length : 0,
        appPushConfigured: push.appPushConfigured(),
        webPushConfigured: push.pushConfigured(),
      });
    } catch (e) {
      console.error("Push test error:", e);
      res.status(500).json({ message: "Couldn't send the test" });
    }
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

  // The Android/iOS app's Firebase token. A token moves to whoever signed in
  // on that phone last, so a shared phone never pushes to the previous member.
  app.post("/api/push/device", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const parsed = z.object({ token: z.string().min(20).max(4096), platform: z.enum(["android", "ios"]) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid body" });
    try {
      await db
        .insert(deviceTokens)
        .values({ userId, token: parsed.data.token, platform: parsed.data.platform })
        .onConflictDoUpdate({ target: deviceTokens.token, set: { userId, platform: parsed.data.platform, lastSeenAt: new Date() } });
      res.json({ ok: true, delivering: push.appPushConfigured() });
    } catch (e) {
      res.status(500).json({ message: "Failed" });
    }
  });

  app.delete("/api/push/device", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const parsed = z.object({ token: z.string().min(20).max(4096) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid body" });
    try {
      await db.delete(deviceTokens).where(and(eq(deviceTokens.token, parsed.data.token), eq(deviceTokens.userId, userId)));
      res.json({ ok: true });
    } catch (e) {
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
}
