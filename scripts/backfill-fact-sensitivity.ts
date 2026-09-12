// One-off: classify every existing twin_memory_facts row into disclosure
// categories, and map user_answers to the known onboarding sensitivity map.
// Until this runs, every pre-existing fact is withheld from interviews
// (disclosable defaults to false).
//
//   npx tsx --env-file=.env scripts/backfill-fact-sensitivity.ts          # dry run
//   npx tsx --env-file=.env scripts/backfill-fact-sensitivity.ts --write

import { db } from "../server/db";
import { twinMemoryFacts, userAnswers, questions } from "@shared/schema";
import { eq, isNull, and } from "drizzle-orm";
import { classifySensitivity, ONBOARDING_SENSITIVITY } from "../server/disclosure";

const WRITE = process.argv.includes("--write");
const BATCH = 40;

async function main() {
  // ── facts ──────────────────────────────────────────────────────────────
  const facts = await db.select().from(twinMemoryFacts).where(eq(twinMemoryFacts.disclosable, false));
  console.log(`facts to classify: ${facts.length}`);
  let safe = 0;
  let sensitive = 0;
  let failed = 0;

  for (let i = 0; i < facts.length; i += BATCH) {
    const chunk = facts.slice(i, i + BATCH);
    const cats = await classifySensitivity(chunk.map((f) => f.factText));
    for (let j = 0; j < chunk.length; j++) {
      const c = cats[j];
      if (c == null) {
        failed++;
        continue; // stays disclosable=false, unclassified
      }
      if (c.length === 0) safe++;
      else sensitive++;
      console.log(`  #${chunk[j].id} [${c.join(",") || "safe"}] ${chunk[j].factText.slice(0, 60)}`);
      if (WRITE) {
        await db
          .update(twinMemoryFacts)
          .set({ sensitivity: c, disclosable: true })
          .where(eq(twinMemoryFacts.id, chunk[j].id));
      }
    }
  }
  console.log(`facts -> safe: ${safe}, sensitive: ${sensitive}, classifier failed (left withheld): ${failed}`);

  // ── answers: static map by question orderIndex ─────────────────────────
  const ans = await db
    .select({ id: userAnswers.id, orderIndex: questions.orderIndex, text: questions.text })
    .from(userAnswers)
    .innerJoin(questions, eq(userAnswers.questionId, questions.id))
    .where(isNull(userAnswers.sensitivity));
  console.log(`\nanswers to map: ${ans.length}`);
  let mapped = 0;
  let unmapped = 0;
  for (const a of ans) {
    const cats = a.orderIndex != null ? ONBOARDING_SENSITIVITY[a.orderIndex] : undefined;
    if (cats === undefined) {
      unmapped++;
      // Unmapped answers get an explicit empty array only if they're clearly
      // benign; safer to leave NULL (withheld) and let a later pass handle it.
      continue;
    }
    mapped++;
    if (WRITE) {
      await db.update(userAnswers).set({ sensitivity: cats }).where(eq(userAnswers.id, a.id));
    }
  }
  console.log(`answers -> mapped: ${mapped}, left NULL (withheld): ${unmapped}`);

  console.log(WRITE ? "\nwritten." : "\ndry run — re-run with --write.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
