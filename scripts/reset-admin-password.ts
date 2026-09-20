// One-off: set/reset a user's password_hash directly (e.g. an account that
// was created via Google OAuth and has no password to log into /console
// with). Uses the same hashPassword() as normal signup/change-password, so
// the result is byte-for-byte what the app would have produced itself.
//
//   RESET_EMAIL=you@example.com RESET_PASSWORD='NewPass123!' \
//     npx tsx --env-file=.env scripts/reset-admin-password.ts
//
// Same DATABASE_URL guard as seed-admin.ts: refuses to touch the local
// PGlite dev database unless --allow-local is passed, and always prints
// which database it's about to write to.

function maskedConnectionInfo(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function main() {
  const email = (process.env.RESET_EMAIL || "").trim().toLowerCase();
  const password = process.env.RESET_PASSWORD || "";
  const allowLocal = process.argv.includes("--allow-local");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl && !allowLocal) {
    console.error("DATABASE_URL is not set. Re-run with --allow-local if you mean to target the local PGlite dev database.");
    process.exit(1);
  }
  console.log(databaseUrl ? `>>> Connecting to ${maskedConnectionInfo(databaseUrl)}` : `>>> Connecting to the LOCAL PGlite dev database at ${process.env.PGLITE_DATA_DIR || "./.localdb"}`);

  if (!email) {
    console.error("Set RESET_EMAIL to the account's email.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Set RESET_PASSWORD (min 8 characters).");
    process.exit(1);
  }

  const { db } = await import("../server/db");
  const { users } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  const { hashPassword } = await import("../server/replit_integrations/auth/password");

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    console.error(`No account found for ${email}.`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
  console.log(`Password hash updated for ${email} (user id ${user.id}).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
