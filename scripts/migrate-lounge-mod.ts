// Lounge moderator tools (Part J): slow mode, muting a member for a while,
// a reason on removed messages, room rules accepted before posting. Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-lounge-mod.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-lounge-mod.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    ALTER TABLE groups ADD COLUMN IF NOT EXISTS slow_mode_seconds integer NOT NULL DEFAULT 0;
    ALTER TABLE group_members ADD COLUMN IF NOT EXISTS muted_until timestamp;
    ALTER TABLE group_members ADD COLUMN IF NOT EXISTS muted_by varchar;
    ALTER TABLE group_members ADD COLUMN IF NOT EXISTS rules_accepted_at timestamp;
    ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS removed_reason text;
  `);
  console.log("lounge moderation: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
