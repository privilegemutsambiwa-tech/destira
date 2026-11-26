// Paid event tickets (Part G4). Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-event-tickets.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-event-tickets.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_cents integer;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS payout_number text;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS host_paid_out_at timestamp;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS host_paid_out_by varchar;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS host_payout_cents integer;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS host_payout_note text;
    CREATE TABLE IF NOT EXISTS event_tickets (
      id serial PRIMARY KEY,
      event_id integer NOT NULL REFERENCES events(id),
      user_id varchar NOT NULL REFERENCES users(id),
      payment_id integer NOT NULL UNIQUE,
      amount_cents integer NOT NULL,
      fee_cents integer NOT NULL,
      status text NOT NULL,
      refund_reason text,
      created_at timestamp NOT NULL,
      refunded_at timestamp,
      refunded_by varchar,
      refund_note text
    );
    CREATE INDEX IF NOT EXISTS event_tickets_event_idx ON event_tickets (event_id, status);
    CREATE INDEX IF NOT EXISTS event_tickets_user_idx ON event_tickets (user_id);
  `);
  console.log("event tickets: ready");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
