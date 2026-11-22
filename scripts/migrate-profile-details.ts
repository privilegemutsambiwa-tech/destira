// Profile details (shared/profile-details.ts): one jsonb column. Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-profile-details.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-profile-details.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS details jsonb;`);
  console.log("profiles.details: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
