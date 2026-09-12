// Plain, specific, operational. No marketing styling, no logo, no "Hi
// there!", no member PII — user ids and a console link only.
import { sendAlert } from "./index";
import { priceLabel } from "@shared/entitlements";

export async function alertPaymentSuccess(p: {
  userId: string;
  tier: string;
  amountCents: number;
  method: string;
  phoneMasked: string | null;
}) {
  await sendAlert(
    "payment_success",
    `Payment: ${p.tier} ${priceLabel(p.amountCents)} via ${p.method}`,
    `User ${p.userId} paid ${priceLabel(p.amountCents)} for ${p.tier} via ${p.method}.` +
      (p.phoneMasked ? ` Phone: ${p.phoneMasked}.` : ""),
  );
}

export async function alertPaymentFailed(p: { userId: string; tier: string; amountCents: number; method: string; reason: string | null }) {
  await sendAlert(
    "payment_failed",
    `Payment failed: ${p.tier} via ${p.method}`,
    `User ${p.userId} — ${priceLabel(p.amountCents)} for ${p.tier} via ${p.method} failed.` +
      (p.reason ? ` Reason: ${p.reason}` : " No reason given by the gateway."),
    { consolePath: "/console" },
  );
}

/** The page-me one: money was taken but the webhook never confirmed it. */
export async function alertPaymentStuck(p: { paymentId: number; userId: string; tier: string; amountCents: number; minutesStuck: number }) {
  await sendAlert(
    "payment_stuck",
    `STUCK: payment #${p.paymentId} — webhook never confirmed`,
    `User ${p.userId} started paying ${priceLabel(p.amountCents)} for ${p.tier} (${p.minutesStuck} min ago) and the gateway never confirmed it. ` +
      `They may have paid and gotten nothing. Check payment #${p.paymentId} now.`,
    { consolePath: "/console" },
  );
}

export async function alertReportFiled(p: { reportId: number; category: string; isSafety: boolean }) {
  const type = p.isSafety ? "report_safety_escalation" : "report_filed";
  await sendAlert(
    type,
    p.isSafety ? `SAFETY report #${p.reportId} filed` : `New report #${p.reportId} (${p.category})`,
    p.isSafety
      ? `A report categorised as a safety escalation was just filed. Open it now — this is not a queue item to triage later.`
      : `A new ${p.category} report was filed.`,
    { consolePath: `/console/reports/${p.reportId}` },
  );
}

export async function alertGatewayUnreachable(p: { provider: string; error: string }) {
  await sendAlert("gateway_unreachable", `Payment gateway unreachable: ${p.provider}`, `${p.provider}: ${p.error}`, { consolePath: "/console" });
}

export async function alertWebhookSignatureFailure(p: { provider: string }) {
  await sendAlert(
    "webhook_signature_failure",
    `Webhook signature failure: ${p.provider}`,
    `A webhook from ${p.provider} failed signature verification and was rejected. If this keeps happening, the gateway's webhook secret may have changed.`,
    { consolePath: "/console" },
  );
}

export async function alertAdminLockout(p: { email: string; attempts: number }) {
  await sendAlert(
    "admin_lockout",
    `Admin login locked out (${p.attempts} attempts)`,
    `${p.attempts} failed login attempts for an admin account and it's now locked out for 15 minutes. If this wasn't you, treat it as a possible credential-stuffing attempt.`,
  );
}
