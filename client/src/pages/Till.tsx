// /redeem: for a partner venue's staff at the till (no Destira account
// needed). Type the guest's code and the venue's PIN, check what's covered,
// then mark it used. Destira pays the venue for used vouchers each month.
import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { normalizeVoucherCode, type TillCheck } from "@shared/date-vouchers";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

async function post(path: string, body: unknown): Promise<TillCheck> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.message || "Something went wrong");
  return j;
}

export default function Till() {
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [v, setV] = useState<TillCheck | null>(null);

  const go = async (path: string) => {
    setBusy(true);
    setErr(null);
    try {
      setV(await post(path, { code: normalizeVoucherCode(code), pin }));
    } catch (e: any) {
      setErr(String(e?.message));
    } finally {
      setBusy(false);
    }
  };
  const reset = () => { setV(null); setCode(""); setErr(null); };

  return (
    <div className="min-h-dvh bg-vf-ink text-vf-text px-6 py-12">
      <div className="w-full max-w-[420px] mx-auto">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">Destira partner venues</div>
        <h1 className="font-serif font-normal text-[32px] leading-[1.1] mt-2">Date on me</h1>
        <p className="text-[14px] text-vf-muted mt-2 leading-[1.5]">A guest shows a code from their Destira chat. Check it here, then mark it used when you serve it.</p>

        {!v ? (
          <div className="mt-6 flex flex-col gap-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Code, e.g. K7PM-3QXA"
              autoCapitalize="characters"
              autoComplete="off"
              className="h-14 rounded-[16px] bg-vf-surface border border-vf-line px-4 font-mono text-[20px] tracking-wider placeholder:text-vf-faint placeholder:font-sans placeholder:text-[15px] placeholder:tracking-normal"
              data-testid="till-code"
            />
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Venue PIN"
              inputMode="numeric"
              type="password"
              autoComplete="off"
              className="h-12 rounded-[16px] bg-vf-surface border border-vf-line px-4 text-[16px] placeholder:text-vf-faint"
              data-testid="till-pin"
            />
            {err && <p className="text-[14px] text-red-400" role="alert" data-testid="till-error">{err}</p>}
            <button onClick={() => go("/api/till/check")} disabled={busy || code.replace(/[^A-Z0-9]/gi, "").length < 8 || pin.length < 4} className="h-12 rounded-full bg-vf-ember text-vf-ink font-semibold text-[15px] disabled:opacity-50" data-testid="till-check">
              {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Check"}
            </button>
          </div>
        ) : (
          <div className="mt-6 rounded-[20px] border border-vf-line p-5" data-testid="till-result">
            <div className="font-mono text-[18px] tracking-wider">{v.code}</div>
            <div className="font-serif text-[24px] leading-[1.15] mt-2">{v.itemLabel}</div>
            <div className="text-[14px] text-vf-muted mt-1">{v.venueName} · paid {money(v.amountCents)}</div>
            {v.status === "active" ? (
              <>
                <p className="text-[14px] text-vf-text mt-4">Paid for and good to use{v.expiresAt ? ` until ${when(v.expiresAt)}` : ""}. Nothing to charge the guests for this item.</p>
                {err && <p className="text-[14px] text-red-400 mt-2" role="alert">{err}</p>}
                <button onClick={() => go("/api/till/redeem")} disabled={busy} className="mt-4 w-full h-12 rounded-full bg-vf-ember text-vf-ink font-semibold text-[15px]" data-testid="till-redeem">
                  Mark as used
                </button>
              </>
            ) : v.status === "redeemed" ? (
              <p className="flex items-center gap-2 text-[15px] text-vf-text mt-4" data-testid="till-used">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Used{v.redeemedAt ? ` ${when(v.redeemedAt)}` : ""}. Destira pays you for it with this month's total.
              </p>
            ) : (
              <p className="text-[15px] text-red-400 mt-4" data-testid="till-not-valid">This voucher can't be used: it was refunded.</p>
            )}
            <button onClick={reset} className="mt-4 text-[14px] text-vf-muted underline underline-offset-2">Check another code</button>
          </div>
        )}
      </div>
    </div>
  );
}
