// Loads posts made by scripts/generate-official-status.mjs into the official
// Destira status library (the same thing the console's upload does), then
// makes today's set. Skips anything already loaded (same caption + event) and
// any post about an event that doesn't exist in this database.
//
//   npx tsx --env-file=.env.dev scripts/seed-official-status.ts <dir with manifest.json>
//   npx tsx --env-file=.env     scripts/seed-official-status.ts <dir>   # production
//
// Add --no-rebuild to load the library without making today's set (e.g. when
// the server running against this database doesn't have the new code yet).
import { readFileSync } from "fs";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../server/db";
import { officialStoryItems, events } from "../shared/schema";
import { putObject, ensureBucketExists } from "../server/storage/objectStorage";
import { rebuildToday } from "../server/official-stories";

interface Entry { file: string; mediaType: "image" | "video"; durationSec?: number; caption: string | null; ctaLabel: string | null; ctaUrl: string | null; eventId: number | null }

const dir = process.argv[2];
const rebuild = !process.argv.includes("--no-rebuild");
if (!dir) throw new Error("usage: seed-official-status.ts <dir>");
const manifest: Entry[] = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8"));
await ensureBucketExists().catch(() => {});

let added = 0;
for (const m of manifest) {
  if (m.eventId != null) {
    const [ev] = await db.select({ id: events.id }).from(events).where(eq(events.id, m.eventId));
    if (!ev) {
      console.log(`skip ${m.file}: event #${m.eventId} isn't in this database`);
      continue;
    }
  }
  const [dupe] = await db
    .select({ id: officialStoryItems.id })
    .from(officialStoryItems)
    .where(and(eq(officialStoryItems.caption, m.caption ?? ""), m.eventId != null ? eq(officialStoryItems.eventId, m.eventId) : isNull(officialStoryItems.eventId)));
  if (dupe) {
    console.log(`skip ${m.file}: already in the library (#${dupe.id})`);
    continue;
  }
  const ext = m.file.slice(m.file.lastIndexOf("."));
  const key = `official-${m.file.replace(/\.[^.]+$/, "")}-${Date.now()}${ext}`;
  await putObject(key, readFileSync(`${dir}/${m.file}`), m.mediaType === "video" ? "video/mp4" : "image/jpeg");
  const [item] = await db
    .insert(officialStoryItems)
    .values({
      mediaUrl: `/uploads/${key}`,
      mediaType: m.mediaType,
      durationSec: m.durationSec ?? null,
      caption: m.caption,
      ctaLabel: m.ctaLabel,
      ctaUrl: m.ctaUrl,
      eventId: m.eventId,
      evergreen: true,
    })
    .returning();
  console.log(`added #${item.id} ${m.file}`);
  added++;
}
console.log(`${added} added${rebuild ? `; today's posts: ${await rebuildToday()}` : "; today's set left for the server to make"}`);
process.exit(0);
