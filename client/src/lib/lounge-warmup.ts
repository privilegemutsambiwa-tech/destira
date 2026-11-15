// The Lounge, ready before it's opened. When the room list is on screen, the
// latest messages of the member's own rooms are fetched quietly in the
// background, and the photos in them are downloaded into the phone's cache.
// The React Query cache is saved to the phone (lib/offline-cache.ts), so the
// next time they open the app and tap a room, its messages and faces are
// already there, even with no connection, and simply refresh.
import type { QueryClient } from "@tanstack/react-query";
import { enrichedMessagesQuery } from "@/hooks/use-interactions";
import { dataSaverOn } from "@/lib/data-saver";

/** Rooms warmed at once: the ones a member is most likely to open next. */
const ROOMS = 6;
/** Photos preloaded per pass, so a busy room can't pull in hundreds. */
const PHOTOS = 60;

const warmedPhotos = new Set<string>();
let lastRun = 0;

function photoUrlsIn(value: unknown, out: Set<string>, depth = 0) {
  if (out.size >= PHOTOS || depth > 8) return;
  if (typeof value === "string") {
    if (/^(https?:\/\/[^\s"]+)?\/(m|uploads)\/[^\s"]+\.(jpe?g|png|webp|gif)(\?|$)/i.test(value)) out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) photoUrlsIn(v, out, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) photoUrlsIn(v, out, depth + 1);
  }
}

function preloadPhotos(urls: Iterable<string>) {
  for (const url of urls) {
    if (warmedPhotos.has(url)) continue;
    warmedPhotos.add(url);
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  }
}

/** Call with the member's rooms, most likely to be opened first. Cheap to
 *  call often: it runs at most once a minute and skips fresh rooms. */
export function warmLounge(qc: QueryClient, rooms: { id: number | string }[]) {
  if (!rooms.length || Date.now() - lastRun < 60_000) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  lastRun = Date.now();
  const saver = dataSaverOn();
  const photos = new Set<string>();

  // Room covers and faces from the list itself.
  photoUrlsIn(rooms, photos);

  const ids = rooms.slice(0, saver ? 2 : ROOMS).map((r) => Number(r.id)).filter(Number.isFinite);
  // One after another, after the screen has settled: never competing with
  // what the member is looking at.
  const run = async () => {
    for (const id of ids) {
      try {
        const msgs = await qc.fetchQuery({ ...enrichedMessagesQuery(id), staleTime: 30_000 });
        if (!saver) photoUrlsIn(msgs, photos);
      } catch {
        /* offline or not a member any more: nothing to warm */
      }
    }
    preloadPhotos(photos);
  };
  const idle = (window as any).requestIdleCallback as ((cb: () => void, o?: { timeout: number }) => void) | undefined;
  if (idle) idle(() => void run(), { timeout: 2500 });
  else window.setTimeout(() => void run(), 1200);
}
