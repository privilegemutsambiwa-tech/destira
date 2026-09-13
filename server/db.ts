import path from "path";
import { Pool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import * as schema from "@shared/schema";

// Local dev: embedded, single-process Postgres (PGlite) — nothing to install,
// data persists to PGLITE_DATA_DIR (default ./.localdb). Production: a real
// Postgres instance via DATABASE_URL (Render's managed Postgres, Supabase,
// etc.) — PGlite is explicitly a dev convenience, not something to run
// behind a hosted web service (ephemeral filesystem on most hosts, and it's
// a single embedded process, not built for a service that gets redeployed
// or ever scaled past one instance).
const databaseUrl = process.env.DATABASE_URL;

export const client = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      // Render's managed Postgres (and most hosted Postgres) requires TLS but
      // presents a cert not signed by a CA Node trusts by default; this
      // matches the common "just give me DATABASE_URL" pattern rather than
      // requiring the caller to also manage a CA bundle for a single app DB.
      ssl: process.env.PGSSL_DISABLE === "1" ? false : { rejectUnauthorized: false },
    })
  : new PGlite(process.env.PGLITE_DATA_DIR || path.join(process.cwd(), ".localdb"));

export const db = (databaseUrl ? drizzlePg(client as Pool, { schema }) : drizzlePglite(client as PGlite, { schema })) as ReturnType<
  typeof drizzlePg<typeof schema>
>;
