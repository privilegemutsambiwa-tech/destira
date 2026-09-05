import type React from "react";

// Every photograph on the marketing site renders through this. It reserves the
// exact aspect box up front (zero CLS whether or not an image is supplied),
// carries the house treatment, and — only when a caption is present — lays down
// the scrim that turns a stock-looking frame into evidence.
//
// THE RULE the captions enforce: never a photo you could swipe on, always a
// photo of an evening that happened. Two people, mid-interaction, place in
// frame, no one looking at the lens.

const WIDTHS = [640, 960, 1440, 1920] as const;

export interface PhotoFrameProps {
  /** Image URL. Absent → the reserved empty state (a labelled box). */
  src?: string;
  /** DM Mono, uppercase, tracked. Naming the resonance + where they met is what
   *  converts the image into proof. Omit on the Communities covers. */
  caption?: string;
  /** CSS aspect-ratio, e.g. "4/5" | "16/9" | "3/2" | "1/1". */
  ratio: string;
  /** "warm" = a sub-10% ember duotone lift so donated imagery stops looking donated. */
  treatment?: "warm" | "plain";
  /** Eager-load + high priority. Use for the hero primary only. */
  priority?: boolean;
  /** REQUIRED whenever src is set — throws in dev otherwise. */
  alt?: string;
  /** Marks the slot for the person filling photos in. */
  slot?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function PhotoFrame({
  src,
  caption,
  ratio,
  treatment = "plain",
  priority = false,
  alt,
  slot,
  className = "",
  style,
}: PhotoFrameProps) {
  if (import.meta.env.DEV && src && !alt) {
    throw new Error(`PhotoFrame(${slot ?? "?"}): alt text is required when src is set`);
  }

  const warm = treatment === "warm";

  return (
    <figure
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio: ratio, borderRadius: "20px", ...style }}
      data-photo-slot={slot}
    >
      {src ? (
        <img
          src={src}
          srcSet={WIDTHS.map((w) => `${src}?w=${w} ${w}w`).join(", ")}
          sizes="(min-width: 1024px) 45vw, 100vw"
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          style={warm ? { filter: "saturate(1.05)" } : undefined}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-vf-surface2">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">Photo</span>
        </div>
      )}

      {src && warm && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: "#FF6B4A", opacity: 0.07, mixBlendMode: "soft-light" }}
        />
      )}

      {/* inset hairline */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ borderRadius: "20px", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.09)" }}
      />

      {caption && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-vf-ink/85 to-transparent"
            style={{ height: "45%" }}
          />
          <figcaption
            className="absolute bottom-4 left-4 right-4 font-mono text-[10.5px] uppercase tracking-[0.16em]"
            style={{ color: "rgba(245,240,234,0.9)" }}
          >
            {caption}
          </figcaption>
        </>
      )}
    </figure>
  );
}
