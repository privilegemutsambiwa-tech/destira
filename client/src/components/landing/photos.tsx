// Landing: the local photo library and the living wall built from it.

import type React from "react";
import { useEffect, useState } from "react";
import type { Photo } from "@/lib/photos";
import { isNativeApp } from "@/lib/native";
import { useDataSaver } from "@/lib/data-saver";
import { usePrefersReducedMotion } from "./shared";

// The app doesn't carry the website's photo library (hundreds of MB); its
// welcome screen loads these from destira.date and shows the blurred
// placeholder while offline.
const PHOTO_ORIGIN = isNativeApp() ? "https://www.destira.date" : "";

const remote = (u: string) => u.replace(/(^|\s|,)\/photos\//g, `$1${PHOTO_ORIGIN}/photos/`);

// ── Photos ───────────────────────────────────────────────────────────
// Destira launches in Zimbabwe, so the landing shows Black couples only:
// a hand-picked set from client/public/photos (hero-81+ repeat 26–80, so
// only the originals are listed). Order is for variety along each column.
const LOCAL_ORDER = [39, 64, 26, 46, 59, 41, 43, 62, 66, 36, 38, 28, 70, 30, 42, 44, 45, 52, 56, 61, 65, 67, 68, 71, 75, 37];

//
// The manifest (lib/photos.ts) is mostly blur-up placeholders for every
// photo, so it loads as its own chunk instead of sitting in the app's first
// load. The request starts as soon as this module runs, so it overlaps with
// the first render; the headline and buttons never wait for it.
interface PhotoSet {
  local: Photo[];
  byName: Map<string, Photo>;
  pick: (...ns: number[]) => Photo[];
}

let photoSet: PhotoSet | null = null;

let photoLoad: Promise<PhotoSet> | null = null;

function loadPhotos(): Promise<PhotoSet> {
  photoLoad ??= import("@/lib/photos").then(({ photos }) => {
    const all: Photo[] = PHOTO_ORIGIN
      ? photos.map((p) => ({ ...p, src: remote(p.src), srcSet: remote(p.srcSet), webpSrcSet: remote(p.webpSrcSet), variants: p.variants.map((v) => ({ ...v, webp: remote(v.webp), jpg: remote(v.jpg) })) }))
      : photos;
    const byName = new Map(all.map((p) => [p.name, p]));
    const pick = (...ns: number[]) => ns.map((n) => byName.get(`hero-${n}`)).filter((p): p is Photo => !!p);
    photoSet = { local: pick(...LOCAL_ORDER), byName, pick };
    return photoSet;
  });
  return photoLoad;
}
if (typeof window !== "undefined") loadPhotos().catch(() => { photoLoad = null; });

export function usePhotos(): PhotoSet | null {
  const [set, setSet] = useState(photoSet);
  useEffect(() => {
    if (set) return;
    let live = true;
    loadPhotos().then((s) => live && setSet(s)).catch(() => {});
    return () => {
      live = false;
    };
  }, [set]);
  return set;
}

/** Wall tiles are small, so their srcset stops at 960w. */
const tileSet = (p: Photo, ext: "webp" | "jpg") =>
  p.variants
    .filter((v) => v.width <= 960)
    .map((v) => `${v[ext]} ${v.width}w`)
    .join(", ");

export function PhotoTile({
  p,
  eager = false,
  sizes = "(min-width: 1024px) 18vw, 46vw",
  ratio = "3/4",
  className = "",
  style,
  position = "center 35%",
}: {
  p: Photo;
  eager?: boolean;
  sizes?: string;
  ratio?: string;
  className?: string;
  style?: React.CSSProperties;
  position?: string;
}) {
  return (
    <div className={`relative w-full overflow-hidden ${className}`} style={{ aspectRatio: ratio, ...style }}>
      <picture>
        <source type="image/webp" srcSet={tileSet(p, "webp")} sizes={sizes} />
        <img
          src={p.variants[0]?.jpg ?? p.src}
          srcSet={tileSet(p, "jpg")}
          sizes={sizes}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: position, backgroundImage: `url("${p.lqip}")`, backgroundSize: "cover" }}
        />
      </picture>
    </div>
  );
}

/** The living wall: columns of couples drifting past each other, slowly, in
 *  opposite directions. Each column holds its photos twice and scrolls by
 *  exactly one copy, so the loop is seamless. Still under reduced motion,
 *  and only a few photos when the visitor is saving data. */
export function PhotoWall({
  photos,
  columns = 3,
  eager = false,
  className = "",
  style,
}: {
  photos: Photo[];
  columns?: number;
  eager?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const reduce = usePrefersReducedMotion();
  const { on: saving } = useDataSaver();
  const perCol = saving ? 2 : 5;
  const cols = Array.from({ length: columns }, (_, c) => photos.slice(c * perCol, c * perCol + perCol));
  const moving = !reduce && !saving;
  return (
    <div className={`flex gap-3 ${className}`} style={style} aria-hidden="true">
      {cols.map((col, c) => (
        <div key={c} className={`flex-1 min-w-0 ${c >= 2 ? "hidden lg:block" : ""}`} style={{ marginTop: c % 2 ? "-22%" : 0 }}>
          <div
            className={moving ? (c % 2 ? "vf-wall-down" : "vf-wall-up") : ""}
            style={moving ? { animationDuration: `${84 + c * 14}s` } : undefined}
          >
            {(moving ? [...col, ...col] : col).map((p, i) => (
              <div key={i} className="pb-3">
                <PhotoTile p={p} eager={eager && i < 2 && c < 2} className="rounded-[20px] bg-white/5" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
