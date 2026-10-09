// Member lifecycle email: the engine that decides who gets which email, when.
//
// Five kinds, each with its own dedupe window so nobody is ever sent the
// same thing twice:
//   welcome         once, within ~10 min..3 days of signup
//   finish_profile  once, 20h..7d after signup, if the profile is still thin
//   likes_waiting   at most every 3 days, when likes arrived since they were last active
//   weekly_digest   once a week (Thursdays, Harare time), only with something real in it
//   win_back        once at 7 days and once at 21 days of inactivity, only with something real
//
// Safety rails, in order:
//   1. Mode lives in app_settings and defaults to "off". Nothing is sent
//      until an admin turns it on in the console (Member emails page).
//   2. Outside production, nothing is ever delivered except to addresses on
//      MEMBER_EMAIL_DEV_ALLOW; everything else is logged as "logged".
//   3. A daily cap (default 90 — Resend's free plan allows 100/day) stops the
//      sweep for the day.
//   4. Sends only between 08:00 and 20:00 Harare time.
//   5. Per-kind and all-email unsubscribe (profiles.notificationPrefs), with
//      a signed one-click link in every email.
import crypto from "crypto";
import { db } from "../db";
import {
  profiles, userPhotos, matches, userActivityDaily, memberEmailLog, appSettings, events, eventAttendees,
} from "@shared/schema";
import { users } from "@shared/models/auth";
import { and, eq, gte, lt, inArray, sql, desc, ne, isNotNull } from "drizzle-orm";
import { sendViaResend, resendConfigured } from "../email/resend";
import { DESTIRA_SYSTEM_USER_ID } from "../system-user";
import * as T from "./templates";

export const MEMBER_EMAIL_KINDS = ["welcome", "finish_profile", "likes_waiting", "weekly_digest", "win_back"] as const;
export type MemberEmailKind = (typeof MEMBER_EMAIL_KINDS)[number];

export const KIND_LABEL: Record<MemberEmailKind, string> = {
  welcome: "Welcome",
  finish_profile: "Finish your profile",
  likes_waiting: "Someone liked you",
  weekly_digest: "Weekly digest",
  win_back: "We miss you",
};
// What the unsubscribe link in each kind turns off (used in the footer copy).
const UNSUB_LABEL: Record<MemberEmailKind, string> = {
  welcome: "tips emails",
  finish_profile: "tips emails",
  likes_waiting: "like notifications by email",
  weekly_digest: "the weekly digest",
  win_back: "catch-up emails",
};
// Kinds share an unsubscribe switch where it makes sense to a member.
const PREF_KEY: Record<MemberEmailKind, string> = {
  welcome: "email_tips",
  finish_profile: "email_tips",
  likes_waiting: "email_likes",
  weekly_digest: "email_digest",
  win_back: "email_digest",
};
export const MEMBER_EMAIL_PREF_KEYS = ["email_all", "email_tips", "email_likes", "email_digest"] as const;

const HARARE_UTC_OFFSET = 2;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// ── settings ───────────────────────────────────────────────────────

export type MemberEmailMode = "off" | "live";
export interface MemberEmailSettings {
  mode: MemberEmailMode;
  dailyCap: number;
  kinds: Record<MemberEmailKind, boolean>;
}
const SETTINGS_KEY = "member_email";
const DEFAULT_SETTINGS: MemberEmailSettings = {
  mode: "off",
  dailyCap: 90,
  kinds: { welcome: true, finish_profile: true, likes_waiting: true, weekly_digest: true, win_back: true },
};

export async function getMemberEmailSettings(): Promise<MemberEmailSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, SETTINGS_KEY));
  const v = (row?.value ?? {}) as Partial<MemberEmailSettings>;
  return {
    mode: v.mode === "live" ? "live" : "off",
    dailyCap: typeof v.dailyCap === "number" && v.dailyCap > 0 ? Math.min(v.dailyCap, 5000) : DEFAULT_SETTINGS.dailyCap,
    kinds: { ...DEFAULT_SETTINGS.kinds, ...(v.kinds ?? {}) },
  };
}

export async function updateMemberEmailSettings(patch: Partial<MemberEmailSettings>, adminUserId: string): Promise<MemberEmailSettings> {
  const current = await getMemberEmailSettings();
  const next: MemberEmailSettings = {
    mode: patch.mode === "live" || patch.mode === "off" ? patch.mode : current.mode,
    dailyCap: typeof patch.dailyCap === "number" && patch.dailyCap > 0 ? Math.min(Math.round(patch.dailyCap), 5000) : current.dailyCap,
    kinds: { ...current.kinds, ...(patch.kinds ?? {}) },
  };
  await db
    .insert(appSettings)
    .values({ key: SETTINGS_KEY, value: next, updatedBy: adminUserId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: next, updatedBy: adminUserId, updatedAt: new Date() } });
  return next;
}

