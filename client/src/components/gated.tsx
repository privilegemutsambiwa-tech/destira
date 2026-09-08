import { useLocation } from "wouter";
import { useGate, resetLabel } from "@/hooks/use-gate";
import type { Feature } from "@shared/entitlements";

// A gated feature is VISIBLE but clearly not yours — never hidden, never a dead
// button, never a fake blur. States the fact and the price, one ember button to
// the plans screen. No countdown, no "you're missing out".
export function Gated({
  feature,
  children,
  title,
  compact,
}: {
  feature: Feature;
  children: React.ReactNode;
  /** shown as the mono eyebrow above the message */
  title?: string;
  compact?: boolean;
}) {
  const { data: gate } = useGate(feature);
  const [, setLocation] = useLocation();

  if (!gate || gate.ok) return <>{children}</>;

  const reset = resetLabel(gate.resetAt);
  return (
    <div
      className={`rounded-[16px] border border-vf-line bg-vf-surface2 ${compact ? "p-3.5" : "p-5"}`}
      data-testid={`gated-${feature}`}
    >
      {title && <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-vf-faint mb-1.5">{title}</div>}
      <p className="text-[13.5px] text-vf-muted leading-[1.55]">
        {gate.message}
        {reset ? ` Your next ones land ${reset}.` : ""}
      </p>
      <button
        onClick={() => setLocation("/plans")}
        className="mt-3 inline-flex items-center justify-center rounded-full bg-vf-ember text-vf-ink font-semibold h-9 px-4 text-[13px] btn-press transition-colors hover:bg-[#FF8163]"
        data-testid={`gated-cta-${feature}`}
      >
        See plans
      </button>
    </div>
  );
}
