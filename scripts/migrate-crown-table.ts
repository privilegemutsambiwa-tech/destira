// Crown Table (Part P5). Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-crown-table.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-crown-table.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    CREATE TABLE IF NOT EXISTS crown_dinners (
      id serial PRIMARY KEY,
      title text NOT NULL,
      place_id integer REFERENCES places(id),
      venue_name text NOT NULL,
      venue_detail text,
      starts_at timestamp NOT NULL,
      seats integer NOT NULL,
      note text,
      status text NOT NULL DEFAULT 'scheduled',
      cancel_reason text,
      created_by varchar NOT NULL,
      created_at timestamp NOT NULL
    );
    CREATE TABLE IF NOT EXISTS crown_dinner_seats (
      id serial PRIMARY KEY,
      dinner_id integer NOT NULL REFERENCES crown_dinners(id) ON DELETE CASCADE,
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      guest_of varchar,
      status text NOT NULL,
      created_at timestamp NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS crown_dinner_seats_pair_idx ON crown_dinner_seats (dinner_id, user_id);
    CREATE INDEX IF NOT EXISTS crown_dinner_seats_guest_idx ON crown_dinner_seats (dinner_id, guest_of);
  `);
  console.log("crown table: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
