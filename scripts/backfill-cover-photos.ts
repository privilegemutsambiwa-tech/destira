// One-off backfill for the "uploaded photos don't show in Discover" bug.
//
//   npx tsx --env-file=.env scripts/backfill-cover-photos.ts        # dry run
//   npx tsx --env-file=.env scripts/backfill-cover-photos.ts --write
//
// Before the fix, uploads landed as role 'gallery' and profiles.coverPhotoUrl
// was only ever written by an explicit role pick — so users who uploaded and
// never opened the role picker had coverPhotoUrl = NULL and showed a monogram
// to everyone else. This promotes each such profile's lowest-orderIndex photo
// to 'cover' and mirrors the URL into profiles.coverPhotoUrl.
//
// Idempotent: skips any profile that already has a coverPhotoUrl or an existing
// role='cover' photo.

import { db } from "../server/db";
import { profiles, userPhotos } from "@shared/schema";
import { and, eq, isNull, asc } from "drizzle-orm";

const WRITE = process.argv.includes("--write");

async function main() {
  const targets = await db
    .select({ userId: profiles.userId, displayName: profiles.displayName })
    .from(profiles)
    .where(isNull(profiles.coverPhotoUrl));

  let touched = 0;
  let skipped = 0;

  for (const t of targets) {
    const photos = await db
      .select()
      .from(userPhotos)
      .where(eq(userPhotos.userId, t.userId))
      .orderBy(asc(userPhotos.orderIndex));

    if (photos.length === 0) {
      skipped++;
      continue;
    }
    if (photos.some((p) => p.role === "cover")) {
      // A cover row exists but the column is NULL — mirror drift. Repair it.
      const cover = photos.find((p) => p.role === "cover")!;
      console.log(`  [drift] ${t.displayName ?? t.userId}: cover #${cover.id} exists, coverPhotoUrl was NULL`);
      if (WRITE) {
        await db.update(profiles).set({ coverPhotoUrl: cover.photoUrl }).where(eq(profiles.userId, t.userId));
      }
      touched++;
      continue;
    }

    const promote = photos[0]; // lowest orderIndex
    console.log(
      `  ${t.displayName ?? t.userId}: promote photo #${promote.id} (order ${promote.orderIndex}) -> cover  ${promote.photoUrl}`,
    );
    if (WRITE) {
      await db.transaction(async (tx) => {
        await tx.update(userPhotos).set({ role: "cover" }).where(eq(userPhotos.id, promote.id));
        await tx
          .update(profiles)
          .set({ coverPhotoUrl: promote.photoUrl })
          .where(eq(profiles.userId, t.userId));
      });
    }
    touched++;
  }

  console.log(
    `\n${WRITE ? "wrote" : "would write"}: ${touched} profile(s); ${skipped} with no photos left as-is.`,
  );
  if (!WRITE && touched > 0) console.log("re-run with --write to apply.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