// ── helpers ────────────────────────────────────────────────────────

export function appOrigin(): string {
  return (process.env.PUBLIC_APP_URL || "http://localhost:5000").replace(/\/$/, "");
}

function signingSecret(): string {
  return process.env.SESSION_SECRET || "local-dev-insecure-secret";
}

/** Signed, non-expiring token for a one-click unsubscribe link. Only lets the
 *  holder turn email OFF for that one user, so a leaked link can't do harm. */
export function unsubscribeToken(userId: string, scope: string): string {
  return crypto.createHmac("sha256", signingSecret()).update(`unsub:${userId}:${scope}`).digest("base64url").slice(0, 32);
}
export function verifyUnsubscribeToken(userId: string, scope: string, token: string): boolean {
  const expected = unsubscribeToken(userId, scope);
  return expected.length === token.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}
export function unsubscribeUrl(userId: string, scope: string): string {
  const q = new URLSearchParams({ u: userId, s: scope, t: unsubscribeToken(userId, scope) });
  return `${appOrigin()}/api/email/unsubscribe?${q.toString()}`;
}

export async function setEmailPref(userId: string, scope: string, on: boolean): Promise<void> {
  const [p] = await db.select({ prefs: profiles.notificationPrefs }).from(profiles).where(eq(profiles.userId, userId));
  if (!p) return;
  await db
    .update(profiles)
    .set({ notificationPrefs: { ...(p.prefs ?? {}), [scope]: on } })
    .where(eq(profiles.userId, userId));
}

