// The one place that decides whether an alert email actually gets sent:
// config lookup, dedup/rate-limit, the log write, and the safety-escalation
// override that can't be silenced by misconfiguration.
import { db } from "../db";
import { emailAlertConfig, emailLog, adminUsers, users } from "@shared/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { sendViaResend, resendConfigured } from "./resend";
import { ALERT_META, type AlertType } from "@shared/email-alerts";

// In-memory dedup — same shape as the login-attempt limiters elsewhere in
// this codebase. A flapping gateway collapses to one email per window with a
// count, not one per failure. Resets on restart, which is fine: the worst
// case is one extra email right after a deploy, never silence.
const pending = new Map<AlertType, { firstAt: number; count: number; lastSubject: string; lastText: string }>();

function baseUrl(): string {
  return process.env.PUBLIC_APP_URL || "http://localhost:5000";
}

async function getConfig(type: AlertType) {
  const [row] = await db.select().from(emailAlertConfig).where(eq(emailAlertConfig.alertType, type));
  if (row) return row;
  // First touch: seed a blank row so the console always has something to
  // show and edit. Blank, not pre-filled — every alert type inherits the
  // one default recipient (below) unless someone sets an override, so a
  // freshly-seeded row isn't secretly missing delivery.
  const [created] = await db
    .insert(emailAlertConfig)
    .values({ alertType: type, enabled: true, recipientEmail: "" })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [row2] = await db.select().from(emailAlertConfig).where(eq(emailAlertConfig.alertType, type));
  return row2;
}

// The default recipient every alert type inherits unless it has its own
// override. Stored as a sentinel row in the same table (an unconstrained
// text key, like everything else here) rather than a new table for one
// value. Excluded from /api/admin/email/config's listing by callers, since
// it isn't an alert type.
export const DEFAULT_RECIPIENT_KEY = "__default_recipient__";

export async function getDefaultRecipient(): Promise<string> {
  const [row] = await db.select().from(emailAlertConfig).where(eq(emailAlertConfig.alertType, DEFAULT_RECIPIENT_KEY));
  return row?.recipientEmail || process.env.ADMIN_ALERT_EMAIL || "";
}

