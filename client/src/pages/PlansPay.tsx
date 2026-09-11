import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { PLAN_CARDS, priceLabel } from "@shared/entitlements";
import {
  useInitiatePayment,
  usePaymentStatus,
  refreshPlanQueries,
  type PayMethod,
} from "@/hooks/use-payments";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";
const RESEND_AFTER_MS = 45_000;

const METHODS: { id: PayMethod; label: string; sub: string }[] = [
  { id: "ecocash", label: "EcoCash", sub: "Pay from your EcoCash wallet. A prompt comes to your phone." },
  { id: "ecocash_card", label: "EcoCash Visa card", sub: "Your EcoCash debit card." },
  { id: "card", label: "Another card", sub: "Any Visa or Mastercard." },
];

export default function PlansPay() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const qc = useQueryClient();
  const params = new URLSearchParams(search);
  const tierParam = params.get("tier");
  const returnRef = params.get("ref");
  const sourceFeature = params.get("feature") || undefined;

  const card = useMemo(() => PLAN_CARDS.find((c) => c.tier === tierParam), [tierParam]);
  const tier = card?.tier as "spark" | "flame" | "ember" | undefined;

  const [method, setMethod] = useState<PayMethod | null>(null);
  const [phone, setPhone] = useState("");
  const [paymentId, setPaymentId] = useState<number | null>(returnRef ? Number(returnRef) : null);
  const [startedAt, setStartedAt] = useState<number | null>(returnRef ? Date.now() : null);
  const [instructions, setInstructions] = useState<string | null>(null);

  const initiate = useInitiatePayment();
  const { data: status } = usePaymentStatus(paymentId, paymentId != null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (status?.status === "paid") refreshPlanQueries(qc);
  }, [status?.status, qc]);

  if (!card || !tier) {
    return (
      <Shell>
        <p className="text-vf-muted text-[14px]">That plan isn't here.</p>
        <button onClick={() => setLocation("/plans")} className="mt-3 text-[13px] text-vf-ember">Back to plans</button>
      </Shell>
    );
  }

  const pay = () => {
    setStartedAt(Date.now());
    initiate.mutate(
      { tier, method: method!, phone: method === "ecocash" ? phone : undefined, sourceFeature },
      {
        onSuccess: (r) => {
          setPaymentId(r.paymentId);
          setInstructions(r.instructions ?? null);
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
    return (
      <Shell>
        <div className={EYEBROW}>Done</div>
        <h1 className="font-serif font-normal text-vf-text mt-3 text-[30px] leading-[1.1]">
          You're on {card.name}.
        </h1>
        <p className="text-[14px] text-vf-muted mt-3">
          {priceLabel(card.priceCents)} / month, in US dollars. Renews in about a month — cancel any time from Settings.
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
          onClick={() => setLocation("/discover")}
          className="mt-6 h-11 px-6 rounded-full bg-vf-ember text-vf-ink font-semibold text-[14px] btn-press hover:bg-[#FF8163] transition-colors"
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
            className="h-11 px-6 rounded-full bg-vf-ember text-vf-ink font-semibold text-[14px] btn-press hover:bg-[#FF8163] transition-colors"
            data-testid="button-retry-pay"
          >
            Try again
          </button>
          <button onClick={() => setLocation("/plans")} className="h-11 px-4 text-[13px] text-vf-muted hover:text-vf-text">
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
        <div className={EYEBROW}>Check your phone</div>
        <h1 className="font-serif font-normal text-vf-text mt-3 text-[26px] leading-[1.15]">
          Approve the prompt {status?.phoneNumberMasked ? `on ${status.phoneNumberMasked}` : "on your handset"}.
        </h1>
        <p className="text-[14px] text-vf-muted mt-3 leading-[1.6]">
          {instructions ||
            "Enter your EcoCash PIN on the prompt your phone just got — we never see it. This can take a minute; keep this open."}
        </p>
        <div className="flex items-center gap-2.5 mt-6 text-[13px] text-vf-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          Waiting for the gateway…
          {status?.rawStatus ? <span className="text-vf-faint">({status.rawStatus})</span> : null}
        </div>

        {waited > RESEND_AFTER_MS * 1.6 && (
          <div className="mt-5 rounded-[14px] border border-vf-line bg-vf-surface2 p-3.5 text-[12.5px] text-vf-muted leading-[1.55]">
            Still nothing? If you approved it and this doesn't update, your plan will switch on as soon as the gateway
            tells us — you don't need to pay again. You can close this and check Settings shortly.
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            disabled={!canResend || initiate.isPending}
            onClick={() => { setPaymentId(null); setStartedAt(null); pay(); }}
            className="h-10 px-4 rounded-full border border-vf-line text-[13px] text-vf-text hover:border-white/25 disabled:opacity-40 transition-colors"
            data-testid="button-resend-prompt"
          >
            {canResend ? "Send the prompt again" : `Resend in ${Math.ceil((RESEND_AFTER_MS - waited) / 1000)}s`}
          </button>
          <button onClick={() => setLocation("/plans")} className="h-10 px-3 text-[13px] text-vf-muted hover:text-vf-text">
            Cancel
          </button>
        </div>
      </Shell>
    );
  }

  // ── choose method ──
  return (
    <Shell>
      <button onClick={() => setLocation("/plans")} className="text-[13px] text-vf-muted hover:text-vf-text transition-colors">
        ← Plans
      </button>
      <div className={`${EYEBROW} mt-6`}>{card.name} · {priceLabel(card.priceCents)} / mo · USD</div>
      <h1 className="font-serif font-normal text-vf-text mt-3 text-[28px] leading-[1.12]">How do you want to pay?</h1>

      <div className="flex flex-col gap-2.5 mt-6">
        {METHODS.map((m) => (
          <button
            key={m.id}
            onClick={() => setMethod(m.id)}
            className={`text-left rounded-[14px] border p-4 transition-colors ${
              method === m.id ? "border-vf-ember/60 bg-vf-ember/[0.06]" : "border-vf-line hover:border-white/20"
            }`}
            data-testid={`method-${m.id}`}
          >
            <div className="text-[15px] text-vf-text">{m.label}</div>
            <div className="text-[12.5px] text-vf-faint mt-0.5">{m.sub}</div>
          </button>
        ))}
      </div>

      {method === "ecocash" && (
        <div className="mt-5">
          <label className={`${EYEBROW} block mb-2`}>EcoCash number</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
            inputMode="numeric"
            placeholder="0771 234 567"
            className="w-full rounded-[12px] border border-vf-line bg-white/5 px-3.5 h-12 text-[16px] tracking-[0.04em] text-vf-text placeholder:text-vf-faint outline-none focus:border-vf-ember/60"
            data-testid="input-ecocash-phone"
          />
          <p className="text-[12px] text-vf-faint mt-2 leading-[1.5]">
            You'll get a prompt on this number. Approve it with your EcoCash PIN — we never see it.
          </p>
        </div>
      )}

      {initiate.isError && (
        <p className="text-[13px] text-vf-ember mt-4">{(initiate.error as Error).message}</p>
      )}

      <button
        disabled={
          !method ||
          initiate.isPending ||
          (method === "ecocash" && !/^0?7\d{8}$/.test(phone))
        }
        onClick={pay}
        className="mt-6 inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full bg-vf-ember text-vf-ink font-bold text-[15px] btn-press hover:bg-[#FF8163] disabled:opacity-40 transition-colors"
        data-testid="button-pay"
      >
        {initiate.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        {method === "ecocash" ? "Send me the prompt" : `Pay ${priceLabel(card.priceCents)}`}
      </button>
      <p className="text-[11.5px] text-vf-faint mt-3">
        You'll see the exact amount before anything is charged. Cancel any time from Settings.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-vf-ink text-vf-text flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-[460px]">{children}</div>
    </div>
  );
}
