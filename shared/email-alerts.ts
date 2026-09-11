// Operational alert vocabulary — shared between the sender (server/email/)
// and the admin config screen. Plain, specific, operational mail: no
// marketing styling, no member PII (user ids + a console link only).

export interface AlertMeta {
  label: string;
  /** Can the admin turn this off / set a threshold? Safety-critical types
   *  can't — they always fire regardless of email_alert_config. */
  configurable: boolean;
  /** Collapse repeats within this window into one email with a count,
   *  instead of one per event. 0 = never dedup (always send). */
  dedupWindowMs: number;
  hasThreshold: boolean;
}

export const ALERT_TYPES = [
  "payment_success",
  "payment_failed",
  "payment_stuck",
  "report_filed",
  "report_safety_escalation",
  "gateway_unreachable",
  "webhook_signature_failure",
  "admin_lockout",
  "error_rate_threshold",
  "llm_cost_threshold",
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_META: Record<AlertType, AlertMeta> = {
  payment_success: { label: "Successful payment", configurable: true, dedupWindowMs: 0, hasThreshold: false },
  payment_failed: { label: "Failed payment", configurable: true, dedupWindowMs: 0, hasThreshold: false },
  payment_stuck: { label: "Payment taken, webhook never confirmed", configurable: true, dedupWindowMs: 0, hasThreshold: false },
  report_filed: { label: "New report filed", configurable: true, dedupWindowMs: 15 * 60 * 1000, hasThreshold: false },
  report_safety_escalation: { label: "Safety-escalation report", configurable: false, dedupWindowMs: 0, hasThreshold: false },
  gateway_unreachable: { label: "Payment gateway unreachable", configurable: true, dedupWindowMs: 15 * 60 * 1000, hasThreshold: false },
  webhook_signature_failure: { label: "Webhook signature failure", configurable: true, dedupWindowMs: 15 * 60 * 1000, hasThreshold: false },
  admin_lockout: { label: "Admin login lockout", configurable: true, dedupWindowMs: 15 * 60 * 1000, hasThreshold: false },
  error_rate_threshold: { label: "Error rate above threshold", configurable: true, dedupWindowMs: 30 * 60 * 1000, hasThreshold: true },
  llm_cost_threshold: { label: "LLM spend above threshold", configurable: true, dedupWindowMs: 6 * 60 * 60 * 1000, hasThreshold: true },
};

// Scheduled digests — same email_alert_config table, own small meta map
// (no dedup window; they're already on a schedule).
export const DIGEST_TYPES = ["daily_digest", "weekly_digest"] as const;
export type DigestType = (typeof DIGEST_TYPES)[number];
export const DIGEST_META: Record<DigestType, { label: string }> = {
  daily_digest: { label: "Daily digest" },
  weekly_digest: { label: "Weekly digest" },
};
