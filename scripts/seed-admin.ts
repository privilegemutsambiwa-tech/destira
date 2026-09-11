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
// STOP THE DEV SERVER FIRST. PGlite (this project's local embedded Postgres)
// is single-writer; running this alongside a live `npm run dev` produced a
// stale read on the very next login attempt in testing (self-resolved by
// restarting the server — no data loss observed, but don't rely on that).

import { db } from "../server/db";
import { adminUsers, users } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { ADMIN_ROLES, type AdminRole } from "@shared/admin";

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL || "").trim().toLowerCase();
  const role = (process.env.SEED_ADMIN_ROLE || "owner") as AdminRole;
  const force = process.argv.includes("--force");

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
