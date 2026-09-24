import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface LightboxPhoto {
  url: string;
}

interface PhotoLightboxProps {
  photos: LightboxPhoto[];
  initialIndex?: number;
  onClose: () => void;
}

/** Full, uncropped view of a photo exactly as uploaded (object-contain, not
 *  the object-cover crop every thumbnail/card uses) — tap the left/right
 *  third to step, arrow keys work, swipe down or the X to close. */
export function PhotoLightbox({ photos, initialIndex = 0, onClose }: PhotoLightboxProps) {
  const [index, setIndex] = useState(Math.min(Math.max(initialIndex, 0), Math.max(photos.length - 1, 0)));

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIndex((i) => Math.min(photos.length - 1, i + 1)), [photos.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, onClose]);

  const current = photos[index];
  if (!current) return null;

  const handleAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (photos.length < 2) return;
    if (x < rect.width / 3) goPrev();
    else if (x > (rect.width * 2) / 3) goNext();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.96)" }}
      data-testid="photo-lightbox-overlay"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full flex items-center justify-center text-white"
        style={{ background: "rgba(255,255,255,0.12)" }}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close"
        data-testid="button-close-lightbox"
      >
        <X className="w-5 h-5" />
      </button>

      {photos.length > 1 && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-10 font-mono text-[11px] tracking-[0.14em] text-white/70"
          data-testid="text-lightbox-count"
        >
          {index + 1} / {photos.length}
        </div>
      )}

      <div
        className="relative w-full h-full flex items-center justify-center"
        onClick={(e) => { e.stopPropagation(); handleAreaClick(e); }}
        data-testid="photo-lightbox-tap-area"
      >
        <img
          src={current.url}
          alt=""
          className="max-w-full max-h-full object-contain select-none"
          onClick={(e) => e.stopPropagation()}
          data-testid="img-lightbox"
        />
      </div>

      {index > 0 && (
        <button
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 hidden md:flex items-center justify-center text-white/80 hover:text-white"
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          aria-label="Previous photo"
          data-testid="button-lightbox-prev"
        >
          <ChevronLeft className="w-7 h-7" />
        </button>
      )}
      {index < photos.length - 1 && (
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 hidden md:flex items-center justify-center text-white/80 hover:text-white"
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          aria-label="Next photo"
          data-testid="button-lightbox-next"
        >
          <ChevronRight className="w-7 h-7" />
        </button>
      )}
    </div>
  );
}
