// Resend HTTP API — no SDK needed, it's one POST. Recommended over
// Postmark/SES for this use case: generous free tier, simplest DNS setup
// flow, and this mail goes to the operator's own inbox (not members), so the
// "Africa deliverability" question is about the SENDING domain's reputation,
// not the receiving region.
//
// Needs, once destira.date's DNS is connected (see LOCAL_DEV.md):
//   SPF   TXT  @                    v=spf1 include:_spf.resend.com ~all
//   DKIM  CNAME (Resend gives exact records when you add the domain)
//   DMARC TXT  _dmarc               v=DMARC1; p=none; rua=mailto:you@...
// Start DMARC at p=none (monitor only) and tighten to quarantine/reject once
// the test-send button confirms delivery.

const RESEND_API = "https://api.resend.com/emails";

export function resendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendViaResend(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: true; providerMessageId: string } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Destira Ops <onboarding@resend.dev>";
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not set — email is a no-op until the domain is connected" };
  }
  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, text: opts.text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: body?.message || `Resend ${res.status}` };
    }
    return { ok: true, providerMessageId: body?.id || "" };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}
