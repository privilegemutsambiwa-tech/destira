// Destira Crown (shared/crown.ts, server/crown.ts): applications and members.
// Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-crown.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-crown.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  // PGlite: exec() runs multi-statement scripts. pg Pool: query() does.
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    CREATE TABLE IF NOT EXISTS crown_members (
      user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'applied',
      city text NOT NULL DEFAULT 'Harare',
      note text,
      applied_at timestamp DEFAULT now(),
      decided_at timestamp,
      decided_by varchar,
      reason text,
      active_until timestamp,
      updated_at timestamp DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS crown_members_status_idx ON crown_members (status);
    ALTER TABLE crown_members ADD COLUMN IF NOT EXISTS private_mode boolean NOT NULL DEFAULT false;

    CREATE TABLE IF NOT EXISTS crown_spotlights (
      id serial PRIMARY KEY,
      viewer_id varchar NOT NULL,
      crown_id varchar NOT NULL,
      day text NOT NULL,
      created_at timestamp DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS crown_spotlights_viewer_crown_day_idx ON crown_spotlights (viewer_id, crown_id, day);

    CREATE TABLE IF NOT EXISTS crown_intros (
      id serial PRIMARY KEY,
      match_id integer NOT NULL,
      from_user_id varchar NOT NULL,
      to_user_id varchar NOT NULL,
      note text NOT NULL,
      created_at timestamp DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS crown_intros_match_idx ON crown_intros (match_id);
    CREATE INDEX IF NOT EXISTS crown_intros_from_created_idx ON crown_intros (from_user_id, created_at);
    CREATE INDEX IF NOT EXISTS crown_intros_to_idx ON crown_intros (to_user_id);
  `);
  console.log("crown_members, crown_spotlights, crown_intros: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
