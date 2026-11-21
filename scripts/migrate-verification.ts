// Selfie verification (server/verification.ts): the queue table, and the
// clean-up of verified marks that were never checked.
//
// Until now "verify" set the mark automatically after 60 seconds, with no
// check at all. This script:
//   1. creates verification_requests (safe to re-run)
//   2. counts profiles marked verified without an approved selfie
//   3. with --reset, removes those marks, so each person verifies for real
//
//   npx tsx --env-file=.env.dev scripts/migrate-verification.ts            # local, count only
//   npx tsx --env-file=.env     scripts/migrate-verification.ts            # production, count only
//   npx tsx --env-file=.env     scripts/migrate-verification.ts --reset    # production, remove unchecked marks
//
// Note: proximity alerts need a verified profile on both sides, so after
// --reset they pause for each person until their selfie is approved.
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  // PGlite: exec() runs multi-statement scripts. pg Pool: query() does.
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function rows(sql: string): Promise<any[]> {
  const c: any = client;
  const r = await c.query(sql);
  return r.rows ?? [];
}

const UNCHECKED = `
  FROM profiles p
  WHERE p.is_verified = true
    AND NOT EXISTS (
      SELECT 1 FROM verification_requests v
      WHERE v.user_id = p.user_id AND v.status = 'approved'
    )`;

async function main() {
  await run(`
    CREATE TABLE IF NOT EXISTS verification_requests (
      id serial PRIMARY KEY,
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pose text,
      selfie_key text,
      status text NOT NULL DEFAULT 'pending',
      reject_reason text,
      reviewed_by varchar REFERENCES users(id),
      reviewed_at timestamp,
      created_at timestamp DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS verification_requests_status_idx ON verification_requests (status, created_at);
    CREATE INDEX IF NOT EXISTS verification_requests_user_idx ON verification_requests (user_id, created_at);
  `);
  console.log("verification_requests: ready");

  const [{ n }] = await rows(`SELECT count(*)::int AS n ${UNCHECKED}`);
  console.log(`Profiles marked verified without a checked selfie: ${n}`);

  if (process.argv.includes("--reset")) {
    await run(`
      UPDATE profiles SET is_verified = false, verification_status = 'unverified'
      WHERE user_id IN (SELECT p.user_id ${UNCHECKED});
      UPDATE profiles SET verification_status = 'unverified'
      WHERE is_verified = false AND verification_status IN ('pending', 'verified')
        AND user_id NOT IN (SELECT user_id FROM verification_requests WHERE status = 'pending');
    `);
    console.log(`Removed ${n} unchecked verified mark(s). Those members can verify again from Settings.`);
  } else if (n > 0) {
    console.log("Nothing changed. Re-run with --reset to remove those marks.");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
