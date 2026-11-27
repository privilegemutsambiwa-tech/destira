// Settings: the colour tokens and the rows, toggles and panel frame every
// settings screen is built from.

import { ArrowLeft, ChevronRight } from "lucide-react";

// Theme-aware — these resolve through the CSS custom properties in
// index.css (dark on bare :root, light under :root[data-theme="light"] /
// prefers-color-scheme), the same tokens tailwind.config.ts's vf-* classes
// use. This file predates that wiring and reads colors as JS constants
// rather than Tailwind classes, so it has to go through var()/hsl(var())
// by hand instead of getting the switch for free — but a value only needs
// changing here, once, for every one of this file's ~1500 lines that
// reference the constant to pick up the theme correctly.
export const BG = "hsl(var(--vf-ink))";        // page ground

export const CARD = "var(--vf-surface2)";      // setting rows

export const ELEVATED = "var(--vf-elevated)";  // input fill

export const BORDER = "var(--vf-line)";        // hairline

export const MUTED = "var(--vf-muted)";        // body

export const FAINT = "var(--vf-faint)";        // 12-13px metadata only

export const TEXT = "hsl(var(--vf-text))";

export const EMBER = "hsl(var(--vf-ember))";   // human / primary action

const MINT = "hsl(var(--vf-mint))";     // AI-twin layer — and toggle tracks, per the global rule

export const INK = "hsl(var(--vf-ink))";       // knob on a mint track, text on an ember fill

export const GOLD = "hsl(var(--vf-gold))";     // Ember premium / upsell only

export const SERIF: React.CSSProperties = { fontFamily: '"Instrument Serif", serif', fontWeight: 400 };

export const MONO_EYEBROW: React.CSSProperties = {
  fontFamily: '"DM Mono", ui-monospace, monospace',
  fontSize: "10.5px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  fontWeight: 400,
};

export const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  height: "52px",
  padding: "0 16px",
  cursor: "pointer",
  borderBottom: `1px solid ${BORDER}`,
};

export const SECTION_HEADER_STYLE: React.CSSProperties = {
  ...MONO_EYEBROW,
  color: MUTED,
  padding: "24px 16px 10px",
};

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onChange(!value); }}
      style={{
        width: "42px", height: "24px", borderRadius: "100px",
        background: value ? EMBER : "var(--vf-line)",
        boxShadow: value ? "inset 0 1px 2px rgba(0,0,0,0.12)" : "inset 0 1px 2px rgba(0,0,0,0.08)",
        transition: "background 0.2s, box-shadow 0.2s", position: "relative", cursor: "pointer", flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute", top: "3px", left: value ? "21px" : "3px",
        width: "18px", height: "18px", borderRadius: "50%",
        background: value ? INK : "#CFC7DA",
        boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
        transition: "left 0.2s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s",
      }} />
    </div>
  );
}

export function ToggleRow({ icon: Icon, label, sublabel, value, onChange, testId }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string; sublabel?: string; value: boolean; onChange: (v: boolean) => void; testId?: string;
}) {
  return (
    <div className="vf-row" style={ROW_STYLE} onClick={() => onChange(!value)} role="switch" aria-checked={value} data-testid={testId}>
      <Icon className="w-5 h-5 mr-3 shrink-0" style={{ color: MUTED }} />
      <div className="flex-1 min-w-0 pr-3">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {sublabel && <p className="text-xs" style={{ color: MUTED }}>{sublabel}</p>}
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

export function ChevronRow({ icon: Icon, label, sublabel, onClick, destructive, testId }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string; sublabel?: string; onClick: () => void; destructive?: boolean; testId?: string;
}) {
  return (
    <div className="vf-row group" style={ROW_STYLE} onClick={onClick} data-testid={testId}>
      <Icon className="w-5 h-5 mr-3" style={{ color: destructive ? "#EF4444" : MUTED }} />
      <div className="flex-1">
        <p className="text-sm font-medium" style={{ color: destructive ? "#EF4444" : TEXT }}>{label}</p>
        {sublabel && <p className="text-xs" style={{ color: MUTED }}>{sublabel}</p>}
      </div>
      <ChevronRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" style={{ color: MUTED }} />
    </div>
  );
}

export function SliderInput({ label, value, min, max, onChange, unit = "" }: {
  label: string; value: number; min: number; max: number;
  onChange: (v: number) => void; unit?: string;
}) {
  return (
    <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}` }}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm" style={{ ...SERIF, color: EMBER, fontSize: "15px" }}>{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full vf-range" style={{ accentColor: EMBER }}
        data-testid={`slider-${label.toLowerCase().replace(/\s+/g, "-")}`}
      />
      <div className="flex justify-between mt-1">
        <span className="text-xs" style={{ color: MUTED }}>{min}{unit}</span>
        <span className="text-xs" style={{ color: MUTED }}>{max}{unit}</span>
      </div>
    </div>
  );
}

export function Panel({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh" style={{ background: BG, color: TEXT }}>
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4"
        style={{ height: "56px", background: BG, borderBottom: `1px solid ${BORDER}` }}>
        <button aria-label="Back" onClick={onBack} className="w-8 h-8 flex items-center justify-center" data-testid="button-panel-back">
          <ArrowLeft className="w-5 h-5" style={{ color: EMBER }} />
        </button>
        <h1 style={{ ...SERIF, color: TEXT, fontSize: "20px" }}>{title}</h1>
      </div>
      <div style={{ maxWidth: "480px", margin: "0 auto", paddingBottom: "40px" }}>
        {children}
      </div>
    </div>
  );
}

export function GradientButton({ label, onClick, testId, danger, disabled }: {
  label: string; onClick: () => void; testId?: string; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="w-full py-3 text-sm vf-btn-primary"
      style={{
        background: danger ? "#EF4444" : EMBER,
        color: danger ? "#FFFFFF" : INK,
        fontWeight: 600,
        borderRadius: "12px", border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        boxShadow: disabled ? "none" : "var(--shadow-card)",
      }}
    >
      {label}
    </button>
  );
}

export function ChoiceRow({ label, options, value, onChange, testId }: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  return (
    <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}` }} data-testid={testId}>
      <p style={{ ...MONO_EYEBROW, color: FAINT, marginBottom: "10px" }}>{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg btn-press transition-colors duration-150"
              style={{
                background: active ? "rgba(143,227,199,0.14)" : ELEVATED,
                border: `1px solid ${active ? "rgba(143,227,199,0.4)" : BORDER}`,
                color: active ? MINT : TEXT,
              }}
              data-testid={testId ? `${testId}-${o.value}` : undefined}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
