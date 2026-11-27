// npm test: the logic that has to stay right, without a server or a network.
//
//   tests/unit  pure functions (prices, gates, scam signals, discover order...)
//   tests/db    code that reads and writes the database, against a fresh
//               in-memory one built from shared/schema.ts for each file.
//               Never the local .localdb, never Supabase.
//
// The Playwright smoke suite (tests/smoke, npm run test:smoke) is separate: it
// drives the running local server.
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    // An in-memory database and no outside services, whatever the shell has.
    env: {
      DATABASE_URL: "",
      PGLITE_DATA_DIR: "memory://",
      DEEPSEEK_API_KEY: "",
      RESEND_API_KEY: "",
      PAYNOW_INTEGRATION_ID: "",
      PAYNOW_INTEGRATION_KEY: "",
      PAYMENTS_MOCK: "1",
      PAYMENTS_MOCK_DELAY_MS: "0",
      TZ: "Africa/Harare",
    },
    setupFiles: ["tests/guard.ts"],
    projects: [
      { extends: true, test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
      {
        extends: true,
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          setupFiles: ["tests/guard.ts", "tests/db/setup.ts"],
          testTimeout: 60_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
