import { useLocation } from "wouter";
import { useGate, resetLabel } from "@/hooks/use-gate";
import { gateCopy, type Feature } from "@shared/entitlements";
import { withFrom } from "@/lib/from-route";

// A gated feature rendered inline: VISIBLE but clearly not yours — never hidden,
// never a dead button, never a fake blur. Same contextual line as the
// moment-of-tap sheet and the server 403 (shared/entitlements gateCopy). One
// ember button to plans, one plain "Not now".
export function Gated({
  feature,
  children,
  title,
  compact,
  onDismiss,
}: {
  feature: Feature;
  children: React.ReactNode;
  /** shown as the mono eyebrow above the message */
  title?: string;
  compact?: boolean;
  onDismiss?: () => void;
}) {
  const { data: gate } = useGate(feature);
  const [, setLocation] = useLocation();

  if (!gate || gate.ok) return <>{children}</>;

  const copy = gateCopy(feature, {
    tier: gate.tier,
    limit: gate.limit,
    used: gate.used,
    resetLabel: resetLabel(gate.resetAt),
  });
  const line = gate.line || copy.line;

  return (
    <div
      className={`rounded-[16px] border border-vf-line bg-vf-surface2 ${compact ? "p-3.5" : "p-5"}`}
      data-testid={`gated-${feature}`}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-vf-faint mb-1.5">
        {title || `Plans · ${gate.action || copy.action}`}
      </div>
      <p className="text-[13.5px] text-vf-muted leading-[1.55]">{line}</p>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => setLocation(withFrom(`/plans?feature=${feature}`, window.location.pathname))}
          className="inline-flex items-center justify-center rounded-full bg-vf-ember text-vf-ink font-semibold h-9 px-4 text-[13px] btn-press transition-colors hover:bg-[var(--vf-ember-soft)]"
          data-testid={`gated-cta-${feature}`}
        >
          See {gate.requiredTierName || copy.requiredTierName}
        </button>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-[13px] font-medium text-vf-faint hover:text-vf-text transition-colors"
            data-testid={`gated-dismiss-${feature}`}
          >
            Not now
          </button>
        )}
      </div>
    </div>
  );
}
