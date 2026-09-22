// Curated, Destira-run Lounges — the starter set new users always find
// joinable on day one, instead of an empty Lounge tab with nothing but a
// "create one" prompt. Mirrors scripts/seed-admin.ts's safety shape.
//
//   SEED_LOUNGE_OWNER_EMAIL=you@example.com \
//     npx tsx --env-file=.env scripts/seed-lounges.ts
//
// The owner account must already exist (sign up normally first) — this
// script doesn't create one, it hosts the curated lounges under an existing
// account, the same "promote, don't create" shape as seed-admin.ts.
//
// DATABASE_URL is required. This writes real, publicly-joinable rows — it
// must never silently fall back to the local PGlite dev database because
// you forgot to export DATABASE_URL, believing you were seeding production.
// Pass --allow-local if you genuinely want to test this locally; otherwise
// it refuses to run. It always prints which database it's about to write
// to, before writing anything.
//
// Idempotent: re-running skips any lounge whose name already exists rather
// than erroring or duplicating, and prints a created/skipped summary.

function maskedConnectionInfo(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL — check it's a valid postgres connection string)";
  }
}

const CAMPUS_LOUNGES = [
  { name: "University of Zimbabwe", locationLabel: "University of Zimbabwe", categoryTags: ["campus", "students", "harare"] },
  { name: "NUST", locationLabel: "National University of Science and Technology", categoryTags: ["campus", "students", "bulawayo"] },
  { name: "Midlands State University", locationLabel: "Midlands State University", categoryTags: ["campus", "students", "gweru"] },
  { name: "Chinhoyi University of Technology", locationLabel: "Chinhoyi University of Technology", categoryTags: ["campus", "students", "chinhoyi"] },
];

const CITY_LOUNGES = [
  { name: "Harare", locationLabel: "Harare", categoryTags: ["city", "local", "harare"] },
  { name: "Bulawayo", locationLabel: "Bulawayo", categoryTags: ["city", "local", "bulawayo"] },
  { name: "Mutare", locationLabel: "Mutare", categoryTags: ["city", "local", "mutare"] },
  { name: "Gweru", locationLabel: "Gweru", categoryTags: ["city", "local", "gweru"] },
  { name: "Masvingo", locationLabel: "Masvingo", categoryTags: ["city", "local", "masvingo"] },
];

async function main() {
  const ownerEmail = (process.env.SEED_LOUNGE_OWNER_EMAIL || "").trim().toLowerCase();
  const allowLocal = process.argv.includes("--allow-local");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    if (!allowLocal) {
      console.error(
        "DATABASE_URL is not set.\n\n" +
          "Refusing to run — this script writes real, publicly-joinable Lounges and must never\n" +
          "silently fall back to the local PGlite dev database because DATABASE_URL wasn't\n" +
          "exported in this shell.\n\n" +
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
  const { groups, users } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  const { storage } = await import("../server/storage");

  if (!ownerEmail) {
    console.error("Set SEED_LOUNGE_OWNER_EMAIL to the email of an existing Destira account to host these Lounges.");
    process.exit(1);
  }

  const [owner] = await db.select().from(users).where(eq(users.email, ownerEmail));
  if (!owner) {
    console.error(`No account found for ${ownerEmail} — sign up normally first, then re-run this.`);
    process.exit(1);
  }
  const ownerProfile = await storage.getProfile(owner.id);
  const ownerNickname = ownerProfile?.groupNickname || ownerProfile?.displayName || "Destira";

  const entries = [
    ...CAMPUS_LOUNGES.map((l) => ({ ...l, description: `For everyone at ${l.name} — say hi, find your people.`, type: "campus" })),
    ...CITY_LOUNGES.map((l) => ({ ...l, description: `Everyone in ${l.name}, in one room.`, type: "city" })),
  ];

  let created = 0;
  let skipped = 0;
  for (const entry of entries) {
    const [existing] = await db.select().from(groups).where(eq(groups.name, entry.name));
    if (existing) {
      console.log(`- skip "${entry.name}" (already exists, id ${existing.id})`);
      skipped++;
      continue;
    }
    const group = await storage.createGroupFull({
      name: entry.name,
      description: entry.description,
      type: entry.type,
      ownerId: owner.id,
      categoryTags: entry.categoryTags,
      privacyMode: "open",
      isOfficial: true,
      locationLabel: entry.locationLabel,
    });
    await storage.joinGroup(group.id, owner.id, ownerNickname);
    await storage.updateGroupMemberRole(group.id, owner.id, "owner");
    console.log(`+ created "${entry.name}" (id ${group.id})`);
    created++;
  }

  console.log(`\nDone — ${created} created, ${skipped} skipped (already existed).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
