// Regenerates the responsive variants for the Landing photo slots.
// Source originals live in client/public/photos/_src/<slot>.jpg (git-ignored);
// this writes <slot>-{640,960,1440,1920}.webp + a <slot>.jpg fallback.
//
//   npm run photos
import sharp from "sharp";
import { readdir, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const photosDir = join(dirname(fileURLToPath(import.meta.url)), "..", "client", "public", "photos");
const srcDir = join(photosDir, "_src");

const WIDTHS = [640, 960, 1440, 1920];

// slot -> [w, h] aspect ratio the frame reserves
const RATIOS = {
  "hero-primary": [4, 5],
  "hero-secondary": [1, 1],
  "turn": [16, 9],
  "group-late-practice": [3, 2],
  "group-sunday-trail": [3, 2],
  "group-table-for-six": [3, 2],
  "closing": [16, 9],
};

const files = (await readdir(srcDir)).filter((f) => /\.(jpe?g|png)$/i.test(f));
await mkdir(photosDir, { recursive: true });

for (const file of files) {
  const slot = file.replace(/\.(jpe?g|png)$/i, "");
  const ratio = RATIOS[slot];
  if (!ratio) {
    console.warn(`  ${slot}: no ratio mapping, skipped`);
    continue;
  }
  const [rw, rh] = ratio;
  const input = join(srcDir, file);

  for (const w of WIDTHS) {
    const h = Math.round((w * rh) / rw);
    await sharp(input)
      .resize(w, h, { fit: "cover", position: "centre" })
      .webp({ quality: 78 })
      .toFile(join(photosDir, `${slot}-${w}.webp`));
  }
  // jpg fallback at 1440 for <img src>
  const h1440 = Math.round((1440 * rh) / rw);
  await sharp(input)
    .resize(1440, h1440, { fit: "cover", position: "centre" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(join(photosDir, `${slot}.jpg`));

  console.log(`  ${slot.padEnd(22)} ${rw}:${rh}  -> 4 webp + jpg`);
}

console.log("photos regenerated.");