function harareHour(now: Date): number {
  return (((now.getUTCHours() + HARARE_UTC_OFFSET) % 24) + 24) % 24;
}
function harareDay(now: Date): number {
  return new Date(now.getTime() + HARARE_UTC_OFFSET * HOUR_MS).getUTCDay(); // 0 Sun .. 6 Sat
}
function isoWeekKey(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
function fmtEventWhen(d: Date): string {
  const local = new Date(d.getTime() + HARARE_UTC_OFFSET * HOUR_MS);
  const day = local.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const time = local.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
  return `${day} · ${time}`;
}
function cityOf(location: string | null | undefined): string | null {
  const s = (location ?? "").trim();
  if (!s) return null;
  // "Avondale, Harare" → "Harare"; "Harare" → "Harare"
  const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  return parts[parts.length - 1] || null;
}

// ── member snapshot (one batched load, then pure decisions) ─────────

interface Member {
  userId: string;
  email: string;
  firstName: string;
  createdAt: Date;
  city: string | null;
  hasBasics: boolean;
  onboardingCompleted: boolean;
  photoCount: number;
  lastActiveAt: Date; // last day with activity (or signup)
  prefs: Record<string, boolean>;
  pendingLikes: Date[]; // createdAt of likes they haven't answered
  sentKeys: Set<string>;
}

async function loadMembers(): Promise<Member[]> {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      firstName: users.firstName,
      createdAt: users.createdAt,
      displayName: profiles.displayName,
      location: profiles.location,
      gender: profiles.gender,
      onboardingCompleted: profiles.onboardingCompleted,
      moderationStatus: profiles.moderationStatus,
      prefs: profiles.notificationPrefs,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(and(isNotNull(users.email), ne(users.id, DESTIRA_SYSTEM_USER_ID)));

  const active = rows.filter((r) => r.email && (r.moderationStatus ?? "active") === "active");
  const ids = active.map((r) => r.userId);
  if (ids.length === 0) return [];

  const since = new Date(Date.now() - 90 * DAY_MS);
  const [photoRows, activityRows, likeRows, sentRows] = await Promise.all([
    db.select({ userId: userPhotos.userId, n: sql<number>`count(*)` }).from(userPhotos).where(inArray(userPhotos.userId, ids)).groupBy(userPhotos.userId),
    db.select({ userId: userActivityDaily.userId, last: sql<string>`max(${userActivityDaily.date})` }).from(userActivityDaily).where(inArray(userActivityDaily.userId, ids)).groupBy(userActivityDaily.userId),
    db.select({ userId: matches.user2Id, createdAt: matches.createdAt }).from(matches).where(and(inArray(matches.user2Id, ids), eq(matches.status, "pending"))),
    db.select({ userId: memberEmailLog.userId, key: memberEmailLog.dedupeKey }).from(memberEmailLog).where(and(inArray(memberEmailLog.userId, ids), gte(memberEmailLog.createdAt, since))),
  ]);
  const photos = new Map(photoRows.map((r) => [r.userId, Number(r.n)]));
  const lastActive = new Map(activityRows.map((r) => [r.userId, new Date(`${r.last}T12:00:00Z`)]));
  const likes = new Map<string, Date[]>();
  for (const l of likeRows) {
    if (!l.createdAt) continue;
    const arr = likes.get(l.userId) ?? [];
    arr.push(l.createdAt);
    likes.set(l.userId, arr);
  }
  const sent = new Map<string, Set<string>>();
  for (const s of sentRows) {
    const set = sent.get(s.userId) ?? new Set<string>();
    set.add(s.key);
    sent.set(s.userId, set);
  }

  return active.map((r) => {
    const createdAt = r.createdAt ?? new Date(0);
    const last = lastActive.get(r.userId);
    return {
      userId: r.userId,
      email: r.email!,
      firstName: (r.firstName || r.displayName || "").trim().split(" ")[0],
      createdAt,
      city: cityOf(r.location),
      hasBasics: !!r.gender,
      onboardingCompleted: !!r.onboardingCompleted,
      photoCount: photos.get(r.userId) ?? 0,
      lastActiveAt: last && last > createdAt ? last : createdAt,
      prefs: (r.prefs ?? {}) as Record<string, boolean>,
      pendingLikes: likes.get(r.userId) ?? [],
      sentKeys: sent.get(r.userId) ?? new Set(),
    };
  });
}

interface WeekContext {
  eventsByCity: Map<string, { id: number; title: string; startsAt: Date; suburb: string | null; going: number; isOfficial: boolean }[]>;
  newPeopleByCity: Map<string, number>;
}

async function loadWeekContext(now: Date): Promise<WeekContext> {
  const weekAhead = new Date(now.getTime() + 7 * DAY_MS);
  const upcoming = await db
    .select({ id: events.id, title: events.title, startsAt: events.startsAt, suburb: events.suburb, city: events.city, isOfficial: events.isOfficial, visibility: events.visibility })
    .from(events)
    .where(and(eq(events.status, "published"), gte(events.startsAt, now), lt(events.startsAt, weekAhead)));
  const publicEvents = upcoming.filter((e) => e.visibility === "public");
  const goingRows = publicEvents.length
    ? await db
        .select({ eventId: eventAttendees.eventId, n: sql<number>`count(*)` })
        .from(eventAttendees)
        .where(and(inArray(eventAttendees.eventId, publicEvents.map((e) => e.id)), eq(eventAttendees.status, "going")))
        .groupBy(eventAttendees.eventId)
    : [];
  const going = new Map(goingRows.map((g) => [g.eventId, Number(g.n)]));
  const eventsByCity = new Map<string, WeekContext["eventsByCity"] extends Map<string, infer V> ? V : never>();
  for (const e of publicEvents) {
    const key = (e.city ?? "").toLowerCase();
    if (!key) continue;
    const list = eventsByCity.get(key) ?? [];
    list.push({ id: e.id, title: e.title, startsAt: e.startsAt, suburb: e.suburb, going: going.get(e.id) ?? 0, isOfficial: e.isOfficial });
    eventsByCity.set(key, list);
  }
  for (const list of Array.from(eventsByCity.values())) {
    list.sort((a, b) => Number(b.isOfficial) - Number(a.isOfficial) || a.startsAt.getTime() - b.startsAt.getTime());
  }

  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const newcomers = await db
    .select({ location: profiles.location })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(and(gte(users.createdAt, weekAgo), eq(profiles.onboardingCompleted, true), eq(profiles.isPublic, true)));
  const newPeopleByCity = new Map<string, number>();
  for (const n of newcomers) {
    const c = cityOf(n.location)?.toLowerCase();
    if (c) newPeopleByCity.set(c, (newPeopleByCity.get(c) ?? 0) + 1);
  }
  return { eventsByCity, newPeopleByCity };
}

// ── decisions ──────────────────────────────────────────────────────

export interface PlannedEmail {
  userId: string;
  kind: MemberEmailKind;
  dedupeKey: string;
  to: string;
  content: T.EmailContent;
  unsubscribeScope: string;
}

function allowed(m: Member, kind: MemberEmailKind): boolean {
  if (m.prefs.email_all === false) return false;
  return m.prefs[PREF_KEY[kind]] !== false;
}

function ctxFor(m: Member, kind: MemberEmailKind): T.LayoutCtx {
  return {
    origin: appOrigin(),
    firstName: m.firstName,
    unsubscribeUrl: unsubscribeUrl(m.userId, PREF_KEY[kind]),
    unsubscribeLabel: UNSUB_LABEL[kind],
  };
}

function nextStep(m: Member): { href: string; label: string } {
  const o = appOrigin();
  if (!m.hasBasics) return { href: `${o}/essentials`, label: "Finish your basics" };
  if (!m.onboardingCompleted) return { href: `${o}/onboarding`, label: "Answer your first questions" };
  if (m.photoCount === 0) return { href: `${o}/photos`, label: "Add a photo" };
  return { href: `${o}/events`, label: "See what's on this week" };
}

function profileSteps(m: Member): { title: string; detail: string; href: string }[] {
  const o = appOrigin();
  const steps: { title: string; detail: string; href: string }[] = [];
  if (!m.hasBasics) steps.push({ title: "Finish your basics", detail: "Who you are and who you'd like to meet. 30 seconds.", href: `${o}/essentials` });
  if (!m.onboardingCompleted) steps.push({ title: "Answer a few questions", detail: "Tap-to-answer. This is what your twin learns from.", href: `${o}/onboarding` });
  if (m.photoCount === 0) steps.push({ title: "Add a photo", detail: "People say yes to a face.", href: `${o}/photos` });
  return steps;
}

function eventItems(ctx: WeekContext, m: Member, limit: number) {
  const o = appOrigin();
  const list = ctx.eventsByCity.get((m.city ?? "harare").toLowerCase()) ?? [];
  return list.slice(0, limit).map((e) => ({
    title: e.isOfficial ? `${e.title} (Destira Official)` : e.title,
    detail: [fmtEventWhen(e.startsAt), e.suburb, e.going > 0 ? `${e.going} going` : "be the first to join"].filter(Boolean).join(" · "),
    href: `${o}/events/${e.id}`,
  }));
}

function plan(members: Member[], ctx: WeekContext, settings: MemberEmailSettings, now: Date): PlannedEmail[] {
  const o = appOrigin();
  const out: PlannedEmail[] = [];
  const isThursday = harareDay(now) === 4;
  const week = isoWeekKey(now);
  const likeBucket = Math.floor(now.getTime() / (3 * DAY_MS));

  for (const m of members) {
    const age = now.getTime() - m.createdAt.getTime();
    const idle = now.getTime() - m.lastActiveAt.getTime();
    const newLikes = m.pendingLikes.filter((d) => d > m.lastActiveAt).length;
    const add = (kind: MemberEmailKind, dedupeKey: string, content: T.EmailContent) => {
      if (!settings.kinds[kind] || !allowed(m, kind) || m.sentKeys.has(dedupeKey)) return false;
      out.push({ userId: m.userId, kind, dedupeKey, to: m.email, content, unsubscribeScope: PREF_KEY[kind] });
      return true;
    };

    // One email per member per sweep, most valuable first.
    if (newLikes > 0 && idle > 2 * DAY_MS) {
      if (add("likes_waiting", `likes:${likeBucket}`, T.likesWaitingEmail(ctxFor(m, "likes_waiting"), { count: newLikes, href: `${o}/matches` }))) continue;
    }
    if (age > 10 * 60_000 && age < 3 * DAY_MS) {
      const step = nextStep(m);
      const evs = ctx.eventsByCity.get((m.city ?? "harare").toLowerCase()) ?? [];
      if (add("welcome", "welcome", T.welcomeEmail(ctxFor(m, "welcome"), { nextStepHref: step.href, nextStepLabel: step.label, eventsThisWeek: evs.length, city: m.city }))) continue;
    }
    if (age > 20 * HOUR_MS && age < 7 * DAY_MS) {
      const steps = profileSteps(m);
      if (steps.length > 0) {
        if (add("finish_profile", "finish_profile", T.finishProfileEmail(ctxFor(m, "finish_profile"), {
          steps,
          rewardLine: "Finish your first-day checklist in the app and you'll also unlock 5 free profile looks.",
        }))) continue;
      }
    }
    const newPeople = ctx.newPeopleByCity.get((m.city ?? "harare").toLowerCase()) ?? 0;
    for (const days of [21, 7]) {
      if (idle >= days * DAY_MS && idle < (days + 2) * DAY_MS) {
        const ev = eventItems(ctx, m, 1)[0] ?? null;
        if (m.pendingLikes.length > 0 || newPeople > 0 || ev) {
          if (add("win_back", `win_back:${days}:${m.lastActiveAt.toISOString().slice(0, 10)}`, T.winBackEmail(ctxFor(m, "win_back"), {
            daysAway: days, newPeople, likesWaiting: m.pendingLikes.length, nextEvent: ev, href: `${o}/discover`,
          }))) break;
        }
      }
    }
    if (out.length && out[out.length - 1].userId === m.userId) continue;
    if (isThursday && age > 3 * DAY_MS) {
      const evs = eventItems(ctx, m, 3);
      if (evs.length > 0 || newPeople > 0 || m.pendingLikes.length > 0) {
        add("weekly_digest", `digest:${week}`, T.digestEmail(ctxFor(m, "weekly_digest"), {
          city: m.city, newPeople, events: evs, likesWaiting: m.pendingLikes.length,
          eventsHref: `${o}/events`, discoverHref: `${o}/discover`,
        }));
      }
    }
  }

  const priority: Record<MemberEmailKind, number> = { likes_waiting: 0, welcome: 1, finish_profile: 2, win_back: 3, weekly_digest: 4 };
  return out.sort((a, b) => priority[a.kind] - priority[b.kind]);
}

// ── delivery ───────────────────────────────────────────────────────

function deliveryBlockedReason(to: string): string | null {
  if (!resendConfigured()) return "RESEND_API_KEY not set — not delivered";
  if (process.env.NODE_ENV !== "production") {
    const allow = (process.env.MEMBER_EMAIL_DEV_ALLOW ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!allow.includes(to.toLowerCase())) return "non-production: recipient not on MEMBER_EMAIL_DEV_ALLOW — not delivered";
  }
  return null;
}

async function deliver(p: PlannedEmail): Promise<"sent" | "failed" | "logged" | "duplicate"> {
  // Claim the dedupe key first so two sweeps (or two instances) can never
  // both send the same email.
  const [claimed] = await db
    .insert(memberEmailLog)
    .values({ userId: p.userId, kind: p.kind, dedupeKey: p.dedupeKey, recipient: p.to, subject: p.content.subject, status: "pending" })
    .onConflictDoNothing()
    .returning({ id: memberEmailLog.id });
  if (!claimed) return "duplicate";

  const blocked = deliveryBlockedReason(p.to);
  if (blocked) {
    await db.update(memberEmailLog).set({ status: "logged", error: blocked }).where(eq(memberEmailLog.id, claimed.id));
    return "logged";
  }
  const unsub = unsubscribeUrl(p.userId, p.unsubscribeScope);
  const r = await sendViaResend({
    to: p.to,
    subject: p.content.subject,
    text: p.content.text,
    html: p.content.html,
    from: process.env.EMAIL_FROM_MEMBERS || process.env.EMAIL_FROM || undefined,
    headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
  if (r.ok) {
    await db.update(memberEmailLog).set({ status: "sent", providerMessageId: r.providerMessageId }).where(eq(memberEmailLog.id, claimed.id));
    return "sent";
  }
  await db.update(memberEmailLog).set({ status: "failed", error: r.error.slice(0, 500) }).where(eq(memberEmailLog.id, claimed.id));
  return "failed";
}

async function sentToday(now: Date): Promise<number> {
  const start = new Date(now.getTime() - 24 * HOUR_MS);
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(memberEmailLog)
    .where(and(gte(memberEmailLog.createdAt, start), inArray(memberEmailLog.status, ["sent", "pending"])));
  return Number(row?.n ?? 0);
}

/** The periodic job. Returns counts for the log line. Does nothing unless an
 *  admin has switched member email to live, and only in Harare daytime. */
export async function runMemberEmailSweep(now = new Date(), opts: { ignoreQuietHours?: boolean } = {}) {
  const settings = await getMemberEmailSettings();
  if (settings.mode !== "live") return { skipped: "mode off" as const };
  const hour = harareHour(now);
  if (!opts.ignoreQuietHours && (hour < 8 || hour >= 20)) return { skipped: "quiet hours" as const };

  const budget = settings.dailyCap - (await sentToday(now));
  if (budget <= 0) return { skipped: "daily cap reached" as const };

  const [members, ctx] = await Promise.all([loadMembers(), loadWeekContext(now)]);
  const planned = plan(members, ctx, settings, now).slice(0, budget);
  const counts: Record<string, number> = {};
  for (const p of planned) {
    const outcome = await deliver(p);
    counts[`${p.kind}:${outcome}`] = (counts[`${p.kind}:${outcome}`] ?? 0) + 1;
  }
  return { counts };
}

/** What the sweep WOULD send right now, without sending or logging anything. */
export async function dryRun(now = new Date()) {
  const settings = await getMemberEmailSettings();
  const [members, ctx] = await Promise.all([loadMembers(), loadWeekContext(now)]);
  const planned = plan(members, ctx, { ...settings, mode: "live" }, now);
  const byKind: Record<string, number> = {};
  for (const p of planned) byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
  return {
    total: planned.length,
    byKind,
    wouldSendToday: Math.min(planned.length, Math.max(0, settings.dailyCap - (await sentToday(now)))),
    sample: planned.slice(0, 25).map((p) => ({ kind: p.kind, to: maskEmail(p.to), subject: p.content.subject })),
    eligibleMembers: members.length,
  };
}

export function maskEmail(e: string): string {
  const [user, domain] = e.split("@");
  if (!domain) return "•••";
  return `${user.slice(0, 2)}${"•".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

/** Renders one kind for a specific member (by user id), with sample data
 *  where the member has none, so an admin can see exactly what it looks like. */
export async function previewFor(userId: string, kind: MemberEmailKind, now = new Date()): Promise<T.EmailContent | null> {
  const [members, ctx] = await Promise.all([loadMembers(), loadWeekContext(now)]);
  const m = members.find((x) => x.userId === userId);
  if (!m) return null;
  const o = appOrigin();
  const c = ctxFor(m, kind);
  const evs = eventItems(ctx, m, 3);
  const newPeople = ctx.newPeopleByCity.get((m.city ?? "harare").toLowerCase()) ?? 0;
  switch (kind) {
    case "welcome": {
      const s = nextStep(m);
      return T.welcomeEmail(c, { nextStepHref: s.href, nextStepLabel: s.label, eventsThisWeek: (ctx.eventsByCity.get((m.city ?? "harare").toLowerCase()) ?? []).length, city: m.city });
    }
    case "finish_profile": {
      const steps = profileSteps(m);
      return T.finishProfileEmail(c, {
        steps: steps.length ? steps : [{ title: "Add a photo", detail: "People say yes to a face.", href: `${o}/photos` }],
        rewardLine: "Finish your first-day checklist in the app and you'll also unlock 5 free profile looks.",
      });
    }
    case "likes_waiting":
      return T.likesWaitingEmail(c, { count: Math.max(1, m.pendingLikes.length), href: `${o}/matches` });
    case "weekly_digest":
      return T.digestEmail(c, { city: m.city, newPeople, events: evs, likesWaiting: m.pendingLikes.length, eventsHref: `${o}/events`, discoverHref: `${o}/discover` });
    case "win_back":
      return T.winBackEmail(c, { daysAway: 7, newPeople, likesWaiting: m.pendingLikes.length, nextEvent: evs[0] ?? null, href: `${o}/discover` });
  }
}

/** Sends one rendered kind to an admin's own inbox, regardless of mode. */
export async function sendTest(userId: string, kind: MemberEmailKind, to: string) {
  const content = await previewFor(userId, kind);
  if (!content) return { ok: false as const, error: "No member record for your account to render from" };
  if (!resendConfigured()) return { ok: false as const, error: "Email isn't connected on this server (RESEND_API_KEY not set)" };
  const r = await sendViaResend({
    to,
    subject: `[Test] ${content.subject}`,
    text: content.text,
    html: content.html,
    from: process.env.EMAIL_FROM_MEMBERS || process.env.EMAIL_FROM || undefined,
  });
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
}

export async function recentLog(limit = 50) {
  const rows = await db.select().from(memberEmailLog).orderBy(desc(memberEmailLog.createdAt)).limit(limit);
  return rows.map((r) => ({ ...r, recipient: maskEmail(r.recipient) }));
}

export async function stats(days = 7) {
  const since = new Date(Date.now() - days * DAY_MS);
  const rows = await db
    .select({ kind: memberEmailLog.kind, status: memberEmailLog.status, n: sql<number>`count(*)` })
    .from(memberEmailLog)
    .where(gte(memberEmailLog.createdAt, since))
    .groupBy(memberEmailLog.kind, memberEmailLog.status);
  return rows.map((r) => ({ kind: r.kind, status: r.status, count: Number(r.n) }));
}
