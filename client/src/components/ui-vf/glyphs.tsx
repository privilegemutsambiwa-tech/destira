// Destira's own five glyphs (docs/destira-upgrade-prompt.md §4.4), drawn on
// Lucide's 24 px grid with its 1.5 px round stroke so they sit beside Lucide
// icons without looking borrowed. currentColor throughout: the parent decides
// the colour (mint for the twin, never anything else).
import type { SVGProps } from "react";

type GlyphProps = SVGProps<SVGSVGElement> & { size?: number };

function Glyph({ size = 20, children, ...rest }: GlyphProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** The twin: the logo's two rings, tilted as in the mark. */
export function TwinGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <g transform="rotate(-15 12 12)">
        <circle cx="9" cy="12" r="6" />
        <circle cx="15" cy="12" r="6" />
      </g>
    </Glyph>
  );
}

/** Resonance: an open dial with its needle. */
export function ResonanceGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M5.64 18.36a9 9 0 1 1 12.72 0" />
      <path d="M12 13.5 15.5 8.5" />
      <circle cx="12" cy="14" r="1.25" />
    </Glyph>
  );
}

/** Tonight's three: three portraits, the middle one stepping forward. */
export function TonightGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="2.75" y="8.5" width="5" height="9" rx="2.5" />
      <rect x="9.5" y="5.5" width="5" height="11" rx="2.5" />
      <rect x="16.25" y="8.5" width="5" height="9" rx="2.5" />
      <path d="M8 20.5h8" />
    </Glyph>
  );
}

/** A seat: the event ticket, with its perforation. */
export function SeatGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M4 6.5h16a1 1 0 0 1 1 1V10a2 2 0 0 0 0 4v2.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V14a2 2 0 0 0 0-4V7.5a1 1 0 0 1 1-1Z" />
      <path d="M15 6.5v2M15 11v2M15 15.5v2" />
    </Glyph>
  );
}

/** The Lounge: people gathered round a table. */
export function LoungeGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="13" r="3.5" />
      <circle cx="12" cy="4.75" r="1.75" />
      <circle cx="4.5" cy="17.5" r="1.75" />
      <circle cx="19.5" cy="17.5" r="1.75" />
    </Glyph>
  );
}
