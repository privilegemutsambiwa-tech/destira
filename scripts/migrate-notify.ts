// Part I: the push log (budget, quiet hours, digests, once-only reminders),
// links on bell items, and the "new since you last looked" marks. Safe to
// re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-notify.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-notify.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    CREATE TABLE IF NOT EXISTS push_log (
      id serial PRIMARY KEY,
      user_id varchar NOT NULL REFERENCES users(id),
      category text NOT NULL,
      title text NOT NULL,
      body text NOT NULL,
      url text,
      tag text,
      dedupe_key text,
      status text NOT NULL,
      local_day text NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS push_log_user_day_idx ON push_log (user_id, local_day);
    CREATE UNIQUE INDEX IF NOT EXISTS push_log_user_key_idx ON push_log (user_id, dedupe_key);
  `);
  console.log("push_log: ready");

  await run(`ALTER TABLE twin_notifications ADD COLUMN IF NOT EXISTS url text;`);
  console.log("twin_notifications.url: ready");

  await run(`
    CREATE TABLE IF NOT EXISTS surface_seen (
      id serial PRIMARY KEY,
      user_id varchar NOT NULL REFERENCES users(id),
      surface text NOT NULL,
      seen_at timestamp NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS surface_seen_user_surface_idx ON surface_seen (user_id, surface);
  `);
  console.log("surface_seen: ready");

  // Someone who had switched off event or message pushes shouldn't start
  // getting the new reminders that grew out of them.
  await run(`
    UPDATE profiles SET notification_prefs = notification_prefs || '{"event_reminders": false, "event_likes": false}'::jsonb
    WHERE notification_prefs->>'events' = 'false' AND NOT (notification_prefs ? 'event_reminders');
    UPDATE profiles SET notification_prefs = notification_prefs || '{"unread": false}'::jsonb
    WHERE notification_prefs->>'messages' = 'false' AND NOT (notification_prefs ? 'unread');
  `);
  console.log("notification prefs carried over");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
