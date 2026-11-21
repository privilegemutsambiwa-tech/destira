// Scam defence (server/safety/): the Risk queue, device ids, photo
// fingerprints. Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-safety.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-safety.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  // PGlite: exec() runs multi-statement scripts. pg Pool: query() does.
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    CREATE TABLE IF NOT EXISTS risk_flags (
      id serial PRIMARY KEY,
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind text NOT NULL,
      severity text NOT NULL,
      source text NOT NULL,
      ref_id text,
      other_user_id varchar,
      snippet text,
      status text NOT NULL DEFAULT 'open',
      reviewed_by varchar REFERENCES users(id),
      reviewed_at timestamp,
      created_at timestamp DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS risk_flags_status_idx ON risk_flags (status, created_at);
    CREATE INDEX IF NOT EXISTS risk_flags_user_idx ON risk_flags (user_id, created_at);

    CREATE TABLE IF NOT EXISTS account_devices (
      id serial PRIMARY KEY,
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id varchar(64) NOT NULL,
      first_seen_at timestamp DEFAULT now(),
      last_seen_at timestamp DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS account_devices_user_device_idx ON account_devices (user_id, device_id);
    CREATE INDEX IF NOT EXISTS account_devices_device_idx ON account_devices (device_id);

    CREATE TABLE IF NOT EXISTS photo_hashes (
      photo_id integer PRIMARY KEY,
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      hash varchar(16) NOT NULL,
      created_at timestamp DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS photo_hashes_user_idx ON photo_hashes (user_id);
  `);
  console.log("risk_flags, account_devices, photo_hashes: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
