export interface ResonanceAxis {
  label: string;
  /** 0-100. */
  value: number;
}

interface ResonanceAxesProps {
  axes: ResonanceAxis[];
}

// docs/redesign-handoff.md §3.3. Product rule: a resonance read must always
// show at least one axis below 65 — the honesty is the feature. This
// component doesn't invent that axis (it only renders what it's given), but
// it flags the violation loudly in dev so it isn't shipped by accident.
export function ResonanceAxes({ axes }: ResonanceAxesProps) {
  if (import.meta.env.DEV && axes.length > 0 && axes.every((a) => a.value >= 65)) {
    console.warn(
      "[resonance-axes] every axis is ≥65 — product rule is to always show at least one honest weak spot " +
        "(docs/redesign-handoff.md §3.3). Check the caller's data.",
    );
  }

  return (
    <div className="flex flex-col gap-[11px]" data-testid="resonance-axes">
      {axes.map((axis) => {
        const value = Math.max(0, Math.min(100, axis.value));
        const color = value >= 80 ? "bg-vf-mint" : value >= 65 ? "bg-vf-warn" : "bg-vf-ember";
        return (
          <div
            key={axis.label}
            className="grid grid-cols-[minmax(96px,124px)_minmax(0,1fr)_34px] items-center gap-3"
            data-testid={`resonance-axis-${axis.label}`}
          >
            <span className="text-[13px] text-vf-soft">{axis.label}</span>
            <span className="h-[5px] rounded-full bg-white/[0.08] overflow-hidden block">
              <span className={`block h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
            </span>
            <span className="font-mono text-xs text-vf-muted text-right">{Math.round(axis.value)}</span>
          </div>
        );
      })}
    </div>
  );
}
