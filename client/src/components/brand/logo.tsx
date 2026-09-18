import { useId } from "react";

// The Overlap. Two rings — ember (#FF6B4A, the human) in front, mint
// (#8FE3C7, the AI twin) behind — tilted 15°, with the lens where they
// intersect lit in cream. The lens is the resonance. Geometry is transcribed
// verbatim from the brand spec / docs/redesign-reference; do not "clean up"
// the viewBox or the circle coordinates.

const EMBER = "#FF6B4A";
const MINT = "#8FE3C7";
const CREAM = "#F5F0EA";
const TILE_LENS = "#FFF6EE";

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
  /** colour = ember+mint+cream · mono = currentColor throughout · tile = lens on an ember square (use <28px). */
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
            <circle cx="96" cy="60" r="34" />
          </clipPath>
        </defs>
        <rect x="0" y="0" width="64" height="64" rx="14" fill={EMBER} />
        <g transform="translate(-34.2 -17.6) scale(0.827)">
          <g transform="rotate(-15 80 60)">
            <g clipPath={`url(#${clipId})`}>
              <circle cx="64" cy="60" r="34" fill={TILE_LENS} />
            </g>
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
          <circle cx="64" cy="60" r="34" fill={isMono ? "currentColor" : CREAM} />
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

/** The one app-wide loading screen — full-bleed, real two-ring mark, breathing.
 *  Used for every in-app "waiting on auth/profile" checkpoint (App.tsx's
 *  route guards, AuthCallback) so there's a single place that decides what
 *  "Destira is loading" looks like, instead of each call site reaching for
 *  DestiraMark variant="tile" (the <28px glyph — wrong at this size, and the
 *  exact bug that had the wrong icon showing everywhere else too). */
export function DestiraLoadingScreen() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-background">
      <DestiraLockup
        orientation="stacked"
        size={64}
        className="motion-safe:animate-[vf-breathe_3.2s_ease-in-out_infinite]"
      />
    </div>
  );
}
