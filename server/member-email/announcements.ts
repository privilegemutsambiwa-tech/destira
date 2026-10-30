// Announcements: a one-off email an admin writes in the console (news, a new
// feature, "the Android app is out") and sends to every member who hasn't
// turned off "News and updates". Sending goes through the same rails as the
// lifecycle emails (index.ts): one per member (the log's dedupe key), only
// 8am to 8pm Harare time, and within the shared daily limit, so a big list
// goes out over several days. Lifecycle emails get the day's budget first.
//
// Announcements live in app_settings (no table of their own): a short list,
// newest first. Progress is counted from member_email_log.
import { db } from "../db";
import { appSettings, memberEmailLog } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";
import { resendConfigured, sendViaResend } from "../email/resend";
import * as T from "./templates";
import {
  appOrigin, deliver, getMemberEmailSettings, harareHour, loadMembers, sentToday, unsubscribeUrl, type Member,
} from "./index";

const SETTINGS_KEY = "announcements";
const PREF = "email_news";
const UNSUB_LABEL = "news and updates";

export interface AnnouncementDraft {
  subject: string;
  heading: string;
  body: string;
  buttonLabel?: string;
  buttonUrl?: string;
}
export interface Announcement extends AnnouncementDraft {
  id: string;
  status: "sending" | "done" | "cancelled";
  /** Members it was going to at the start (later sign-ups aren't included). */
  audience: number;
  createdAt: string;
  createdBy: string;
  finishedAt?: string;
}

/** Cleans a draft from the console; an error message if it can't be sent. */
export function validateDraft(raw: any): { draft: AnnouncementDraft } | { error: string } {
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const draft: AnnouncementDraft = {
    subject: str(raw?.subject, 150),
    heading: str(raw?.heading, 150),
    body: typeof raw?.body === "string" ? raw.body.replace(/\r\n/g, "\n").trim().slice(0, 5000) : "",
    buttonLabel: str(raw?.buttonLabel, 40),
    buttonUrl: str(raw?.buttonUrl, 500),
  };
  if (draft.subject.length < 3) return { error: "Add a subject line" };
  if (!draft.heading) draft.heading = draft.subject;
  if (draft.body.length < 10) return { error: "Write the message (at least a sentence)" };
  if (!!draft.buttonLabel !== !!draft.buttonUrl) return { error: "A button needs both a label and a link" };
  if (draft.buttonUrl && !/^(https:\/\/|\/)/.test(draft.buttonUrl)) return { error: "The button link must start with https:// or /" };
  return { draft };
}

function buttonOf(d: AnnouncementDraft) {
  if (!d.buttonLabel || !d.buttonUrl) return null;
  return { label: d.buttonLabel, href: d.buttonUrl.startsWith("/") ? `${appOrigin()}${d.buttonUrl}` : d.buttonUrl };
}

export function render(d: AnnouncementDraft, m: { userId: string; firstName: string }): T.EmailContent {
  return T.announcementEmail(
    { origin: appOrigin(), firstName: m.firstName, unsubscribeUrl: unsubscribeUrl(m.userId, PREF), unsubscribeLabel: UNSUB_LABEL },
    { subject: d.subject, heading: d.heading, body: d.body, button: buttonOf(d) },
  );
}

const wantsNews = (m: Member) => m.prefs.email_all !== false && m.prefs[PREF] !== false;
const dedupeKey = (id: string) => `announce:${id}`;

async function list(): Promise<Announcement[]> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, SETTINGS_KEY));
  const items = (row?.value as { items?: Announcement[] } | undefined)?.items;
  return Array.isArray(items) ? items : [];
}
async function save(items: Announcement[], by: string | null) {
  const value = { items: items.slice(0, 50) };
  await db
    .insert(appSettings)
    .values({ key: SETTINGS_KEY, value, updatedBy: by, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: by, updatedAt: new Date() } });
}

/** Members who would get an announcement started now. */
export async function audienceSize(): Promise<number> {
  return (await loadMembers()).filter(wantsNews).length;
}

