// Console member lookup and actions (Part L1, L2): refunds recorded on
// payments, and a short log of member sign-ins. Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-member-admin.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-member-admin.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_at timestamp;`);
  await run(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_by varchar REFERENCES users(id);`);
  await run(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_cents integer;`);
  await run(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_note text;`);
  await run(`CREATE TABLE IF NOT EXISTS member_sign_ins (
    id serial PRIMARY KEY,
    user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    method text NOT NULL,
    network text,
    device text,
    created_at timestamp DEFAULT now()
  );`);
  await run(`CREATE INDEX IF NOT EXISTS member_sign_ins_user_idx ON member_sign_ins (user_id, created_at);`);
  console.log("member admin: payments refund columns and member_sign_ins ready");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
