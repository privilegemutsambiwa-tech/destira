// Lounge: scheduled game nights and voice notes in rooms (Part J). Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-game-nights.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-game-nights.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS media_key text;
    ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS duration_ms integer;
    CREATE TABLE IF NOT EXISTS game_nights (
      id serial PRIMARY KEY,
      group_id integer NOT NULL REFERENCES groups(id),
      host_id varchar NOT NULL REFERENCES users(id),
      kind text NOT NULL,
      setup jsonb NOT NULL DEFAULT '{}'::jsonb,
      note text,
      starts_at timestamp NOT NULL,
      status text NOT NULL DEFAULT 'scheduled',
      game_id integer,
      reminded_at timestamp,
      created_at timestamp DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS game_nights_group_idx ON game_nights (group_id, status);
    CREATE TABLE IF NOT EXISTS game_night_rsvps (
      id serial PRIMARY KEY,
      game_night_id integer NOT NULL REFERENCES game_nights(id),
      user_id varchar NOT NULL REFERENCES users(id),
      created_at timestamp DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS game_night_rsvps_pair_idx ON game_night_rsvps (game_night_id, user_id);
  `);
  console.log("game nights and room voice notes: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
