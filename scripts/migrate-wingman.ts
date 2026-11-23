// Wingman (Part O6). Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-wingman.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-wingman.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    CREATE TABLE IF NOT EXISTS wingman_suggestions (
      id serial PRIMARY KEY,
      from_id varchar NOT NULL REFERENCES users(id),
      to_id varchar NOT NULL REFERENCES users(id),
      candidate_id varchar NOT NULL REFERENCES users(id),
      circle_name text NOT NULL,
      note text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS wingman_triple_idx ON wingman_suggestions (from_id, to_id, candidate_id);
    CREATE INDEX IF NOT EXISTS wingman_to_idx ON wingman_suggestions (to_id, status);
    CREATE INDEX IF NOT EXISTS wingman_from_idx ON wingman_suggestions (from_id, created_at);
  `);
  console.log("wingman: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
