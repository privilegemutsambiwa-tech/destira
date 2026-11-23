// Events: host ratings and venue partners (Part J). Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-event-extras.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-event-extras.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    ALTER TABLE places ADD COLUMN IF NOT EXISTS partner_offer text;
    ALTER TABLE places ADD COLUMN IF NOT EXISTS partner_since timestamp;
    CREATE TABLE IF NOT EXISTS event_ratings (
      id serial PRIMARY KEY,
      event_id integer NOT NULL REFERENCES events(id),
      user_id varchar NOT NULL REFERENCES users(id),
      stars integer NOT NULL,
      note text,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS event_ratings_pair_idx ON event_ratings (event_id, user_id);
  `);
  console.log("event extras: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
