// Runs before every test file. Tests write to the database freely, so they
// must never see a real one.
if (process.env.DATABASE_URL) {
  throw new Error("Tests refuse to run with DATABASE_URL set: they write data. Unset it (vitest.config.ts clears it).");
}
if (process.env.PGLITE_DATA_DIR !== "memory://") {
  throw new Error("Tests run on an in-memory database only (PGLITE_DATA_DIR=memory://).");
}
