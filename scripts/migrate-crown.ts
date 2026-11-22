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
  `);
  console.log("crown_members: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
