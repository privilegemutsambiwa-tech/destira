// One-off, idempotent: the official Destira status (library + daily marker)
// and the story columns it needs. Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-official-stories.ts
//   npx tsx --env-file=.env     scripts/migrate-official-stories.ts   # production
import { client } from "../server/db";

async function run(sql: string) {
  const c: any = client;
  // PGlite: exec() runs multi-statement scripts. pg Pool: query() does.
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    ALTER TABLE stories ADD COLUMN IF NOT EXISTS publish_at timestamp NOT NULL DEFAULT now();
    ALTER TABLE stories ADD COLUMN IF NOT EXISTS official_item_id integer;
    ALTER TABLE story_media ADD COLUMN IF NOT EXISTS cta_label text;
    ALTER TABLE story_media ADD COLUMN IF NOT EXISTS cta_url text;
    ALTER TABLE story_media ADD COLUMN IF NOT EXISTS duration_sec integer;
    CREATE TABLE IF NOT EXISTS official_story_items (
      id serial PRIMARY KEY,
      media_url text NOT NULL,
      media_type text NOT NULL,
      duration_sec integer,
      caption text,
      cta_label text,
      cta_url text,
      event_id integer REFERENCES events(id) ON DELETE SET NULL,
      scheduled_for date,
      evergreen boolean NOT NULL DEFAULT true,
      active boolean NOT NULL DEFAULT true,
      times_shown integer NOT NULL DEFAULT 0,
      last_shown_on date,
      created_by varchar,
      created_at timestamp DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS official_story_days (
      day date PRIMARY KEY,
      story_ids integer[],
      created_at timestamp DEFAULT now()
    );
  `);
  console.log("official stories migration done");
  process.exit(0);
}

main().catch((e) => {
  console.error("migration failed:", e);
  process.exit(1);
});
