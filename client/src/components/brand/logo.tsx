import { useId } from "react";

// The Overlap. Two rings — ember (#FF6B4A, the human) in front, mint
// (#8FE3C7, the AI twin) behind — tilted 15°, with the lens where they
// intersect filled in: cream on a dark ground, ink on a light one (--vf-lens),
// so it always reads. The lens is the resonance. Geometry is transcribed
// verbatim from the brand spec / docs/redesign-reference; do not "clean up"
// the viewBox or the circle coordinates.

const EMBER = "#FF6B4A";
const MINT = "#8FE3C7";
const CREAM = "#F5F0EA";
// Matches the app icon (scripts/generate-brand-assets.mjs): cream tile, ink lens.
const TILE_BG = "#F7F1EA";
const TILE_LENS = "#1A1418";

/** Exclusion zone around the lockup = one ring radius = 0.315 × mark width. */
export const CLEARSPACE = 0.315;

/** Lockup gap as a fraction of mark width. */
const LOCKUP_GAP = { horizontal: 0.34, stacked: 0.24 } as const;

/** Wordmark size relative to mark size, tuned per lockup orientation. */
const WORDMARK_RATIO = { horizontal: 0.9, stacked: 0.52 } as const;

// Two-ring viewBox "26 17 108 86" → 108 wide by 86 tall.
const MARK_RATIO = 86 / 108;

function strokeForSize(size: number): number {
  if (size >= 48) return 6;
  if (size >= 40) return 7;
  return 8; // 28–39px
}

export type MarkVariant = "colour" | "mono" | "tile";

interface DestiraMarkProps {
  /** Rendered width in px. Height follows the artwork ratio. */
  size: number;
  /** colour = ember+mint+lens · mono = currentColor throughout · tile = the app icon, rings on cream (use <28px). */
  variant?: MarkVariant;
  /** aria-hidden the mark when it sits beside the wordmark so the lockup announces once. */
  decorative?: boolean;
  className?: string;
}

export function DestiraMark({ size, variant = "colour", decorative = false, className }: DestiraMarkProps) {
  const clipId = useId();

  if (import.meta.env.DEV && variant === "colour" && size < 28) {
    throw new Error(
      `DestiraMark: the two-ring colour mark stops resolving below 28px (got ${size}px). ` +
        `Use variant="tile" for small sizes.`,
    );
  }

  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": "Destira" } as const);

  if (variant === "tile") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 64 64"
        width={size}
        height={size}
        className={className}
        {...a11y}
      >
        <defs>
          <clipPath id={clipId}>
            <circle cx="38.87" cy="32" r="14.6" />
          </clipPath>
        </defs>
        <rect x="0" y="0" width="64" height="64" rx="14" fill={TILE_BG} />
        <g transform="rotate(-15 32 32)">
          <circle cx="38.87" cy="32" r="14.6" fill="none" stroke={MINT} strokeWidth="6.2" />
          <circle cx="25.13" cy="32" r="14.6" fill="none" stroke={EMBER} strokeWidth="6.2" />
          <g clipPath={`url(#${clipId})`}>
            <circle cx="25.13" cy="32" r="14.6" fill={TILE_LENS} />
          </g>
        </g>
      </svg>
    );
  }

  const stroke = strokeForSize(size);
  const isMono = variant === "mono";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="26 17 108 86"
      width={size}
      height={Math.round(size * MARK_RATIO)}
      className={className}
      {...a11y}
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="96" cy="60" r="34" />
        </clipPath>
      </defs>
      <g transform="rotate(-15 80 60)">
        <circle cx="96" cy="60" r="34" fill="none" stroke={isMono ? "currentColor" : MINT} strokeWidth={stroke} />
        <circle cx="64" cy="60" r="34" fill="none" stroke={isMono ? "currentColor" : EMBER} strokeWidth={stroke} />
        <g clipPath={`url(#${clipId})`}>
          <circle cx="64" cy="60" r="34" fill={isMono ? "currentColor" : `var(--vf-lens, ${CREAM})`} />
        </g>
      </g>
    </svg>
  );
}

interface DestiraWordmarkProps {
  /** Font size in px. */
  size: number;
  className?: string;
}

export function DestiraWordmark({ size, className }: DestiraWordmarkProps) {
  return (
    <span
      className={className}
      style={{
        fontFamily: '"Instrument Serif", serif',
        fontWeight: 400,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: "-0.015em",
        textTransform: "lowercase",
      }}
    >
      destira
    </span>
  );
}

interface DestiraLockupProps {
  orientation?: "horizontal" | "stacked";
  /** Mark width in px; the wordmark scales from it. */
  size: number;
  variant?: MarkVariant;
  className?: string;
}

export function DestiraLockup({ orientation = "horizontal", size, variant = "colour", className }: DestiraLockupProps) {
  const gap = size * LOCKUP_GAP[orientation];
  const wordSize = size * WORDMARK_RATIO[orientation];

  return (
    <span
      className={className}
      role="img"
      aria-label="Destira"
      style={{
        display: "inline-flex",
        flexDirection: orientation === "horizontal" ? "row" : "column",
        alignItems: "center",
        gap,
      }}
    >
      <DestiraMark size={size} variant={variant} decorative />
      <DestiraWordmark size={wordSize} />
    </span>
  );
}

/** The mark in motion (brief 5.8 / 7.19). `join`: the two rings slide
 *  together along their tilt and the lens fills in, in 600 ms, then the
 *  mark breathes. `drift`: the rings drift apart and back, the lens fading
 *  as they part (the 404). Reduced motion shows the still mark. The lens is
 *  drawn static and only faded, so the clip geometry never has to move. */
export function DestiraMarkMotion({ size, mode = "join", className }: { size: number; mode?: "join" | "drift"; className?: string }) {
  const clipId = useId();
  const stroke = strokeForSize(size);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="10 9 140 102"
      width={size}
      height={Math.round(size * (102 / 140))}
      className={`vf-mark-motion vf-mark-${mode}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="96" cy="60" r="34" />
        </clipPath>
      </defs>
      <g transform="rotate(-15 80 60)">
        <circle className="vf-ring-mint" cx="96" cy="60" r="34" fill="none" stroke={MINT} strokeWidth={stroke} />
        <circle className="vf-ring-ember" cx="64" cy="60" r="34" fill="none" stroke={EMBER} strokeWidth={stroke} />
        <g className="vf-ring-lens" clipPath={`url(#${clipId})`}>
          <circle cx="64" cy="60" r="34" fill={`var(--vf-lens, ${CREAM})`} />
        </g>
      </g>
    </svg>
  );
}

/** The one app-wide loading screen: the rings draw together, then breathe.
 *  Pass `message` whenever the wait has a reason worth saying.
 *  Used for every in-app "waiting on auth/profile" checkpoint (App.tsx's
 *  route guards, AuthCallback) so there's a single place that decides what
 *  "Destira is loading" looks like, instead of each call site reaching for
 *  DestiraMark variant="tile" (the <28px glyph — wrong at this size, and the
 *  exact bug that had the wrong icon showing everywhere else too). */
export function DestiraLoadingScreen({ message }: { message?: string } = {}) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-background text-vf-text" role="status" aria-live="polite">
      <DestiraMarkMotion size={84} mode="join" />
      <DestiraWordmark size={34} className="mt-3" />
      <p className={`mt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-vf-faint ${message ? "" : "sr-only"}`}>
        {message ?? "Loading"}
      </p>
    </div>
  );
}
