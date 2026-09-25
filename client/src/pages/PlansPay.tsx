import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { PLAN_CARDS, BILLING_PERIODS, PERIOD_LABEL, priceLabel, periodPriceCents, type BillingPeriod } from "@shared/entitlements";
import {
  useInitiatePayment,
  usePaymentStatus,
  usePaymentsConfig,
  refreshPlanQueries,
  WALLET_PAY_METHODS,
  type PayMethod,
} from "@/hooks/use-payments";
import { getFromRoute, withFrom } from "@/lib/from-route";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";
const RESEND_AFTER_MS = 45_000;
const RENEWAL_WINDOW: Record<BillingPeriod, string> = { weekly: "a week", monthly: "a month", sixMonth: "six months" };

// EcoCash/OneMoney's subtitle depends on which gateway is actually live:
// Paynow pushes a USSD prompt straight to the phone, but NardoPay is a
// hosted redirect — the number and PIN are entered on NardoPay's own next
// screen, never a phone prompt from us. Wrong here is what confused the
// person who tested a real charge expecting a handset prompt that never came.
function methodsFor(walletHandledByNardoPay: boolean): { id: PayMethod; label: string; sub: string }[] {
  const walletSub = (walletName: string) =>
    walletHandledByNardoPay
      ? `Pay from your ${walletName} wallet. You'll finish this on ${walletName}'s own page.`
      : `Pay from your ${walletName} wallet. A prompt comes to your phone.`;
  return [
    { id: "ecocash", label: "EcoCash", sub: walletSub("EcoCash") },
    { id: "onemoney", label: "OneMoney", sub: walletSub("OneMoney") },
    { id: "innbucks", label: "InnBucks", sub: "Approve the payment in your InnBucks app." },
    { id: "ecocash_card", label: "EcoCash Visa card", sub: "Your EcoCash debit card." },
    { id: "card", label: "Another card", sub: "Visa, Mastercard, or Zimswitch." },
  ];
}

