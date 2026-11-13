// Small, everywhere pieces (docs/destira-upgrade-prompt.md §4.7): search,
// empty states, skeletons, avatars and page headers.
import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { avatarColor } from "@/lib/avatar-color";

/* ---------- Search ---------- */

interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: string;
  onChange: (value: string) => void;
  /** Read by screen readers; the placeholder is not a label. */
  label: string;
}

/** A quiet field with a leading glyph, not a pill. */
export function SearchField({ value, onChange, label, className, placeholder, ...rest }: SearchFieldProps) {
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-vf-faint pointer-events-none" aria-hidden="true" />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className={cn(
          "w-full h-11 rounded-[10px] pl-10 pr-10 text-[15px] text-vf-text placeholder:text-vf-faint",
          "bg-[var(--vf-elevated)] border border-transparent transition-colors duration-150",
          "focus:outline-none focus:border-vf-line focus-visible:border-[color:var(--vf-focus)]",
          "[&::-webkit-search-cancel-button]:appearance-none",
        )}
        {...rest}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-0 top-0 w-11 h-11 flex items-center justify-center text-vf-faint hover:text-vf-text"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

/* ---------- Empty states ---------- */

/** The default illustration: the logo's two rings, drifted apart. */
export function RingsIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 64" className={cn("w-24 h-16", className)} fill="none" aria-hidden="true">
      <circle cx="36" cy="32" r="20" stroke="hsl(var(--vf-ember))" strokeWidth="2" opacity="0.85" />
      <circle cx="62" cy="32" r="20" stroke="var(--vf-mint-vivid)" strokeWidth="2" opacity="0.85" />
    </svg>
  );
}

interface EmptyStateProps {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  illustration?: ReactNode;
  className?: string;
  testId?: string;
}

/** Written, not defaulted: a serif line, one sentence, at most one action. */
export function EmptyState({ title, body, action, illustration, className, testId }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center text-center px-6 py-14", className)} data-testid={testId}>
      <div className="mb-5">{illustration ?? <RingsIllustration />}</div>
      <h2 className="vf-h2 text-vf-text text-balance max-w-[22ch]">{title}</h2>
      {body && <p className="vf-small text-vf-muted mt-2 max-w-[36ch] text-balance">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/* ---------- Skeletons ---------- */

export function VfSkeleton({ className }: { className?: string }) {
  return <div className={cn("vf-skeleton rounded-[10px]", className)} aria-hidden="true" />;
}

/* ---------- Avatars ---------- */

interface VfAvatarProps {
  src?: string | null;
  name?: string | null;
  /** Stable id for the generated colour (user id, group id). */
  seed?: string | null;
  size?: number;
  className?: string;
  /** Rounded square instead of a circle (rooms, events). */
  square?: boolean;
}

/** Photo with a hairline inner ring; no photo → a warm generated colour and
 *  the serif initial. Never a grey silhouette, never an empty square. */
export function VfAvatar({ src, name, seed, size = 40, className, square = false }: VfAvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = (name ?? "").trim()[0]?.toUpperCase() ?? "";
  const showPhoto = !!src && !failed;
  return (
    <span
      className={cn("relative inline-block shrink-0 overflow-hidden", square ? "rounded-[16px]" : "rounded-full", className)}
      style={{
        width: size,
        height: size,
        background: showPhoto
          ? "var(--vf-elevated)"
          : `linear-gradient(145deg, rgba(255,255,255,0.16), rgba(0,0,0,0.16)), ${avatarColor(seed ?? name ?? "")}`,
      }}
    >
      {showPhoto ? (
        <img src={src!} alt={name ?? ""} loading="lazy" decoding="async" onError={() => setFailed(true)} className="w-full h-full object-cover" />
      ) : (
        <span
          className="absolute inset-0 flex items-center justify-center font-serif text-white/90 select-none"
          style={{ fontSize: Math.round(size * 0.44) }}
          aria-label={name ?? undefined}
        >
          {initial}
        </span>
      )}
      <span className={cn("absolute inset-0 pointer-events-none shadow-[inset_0_0_0_1px_var(--vf-line)]", square ? "rounded-[16px]" : "rounded-full")} />
    </span>
  );
}

/* ---------- Page headers ---------- */

interface PageHeaderProps {
  title: string;
  /** Small mono line above the title (date, context). */
  eyebrow?: ReactNode;
  /** One sentence under the title. */
  subtitle?: ReactNode;
  /** Right-hand actions: one icon or button, rarely two. */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, eyebrow, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex items-end justify-between gap-4 mb-6", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="vf-label text-vf-faint mb-2">{eyebrow}</div>}
        <h1 className="vf-h1 text-vf-text">{title}</h1>
        {subtitle && <p className="vf-small text-vf-muted mt-1.5 max-w-[52ch]">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}
