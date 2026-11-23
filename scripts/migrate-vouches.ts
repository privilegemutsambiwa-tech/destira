// Vouches (Part O5). Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-vouches.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-vouches.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    CREATE TABLE IF NOT EXISTS vouches (
      id serial PRIMARY KEY,
      from_id varchar NOT NULL REFERENCES users(id),
      to_id varchar NOT NULL REFERENCES users(id),
      body text NOT NULL,
      met_label text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS vouches_pair_idx ON vouches (from_id, to_id);
    CREATE INDEX IF NOT EXISTS vouches_to_idx ON vouches (to_id, status);
  `);
  console.log("vouches: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
