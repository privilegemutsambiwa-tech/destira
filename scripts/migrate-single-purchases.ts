// Single purchases (Part G3): the 24-hour "see who liked you" pass. Super
// likes and boosts use the existing profiles columns. Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-single-purchases.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-single-purchases.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS see_likes_until timestamp;`);
  console.log("single purchases: profiles.see_likes_until ready");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