export async function listWithProgress() {
  const items = await list();
  const counts = await db
    .select({ key: memberEmailLog.dedupeKey, status: memberEmailLog.status, n: sql<number>`count(*)` })
    .from(memberEmailLog)
    .where(eq(memberEmailLog.kind, "announcement"))
    .groupBy(memberEmailLog.dedupeKey, memberEmailLog.status);
  return items.map((a) => {
    const mine = counts.filter((c) => c.key === dedupeKey(a.id));
    const n = (s: string) => mine.filter((c) => c.status === s).reduce((t, c) => t + Number(c.n), 0);
    return { ...a, sent: n("sent"), failed: n("failed"), logged: n("logged") };
  });
}

export async function startAnnouncement(d: AnnouncementDraft, adminUserId: string): Promise<Announcement> {
  const items = await list();
  const a: Announcement = {
    ...d,
    id: Date.now().toString(36),
    status: "sending",
    audience: await audienceSize(),
    createdAt: new Date().toISOString(),
    createdBy: adminUserId,
  };
  await save([a, ...items], adminUserId);
  return a;
}

export async function cancelAnnouncement(id: string, adminUserId: string): Promise<boolean> {
  const items = await list();
  const a = items.find((x) => x.id === id);
  if (!a || a.status !== "sending") return false;
  a.status = "cancelled";
  a.finishedAt = new Date().toISOString();
  await save(items, adminUserId);
  return true;
}

/** Sends a draft to one address (the admin's own inbox), marked [Test]. */
export async function sendAnnouncementTest(d: AnnouncementDraft, me: { userId: string; firstName: string }, to: string) {
  if (!resendConfigured()) return { ok: false as const, error: "Email isn't connected on this server (RESEND_API_KEY not set)" };
  const c = render(d, me);
  const r = await sendViaResend({
    to,
    subject: `[Test] ${c.subject}`,
    text: c.text,
    html: c.html,
    from: process.env.EMAIL_FROM_MEMBERS || process.env.EMAIL_FROM || undefined,
  });
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
}

/** Part of the periodic sweep, after the lifecycle emails: sends the oldest
 *  announcement still going out to as many members as today's limit allows. */
export async function runAnnouncementSweep(now = new Date(), opts: { ignoreQuietHours?: boolean } = {}) {
  const items = await list();
  const current = items.filter((a) => a.status === "sending").pop();
  if (!current) return { skipped: "nothing to send" as const };
  // Without a provider every send would be logged as not delivered, and
  // those members would then be skipped for good. Wait instead.
  if (!resendConfigured() && process.env.NODE_ENV === "production") return { skipped: "email not connected" as const };
  const hour = harareHour(now);
  if (!opts.ignoreQuietHours && (hour < 8 || hour >= 20)) return { skipped: "quiet hours" as const };
  const settings = await getMemberEmailSettings();
  const budget = settings.dailyCap - (await sentToday(now));
  if (budget <= 0) return { skipped: "daily cap reached" as const };

  const startedAt = new Date(current.createdAt);
  const key = dedupeKey(current.id);
  const sentRows = await db
    .select({ userId: memberEmailLog.userId })
    .from(memberEmailLog)
    .where(and(eq(memberEmailLog.kind, "announcement"), eq(memberEmailLog.dedupeKey, key)));
  const done = new Set(sentRows.map((r) => r.userId));
  const remaining = (await loadMembers()).filter((m) => m.createdAt <= startedAt && wantsNews(m) && !done.has(m.userId));

  const counts: Record<string, number> = {};
  for (const m of remaining.slice(0, budget)) {
    // Cancelled from the console mid-batch: stop.
    if ((await list()).find((a) => a.id === current.id)?.status !== "sending") break;
    const outcome = await deliver({ userId: m.userId, kind: "announcement", dedupeKey: key, to: m.email, content: render(current, m), unsubscribeScope: PREF });
    counts[outcome] = (counts[outcome] ?? 0) + 1;
  }
  if (remaining.length <= budget) {
    const fresh = await list();
    const a = fresh.find((x) => x.id === current.id);
    if (a && a.status === "sending") {
      a.status = "done";
      a.finishedAt = new Date().toISOString();
      await save(fresh, null);
    }
  }
  return { id: current.id, counts, remaining: Math.max(0, remaining.length - budget) };
}
