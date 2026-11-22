// Discover filters and dealbreakers (shared/match-prefs.ts). Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-match-prefs.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-match-prefs.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS match_prefs jsonb;`);
  console.log("profiles.match_prefs: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
