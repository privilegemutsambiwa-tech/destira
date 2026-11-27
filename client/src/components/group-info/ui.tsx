// Group info: colour tokens, privacy labels and the pill buttons under the header.

import { Globe, Lock, UserPlus } from "lucide-react";

export const PRIVACY_LABELS: Record<string, { icon: any; label: string }> = {
  "open": { icon: Globe, label: "Open" },
  "request-to-join": { icon: UserPlus, label: "Request to Join" },
  "invite-only": { icon: Lock, label: "Invite Only" },
};

// Groups exist to find love here, not just to chat about a shared interest —
// knowing who's who matters. Only the two binary answers get a label;
// non-binary/self-describe/prefer-not/unset stay unlabeled rather than
// forcing a category on someone who deliberately didn't pick one.
export function genderLabel(gender: string | null | undefined): string | null {
  if (gender === "man") return "Man";
  if (gender === "woman") return "Woman";
  return null;
}

// vf-* tokens, theme-aware — see client/src/index.css (this file styles
// inline, not via Tailwind classes, so a value only needs to change here once)
export const INK = "hsl(var(--vf-ink))";

export const SURFACE2 = "var(--vf-surface2)";

export const ELEVATED = "var(--vf-elevated)";

export const LINE = "var(--vf-line)";

export const MUTED = "var(--vf-muted)";

export const FAINT = "var(--vf-faint)";

export const TEXT = "hsl(var(--vf-text))";

export const EMBER = "hsl(var(--vf-ember))";

export const MINT = "hsl(var(--vf-mint))";

export const SERIF: React.CSSProperties = { fontFamily: '"Instrument Serif", serif', fontWeight: 400 };

export const MONO: React.CSSProperties = {
  fontFamily: '"DM Mono", ui-monospace, monospace',
  fontSize: "10.5px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

export function PillAction({
  icon: Icon, label, onClick, disabled, active, testId,
}: {
  icon: any; label: string; onClick: () => void; disabled?: boolean; active?: boolean; testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 btn-press rounded-full disabled:opacity-50"
      style={{
        height: "36px", padding: "0 16px",
        border: `1px solid ${active ? "hsl(var(--vf-ember) / 0.5)" : LINE}`,
        color: active ? EMBER : MUTED,
        background: "transparent",
      }}
      data-testid={testId}
    >
      <Icon className="w-4 h-4" />
      <span style={{ ...MONO }}>{label}</span>
    </button>
  );
}
