// Direct messages catch up with the Lounge: photos (optionally view once),
// voice notes, reactions, edit and unsend (server/dm-extras.ts). Safe to
// re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-dm-extras.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-dm-extras.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`
    ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'text';
    ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS media_key text;
    ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS media_meta jsonb;
    ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS viewed_at timestamp;
    ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS edited_at timestamp;
    ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS unsent_at timestamp;
    ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS client_id text;
    CREATE UNIQUE INDEX IF NOT EXISTS direct_messages_match_client_idx ON direct_messages (match_id, client_id) WHERE client_id IS NOT NULL;
  `);
  console.log("direct_messages: media, edit, unsend columns ready");

  await run(`
    CREATE TABLE IF NOT EXISTS dm_reactions (
      id serial PRIMARY KEY,
      message_id integer NOT NULL REFERENCES direct_messages(id),
      user_id varchar NOT NULL REFERENCES users(id),
      emoji text NOT NULL,
      created_at timestamp DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS dm_reactions_message_user_idx ON dm_reactions (message_id, user_id);
  `);
  console.log("dm_reactions: ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
