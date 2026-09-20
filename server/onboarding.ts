// Onboarding + twin-readiness service.
//
// The ten soul-mapping questions the twin is built from live in the DB
// (`questions.isOnboardingQuestion = true`, seeded by server/seed-questions.ts) —
// NOT hardcoded in a component. Each answer is stored as a real `user_answers`
// row against a question id so the twin, the profile prompts and the readiness
// meter can all reference it.
//
// Readiness = answered onboarding questions / total onboarding questions.
// Below MIN_TWIN_ANSWERS the twin is not generated and the twin layer must
// show as "not yet ready" rather than fabricating a personality.

import { db } from "./db";
import { questions, userAnswers, profiles, reminderDismissals, MIN_TWIN_ANSWERS } from "@shared/schema";
import { and, eq, asc } from "drizzle-orm";

export interface OnboardingQuestion {
  id: number;
  text: string;
  category: string;
  answerType: string; // 'text' | 'multiple_choice' | 'rating'
  options: string[] | null;
  answerText: string | null;
  selectedOptions: string[] | null;
  answered: boolean;
  orderIndex: number;
}

export async function getOnboardingQuestions(userId: string): Promise<OnboardingQuestion[]> {
  const [qs, answers] = await Promise.all([
    db
      .select()
      .from(questions)
      .where(eq(questions.isOnboardingQuestion, true))
      .orderBy(asc(questions.orderIndex)),
    db.select().from(userAnswers).where(eq(userAnswers.userId, userId)),
  ]);
  const byQ = new Map(answers.map((a) => [a.questionId, a]));
  return qs.map((q) => {
    const a = byQ.get(q.id);
    const answered =
      !!a &&
      ((a.answerText != null && a.answerText.trim().length > 0) ||
        (Array.isArray(a.selectedOptions) && a.selectedOptions.length > 0));
    return {
      id: q.id,
      text: q.text,
      category: q.category,
      answerType: q.answerType,
      options: (q.options as string[] | null) ?? null,
      answerText: a?.answerText ?? null,
      selectedOptions: (a?.selectedOptions as string[] | null) ?? null,
      answered,
      orderIndex: q.orderIndex ?? 0,
    };
  });
}

export interface TwinReadiness {
  answeredCount: number;
  totalCount: number;
  pct: number;
  twinReady: boolean;
  floor: number;
  nextQuestionId: number | null;
  onboardingCompleted: boolean;
}

export async function getTwinReadiness(userId: string): Promise<TwinReadiness> {
  const qs = await getOnboardingQuestions(userId);
  const answered = qs.filter((q) => q.answered);
  const next = qs.find((q) => !q.answered) ?? null;
  const [profile] = await db
    .select({ onboardingCompleted: profiles.onboardingCompleted })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  const totalCount = qs.length || 10;
  return {
    answeredCount: answered.length,
    totalCount,
    pct: totalCount ? Math.round((answered.length / totalCount) * 100) : 0,
    twinReady: answered.length >= MIN_TWIN_ANSWERS,
    floor: MIN_TWIN_ANSWERS,
    nextQuestionId: next?.id ?? null,
    onboardingCompleted: !!profile?.onboardingCompleted,
  };
}

// Upsert one onboarding answer. Unlike POST /api/questions/:id/answer this does
// not reject a re-answer — onboarding is resumable and editable.
export async function saveOnboardingAnswer(
  userId: string,
  questionId: number,
  value: { answerText?: string; selectedOptions?: string[]; isPrivate?: boolean },
): Promise<void> {
  const [q] = await db.select().from(questions).where(eq(questions.id, questionId));
  if (!q || !q.isOnboardingQuestion) throw new Error("Not an onboarding question");
  const [existing] = await db
    .select({ id: userAnswers.id })
    .from(userAnswers)
    .where(and(eq(userAnswers.userId, userId), eq(userAnswers.questionId, questionId)));
  const row = {
    answerText: value.answerText ?? null,
    selectedOptions: value.selectedOptions ?? null,
    isPrivate: value.isPrivate ?? false,
  };
  if (existing) {
    await db.update(userAnswers).set(row).where(eq(userAnswers.id, existing.id));
  } else {
    await db.insert(userAnswers).values({ userId, questionId, ...row });
  }
}

// Flips onboardingCompleted true no matter how the user leaves onboarding
// (skipped everything, finished, or "Finish later") so nobody is trapped.
// Optionally sets the group nickname. Idempotent.
export async function completeOnboarding(
  userId: string,
  groupNickname?: string,
  isPublic?: boolean,
  timezone?: string,
): Promise<void> {
  const patch: Record<string, unknown> = { onboardingCompleted: true };
  if (groupNickname && /^[a-zA-Z0-9_]{3,20}$/.test(groupNickname)) {
    patch.groupNickname = groupNickname;
  }
  if (typeof isPublic === "boolean") patch.isPublic = isPublic;
  if (typeof timezone === "string" && timezone.length > 1 && timezone.length < 64) patch.timezone = timezone;
  const readiness = await getTwinReadiness(userId);
  patch.twinQuestionsAnswered = readiness.answeredCount;
  const [existing] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (existing) {
    await db.update(profiles).set(patch).where(eq(profiles.userId, userId));
  } else {
    await db.insert(profiles).values({ userId, ...(patch as any) });
  }
}

// ── reminder dismissals (per-user, time-boxed, cross-device) ──
const DISMISS_DAYS = 7;

export async function isReminderDismissed(userId: string, kind: string): Promise<boolean> {
  const [row] = await db
    .select({ until: reminderDismissals.dismissedUntil })
    .from(reminderDismissals)
    .where(and(eq(reminderDismissals.userId, userId), eq(reminderDismissals.kind, kind)));
  return !!row && row.until.getTime() > Date.now();
}

export async function dismissReminder(userId: string, kind: string): Promise<void> {
  const until = new Date(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000);
  await db
    .insert(reminderDismissals)
    .values({ userId, kind, dismissedUntil: until, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [reminderDismissals.userId, reminderDismissals.kind],
      set: { dismissedUntil: until, updatedAt: new Date() },
    });
}
