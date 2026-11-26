// Date on me (shared/date-vouchers.ts) on a date card: a Crown member covers
// something at the partner venue ahead; both see the voucher and its code.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift } from "lucide-react";
import { VfButton, VfSheet } from "@/components/ui-vf";
import { PurchaseSheet } from "@/components/purchase-sheet";
import { apiRequest } from "@/lib/queryClient";
import { PURCHASE_KIND_VOUCHER, VOUCHER_DAYS, type PlanVoucherState, type VoucherItem } from "@shared/date-vouchers";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export function DateOnMe({ planId, otherFirst }: { planId: number; otherFirst: string }) {
  const qc = useQueryClient();
  const key = [`/api/date-vouchers/plan/${planId}`];
  const { data } = useQuery<PlanVoucherState>({ queryKey: key, staleTime: 15_000 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [item, setItem] = useState<VoucherItem | null>(null);
  const [voucherId, setVoucherId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!data || (!data.voucher && !data.canAttach)) return null;

  const choose = async (it: VoucherItem) => {
    setErr(null);
    try {
      const r = await (await apiRequest("POST", "/api/date-vouchers", { planId, itemId: it.id })).json();
      setItem(it);
      setVoucherId(r.voucherId);
      setMenuOpen(false);
    } catch (e: any) {
      setErr(String(e?.message || "That didn't work"));
    }
  };

  const v = data.voucher;
  if (v) {
    const live = v.status === "active";
    return (
      <div className="mx-3 mb-3 rounded-[14px] border px-3.5 py-3" style={{ borderColor: "rgba(233,185,73,0.45)", background: "rgba(233,185,73,0.08)" }} data-testid={`date-on-me-${planId}`}>
        <div className="flex items-center gap-2 vf-label text-vf-text">
          <Gift className="w-3.5 h-3.5 text-vf-gold" />
          {v.mine ? "You've covered this" : "Your date has covered this"}
        </div>
        <p className="text-[14px] text-vf-text mt-1">{v.itemLabel}{data.venue ? ` at ${data.venue.name}` : ""}</p>
        {live && v.code && (
          <p className="mt-1.5 vf-small text-vf-muted">
            Show this at the till: <span className="font-mono text-[15px] text-vf-text tracking-wider" data-testid={`voucher-code-${planId}`}>{v.code}</span>
          </p>
        )}
        <p className="vf-small text-vf-faint mt-1" data-testid={`voucher-status-${planId}`}>
          {v.status === "active" ? (v.mine && v.expiresAt ? `Unused by ${day(v.expiresAt)}, it's refunded to you.` : "It's paid for. Nothing to settle at the venue for this.")
            : v.status === "redeemed" ? "Used. Enjoy."
            : v.status === "refund_due" ? (v.mine ? "Being refunded to you." : "No longer on.")
            : v.mine ? "Refunded to you." : "No longer on."}
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 pb-3">
      <VfButton size="sm" variant="secondary" fullWidth onClick={() => setMenuOpen(true)} leading={<Gift className="w-4 h-4" />} data-testid={`button-date-on-me-${planId}`}>
        Date on me
      </VfButton>
      <VfSheet open={menuOpen} onOpenChange={setMenuOpen} title="Date on me" data-testid="sheet-date-on-me">
        <div className="px-5 pb-5 flex flex-col gap-2.5">
          <p className="vf-small text-vf-muted">
            Cover something at {data.venue?.name} ahead, at the Crown member price. {otherFirst} sees "Your date has covered this" and the code to show at the till. It's for the venue only, never cash. Unused after {VOUCHER_DAYS} days, it's refunded to you.
          </p>
          {data.items.map((it) => (
            <button key={it.id} type="button" onClick={() => choose(it)} className="flex items-center justify-between h-12 px-4 rounded-[14px] border border-vf-line hover:border-vf-gold/60 text-left" data-testid={`voucher-item-${it.id}`}>
              <span className="text-[14.5px] text-vf-text">{it.label}</span>
              <span className="font-mono text-[14px] text-vf-text">{money(it.cents)}</span>
            </button>
          ))}
          {err && <p className="vf-small text-red-400" role="alert">{err}</p>}
        </div>
      </VfSheet>
      {item && (
        <PurchaseSheet
          open={!!voucherId}
          onOpenChange={(o) => { if (!o) setVoucherId(null); }}
          kind={PURCHASE_KIND_VOUCHER}
          refId={voucherId}
          title="Date on me"
          label={`${item.label} at ${data.venue?.name}`}
          cents={item.cents}
          note={`For your date with ${otherFirst}. Refunded if unused in ${VOUCHER_DAYS} days.`}
          onPaid={() => { qc.invalidateQueries({ queryKey: key }); setTimeout(() => setVoucherId(null), 1200); }}
        />
      )}
    </div>
  );
}
