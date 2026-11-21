// Measurement (phase 2): the landing headline on each sign-up, daily landing
// visits for the console Funnel, and the keys Meta's Conversions API needs to
// match a payment to its ad. Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-funnel.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-funnel.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  // PGlite: exec() runs multi-statement scripts. pg Pool: query() does.
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    ALTER TABLE signup_sources ADD COLUMN IF NOT EXISTS landing_variant text;

    CREATE TABLE IF NOT EXISTS landing_visits (
      day date NOT NULL,
      variant text NOT NULL,
      source text NOT NULL,
      visits integer NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS landing_visits_key_idx ON landing_visits (day, variant, source);

    CREATE TABLE IF NOT EXISTS ad_match_keys (
      user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      fbp text,
      fbc text,
      client_ip text,
      user_agent text,
      created_at timestamp DEFAULT now()
    );
  `);
  console.log("signup_sources.landing_variant, landing_visits, ad_match_keys: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
