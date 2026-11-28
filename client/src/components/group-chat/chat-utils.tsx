// Group chat: shared colours, reactions and time/mention helpers (split out of pages/GroupChat.tsx).
import { Heart, ThumbsUp, ThumbsDown, Laugh, Flame, Star } from "lucide-react";

export interface MessageAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  testId: string;
  danger?: boolean;
}

export const REACTION_ICONS: Record<string, any> = {
  heart: Heart,
  thumbsup: ThumbsUp,
  thumbsdown: ThumbsDown,
  laugh: Laugh,
  flame: Flame,
  star: Star,
};

export const REACTIONS = [
  { key: "heart", Icon: Heart },
  { key: "thumbsup", Icon: ThumbsUp },
  { key: "thumbsdown", Icon: ThumbsDown },
  { key: "laugh", Icon: Laugh },
  { key: "flame", Icon: Flame },
  { key: "star", Icon: Star },
];

// vf-* tokens, theme-aware — see client/src/index.css for the light/dark
// values these resolve through (this file styles inline rather than via
// Tailwind's vf-* classes, so a value only needs to change here once).
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

// Groups exist to find love here, not just to chat about a shared interest —
// knowing who's replying matters. Only the two binary answers get a label;
// non-binary/self-describe/prefer-not/unset stay unlabeled rather than
// forcing a category on someone who deliberately didn't pick one.
export function genderLabel(gender: string | null | undefined): string | null {
  if (gender === "man") return "Man";
  if (gender === "woman") return "Woman";
  return null;
}

/** "@Farai" in a room message shows in ember (docs/destira-upgrade-prompt.md §7.13). */
export function withMentions(text: string): React.ReactNode {
  if (!text || !text.includes("@")) return text;
  return text.split(/(@[\p{L}\p{N}_.-]+)/u).map((part, i) =>
    part.startsWith("@") && part.length > 1 ? (
      <span key={i} className="font-semibold text-vf-ember">{part}</span>
    ) : (
      part
    ),
  );
}

export function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatDateSeparator(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = today.getTime() - msgDate.getTime();
  if (diff === 0) return "Today";
  if (diff === 86400000) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function isSameDay(a: string, b: string) {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}
