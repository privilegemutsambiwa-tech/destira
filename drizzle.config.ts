import { defineConfig } from "drizzle-kit";

// Local dev uses PGlite (embedded Postgres). See server/db.ts.
export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  driver: "pglite",
  dbCredentials: {
    url: process.env.PGLITE_DATA_DIR || "./.localdb",
  },
});
