// One-off, idempotent: adds the Official Events columns to `events`, the
// `event_lead_applications` table, and the "Destira" system user/profile that
// hosts official events. Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-official-events.ts
//   npx tsx --env-file=.env     scripts/migrate-official-events.ts   # production
import { client } from "../server/db";
import { ensureDestiraSystemUser } from "../server/official-events";

async function run(sql: string) {
  const c: any = client;
  // PGlite: exec() runs multi-statement scripts. pg Pool: query() does.
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    ALTER TABLE events ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS lead_user_id varchar REFERENCES users(id);
    ALTER TABLE events ADD COLUMN IF NOT EXISTS sponsor_name text;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS sponsor_logo_url text;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS min_going integer;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS lead_nudged_at timestamp;
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS event_lead_applications (
      id serial PRIMARY KEY,
      event_id integer NOT NULL REFERENCES events(id),
      user_id varchar NOT NULL REFERENCES users(id),
      note text,
      status text NOT NULL DEFAULT 'pending',
      created_at timestamp DEFAULT now(),
      decided_at timestamp
    );
    CREATE UNIQUE INDEX IF NOT EXISTS event_lead_applications_event_user_idx
      ON event_lead_applications (event_id, user_id);
  `);
  const id = await ensureDestiraSystemUser();
  console.log(`official events migration done; system user id = ${id}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("migration failed:", e);
  process.exit(1);
});
