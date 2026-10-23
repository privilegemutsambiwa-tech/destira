// One-off, idempotent: device_tokens, the app's Firebase push tokens. Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-native-push.ts
//   npx tsx --env-file=.env     scripts/migrate-native-push.ts   # production
import { client } from "../server/db";

async function run(sql: string) {
  const c: any = client;
  // PGlite: exec() runs multi-statement scripts. pg Pool: query() does.
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    CREATE TABLE IF NOT EXISTS device_tokens (
      id serial PRIMARY KEY,
      user_id varchar NOT NULL REFERENCES users(id),
      token text NOT NULL UNIQUE,
      platform text NOT NULL,
      created_at timestamp DEFAULT now(),
      last_seen_at timestamp DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS device_tokens_user_idx ON device_tokens (user_id);
  `);
  console.log("native push migration done");
  process.exit(0);
}

main().catch((e) => {
  console.error("migration failed:", e);
  process.exit(1);
});
