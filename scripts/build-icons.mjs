// Rasterises the brand SVGs to the PNGs that index.html / manifest.webmanifest
// reference. Run after any change to vibeflow-icon.svg / vibeflow-icon-square.svg.
//
//   npm run build:icons
//
// Needs sharp:  npm i -D sharp
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const brandDir = join(dirname(fileURLToPath(import.meta.url)), "..", "client", "public", "brand");

// [source svg, output png, pixel size]
const targets = [
  ["vibeflow-icon.svg", "vibeflow-icon-180.png", 180], // apple-touch-icon
  ["vibeflow-icon.svg", "vibeflow-icon-192.png", 192], // <link rel=icon> fallback
  ["vibeflow-icon.svg", "vibeflow-icon-512.png", 512],
  ["vibeflow-icon-square.svg", "vibeflow-maskable-192.png", 192], // manifest, purpose "any maskable"
  ["vibeflow-icon-square.svg", "vibeflow-maskable-512.png", 512],
];

for (const [src, out, size] of targets) {
  const svg = await readFile(join(brandDir, src));
  const png = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await writeFile(join(brandDir, out), png);
  console.log(`  ${src.padEnd(24)} -> ${out}  (${size}x${size})`);
}

console.log("icons built.");