export async function setDefaultRecipient(recipientEmail: string, updatedBy: string): Promise<void> {
  await db
    .insert(emailAlertConfig)
    .values({ alertType: DEFAULT_RECIPIENT_KEY, enabled: true, recipientEmail, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({ target: emailAlertConfig.alertType, set: { recipientEmail, updatedBy, updatedAt: new Date() } });
}

/** Every admin (support role and above) account email, for alerts that must
 *  reach a human regardless of the configured recipient — safety escalation. */
async function allAdminEmails(minRank: number): Promise<string[]> {
  const rows = await db
    .select({ role: adminUsers.role, email: users.email })
    .from(adminUsers)
    .innerJoin(users, eq(adminUsers.userId, users.id))
    .where(isNull(adminUsers.revokedAt));
  const { adminRoleRank } = await import("@shared/admin");
  return rows.filter((r) => adminRoleRank(r.role) >= minRank && r.email).map((r) => r.email!) as string[];
}

async function writeLog(type: string, recipient: string, status: "sent" | "failed" | "skipped", providerMessageId?: string, error?: string) {
  try {
    await db.insert(emailLog).values({ type, recipient, status, providerMessageId: providerMessageId ?? null, error: error ?? null });
  } catch (e) {
    console.error("[email] failed to write email_log:", e);
  }
}

async function deliver(recipient: string, subject: string, text: string, type: string) {
  if (!recipient) {
    await writeLog(type, "(none configured)", "skipped", undefined, "No recipient configured");
    console.warn(`[email] SKIPPED ${type} — no recipient configured in the console`);
    return;
  }
  if (!resendConfigured()) {
    await writeLog(type, recipient, "skipped", undefined, "RESEND_API_KEY not set");
    console.log(`[email] (no-op, no RESEND_API_KEY) would send "${subject}" to ${recipient}`);
    return;
  }
  const r = await sendViaResend({ to: recipient, subject, text });
  if (r.ok) {
    await writeLog(type, recipient, "sent", r.providerMessageId);
  } else {
    await writeLog(type, recipient, "failed", undefined, r.error);
    console.error(`[email] FAILED to send ${type} to ${recipient}: ${r.error}`);
  }
}

/** Fire an operational alert. Plain text, a console link, no member PII —
 *  callers build `text` from ids only, never names/content/full phone
 *  numbers. Dedup-window types collapse repeats into one email with a count. */
export async function sendAlert(type: AlertType, subject: string, text: string, opts: { consolePath?: string } = {}) {
  const meta = ALERT_META[type];
  const fullText = opts.consolePath ? `${text}\n\n${baseUrl()}${opts.consolePath}` : text;

  // Safety escalation ignores config entirely — every admin (support+) gets
  // it, always, dedup or not.
  if (type === "report_safety_escalation") {
    const emails = await allAdminEmails(1); // support rank
    await Promise.all(emails.map((e) => deliver(e, subject, fullText, type)));
    return;
  }

  const cfg = await getConfig(type);
  if (meta.configurable && cfg && !cfg.enabled) {
    await writeLog(type, cfg.recipientEmail || "", "skipped", undefined, "Alert type disabled in console");
    return;
  }
  const recipient = cfg?.recipientEmail || (await getDefaultRecipient());

  if (meta.dedupWindowMs > 0) {
    const now = Date.now();
    const p = pending.get(type);
    if (p && now - p.firstAt < meta.dedupWindowMs) {
      p.count += 1;
      p.lastSubject = subject;
      p.lastText = fullText;
      return; // folded into the next send when the window elapses
    }
    pending.set(type, { firstAt: now, count: 1, lastSubject: subject, lastText: fullText });
    setTimeout(async () => {
      const entry = pending.get(type);
      pending.delete(type);
      if (!entry) return;
      const suffix = entry.count > 1 ? `\n\n(${entry.count} of these in the last ${Math.round(meta.dedupWindowMs / 60000)} min — showing the latest.)` : "";
      await deliver(recipient, entry.lastSubject, entry.lastText + suffix, type);
    }, meta.dedupWindowMs);
    return;
  }

  await deliver(recipient, subject, fullText, type);
}

/** For the daily/weekly digest — a scheduled send, not an event-triggered
 *  alert, so no dedup/safety-override logic applies. Uses the same
 *  email_alert_config table (keyed by "daily_digest" / "weekly_digest") so
 *  it's editable from the same console screen with no separate UI. */
export async function sendConfiguredEmail(type: string, subject: string, text: string): Promise<void> {
  const [row] = await db.select().from(emailAlertConfig).where(eq(emailAlertConfig.alertType, type));
  if (row && !row.enabled) {
    await writeLog(type, row.recipientEmail || "", "skipped", undefined, "Disabled in console");
    return;
  }
  const recipient = row?.recipientEmail || (await getDefaultRecipient());
  await deliver(recipient, subject, text, type);
}

export async function testSend(type: AlertType, recipientOverride?: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getConfig(type);
  const recipient = recipientOverride || cfg?.recipientEmail || (await getDefaultRecipient());
  if (!recipient) {
    await writeLog(`test:${type}`, "(none)", "skipped", undefined, "No recipient set");
    return { ok: false, error: "No recipient set" };
  }
  if (!resendConfigured()) {
    await writeLog(`test:${type}`, recipient, "skipped", undefined, "RESEND_API_KEY not set");
    return { ok: false, error: "RESEND_API_KEY not set" };
  }
  const r = await sendViaResend({
    to: recipient,
    subject: `[test] ${ALERT_META[type].label}`,
    text: `This is a test send for the "${ALERT_META[type].label}" alert from the Destira admin console. If you got this, delivery works.`,
  });
  await writeLog(`test:${type}`, recipient, r.ok ? "sent" : "failed", r.ok ? r.providerMessageId : undefined, r.ok ? undefined : r.error);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export { ALERT_TYPES, ALERT_META } from "@shared/email-alerts";
export type { AlertType } from "@shared/email-alerts";
