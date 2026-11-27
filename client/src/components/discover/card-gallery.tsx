// Discover: the photo gallery on a card, and the small formatters the card uses.

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { avatarColor } from "@/lib/avatar-color";
import { dataSaverOn, photoForSaver } from "@/lib/data-saver";

export function formatDistance(km: number): string {
  if (km < 1) return "Less than 1km away";
  if (km >= 100) return `${Math.round(km)}km away`;
  return `${km.toFixed(1)}km away`;
}

// There is no resonance score. The old dial averaged a profile's own trait
// numbers (only demo profiles had any) and called it compatibility; that's a
// guess dressed as a fact. The card says why two people might click instead,
// from things that are true (server/click-reasons.ts).

/** "Good evening", by the member's own clock. */
export function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export type GalleryPhoto = {
  id?: number;
  url: string;
  w800: string | null;
  w1600: string | null;
  role: string;
  focalX: number;
  focalY: number;
};

// The photo pane as a stepped gallery. Mirrors StoryViewer's vocabulary —
// segment ticks up top, tap the left/right third, arrow keys, hover chevrons on
// desktop. Stepping never advances the profile; it only moves within this card.
export function CardGallery({ photos, initial, seed }: { photos: GalleryPhoto[]; initial: string; seed?: string }) {
  const [idx, setIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const count = photos.length;

  useEffect(() => {
    setIdx(0);
  }, [photos]);

  const go = useCallback(
    (dir: 1 | -1) => setIdx((i) => (count ? (i + dir + count) % count : 0)),
    [count],
  );

  useEffect(() => {
    if (count < 2) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, go]);

  // preload the next photo only
  useEffect(() => {
    if (count < 2) return;
    const next = photos[(idx + 1) % count];
    const img = new Image();
    img.src = next.w800 ?? next.url;
  }, [idx, count, photos]);

  if (count === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: avatarColor(seed) }}>
        <span className="font-serif text-white/90" style={{ fontSize: "96px" }}>
          {initial}
        </span>
      </div>
    );
  }

  const p = photos[idx];
  return (
    <div className="absolute inset-0 group">
      <img
        key={p.url}
        src={p.w800 ?? p.url}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: `${(p.focalX ?? 0.5) * 100}% ${(p.focalY ?? 0.5) * 100}%` }}
      />

      {count > 1 && (
        <>
          <div className="absolute top-2 inset-x-2 z-20 flex gap-1" aria-hidden="true">
            {photos.map((_, i) => (
              <div
                key={i}
                className="flex-1 h-[3px] rounded-full overflow-hidden"
                style={{ background: "rgba(255,255,255,0.28)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: i <= idx ? "100%" : "0%", background: "rgba(255,255,255,0.95)" }}
                />
              </div>
            ))}
          </div>

          {/* tap zones — start below the story-ring / badge band */}
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous photo"
            className="absolute left-0 top-14 bottom-0 w-1/3 z-10 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next photo"
            className="absolute right-0 top-14 bottom-0 w-1/3 z-10 focus:outline-none"
          />

          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous photo"
            className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next photo"
            className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>

          <span className="absolute bottom-3 right-3 z-20 font-mono text-[10px] tracking-[0.16em] text-white/70">
            {idx + 1}/{count}
          </span>
        </>
      )}

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setLightboxOpen(true); }}
        aria-label="View full photo"
        className="absolute bottom-3 left-3 z-20 w-8 h-8 rounded-full flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
        data-testid="button-expand-photo"
      >
        <Maximize2 className="w-3.5 h-3.5 text-white" />
      </button>

      {lightboxOpen && (
        <PhotoLightbox
          photos={photos.map((ph) => ({ url: photoForSaver(ph.w1600, ph.w800, dataSaverOn()) ?? ph.url }))}
          initialIndex={idx}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}
