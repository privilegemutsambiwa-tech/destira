// One-off repair: re-derives every user's "onboarding"-sourced twin memory
// facts from their real, correctly-paired questions/user_answers rows, and
// replaces whatever is currently stored under source='onboarding'.
//
// Why this is needed: the seeding function that used to write these facts
// (seedOnboardingIntoTwinMemory, server/routes.ts) paired an answer's
// *position in a re-indexed, answered-only array* against a hardcoded,
// stale ONBOARDING_QUESTIONS list — so skipping any question shifted every
// later answer onto the wrong question's text, and the question wording
// itself no longer matched what's actually in the questions table. That
// function is now fixed to take real {question, answer} pairs and can't
// drift again, but the fix doesn't retroactively correct facts it already
// wrote — this script does that, once, for every affected account.
//
// 'chat'-sourced facts (from twin conversations) are untouched — only rows
// with source='onboarding' are replaced.
//
//   npx tsx --env-file=.env scripts/repair-onboarding-twin-facts.ts [--dry-run]

function maskedConnectionInfo(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set — refusing to guess which database to touch.");
    process.exit(1);
  }
  console.log(`>>> ${dryRun ? "[dry run] " : ""}Connecting to ${maskedConnectionInfo(databaseUrl)}`);

  const { db } = await import("../server/db");
  const { profiles, twinMemoryFacts } = await import("@shared/schema");
  const { eq, and } = await import("drizzle-orm");
  const { getOnboardingQuestions } = await import("../server/onboarding");
  const disclosure = await import("../server/disclosure");
  const { storage } = await import("../server/storage");

  const completed = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.onboardingCompleted, true));

  console.log(`Found ${completed.length} user(s) with onboarding completed.\n`);

  let usersTouched = 0;
  let factsWritten = 0;

  for (const { userId } of completed) {
    const qs = await getOnboardingQuestions(userId);
    const answered = qs.filter((q) => q.answered);
    const correctFacts = answered
      .map((q) => {
        const a = q.answerText?.trim() || (q.selectedOptions ?? []).join(", ");
        return a ? `${q.text} → ${a}` : null;
      })
      .filter((f): f is string => !!f);

    const existing = await db
      .select({ id: twinMemoryFacts.id, factText: twinMemoryFacts.factText })
      .from(twinMemoryFacts)
      .where(and(eq(twinMemoryFacts.userId, userId), eq(twinMemoryFacts.source, "onboarding")));

    const alreadyCorrect =
      existing.length === correctFacts.length &&
      existing.every((e) => correctFacts.includes(e.factText));
    if (alreadyCorrect) continue; // nothing to do for this user

    usersTouched++;
    console.log(`  - user ${userId}: replacing ${existing.length} onboarding fact(s) with ${correctFacts.length} correct one(s)`);
    if (dryRun) continue;

    await db
      .delete(twinMemoryFacts)
      .where(and(eq(twinMemoryFacts.userId, userId), eq(twinMemoryFacts.source, "onboarding")));

    if (correctFacts.length) {
      const cats = await disclosure.classifySensitivity(correctFacts);
      for (let i = 0; i < correctFacts.length; i++) {
        await storage.addTwinMemoryFact(userId, correctFacts[i], "onboarding", {
          sensitivity: cats[i] ?? undefined,
          classified: cats[i] != null,
        });
        factsWritten++;
      }
    }
  }

  console.log(
    `\n${dryRun ? "[dry run] Would have repaired" : "Repaired"} ${usersTouched} of ${completed.length} user(s)` +
      (dryRun ? "" : `, writing ${factsWritten} fact(s) total.`),
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
