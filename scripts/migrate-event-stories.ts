// One-off, idempotent: story_media.event_id, so a story can point at an event.
// Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-event-stories.ts
//   npx tsx --env-file=.env     scripts/migrate-event-stories.ts   # production
import { client } from "../server/db";

async function run(sql: string) {
  const c: any = client;
  // PGlite: exec() runs multi-statement scripts. pg Pool: query() does.
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    ALTER TABLE story_media ADD COLUMN IF NOT EXISTS event_id integer REFERENCES events(id) ON DELETE SET NULL;
  `);
  console.log("event stories migration done");
  process.exit(0);
}

main().catch((e) => {
  console.error("migration failed:", e);
  process.exit(1);
});
