import { defineConfig } from "drizzle-kit";

// Dedicated config for the isolated local dev/test database (.env.dev's
// PGLITE_DATA_DIR). Hardcoded rather than reading env vars: drizzle-kit
// bundles its own dotenv and auto-loads the plain ".env" file (which points
// at .localdb, or in a real checkout might even point at DATABASE_URL) —
// it does this *before* drizzle.config.ts runs, so an exported
// PGLITE_DATA_DIR from the shell gets silently overwritten. Hardcoding the
// path here sidesteps that entirely. Run with:
//   npx drizzle-kit push --config=drizzle.dev.config.ts
export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  driver: "pglite",
  dbCredentials: {
    url: "./.localdb-dev",
  },
});
