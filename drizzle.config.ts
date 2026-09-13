import { defineConfig } from "drizzle-kit";

// Local dev uses embedded PGlite; a real DATABASE_URL (Render's managed
// Postgres, Supabase, etc.) switches drizzle-kit to talk to that instead —
// same "DATABASE_URL if set, else PGlite" rule as server/db.ts.
export default defineConfig(
  process.env.DATABASE_URL
    ? {
        out: "./migrations",
        schema: "./shared/schema.ts",
        dialect: "postgresql",
        dbCredentials: { url: process.env.DATABASE_URL },
      }
    : {
        out: "./migrations",
        schema: "./shared/schema.ts",
        dialect: "postgresql",
        driver: "pglite",
        dbCredentials: {
          url: process.env.PGLITE_DATA_DIR || "./.localdb",
        },
      },
);
