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
      // Conservative: this app runs as a single process (WEB_CONCURRENCY=1),
      // so it never needs many concurrent connections, and hosted poolers
      // (e.g. Supabase's) cap total connections per project across every
      // client — staying small here leaves headroom for other consumers.
      // Bumped 5 -> 8: at 5, the boot-time background jobs (proximity sweep,
      // payments sweep, metrics backfill — see server/routes.ts) could
      // exhaust the whole pool simultaneously and queue a real request
      // behind them for 10s+ on a high-latency connection. 8 leaves real
      // traffic a connection even if every boot job is mid-query at once;
      // see also the startup stagger in routes.ts, which reduces how often
      // that pile-up happens in the first place.
      max: 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // Bounds query EXECUTION time server-side, separate from
      // connectionTimeoutMillis (which only bounds acquiring a connection).
      // Without this, a genuinely stuck query holds its pool slot
      // indefinitely instead of failing fast.
      statement_timeout: 15_000,
      query_timeout: 15_000,
    })
  : new PGlite(process.env.PGLITE_DATA_DIR || path.join(process.cwd(), ".localdb"));

// node-postgres pools emit 'error' when a hosted pooler (e.g. Supabase's)
// drops an idle connection — with no listener, that's an unhandled 'error'
// event, which Node treats as fatal and kills the whole process. This one
// Pool is shared by Drizzle and both connect-pg-simple session stores
// (replitAuth.ts, admin/session.ts), so a single handler here covers all of
// them; pg-pool itself already drops the dead client and reconnects on the
// next query.
if (databaseUrl) {
  (client as Pool).on("error", (err) => {
    console.error("[pg pool] idle client error (non-fatal):", err.message);
  });
}

export const db = (databaseUrl ? drizzlePg(client as Pool, { schema }) : drizzlePglite(client as PGlite, { schema })) as ReturnType<
  typeof drizzlePg<typeof schema>
>;
