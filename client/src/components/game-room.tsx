// Shared visual language for group games in the room's main chat
// (GroupChat.tsx): the announcement card a new round posts. The rooms
// themselves, Game Night, live in components/games/ and pages/GameRoom*.tsx.
import { GAME_THEMES } from "@/components/games/game-theme";

const SURFACE2 = "var(--vf-surface2)";
const LINE = "var(--vf-line)";
const MUTED = "var(--vf-muted)";
const TEXT = "hsl(var(--vf-text))";
const EMBER = "hsl(var(--vf-ember))";
const MINT = "hsl(var(--vf-mint))";

/** Each game's glyph, the same one Game Night uses (components/games/game-theme.ts). */
export const GAME_ICON_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(GAME_THEMES).map((t) => [t.kind, t.glyph]),
);

// Shared shell for every rich, interactive chat card (polls, games) — always
// the same opaque, neutral surface regardless of who sent the message.
export function RichCard({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <div
      className="min-w-[240px] max-w-full"
      style={{ background: SURFACE2, border: `1px solid ${LINE}`, borderRadius: "16px", padding: "14px", boxShadow: "0 2px 10px rgba(0,0,0,0.18)" }}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

export function CardHeader({ icon, title, status }: { icon: string; title: string; status?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span
        className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0"
        style={{ background: "hsl(var(--vf-ember) / 0.14)" }}
      >
        {icon}
      </span>
      <p className="font-semibold text-sm flex-1 min-w-0" style={{ color: TEXT }}>{title}</p>
      {status}
    </div>
  );
}

export function StatusPill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "ember" | "mint" }) {
  const color = tone === "mint" ? MINT : tone === "ember" ? EMBER : MUTED;
  const bg = tone === "mint" ? "hsl(var(--vf-mint) / 0.14)" : tone === "ember" ? "hsl(var(--vf-ember) / 0.14)" : "rgba(255,255,255,0.06)";
  return (
    <span
      className="shrink-0 font-mono text-[10px] uppercase tracking-wide px-2 py-1 rounded-full"
      style={{ color, background: bg }}
    >
      {children}
    </span>
  );
}

export function GameProgress({ state }: { state: any }) {
  if (state.status === "revealed") return <StatusPill tone="mint">✓ Revealed</StatusPill>;
  return <StatusPill>{state.responseCount}/{state.eligibleCount} answered</StatusPill>;
}
