// Paying once for something (server/purchases.ts): a Date on me voucher now,
// single super likes, boosts and event tickets next. Pick how to pay, approve
// it on the phone, and we watch the payment until it settles. The price shown
// is the one the server quoted; the server charges its own number regardless.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { VfButton, VfSheet } from "@/components/ui-vf";
import { usePaymentsConfig, usePaymentStatus, WALLET_PAY_METHODS, type InitiateResult, type PayMethod } from "@/hooks/use-payments";

const METHODS: { id: PayMethod; label: string }[] = [
  { id: "ecocash", label: "EcoCash" },
  { id: "onemoney", label: "OneMoney" },
  { id: "innbucks", label: "InnBucks" },
  { id: "card", label: "Card" },
];
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export function PurchaseSheet({
  open, onOpenChange, kind, refId, title, label, cents, note, onPaid,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: string;
  /** What's being bought (a voucher id, an event id); 0 until it exists. */
  refId: number | null;
  title: string;
  label: string;
  cents: number;
  note?: string;
  onPaid: () => void;
}) {
  const [method, setMethod] = useState<PayMethod>("ecocash");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [started, setStarted] = useState<InitiateResult | null>(null);
  const { data: cfg } = usePaymentsConfig();
  const { data: status } = usePaymentStatus(started?.paymentId ?? null, !!started);
  const askPhone = WALLET_PAY_METHODS.has(method) && method !== "innbucks" && cfg?.walletProvider !== "nardopay";

  useEffect(() => {
    if (!open) { setStarted(null); setErr(null); setBusy(false); }
  }, [open]);
  useEffect(() => {
    if (status?.status === "paid") onPaid();
  }, [status?.status]);

  const pay = async () => {
    if (!refId) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/purchases/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ kind, ref: refId, method, phone: askPhone ? phone : undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || "Couldn't start that payment. Try again.");
      if (body.redirectUrl) { window.location.href = body.redirectUrl; return; }
      setStarted(body);
    } catch (e: any) {
      setErr(String(e?.message || "Couldn't start that payment. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const s = status?.status;
  return (
    <VfSheet open={open} onOpenChange={onOpenChange} title={title} data-testid="sheet-purchase">
      <div className="px-5 pb-5 flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] text-vf-text">{label}</span>
          <span className="font-mono text-[15px] text-vf-text" data-testid="purchase-price">{money(cents)}</span>
        </div>
        {note && <p className="vf-small text-vf-muted -mt-2">{note}</p>}

        {!started ? (
          <>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How to pay">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={method === m.id}
                  onClick={() => setMethod(m.id)}
                  className={`h-11 rounded-full border text-[14px] ${method === m.id ? "border-vf-ember bg-vf-ember/10 text-vf-text" : "border-vf-line text-vf-muted"}`}
                  data-testid={`pay-method-${m.id}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {askPhone && (
              <input
                inputMode="tel"
                autoComplete="tel"
                placeholder="07XX XXX XXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-12 rounded-[14px] bg-vf-ink border border-vf-line px-4 text-[15px] text-vf-text placeholder:text-vf-faint"
                data-testid="input-pay-phone"
              />
            )}
            {err && <p className="vf-small text-red-400" role="alert">{err}</p>}
            <VfButton fullWidth loading={busy} disabled={!refId || (askPhone && phone.replace(/\D/g, "").length < 9)} onClick={pay} data-testid="button-purchase-pay">
              Pay {money(cents)}
            </VfButton>
            <p className="vf-small text-vf-faint text-center">Paid through Paynow. A one-off payment, nothing renews.</p>
          </>
        ) : s === "paid" ? (
          <p className="text-[15px] text-vf-text" data-testid="purchase-paid">Paid. Thank you.</p>
        ) : s && s !== "pending" ? (
          <div className="flex flex-col gap-3">
            <p className="text-[14px] text-vf-text" data-testid="purchase-failed">That payment didn't go through{status?.failureReason ? `: ${status.failureReason}` : "."}</p>
            <VfButton variant="secondary" onClick={() => setStarted(null)}>Try again</VfButton>
          </div>
        ) : (
          <div className="flex flex-col gap-2" data-testid="purchase-waiting">
            <div className="flex items-center gap-2 text-[14px] text-vf-text"><Loader2 className="w-4 h-4 animate-spin" /> Waiting for the payment</div>
            {started.instructions && <p className="vf-small text-vf-muted">{started.instructions}</p>}
            {started.authorizationCode && (
              <p className="vf-small text-vf-muted">InnBucks code: <span className="font-mono text-vf-text">{started.authorizationCode}</span>
                {started.deepLink && <> · <a className="underline" href={started.deepLink}>Open InnBucks</a></>}</p>
            )}
          </div>
        )}
      </div>
    </VfSheet>
  );
}
