// Destira Friends, part one (Part O1): what each member is here for, the
// kind of each chat, waves and Friends-side passes. Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-friends.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-friends.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS looking_for text;`);
  console.log("profiles.looking_for: ready");

  await run(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'love';`);
  console.log("matches.kind: ready");

  await run(`
    CREATE TABLE IF NOT EXISTS friend_waves (
      id serial PRIMARY KEY,
      from_id varchar NOT NULL REFERENCES users(id),
      to_id varchar NOT NULL REFERENCES users(id),
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS friend_waves_pair_idx ON friend_waves (from_id, to_id);
    CREATE INDEX IF NOT EXISTS friend_waves_to_idx ON friend_waves (to_id);
  `);
  console.log("friend_waves: ready");

  await run(`
    CREATE TABLE IF NOT EXISTS friend_passes (
      id serial PRIMARY KEY,
      user_id varchar NOT NULL REFERENCES users(id),
      target_id varchar NOT NULL REFERENCES users(id),
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS friend_passes_user_target_idx ON friend_passes (user_id, target_id);
  `);
  console.log("friend_passes: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
