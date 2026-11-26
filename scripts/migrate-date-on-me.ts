// One-off purchases and Date on me (Part P6). Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-date-on-me.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-date-on-me.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS purchase_kind text;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS purchase_ref integer;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS purchase_label text;
    ALTER TABLE places ADD COLUMN IF NOT EXISTS voucher_items jsonb;
    ALTER TABLE places ADD COLUMN IF NOT EXISTS till_pin_hash text;
    CREATE TABLE IF NOT EXISTS date_vouchers (
      id serial PRIMARY KEY,
      code varchar(16) NOT NULL UNIQUE,
      crown_user_id varchar NOT NULL REFERENCES users(id),
      plan_id integer NOT NULL REFERENCES date_plans(id),
      match_id integer NOT NULL,
      place_id integer NOT NULL REFERENCES places(id),
      item_id text NOT NULL,
      item_label text NOT NULL,
      amount_cents integer NOT NULL,
      payment_id integer,
      status text NOT NULL DEFAULT 'pending_payment',
      created_at timestamp NOT NULL,
      paid_at timestamp,
      expires_at timestamp,
      redeemed_at timestamp,
      refund_reason text,
      refunded_at timestamp,
      refunded_by varchar,
      refund_note text,
      paid_out_at timestamp,
      paid_out_by varchar,
      payout_note text
    );
    CREATE INDEX IF NOT EXISTS date_vouchers_plan_idx ON date_vouchers (plan_id);
    CREATE INDEX IF NOT EXISTS date_vouchers_status_idx ON date_vouchers (status);
    CREATE INDEX IF NOT EXISTS date_vouchers_place_idx ON date_vouchers (place_id, status);
  `);
  console.log("one-off purchases and Date on me: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
