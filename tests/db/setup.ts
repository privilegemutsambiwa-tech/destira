// Builds every table from shared/schema.ts in this file's fresh in-memory
// database before its tests run.
import { PGlite } from "@electric-sql/pglite";
import * as schema from "@shared/schema";
import { client, db } from "../../server/db";

if (!(client instanceof PGlite)) throw new Error("db tests must run on the in-memory PGlite database");

const { pushSchema } = await import("drizzle-kit/api");
const quiet = console.log;
console.log = () => {};
try {
  const { apply } = await pushSchema(schema as any, db as any);
  await apply();
} finally {
  console.log = quiet;
}
