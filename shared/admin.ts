// Admin console vocabulary — roles, report/feedback taxonomy, moderation action
// types. No platform "admin" exists anywhere else in the schema; this is the
// entire surface of it. See server/admin/ for enforcement.

export const ADMIN_ROLES = ["read_only", "support", "admin", "owner"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export function adminRoleRank(r: string): number {
  const i = (ADMIN_ROLES as readonly string[]).indexOf(r);
  return i < 0 ? -1 : i;
}

export function meetsAdminRole(have: string, need: AdminRole): boolean {
  return adminRoleRank(have) >= adminRoleRank(need);
}

// ── reports ──────────────────────────────────────────────────────────────
export const REPORT_CATEGORIES = [
  "spam",
  "harassment",
  "fake_profile",
  "inappropriate_content",
  "scam_or_financial",
  "underage_concern",
  "safety_escalation", // real-world danger / threat / self-harm — see server/admin/reports.ts
  "other",
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

// Categories that page an admin immediately regardless of alert config, and
// are pinned above the normal oldest-first queue order.
export const SAFETY_CATEGORIES: readonly ReportCategory[] = ["safety_escalation", "underage_concern"];

export const REPORT_STATUSES = ["open", "investigating", "actioned", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_CATEGORY_LABEL: Record<ReportCategory, string> = {
  spam: "Spam",
  harassment: "Harassment",
  fake_profile: "Fake profile",
  inappropriate_content: "Inappropriate content",
  scam_or_financial: "Scam / financial",
  underage_concern: "Underage concern",
  safety_escalation: "Safety escalation",
  other: "Other",
};

// ── moderation actions ──────────────────────────────────────────────────
export const MODERATION_ACTION_TYPES = [
  "warn",
  "suspend",
  "ban",
  "remove_photo",
  "remove_message",
  "unpublish_event",
  "dismiss_report",
] as const;
export type ModerationActionType = (typeof MODERATION_ACTION_TYPES)[number];

// What each action tells the reported user and the reporter, and when. Shown
// in the console before an admin confirms, so the consequence is never a
// surprise to the admin either.
export const MODERATION_ACTION_COPY: Record<
  ModerationActionType,
  { label: string; targetNotice: string | null; reporterNotice: string | null }
> = {
  warn: {
    label: "Warn",
    targetNotice: "You've received a warning about your account. Repeat issues can lead to suspension.",
    reporterNotice: "We looked into your report and took action.",
  },
  suspend: {
    label: "Suspend",
    targetNotice: "Your account has been temporarily suspended.",
    reporterNotice: "We looked into your report and took action.",
  },
  ban: {
    label: "Ban",
    targetNotice: "Your account has been permanently removed for violating our terms.",
    reporterNotice: "We looked into your report and took action.",
  },
  remove_photo: {
    label: "Remove photo",
    targetNotice: "One of your photos was removed for violating our guidelines.",
    reporterNotice: "We removed the content you reported.",
  },
  remove_message: {
    label: "Remove message",
    targetNotice: "A message you sent was removed for violating our guidelines.",
    reporterNotice: "We removed the content you reported.",
  },
  unpublish_event: {
    label: "Unpublish event",
    targetNotice: "Your event was unpublished for violating our guidelines.",
    reporterNotice: "We removed the content you reported.",
  },
  dismiss_report: {
    label: "Dismiss (no action)",
    targetNotice: null,
    reporterNotice: "We looked into your report and didn't find a violation.",
  },
};

// ── feedback ─────────────────────────────────────────────────────────────
export const FEEDBACK_CATEGORIES = ["bug", "idea", "confusing", "praise", "other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export const FEEDBACK_STATUSES = ["open", "reviewed"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  bug: "Something's broken",
  idea: "An idea",
  confusing: "Something's confusing",
  praise: "Just saying thanks",
  other: "Other",
};

// ── team / roles ─────────────────────────────────────────────────────────
// One line each — this is what a "what does granting X actually give them"
// check reads, on the Team page, instead of the source.
export const ADMIN_ROLE_REFERENCE: Record<AdminRole, string> = {
  read_only:
    "Can view Overview, Reports, Feedback, Metrics and Email alert config. Sees report-scoped personal data (a reporter's and subject's cited evidence) same as every other role — there's no lower tier that hides it.",
  support: "Everything read_only sees, plus can action reports and feedback: warn, suspend, ban, dismiss, remove content, mark feedback reviewed.",
  admin: "Everything support can do, plus edit email alert config, recompute metrics, invite/suspend/remove admins at or below their own role.",
  owner: "Everything admin can do, plus grant or change the owner role itself, and act on other owners. At least one owner always exists — the last one can't be demoted, suspended or removed.",
};

export const ADMIN_STATUSES = ["active", "suspended", "removed"] as const;
export type AdminStatus = (typeof ADMIN_STATUSES)[number];
