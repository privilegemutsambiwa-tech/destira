// Events: door check-in and "Who did you click with?" (Part J). Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-event-door.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-event-door.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    ALTER TABLE event_attendees ADD COLUMN IF NOT EXISTS checked_in_at timestamp;
    ALTER TABLE event_attendees ADD COLUMN IF NOT EXISTS checked_in_by varchar;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS clicks_asked_at timestamp;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS origin_note text;
    CREATE TABLE IF NOT EXISTS event_clicks (
      id serial PRIMARY KEY,
      event_id integer NOT NULL REFERENCES events(id),
      from_id varchar NOT NULL REFERENCES users(id),
      to_id varchar NOT NULL REFERENCES users(id),
      kind text NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS event_clicks_pair_idx ON event_clicks (event_id, from_id, to_id);
  `);
  // Events that ended before this shipped have had their moment: don't ask now.
  await run(`UPDATE events SET clicks_asked_at = now() WHERE clicks_asked_at IS NULL AND starts_at < now() - interval '1 day';`);
  console.log("event door: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
