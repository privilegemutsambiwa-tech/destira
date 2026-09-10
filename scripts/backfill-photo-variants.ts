// Generate the webp derivatives + strip EXIF for user_photos rows uploaded
// before the pipeline existed (server POST /api/uploads/image now does this on
// upload). Safe to re-run — skips rows that already have both variants on disk.
//
//   npx tsx --env-file=.env scripts/backfill-photo-variants.ts          # dry run
//   npx tsx --env-file=.env scripts/backfill-photo-variants.ts --write

import { db } from "../server/db";
import { userPhotos } from "@shared/schema";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";

const WRITE = process.argv.includes("--write");
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

async function main() {
  const rows = await db.select().from(userPhotos);
  let done = 0;
  let skipped = 0;

  for (const r of rows) {
    if (!r.photoUrl.startsWith("/uploads/")) {
      skipped++;
      continue;
    }
    const filename = r.photoUrl.slice("/uploads/".length);
    const abs = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(abs)) {
      console.log(`  [missing] #${r.id} ${filename}`);
      skipped++;
      continue;
    }
    const base = filename.replace(/\.[^.]+$/, "");
    const w800Name = `${base}.w800.webp`;
    const w1600Name = `${base}.w1600.webp`;
    const v = (r.variants ?? {}) as { w800?: string; w1600?: string };
    const already =
      v.w800 && v.w1600 &&
      fs.existsSync(path.join(UPLOAD_DIR, w800Name)) &&
      fs.existsSync(path.join(UPLOAD_DIR, w1600Name));
    if (already) {
      skipped++;
      continue;
    }

    console.log(`  #${r.id} ${filename} -> ${w800Name}, ${w1600Name}${WRITE ? "" : "  (dry run)"}`);
    if (WRITE) {
      const buf = await fs.promises.readFile(abs);
      // strip metadata from the stored original
      await fs.promises.writeFile(abs, await sharp(buf).rotate().toBuffer());
      const meta = await sharp(buf).metadata();
      await sharp(buf).rotate().resize({ width: 800, withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(UPLOAD_DIR, w800Name));
      await sharp(buf).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(UPLOAD_DIR, w1600Name));
      await db
        .update(userPhotos)
        .set({
          variants: { w800: `/uploads/${w800Name}`, w1600: `/uploads/${w1600Name}` },
          width: r.width ?? meta.width ?? null,
          height: r.height ?? meta.height ?? null,
        })
        .where(eq(userPhotos.id, r.id));
    }
    done++;
  }

  console.log(`\n${WRITE ? "processed" : "would process"}: ${done}; skipped (no file / already done / external): ${skipped}`);
  if (!WRITE && done > 0) console.log("re-run with --write to apply.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
