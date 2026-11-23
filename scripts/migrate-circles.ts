// Friend circles (Part O3): circles, invitations, plans and "I'm in".
// Also tightens Sunday Table chats made before this: their own type, and
// nobody adds people in. Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-circles.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-circles.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    CREATE TABLE IF NOT EXISTS circles (
      id serial PRIMARY KEY,
      group_id integer NOT NULL REFERENCES groups(id),
      name text NOT NULL,
      created_by varchar NOT NULL REFERENCES users(id),
      source text NOT NULL DEFAULT 'invite',
      source_id integer,
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS circles_group_idx ON circles (group_id);
  `);
  console.log("circles: ready");

  await run(`
    CREATE TABLE IF NOT EXISTS circle_invites (
      id serial PRIMARY KEY,
      circle_id integer NOT NULL REFERENCES circles(id),
      from_id varchar NOT NULL REFERENCES users(id),
      to_id varchar NOT NULL REFERENCES users(id),
      status text NOT NULL DEFAULT 'pending',
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS circle_invites_pair_idx ON circle_invites (circle_id, to_id);
    CREATE INDEX IF NOT EXISTS circle_invites_to_idx ON circle_invites (to_id, status);
  `);
  console.log("circle_invites: ready");

  await run(`
    CREATE TABLE IF NOT EXISTS circle_plans (
      id serial PRIMARY KEY,
      circle_id integer NOT NULL REFERENCES circles(id),
      author_id varchar NOT NULL REFERENCES users(id),
      title text NOT NULL,
      starts_at timestamp NOT NULL,
      place text,
      cancelled_at timestamp,
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS circle_plans_circle_idx ON circle_plans (circle_id, starts_at);
    CREATE TABLE IF NOT EXISTS circle_plan_ins (
      id serial PRIMARY KEY,
      plan_id integer NOT NULL REFERENCES circle_plans(id),
      user_id varchar NOT NULL REFERENCES users(id),
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS circle_plan_ins_pair_idx ON circle_plan_ins (plan_id, user_id);
  `);
  console.log("circle_plans, circle_plan_ins: ready");

  await run(`
    UPDATE groups SET type = 'table', can_members_add_others = false
    WHERE id IN (SELECT chat_group_id FROM sunday_tables WHERE chat_group_id IS NOT NULL);
  `);
  console.log("Sunday Table chats: tightened");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
