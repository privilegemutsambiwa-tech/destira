import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@shared/schema";

// Local-only database. VibeFlow originally ran on Replit-managed Postgres;
// for local dev we use PGlite (an embedded, single-process Postgres) so there
// is nothing to install or provision. Data persists to PGLITE_DATA_DIR.
const dataDir =
  process.env.PGLITE_DATA_DIR || path.join(process.cwd(), ".localdb");

export const client = new PGlite(dataDir);
export const db = drizzle(client, { schema });
