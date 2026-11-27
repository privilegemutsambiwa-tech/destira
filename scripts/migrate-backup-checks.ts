// The daily backup check's history (Part K7, server/admin/backup-check.ts).
// Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-backup-checks.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-backup-checks.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`CREATE TABLE IF NOT EXISTS backup_checks (
    id serial PRIMARY KEY,
    checked_at timestamp NOT NULL DEFAULT now(),
    status text NOT NULL,
    latest_backup_at timestamp,
    backup_count integer NOT NULL DEFAULT 0,
    pitr boolean NOT NULL DEFAULT false,
    message text NOT NULL,
    trigger text NOT NULL DEFAULT 'schedule'
  );`);
  await run(`CREATE INDEX IF NOT EXISTS backup_checks_checked_at_idx ON backup_checks (checked_at);`);
  console.log("backup checks: backup_checks ready");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
