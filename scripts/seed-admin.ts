// The ONLY way an admin_users row is ever created. No endpoint does this —
// deliberately, so there is no self-promotion path. Run manually, once, for
// the owner; use it again (same script) to add support/admin/read_only staff.
//
//   SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_ROLE=owner \
//     npx tsx --env-file=.env scripts/seed-admin.ts
//
// The account must already exist (sign up normally first) — this promotes an
// existing user, it doesn't create one. Refuses to seed a second owner unless
// --force is passed, so "oops, ran it twice" can't quietly grant two owners.
//
// DATABASE_URL is required. This script promotes an account to admin — it
// must never silently fall back to the local PGlite dev database because
// you forgot to export DATABASE_URL in this shell, believing you were
// seeding production. Pass --allow-local if you genuinely want to test this
// against your local PGlite database; otherwise it refuses to run. It always
// prints which database it's about to write to, before writing anything.
//
// Re-running for an email that's an ACTIVE admin is a no-op (prints and
// exits — no duplicate row, no changes). Re-running for an email you
// PREVIOUSLY REVOKED does NOT silently restore them — pass --reactivate
// explicitly, so "ran this again out of habit" can't quietly undo a
// revocation you meant to stick.
//
// STOP THE DEV SERVER FIRST if running locally with --allow-local. PGlite
// (this project's local embedded Postgres) is single-writer; running this
// alongside a live `npm run dev` produced a stale read on the very next
// login attempt in testing (self-resolved by restarting the server — no
// data loss observed, but don't rely on that). Doesn't apply against a real
// DATABASE_URL — Postgres handles concurrent writers fine.

import { ADMIN_ROLES, type AdminRole } from "@shared/admin";

function maskedConnectionInfo(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL — check it's a valid postgres connection string)";
  }
}

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL || "").trim().toLowerCase();
  const role = (process.env.SEED_ADMIN_ROLE || "owner") as AdminRole;
  const force = process.argv.includes("--force");
  const allowLocal = process.argv.includes("--allow-local");
  const reactivate = process.argv.includes("--reactivate");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    if (!allowLocal) {
      console.error(
        "DATABASE_URL is not set.\n\n" +
          "Refusing to run — this script grants admin access and must never silently fall back\n" +
          "to the local PGlite dev database because DATABASE_URL wasn't exported in this shell.\n\n" +
          "  - Seeding PRODUCTION: set DATABASE_URL to the production connection string, then re-run.\n" +
          "  - Deliberately testing locally: re-run with --allow-local.\n",
      );
      process.exit(1);
    }
    console.log(
      `>>> Connecting to the LOCAL PGlite dev database at ${process.env.PGLITE_DATA_DIR || "./.localdb"} (--allow-local was passed).`,
    );
  } else {
    console.log(`>>> Connecting to ${maskedConnectionInfo(databaseUrl)}`);
  }

  // Imported after the guard above, not at module top-level — server/db.ts
  // opens a connection (Pool or PGlite) as a side effect of import, and that
  // must not happen before the guard has had a chance to refuse.
  const { db } = await import("../server/db");
  const { adminUsers, users } = await import("@shared/schema");
  const { eq, and, isNull } = await import("drizzle-orm");

  if (!email) {
    console.error("Set SEED_ADMIN_EMAIL to the email of an existing Destira account.");
    process.exit(1);
  }
  if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
    console.error(`SEED_ADMIN_ROLE must be one of: ${ADMIN_ROLES.join(", ")}`);
    process.exit(1);
  }

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    console.error(`No account found for ${email} — sign up normally first, then re-run this.`);
    process.exit(1);
  }

  const [existing] = await db.select().from(adminUsers).where(eq(adminUsers.userId, user.id));
  if (existing && !existing.revokedAt) {
    console.error(`${email} is already an active admin (role: ${existing.role}). Nothing to do.`);
    process.exit(1);
  }
  if (existing && existing.revokedAt && !reactivate) {
    console.error(
      `${email}'s admin access was revoked on ${existing.revokedAt.toISOString()}` +
        (existing.revokedReason ? ` (reason: ${existing.revokedReason})` : "") +
        `.\nThis script won't silently undo that. Re-run with --reactivate if you mean to restore them.`,
    );
    process.exit(1);
  }

  if (role === "owner") {
    const [anyOwner] = await db
      .select()
      .from(adminUsers)
      .where(and(eq(adminUsers.role, "owner"), isNull(adminUsers.revokedAt)));
    if (anyOwner && !force) {
      console.error(
        "An active owner already exists. Re-run with --force if you really mean to add a second owner.",
      );
      process.exit(1);
    }
  }

  if (existing) {
    await db.update(adminUsers).set({ role, revokedAt: null, revokedBy: null, grantedAt: new Date() }).where(eq(adminUsers.id, existing.id));
    console.log(`Re-activated ${email} as ${role}. They still need to enrol 2FA on next login.`);
  } else {
    await db.insert(adminUsers).values({ userId: user.id, role });
    console.log(`${email} is now a Destira admin (${role}). They'll be forced through 2FA enrolment on first admin login at /console/login.`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