export default function PlansPay() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const qc = useQueryClient();
  const params = new URLSearchParams(search);
  const tierParam = params.get("tier");
  const returnRef = params.get("ref");
  const sourceFeature = params.get("feature") || undefined;
  // Forwarded from Plans.tsx (which forwarded it from whoever opened Plans
  // in the first place) — a hosted-checkout return trip loses it, since the
  // gateway's own redirect URL only round-trips `ref`; "/discover" is a
  // reasonable landing spot in that one case, not the whole-app default.
  const from = getFromRoute(search, "/discover");
  const periodParam = params.get("period");
  const period: BillingPeriod = (BILLING_PERIODS as readonly string[]).includes(periodParam as string)
    ? (periodParam as BillingPeriod)
    : "monthly";

  const [method, setMethod] = useState<PayMethod | null>(null);
  const [phone, setPhone] = useState("");
  const [paymentId, setPaymentId] = useState<number | null>(returnRef ? Number(returnRef) : null);
  const [startedAt, setStartedAt] = useState<number | null>(returnRef ? Date.now() : null);
  const [instructions, setInstructions] = useState<string | null>(null);
  const [authCode, setAuthCode] = useState<{ code: string; expires?: string; deepLink?: string } | null>(null);

  // A hosted-checkout return (Paynow's card page, NardoPay) only round-trips
  // `ref` — the gateway's own redirect URL never carries our `tier` query
  // param — so on that leg we fall back to the tier the server already has
  // on the payment row itself rather than showing a false "not here" dead end.
  const { data: status, isError: statusCheckFailing } = usePaymentStatus(paymentId, paymentId != null);
  const effectiveTierParam = tierParam || status?.tier || null;
  const card = useMemo(() => PLAN_CARDS.find((c) => c.tier === effectiveTierParam), [effectiveTierParam]);
  const tier = card?.tier as "spark" | "flame" | "ember" | undefined;
  const priceCents = tier ? periodPriceCents(tier, period) : 0;

  // Wouter keeps this component mounted across a /plans/pay navigation that
  // only changes the query string (e.g. picking a different plan after a
  // failed attempt), so the useState initializers above only run once and
  // never see the new URL. Without this, a stale paymentId from an earlier
  // failed/interrupted attempt keeps rendering the failed/waiting screen for
  // a plan the user hasn't even tried to pay for yet. Only a genuine return
  // callback (a `ref` in the new URL) is allowed to seed that state.
  useEffect(() => {
    if (!returnRef) {
      setPaymentId(null);
      setStartedAt(null);
      setInstructions(null);
      setAuthCode(null);
    }
  }, [search]);

  const initiate = useInitiatePayment();
  const { data: paymentsConfig } = usePaymentsConfig();
  // NardoPay's own hosted page collects the wallet number and lets the
  // subscriber pick EcoCash/OneMoney/InnBucks there — asking for it here too
  // would be a second, redundant prompt for a number we never actually use.
  const walletHandledByNardoPay = paymentsConfig?.walletProvider === "nardopay";
  const methods = methodsFor(walletHandledByNardoPay);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (status?.status === "paid") refreshPlanQueries(qc);
  }, [status?.status, qc]);

  if (!card || !tier) {
    // Returning from a hosted checkout redirect: we have the payment id but
    // haven't loaded its tier yet — show a brief wait, not a dead end.
    if (paymentId != null && status === undefined) {
      return (
        <Shell>
          <div className="flex items-center gap-2.5 text-[13px] text-vf-muted">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking your payment…
          </div>
        </Shell>
      );
    }
    return (
      <Shell>
        <p className="text-vf-muted text-[14px]">That plan isn't here.</p>
        <button onClick={() => setLocation(withFrom("/plans", from))} className="mt-3 text-[13px] text-vf-ember">Back to plans</button>
      </Shell>
    );
  }

  const pay = (opts?: { resend?: boolean }) => {
    setStartedAt(Date.now());
    const needsPhone = !!method && WALLET_PAY_METHODS.has(method) && !walletHandledByNardoPay;
    initiate.mutate(
      { tier, period, method: method!, phone: needsPhone ? phone : undefined, sourceFeature, resend: opts?.resend },
      {
        onSuccess: (r) => {
          setPaymentId(r.paymentId);
          setInstructions(r.instructions ?? null);
          setAuthCode(r.authorizationCode ? { code: r.authorizationCode, expires: r.authorizationExpires, deepLink: r.deepLink } : null);
          if (r.redirectUrl) {
            if (r.redirectUrl.startsWith("/")) setLocation(r.redirectUrl);
            else window.location.href = r.redirectUrl;
          }
        },
      },
    );
  };

  // ── confirmed ──
  if (status?.status === "paid") {
    const paidPeriod: BillingPeriod = (BILLING_PERIODS as readonly string[]).includes(status.period as string)
      ? (status.period as BillingPeriod)
      : period;
    const paidPriceCents = periodPriceCents(tier, paidPeriod);
    const isAutoRenewing = status.provider === "stripe";
    const renewalWindow = RENEWAL_WINDOW[paidPeriod];
    return (
      <Shell>
        <div className={EYEBROW}>Done</div>
        <h1 className="font-serif font-normal text-vf-text mt-3 text-[clamp(24px,7vw,30px)] leading-[1.1]">
          You're on {card.name}.
        </h1>
        <p className="text-[14px] text-vf-muted mt-3">
          {priceLabel(paidPriceCents)} / {PERIOD_LABEL[paidPeriod]}, in US dollars.{" "}
          {isAutoRenewing
            ? `Renews automatically in about ${renewalWindow} — cancel any time from Settings.`
            : `We'll remind you before it ends in about ${renewalWindow} — pay again to keep it going, cancel any time from Settings.`}
        </p>
        <div className="mt-5 rounded-[16px] border border-vf-line bg-vf-surface2 p-4">
          <div className={`${EYEBROW} mb-2`}>Live now</div>
          <ul className="flex flex-col gap-1.5 text-[13.5px] text-vf-soft">
            {card.gets.slice(0, 3).map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
        <button
          onClick={() => setLocation(from)}
          className="mt-6 h-11 px-6 rounded-full bg-vf-ember text-vf-ink font-semibold text-[14px] btn-press hover:bg-[var(--vf-ember-soft)] transition-colors"
          data-testid="button-into-app"
        >
          Into Destira
        </button>
      </Shell>
    );
  }

  // ── failed / expired / cancelled ──
  if (status && ["failed", "expired", "cancelled"].includes(status.status)) {
    return (
      <Shell>
        <div className={EYEBROW}>Not this time</div>
        <h1 className="font-serif font-normal text-vf-text mt-3 text-[26px] leading-[1.15]">
          {status.status === "expired" ? "The prompt expired." : "That didn't go through."}
        </h1>
        <p className="text-[14px] text-vf-muted mt-3">
          {status.failureReason || "The gateway didn't confirm the payment. Nothing was charged."}
        </p>
        <div className="flex gap-3 mt-6">
          <button
            onClick={() => { setPaymentId(null); setStartedAt(null); setInstructions(null); }}
            className="h-11 px-6 rounded-full bg-vf-ember text-vf-ink font-semibold text-[14px] btn-press hover:bg-[var(--vf-ember-soft)] transition-colors"
            data-testid="button-retry-pay"
          >
            Try again
          </button>
          <button onClick={() => setLocation(withFrom("/plans", from))} className="h-11 px-4 text-[13px] text-vf-muted hover:text-vf-text">
            Back to plans
          </button>
        </div>
      </Shell>
    );
  }

  // ── waiting for the handset ──
  if (paymentId != null && startedAt != null) {
    const waited = now - startedAt;
    const canResend = waited > RESEND_AFTER_MS;
    return (
      <Shell>
        <div className={EYEBROW}>{authCode ? "Approve in InnBucks" : "Check your phone"}</div>
        <h1 className="font-serif font-normal text-vf-text mt-3 text-[26px] leading-[1.15]">
          {authCode
            ? "Approve this code in your InnBucks app."
            : `Approve the prompt ${status?.phoneNumberMasked ? `on ${status.phoneNumberMasked}` : "on your handset"}.`}
        </h1>
        {authCode ? (
          <div className="mt-4">
            <div
              className="inline-flex items-center rounded-[12px] border border-vf-line bg-vf-surface2 px-4 py-2.5 font-mono text-[20px] tracking-[0.12em] text-vf-text"
              data-testid="text-innbucks-code"
            >
              {authCode.code}
            </div>
            {authCode.expires && (
              <p className="text-[12px] text-vf-faint mt-2">Expires {authCode.expires}.</p>
            )}
            {authCode.deepLink && (
              <a
                href={authCode.deepLink}
                className="mt-3 inline-flex h-10 px-4 items-center rounded-full border border-vf-line text-[13px] text-vf-text hover:border-vf-text/25 transition-colors"
                data-testid="link-open-innbucks"
              >
                Open InnBucks app
              </a>
            )}
          </div>
        ) : (
          <p className="text-[14px] text-vf-muted mt-3 leading-[1.6]">
            {instructions ||
              "Enter your PIN on the prompt your phone just got — we never see it. This can take a minute; keep this open."}
          </p>
        )}
        <div className="flex items-center gap-2.5 mt-6 text-[13px] text-vf-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          {statusCheckFailing ? "Having trouble checking — retrying…" : "Waiting for the gateway…"}
          {status?.rawStatus ? <span className="text-vf-faint">({status.rawStatus})</span> : null}
        </div>
        {statusCheckFailing && (
          // Distinct from the gateway genuinely still pending: this means
          // OUR status check is failing (network blip, session hiccup), not
          // that the payment itself hasn't gone through — telling them apart
          // avoids someone thinking their money is stuck when it's really
          // just our polling that's stuck.
          <p className="text-[12.5px] text-vf-faint mt-2 leading-[1.5]">
            This is just us checking in, not the payment — if you already approved it, it'll still go through.
          </p>
        )}

        {waited > RESEND_AFTER_MS * 1.6 && (
          <div className="mt-5 rounded-[14px] border border-vf-line bg-vf-surface2 p-3.5 text-[12.5px] text-vf-muted leading-[1.55]">
            Still nothing? If you approved it and this doesn't update, your plan will switch on as soon as the gateway
            tells us — you don't need to pay again. You can close this and check Settings shortly.
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            disabled={!canResend || initiate.isPending}
            onClick={() => { setPaymentId(null); setStartedAt(null); pay({ resend: true }); }}
            className="h-10 px-4 rounded-full border border-vf-line text-[13px] text-vf-text hover:border-vf-text/25 disabled:opacity-40 transition-colors"
            data-testid="button-resend-prompt"
          >
            {canResend ? "Send the prompt again" : `Resend in ${Math.ceil((RESEND_AFTER_MS - waited) / 1000)}s`}
          </button>
          <button onClick={() => setLocation(withFrom("/plans", from))} className="h-10 px-3 text-[13px] text-vf-muted hover:text-vf-text">
            Cancel
          </button>
        </div>
      </Shell>
    );
  }

  // ── choose method ──
  return (
    <Shell>
      <button onClick={() => setLocation(withFrom("/plans", from))} className="text-[13px] text-vf-muted hover:text-vf-text transition-colors">
        ← Plans
      </button>
      <div className={`${EYEBROW} mt-6`}>
        {card.name} · {priceLabel(priceCents)} / {period === "monthly" ? "mo" : PERIOD_LABEL[period]} · USD
      </div>
      <h1 className="font-serif font-normal text-vf-text mt-3 text-[28px] leading-[1.12]">How do you want to pay?</h1>

      <div className="flex flex-col gap-2.5 mt-6">
        {methods.map((m) => (
          <button
            key={m.id}
            onClick={() => setMethod(m.id)}
            className={`text-left rounded-[14px] border p-4 transition-colors ${
              method === m.id ? "border-vf-ember/60 bg-vf-ember/[0.06]" : "border-vf-line hover:border-vf-text/20"
            }`}
            data-testid={`method-${m.id}`}
          >
            <div className="text-[15px] text-vf-text">{m.label}</div>
            <div className="text-[12.5px] text-vf-faint mt-0.5">{m.sub}</div>
          </button>
        ))}
      </div>

      {method && WALLET_PAY_METHODS.has(method) && (
        walletHandledByNardoPay ? (
          <p className="text-[12.5px] text-vf-faint mt-5 leading-[1.5]" data-testid="text-nardopay-redirect-note">
            You'll enter your {method === "onemoney" ? "OneMoney" : method === "innbucks" ? "InnBucks" : "EcoCash"}{" "}
            number and approve it on the next screen — we never see your PIN.
          </p>
        ) : (
          <div className="mt-5">
            <label className={`${EYEBROW} block mb-2`}>
              {method === "onemoney" ? "OneMoney" : method === "innbucks" ? "InnBucks" : "EcoCash"} number
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
              inputMode="numeric"
              placeholder="0771 234 567"
              className="w-full rounded-[12px] border border-vf-line bg-vf-text/5 px-3.5 h-12 text-[16px] tracking-[0.04em] text-vf-text placeholder:text-vf-faint outline-none focus:border-vf-ember/60"
              data-testid="input-wallet-phone"
            />
            <p className="text-[12px] text-vf-faint mt-2 leading-[1.5]">
              {method === "innbucks"
                ? "You'll get a code to approve in your InnBucks app — we never see your PIN."
                : "You'll get a prompt on this number. Approve it with your PIN — we never see it."}
            </p>
          </div>
        )
      )}

      {initiate.isError && (
        <p className="text-[13px] text-vf-ember mt-4">{(initiate.error as Error).message}</p>
      )}

      <button
        disabled={
          !method ||
          initiate.isPending ||
          (!!method && WALLET_PAY_METHODS.has(method) && !walletHandledByNardoPay && !/^0?7\d{8}$/.test(phone))
        }
        onClick={() => pay()}
        className="mt-6 inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full bg-vf-ember text-vf-ink font-bold text-[15px] btn-press hover:bg-[var(--vf-ember-soft)] disabled:opacity-40 transition-colors"
        data-testid="button-pay"
      >
        {initiate.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        {method && WALLET_PAY_METHODS.has(method) && !walletHandledByNardoPay
          ? "Send me the prompt"
          : `Pay ${priceLabel(priceCents)}`}
      </button>
      <p className="text-[11.5px] text-vf-faint mt-3">
        You'll see the exact amount before anything is charged. This pays for {RENEWAL_WINDOW[period]}, not an
        ongoing charge — cancel any time from Settings.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-vf-ink text-vf-text flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-[460px]">{children}</div>
    </div>
  );
}
