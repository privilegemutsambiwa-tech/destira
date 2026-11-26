// Crown matchmaker (Part P4). Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-matchmaker.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-matchmaker.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    ALTER TABLE crown_members ADD COLUMN IF NOT EXISTS matchmaker_id varchar;
    CREATE TABLE IF NOT EXISTS matchmaker_intros (
      id serial PRIMARY KEY,
      crown_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      candidate_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      proposed_by varchar NOT NULL,
      note text NOT NULL,
      status text NOT NULL DEFAULT 'proposed',
      crown_answered_at timestamp,
      candidate_answered_at timestamp,
      match_id integer,
      created_at timestamp NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS matchmaker_intros_pair_idx ON matchmaker_intros (crown_user_id, candidate_id);
    CREATE INDEX IF NOT EXISTS matchmaker_intros_crown_idx ON matchmaker_intros (crown_user_id, created_at);
    CREATE INDEX IF NOT EXISTS matchmaker_intros_candidate_idx ON matchmaker_intros (candidate_id, status);
    CREATE TABLE IF NOT EXISTS matchmaker_chats (
      id serial PRIMARY KEY,
      crown_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message text NOT NULL,
      status text NOT NULL DEFAULT 'requested',
      reply text,
      handled_by varchar,
      requested_at timestamp NOT NULL,
      replied_at timestamp,
      done_at timestamp
    );
    CREATE INDEX IF NOT EXISTS matchmaker_chats_crown_idx ON matchmaker_chats (crown_user_id, requested_at);
  `);
  console.log("crown matchmaker: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
