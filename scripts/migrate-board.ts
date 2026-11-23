// Plans board, "Who's in?" (Part O4): plans and requests to join. Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-board.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-board.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    CREATE TABLE IF NOT EXISTS board_plans (
      id serial PRIMARY KEY,
      host_id varchar NOT NULL REFERENCES users(id),
      title text NOT NULL,
      starts_at timestamp NOT NULL,
      place_id integer NOT NULL REFERENCES places(id),
      seats integer NOT NULL,
      who text NOT NULL DEFAULT 'anyone',
      chat_group_id integer,
      cancelled_at timestamp,
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS board_plans_starts_idx ON board_plans (starts_at);
    CREATE INDEX IF NOT EXISTS board_plans_host_idx ON board_plans (host_id);
  `);
  console.log("board_plans: ready");

  await run(`
    CREATE TABLE IF NOT EXISTS board_plan_requests (
      id serial PRIMARY KEY,
      plan_id integer NOT NULL REFERENCES board_plans(id),
      user_id varchar NOT NULL REFERENCES users(id),
      status text NOT NULL DEFAULT 'pending',
      created_at timestamp NOT NULL DEFAULT now(),
      decided_at timestamp
    );
    CREATE UNIQUE INDEX IF NOT EXISTS board_plan_requests_pair_idx ON board_plan_requests (plan_id, user_id);
    CREATE INDEX IF NOT EXISTS board_plan_requests_user_idx ON board_plan_requests (user_id);
  `);
  console.log("board_plan_requests: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
