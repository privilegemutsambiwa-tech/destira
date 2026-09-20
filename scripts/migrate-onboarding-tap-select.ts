// One-off: converts the ten Soul-Mapping onboarding questions from free-text
// to tap-to-select (multiple_choice), to cut onboarding drop-off. Matches
// each row by its exact, known `text` (stable, curated content — not
// arbitrary user data), so a text mismatch just skips that row rather than
// touching the wrong one.
//
// Three of the ten (orderIndex 17, 53, 81) are meant to render as
// multi-select in the client (see MULTI_SELECT_ORDER_INDEXES in
// client/src/pages/Onboarding.tsx) — this script only sets answerType to
// "multiple_choice" and the options; the single-vs-multi behavior is a
// client-side concern keyed off orderIndex, not a separate DB answerType.
//
// Existing free-text answers already on these questions (from users who
// answered before this migration) are left as-is in user_answers — they
// still feed the twin as historical data, they just won't pre-fill the new
// tap-select UI (selectedOptions stays empty for them on these questions).
//
//   npx tsx --env-file=.env scripts/migrate-onboarding-tap-select.ts [--dry-run]

function maskedConnectionInfo(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

const UPDATES: { text: string; options: string[] }[] = [
  {
    text: "What's the one value you'd never compromise on, even if it cost you a relationship?",
    options: [
      "Honesty, even when it costs me",
      "Loyalty — showing up, no matter what",
      "Respect, in both directions",
      "My independence",
      "Ambition and growth",
      "Where I come from — family, faith, roots",
    ],
  },
  {
    text: "What's the most important lesson a past relationship taught you?",
    options: [
      "Say the hard thing before it festers",
      "Don't disappear into someone else",
      "Trust is earned in actions, not promises",
      "I deserve to be chosen, not just liked",
      "Red flags don't fix themselves",
      "Compromise isn't the same as losing myself",
    ],
  },
  {
    // Multi-select, up to 3 (orderIndex 17).
    text: "What does your ideal relationship look like on a random Tuesday evening?",
    options: [
      "Cooking together, no occasion needed",
      "Comfortable silence in the same room",
      "Catching up on each other's day",
      "A show we're both actually into",
      "A walk or workout, side by side",
      "Deep talk, phones down",
      "Doing our own thing, just near each other",
    ],
  },
  {
    text: "Describe your ideal weekend - are you out adventuring or recharging at home?",
    options: [
      "Outdoors and moving — hikes, sport, sun",
      "Home, slow, and unbothered",
      "Out with people I love",
      "Exploring something new in the city",
      "Active mornings, quiet nights",
    ],
  },
  {
    text: "When something bothers you in a relationship, do you bring it up right away or sit with it first?",
    options: [
      "Right away — I need the air clear",
      "I sit with it, then raise it calmly",
      "I process alone first — I don't always raise it",
      "Depends entirely on what it is",
    ],
  },
  {
    // Multi-select, exactly 3 (orderIndex 53).
    text: "How would your closest friend describe you in three words?",
    options: [
      "Loyal", "Funny", "Ambitious", "Calm", "Adventurous", "Thoughtful",
      "Stubborn", "Warm", "Independent", "Curious", "Reliable", "Bold",
      "Guarded", "Generous", "Intense", "Easygoing",
    ],
  },
  {
    text: "What makes you feel most loved and appreciated?",
    options: [
      "When they remember the small details",
      "When they show up without being asked",
      "When they give me room to breathe",
      "When they take my side, publicly",
      "When they just say it, out loud",
    ],
  },
  // orderIndex 71 ("emotional love language") is already multiple_choice — left alone.
  {
    text: "Where do you see yourself in five years, and does that picture include a partner?",
    options: [
      "Yes — building a life with someone",
      "Hopefully, but I'm not chasing it",
      "Focused on myself and my career first",
      "Honestly unsure, and staying open to it",
    ],
  },
  {
    // Multi-select, exactly 3 (orderIndex 81).
    text: "What three qualities are non-negotiable in a partner for you?",
    options: [
      "Kindness", "Honesty", "Ambition", "Sense of humor", "Emotional intelligence",
      "Independence", "Loyalty", "Confidence", "Curiosity", "Stability",
      "Adventurousness", "Family-oriented",
    ],
  },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set — refusing to guess which database to touch.");
    process.exit(1);
  }
  console.log(`>>> ${dryRun ? "[dry run] " : ""}Connecting to ${maskedConnectionInfo(databaseUrl)}`);

  const { db } = await import("../server/db");
  const { questions } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  let matched = 0;
  for (const u of UPDATES) {
    const [row] = await db.select().from(questions).where(eq(questions.text, u.text));
    if (!row) {
      console.warn(`  ! No question found for: "${u.text.slice(0, 60)}..." — skipping.`);
      continue;
    }
    matched++;
    console.log(
      `  - id ${row.id} (orderIndex ${row.orderIndex}): answerType "${row.answerType}" -> "multiple_choice", ${u.options.length} options`,
    );
    if (!dryRun) {
      await db
        .update(questions)
        .set({ answerType: "multiple_choice", options: u.options })
        .where(eq(questions.id, row.id));
    }
  }

  console.log(`\n${dryRun ? "[dry run] Would have updated" : "Updated"} ${matched} of ${UPDATES.length} question(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
