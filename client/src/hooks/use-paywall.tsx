import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { gateCopy, type Feature } from "@shared/entitlements";
import type { GateState } from "@/hooks/use-gate";
import { resetLabel } from "@/hooks/use-gate";

// The moment-of-tap refusal. Call `guard(feature, proceed)` from a locked
// button: if the gate is clear it runs `proceed`, otherwise it shows a sheet
// that says — in the user's words — what was blocked and what it costs, with
// "Not now" as easy as the primary. The server still enforces; this refuses
// first so a 403 is never how the user learns about a gate.

async function readGate(qc: ReturnType<typeof useQueryClient>, feature: Feature): Promise<GateState> {
  return qc.fetchQuery<GateState>({
    queryKey: ["/api/gate", feature],
    queryFn: async () => {
      const res = await fetch(`/api/gate/${feature}`, { credentials: "include" });
      if (!res.ok) return { ok: true, tier: "free", limit: null };
      return res.json();
    },
    staleTime: 60_000,
  });
}

export function usePaywall() {
  const qc = useQueryClient();
  const [state, setState] = useState<{ feature: Feature; gate: GateState } | null>(null);

  const guard = useCallback(
    async (feature: Feature, proceed: () => void) => {
      let gate: GateState;
      try {
        gate = await readGate(qc, feature);
      } catch {
        proceed(); // fail open on the client — server still enforces
        return;
      }
      if (gate.ok) proceed();
      else setState({ feature, gate });
    },
    [qc],
  );

  const close = useCallback(() => setState(null), []);

  const sheet = state ? (
    <RefusalSheet feature={state.feature} gate={state.gate} onClose={close} />
  ) : null;

  return { guard, sheet, close };
}

export function RefusalSheet({
  feature,
  gate,
  onClose,
}: {
  feature: Feature;
  gate: GateState;
  onClose: () => void;
}) {
  const [, setLocation] = useLocation();
  const copy = gateCopy(feature, {
    tier: gate.tier,
    limit: gate.limit,
    used: gate.used,
    resetLabel: resetLabel(gate.resetAt),
  });
  const line = gate.line || copy.line;
  const action = gate.action || copy.action;
  const reqName = gate.requiredTierName || copy.requiredTierName;
  const reqPrice = gate.requiredPrice || copy.requiredPrice;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(8,6,11,.82)", backdropFilter: "blur(14px)" }}
      onClick={onClose}
      data-testid={`refusal-${feature}`}
    >
      <div
        className="w-full max-w-[440px] rounded-t-[24px] sm:rounded-[24px] border border-vf-line bg-vf-surface p-7 pb-10 sm:pb-7 motion-safe:animate-[vf-rise_0.24s_ease-out_both]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint mb-2.5">
          Plans · {action}
        </div>
        <p className="text-[15px] leading-[1.55] text-vf-text">{line}</p>

        <button
          onClick={() => {
            onClose();
            setLocation(`/plans?feature=${feature}`);
          }}
          className="mt-5 w-full h-12 rounded-full bg-vf-ember text-vf-ink font-semibold text-[14px] btn-press transition-colors hover:bg-[#FF8163]"
          data-testid={`refusal-cta-${feature}`}
        >
          {copy.kind === "tier" && reqPrice !== "Free" ? `Get ${reqName} · ${reqPrice}/mo` : `See ${reqName}`}
        </button>
        <button
          onClick={onClose}
          className="mt-2.5 w-full h-11 text-[14px] font-medium text-vf-faint hover:text-vf-text transition-colors"
          data-testid={`refusal-dismiss-${feature}`}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
