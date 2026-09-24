// Seeds the isolated local dev database (.env.dev / .localdb-dev) with a
// handful of log-in-able test accounts across every tier, plus a spread of
// candidate profiles covering every gender/seekingGenders combination — so
// Discover, matching, and tier-gated features all have real volume to
// exercise without ever touching the production Supabase database. Safe to
// re-run: every insert is upsert-by-known-id.
//
// Run with: npm run seed:local  (equivalent to
//   npx tsx --env-file=.env.dev scripts/seed-local-dev.ts)
import { db } from "../server/db";
import { users, profiles, subscriptions } from "../shared/schema";
import { hashPassword } from "../server/replit_integrations/auth/password";
import { eq } from "drizzle-orm";

const AVATAR = (seed: string) => `https://i.pravatar.cc/400?u=${seed}`;

type SeedProfile = {
  id: string;
  email: string;
  firstName: string;
  displayName: string;
  gender: "man" | "woman";
  seekingGenders: string[];
  age: number;
  location: string;
  bio: string;
};

// Four log-in-able accounts, one per tier — password for all: "Testing123!"
const LOGIN_ACCOUNTS: Array<SeedProfile & { tier: "free" | "spark" | "flame" | "ember" }> = [
  { id: "local-free", email: "free@local.test", firstName: "Faith", displayName: "Faith", gender: "woman", seekingGenders: ["men"], age: 26, location: "Harare", bio: "Free-tier test account.", tier: "free" },
  { id: "local-spark", email: "spark@local.test", firstName: "Simba", displayName: "Simba", gender: "man", seekingGenders: ["women"], age: 29, location: "Harare", bio: "Spark-tier test account.", tier: "spark" },
  { id: "local-flame", email: "flame@local.test", firstName: "Farai", displayName: "Farai", gender: "woman", seekingGenders: ["everyone"], age: 31, location: "Bulawayo", bio: "Flame-tier test account.", tier: "flame" },
  { id: "local-ember", email: "ember@local.test", firstName: "Eddie", displayName: "Eddie", gender: "man", seekingGenders: ["everyone"], age: 34, location: "Bulawayo", bio: "Ember-tier test account.", tier: "ember" },
];

const FIRST_NAMES_MEN = ["Tanaka", "Kudzai", "Tapiwa", "Blessing", "Farai", "Tinashe", "Munashe", "Wesley", "Panashe", "Tatenda", "Ngoni", "Takudzwa", "Anesu", "Simbarashe", "Nyasha"];
const FIRST_NAMES_WOMEN = ["Rutendo", "Chiedza", "Rumbidzai", "Vimbai", "Nyaradzo", "Fadzai", "Ropafadzo", "Kudzai", "Anotidaishe", "Tariro", "Ashley", "Charity", "Precious", "Rufaro", "Yeukai"];
const CITIES = ["Harare", "Bulawayo", "Mutare", "Gweru", "Chinhoyi", "Kwekwe", "Masvingo", "Victoria Falls"];
const INTEREST_POOL = ["hiking", "cooking", "music", "faith", "travel", "gaming", "reading", "fitness", "movies", "photography", "dancing", "football"];
const BIOS = [
  "Looking for someone genuine to build something real with.",
  "Big on good food, better conversation, and honesty.",
  "Here for real connection, not games.",
  "Faith, family, and a good sense of humor matter to me.",
  "Ambitious but grounded — looking for the same.",
  "Adventure on weekends, quiet nights the rest of the time.",
];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

async function upsertUser(u: { id: string; email: string; firstName: string; passwordHash?: string; profileImageUrl?: string }) {
  const [existing] = await db.select().from(users).where(eq(users.id, u.id));
  if (existing) return existing;
  const [created] = await db.insert(users).values(u).returning();
  return created;
}

async function upsertProfile(p: {
  userId: string; displayName: string; gender: string; seekingGenders: string[]; age: number;
  location: string; bio: string; coverPhotoUrl: string;
}) {
  const [existing] = await db.select().from(profiles).where(eq(profiles.userId, p.userId));
  if (existing) {
    await db.update(profiles).set({ ...p, onboardingCompleted: true, isPublic: true, moderationStatus: "active" }).where(eq(profiles.userId, p.userId));
    return;
  }
  await db.insert(profiles).values({ ...p, onboardingCompleted: true, isPublic: true, moderationStatus: "active" });
}

async function main() {
  console.log("Seeding local dev database...");

  for (const acc of LOGIN_ACCOUNTS) {
    await upsertUser({
      id: acc.id,
      email: acc.email,
      firstName: acc.firstName,
      passwordHash: await hashPassword("Testing123!"),
      profileImageUrl: AVATAR(acc.id),
    });
    await upsertProfile({
      userId: acc.id,
      displayName: acc.displayName,
      gender: acc.gender,
      seekingGenders: acc.seekingGenders,
      age: acc.age,
      location: acc.location,
      bio: acc.bio,
      coverPhotoUrl: AVATAR(acc.id),
    });
    const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, acc.id));
    if (!existingSub) {
      await db.insert(subscriptions).values({
        userId: acc.id,
        tier: acc.tier,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
    }
    console.log(`  login account: ${acc.email} / Testing123! (${acc.tier}, ${acc.gender} seeking ${acc.seekingGenders.join("/")})`);
  }

  // 40 candidate profiles, split across every gender x seekingGenders
  // combination so every login account above has real matches.
  const CANDIDATE_COUNT = 40;
  for (let i = 0; i < CANDIDATE_COUNT; i++) {
    const isMan = i % 2 === 0;
    const gender = isMan ? "man" : "woman";
    const firstName = isMan ? pick(FIRST_NAMES_MEN, i) : pick(FIRST_NAMES_WOMEN, i);
    const id = `local-candidate-${i}`;
    // Rotate seekingGenders so reciprocal matching has variety: mostly
    // opposite-sex seekers (the common case), a slice seeking "everyone",
    // a slice seeking their own gender.
    const seeking =
      i % 10 === 0 ? ["everyone"] :
      i % 7 === 0 ? [isMan ? "men" : "women"] :
      [isMan ? "women" : "men"];

    await upsertUser({
      id,
      email: `candidate${i}@local.test`,
      firstName,
      profileImageUrl: AVATAR(id),
    });
    await upsertProfile({
      userId: id,
      displayName: firstName,
      gender,
      seekingGenders: seeking,
      age: 20 + (i % 20),
      location: pick(CITIES, i),
      bio: pick(BIOS, i),
      coverPhotoUrl: AVATAR(id),
    });
  }
  console.log(`  ${CANDIDATE_COUNT} candidate profiles seeded (varied gender/seekingGenders/age/city)`);

  console.log("Done.");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
