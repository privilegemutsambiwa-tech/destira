// The console's error log (Part K3): errors grouped by what broke, and how
// many of each per hour. Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-error-log.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-error-log.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`CREATE TABLE IF NOT EXISTS error_groups (
    id serial PRIMARY KEY,
    fingerprint varchar(64) NOT NULL,
    kind text NOT NULL,
    method text NOT NULL,
    route text NOT NULL,
    status integer NOT NULL DEFAULT 0,
    message text NOT NULL,
    cause text,
    stack text,
    source text,
    count integer NOT NULL DEFAULT 0,
    first_seen_at timestamp NOT NULL DEFAULT now(),
    last_seen_at timestamp NOT NULL DEFAULT now(),
    state text NOT NULL DEFAULT 'open',
    resolved_at timestamp,
    resolved_by varchar,
    last_alert_at timestamp
  );`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS error_groups_fingerprint_idx ON error_groups (fingerprint);`);
  await run(`CREATE INDEX IF NOT EXISTS error_groups_last_seen_idx ON error_groups (last_seen_at);`);
  await run(`CREATE TABLE IF NOT EXISTS error_group_hours (
    group_id integer NOT NULL REFERENCES error_groups(id) ON DELETE CASCADE,
    hour timestamp NOT NULL,
    count integer NOT NULL DEFAULT 0
  );`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS error_group_hours_group_hour_idx ON error_group_hours (group_id, hour);`);
  console.log("error log: error_groups and error_group_hours ready");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
