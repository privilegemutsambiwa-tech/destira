import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { RefineWithAI } from "@/components/refine-with-ai";
import { useCheckNickname } from "@/hooks/use-interactions";
import {
  useOnboarding,
  useSaveOnboardingAnswer,
  useCompleteOnboarding,
  type OnboardingQuestion,
} from "@/hooks/use-onboarding";
import { useToast } from "@/hooks/use-toast";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";
const INPUT =
  "w-full rounded-[12px] border border-vf-line bg-vf-text/5 px-3.5 h-11 text-[15px] text-vf-text placeholder:text-vf-faint outline-none focus:border-vf-ember/60 transition-colors";

// Three of the ten Soul-Mapping questions read naturally as "pick a few, not
// one" (a Tuesday evening, three words, three qualities) — multi-select,
// capped at 3, keyed by the question's stable orderIndex rather than its id
// (ids are DB-generated per environment; orderIndex is the content's own
// stable key, set once in server/seed-questions.ts). Every other
// multiple_choice question is single-select.
const MULTI_SELECT_ORDER_INDEXES = new Set([17, 53, 81]);
const MULTI_SELECT_MAX = 3;

type Step = "nickname" | "deal" | number; // number = question index

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { logout } = useAuth();
  const { toast } = useToast();
  const { data, isLoading } = useOnboarding();
  const saveAnswer = useSaveOnboardingAnswer();
  const complete = useCompleteOnboarding();

  const questions: OnboardingQuestion[] = data?.questions ?? [];
  const [step, setStep] = useState<Step>("nickname");
  const [nickname, setNickname] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  // local edits keyed by question id — choice is always an array (a single
  // pick is just an array of one) so the same state shape covers both
  // single- and multi-select without a parallel structure.
  const [text, setText] = useState<Record<number, string>>({});
  const [choice, setChoice] = useState<Record<number, string[]>>({});
  const [seeded, setSeeded] = useState(false);
  const pendingAdvanceRef = useRef<number | null>(null);

  // A pending single-select auto-advance belongs to one specific question —
  // if the step changes any other way while it's in flight, drop it rather
  // than let it fire against whatever question the user has since moved to.
  useEffect(() => {
    return () => {
      if (pendingAdvanceRef.current != null) {
        window.clearTimeout(pendingAdvanceRef.current);
        pendingAdvanceRef.current = null;
      }
    };
  }, [step]);

  // Seed local state from the server once, and jump to where the user left off.
  useEffect(() => {
    if (seeded || !data) return;
    setNickname(data.nickname || "");
    const t: Record<number, string> = {};
    const c: Record<number, string[]> = {};
    data.questions.forEach((q) => {
      if (q.answerText) t[q.id] = q.answerText;
      if (q.selectedOptions?.length) c[q.id] = q.selectedOptions;
    });
    setText(t);
    setChoice(c);
    if (!data.nickname) setStep("nickname");
    else if (data.readiness.answeredCount === 0) setStep("deal");
    else {
      const firstUnanswered = data.questions.findIndex((q) => !q.answered);
      setStep(firstUnanswered === -1 ? data.questions.length - 1 : firstUnanswered);
    }
    setSeeded(true);
  }, [data, seeded]);

  const answeredCount = useMemo(
    () =>
      questions.filter(
        (q) => (text[q.id]?.trim().length ?? 0) > 0 || (choice[q.id]?.length ?? 0) > 0 || q.answered,
      ).length,
    [questions, text, choice],
  );

  const finishAndLeave = async () => {
    try {
      await complete.mutateAsync({
        groupNickname: nickname || undefined,
        isPublic,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setLocation("/plans?intro=1");
    } catch (e: any) {
      toast({ title: e?.message || "Couldn't finish", variant: "destructive" });
    }
  };

  const saveCurrent = async (q: OnboardingQuestion): Promise<boolean> => {
    const t = text[q.id]?.trim();
    const c = choice[q.id] ?? [];
    if (!t && c.length === 0) return true; // nothing to save, treat as skip
    try {
      await saveAnswer.mutateAsync(
        q.answerType === "multiple_choice"
          ? { questionId: q.id, selectedOptions: c }
          : { questionId: q.id, answerText: t },
      );
      return true;
    } catch (e: any) {
      toast({ title: e?.message || "Couldn't save that", variant: "destructive" });
      return false;
    }
  };

  if (isLoading || !data) {
    return (
      <div className="min-h-dvh bg-vf-ink flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-vf-ember" />
      </div>
    );
  }

  // ── NICKNAME ─────────────────────────────────────────────────────────
  if (step === "nickname") {
    return (
      <Shell>
        <NicknameStep
          value={nickname}
          onChange={setNickname}
          onNext={() => setStep(data.readiness.answeredCount === 0 ? "deal" : 0)}
          onExit={() => logout()}
        />
      </Shell>
    );
  }

  // ── THE DEAL ─────────────────────────────────────────────────────────
  if (step === "deal") {
    return (
      <Shell>
        <div className="rounded-[24px] border border-vf-line bg-vf-surface p-7 sm:p-9">
          <div className={EYEBROW}>Before you start</div>
          <h1
            className="font-serif font-normal text-vf-text mt-3"
            style={{ fontSize: "30px", lineHeight: 1.15, letterSpacing: "-0.01em" }}
          >
            Your twin only knows what you tell it.
          </h1>
          <p className="text-[15px] text-vf-muted leading-[1.65] mt-4 max-w-[46ch]">
            Ten questions, about six minutes. You can skip any of them and answer later — but a
            twin with two answers will guess, and you'll feel it in who you're shown.
          </p>

          <label className="flex items-center justify-between gap-4 mt-6 py-3 border-t border-vf-line">
            <span className="text-[14px] text-vf-soft">
              Show my profile to others
              <span className="block text-[12px] text-vf-faint mt-0.5">
                Off means people can't find you in Discover yet.
              </span>
            </span>
            <Toggle on={isPublic} onChange={setIsPublic} />
          </label>

          <div className="flex flex-col gap-3 mt-7">
            <button
              onClick={() => setStep(0)}
              className="inline-flex items-center justify-center rounded-full bg-vf-ember text-vf-ink font-bold h-12 text-[15px] btn-press transition-colors hover:bg-[var(--vf-ember-soft)]"
              data-testid="button-answer-now"
            >
              Answer them now
            </button>
            <button
              onClick={finishAndLeave}
              disabled={complete.isPending}
              className="text-[13px] text-vf-muted hover:text-vf-text transition-colors disabled:opacity-50"
              data-testid="button-skip-for-now"
            >
              {complete.isPending ? "One moment…" : "Skip for now"}
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ── QUESTIONS ────────────────────────────────────────────────────────
  const idx = step as number;
  const q = questions[idx];
  if (!q) {
    setLocation("/discover");
    return null;
  }
  const isLast = idx === questions.length - 1;
  const pct = Math.round((answeredCount / (questions.length || 10)) * 100);
  const busy = saveAnswer.isPending || complete.isPending;

  const goNext = async () => {
    clearPendingAdvance();
    const ok = await saveCurrent(q);
    if (!ok) return;
    if (isLast) return finishAndLeave();
    setStep(idx + 1);
  };
  const skipOne = () => {
    clearPendingAdvance();
    if (isLast) return finishAndLeave();
    setStep(idx + 1);
  };

  return (
    <Shell>
      <div className="mb-6 flex items-center justify-between">
        <div className={EYEBROW}>
          Question {idx + 1} of {questions.length}
        </div>
        <button
          onClick={finishAndLeave}
          disabled={busy}
          className="text-[12.5px] text-vf-muted hover:text-vf-text transition-colors disabled:opacity-50"
          data-testid="button-finish-later"
        >
          Finish later
        </button>
      </div>
      <div className="h-1 rounded-full bg-vf-text/10 overflow-hidden mb-8">
        <div className="h-full bg-vf-ember transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="rounded-[24px] border border-vf-line bg-vf-surface p-7 sm:p-9"
        >
          <h1
            className="font-serif font-normal text-vf-text"
            style={{ fontSize: "24px", lineHeight: 1.25, letterSpacing: "-0.01em" }}
            data-testid="text-question"
          >
            {q.text}
          </h1>

          {q.answerType === "multiple_choice" && q.options ? (
            <ChoiceGrid
              question={q}
              options={q.options}
              selected={choice[q.id] ?? []}
              onToggle={(opt) => toggleOption(q, opt)}
            />
          ) : (
            <>
              <textarea
                value={text[q.id] ?? ""}
                onChange={(e) => setText((t) => ({ ...t, [q.id]: e.target.value }))}
                placeholder="In your own words…"
                className="mt-7 w-full min-h-[140px] bg-transparent border-0 border-b-2 border-vf-line focus:border-vf-ember rounded-none outline-none text-[16px] leading-[1.6] text-vf-text placeholder:text-vf-faint resize-none px-0"
                autoFocus
                data-testid="input-answer"
              />
              <div className="mt-3">
                <RefineWithAI
                  key={`refine-onboarding-${q.id}`}
                  value={text[q.id] ?? ""}
                  fieldType="answer"
                  promptContext={q.text}
                  onApply={(refined) => setText((t) => ({ ...t, [q.id]: refined }))}
                />
              </div>
            </>
          )}

          <div className="flex items-center justify-between mt-8">
            <button
              onClick={skipOne}
              disabled={busy}
              className="text-[13px] text-vf-muted hover:text-vf-text transition-colors disabled:opacity-50"
              data-testid="button-skip-one"
            >
              Skip this one
            </button>
            <button
              onClick={goNext}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-vf-ember text-vf-ink font-bold h-11 px-7 text-[14px] btn-press transition-colors hover:bg-[var(--vf-ember-soft)] disabled:opacity-50"
              data-testid="button-next"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLast ? "Finish" : "Next"}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </Shell>
  );

  // Single-select: tapping an option answers the question — no second tap
  // on "Next" needed, which is the whole point of trading a blank textarea
  // for a tap-select grid. A short delay lets the selected state actually
  // render before the card changes underneath the tap. Multi-select still
  // needs an explicit "Next": the answer isn't complete after one tap by
  // definition. pendingAdvance is cleared by any other way of leaving this
  // question (Next, Skip, or a second tap arriving before the timer fires)
  // so a quick double-tap can never advance two questions at once.
  function toggleOption(question: OnboardingQuestion, opt: string) {
    clearPendingAdvance();
    const isMulti = MULTI_SELECT_ORDER_INDEXES.has(question.orderIndex);
    const cur = choice[question.id] ?? [];
    let next: string[];
    if (isMulti) {
      next = cur.includes(opt)
        ? cur.filter((o) => o !== opt)
        : cur.length >= MULTI_SELECT_MAX
          ? cur
          : [...cur, opt];
    } else {
      next = cur[0] === opt ? [] : [opt];
    }
    setChoice((c) => ({ ...c, [question.id]: next }));

    if (!isMulti && next.length > 0) {
      pendingAdvanceRef.current = window.setTimeout(async () => {
        pendingAdvanceRef.current = null;
        try {
          await saveAnswer.mutateAsync({ questionId: question.id, selectedOptions: next });
        } catch (e: any) {
          toast({ title: e?.message || "Couldn't save that", variant: "destructive" });
          return;
        }
        if (question.id !== questions[idx]?.id) return; // moved on some other way already
        if (idx === questions.length - 1) finishAndLeave();
        else setStep(idx + 1);
      }, 320);
    }
  }

  function clearPendingAdvance() {
    if (pendingAdvanceRef.current != null) {
      window.clearTimeout(pendingAdvanceRef.current);
      pendingAdvanceRef.current = null;
    }
  }
}

// Short, single-word-ish options (the trait lists: "three words about you",
// "non-negotiable qualities") read better as a loose wrap of pills; longer
// phrase options (everything else) read better as full-width tap cards —
// a pill that wraps to two lines loses the "quick tap" feel entirely.
function ChoiceGrid({
  question,
  options,
  selected,
  onToggle,
}: {
  question: OnboardingQuestion;
  options: string[];
  selected: string[];
  onToggle: (opt: string) => void;
}) {
  const isMulti = MULTI_SELECT_ORDER_INDEXES.has(question.orderIndex);
  const isPillStyle = options.every((o) => o.length <= 20);

  return (
    <div className="mt-7">
      {isMulti && (
        <div className={`${EYEBROW} mb-3`} data-testid="text-multiselect-hint">
          Pick up to {MULTI_SELECT_MAX} · {selected.length} selected
        </div>
      )}
      <div className={isPillStyle ? "flex flex-wrap gap-2" : "flex flex-col gap-2.5"}>
        {options.map((opt) => {
          const on = selected.includes(opt);
          const disabledByCap = isMulti && !on && selected.length >= MULTI_SELECT_MAX;
          return isPillStyle ? (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              disabled={disabledByCap}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 h-10 text-[13.5px] font-medium btn-press transition-all duration-150 ${
                on
                  ? "border-transparent bg-vf-ember text-vf-ink"
                  : disabledByCap
                    ? "border-vf-line text-vf-faint opacity-40"
                    : "border-vf-line text-vf-muted hover:text-vf-text hover:border-vf-text/25"
              }`}
              data-testid={`option-${opt}`}
            >
              {on && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
              {opt}
            </button>
          ) : (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              disabled={disabledByCap}
              aria-pressed={on}
              className={`text-left flex items-center gap-3 rounded-[14px] border px-4 py-3.5 text-[14.5px] btn-press transition-all duration-150 ${
                on
                  ? "border-vf-ember/60 bg-vf-ember/[0.08] text-vf-text"
                  : disabledByCap
                    ? "border-vf-line text-vf-faint opacity-40"
                    : "border-vf-line text-vf-muted hover:text-vf-text hover:border-vf-text/20"
              }`}
              data-testid={`option-${opt}`}
            >
              <span
                className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                  on ? "border-vf-ember bg-vf-ember" : "border-vf-text/25"
                }`}
              >
                {on && <Check className="w-3 h-3 text-vf-ink" strokeWidth={3.5} />}
              </span>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-vf-ink text-vf-text flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-[520px]">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`w-[44px] h-[26px] rounded-full shrink-0 flex items-center p-[3px] transition-colors ${
        on ? "bg-vf-ember justify-end" : "bg-vf-text/[0.14] justify-start"
      }`}
      data-testid="toggle-public"
    >
      <span className="block w-[20px] h-[20px] rounded-full" style={{ background: on ? "hsl(var(--vf-ink))" : "#CFC7DA" }} />
    </button>
  );
}

function NicknameStep({
  value,
  onChange,
  onNext,
  onExit,
}: {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onExit: () => void;
}) {
  const { data: check, isFetching } = useCheckNickname(value);
  const [touched, setTouched] = useState(false);
  const validFormat = /^[a-zA-Z0-9_]{3,20}$/.test(value);
  const available = check?.available === true;
  const showError = touched && value.length > 0 && !validFormat;
  const showTaken = touched && validFormat && !isFetching && !available;
  const ok = validFormat && !isFetching && available;

  return (
    <div className="rounded-[24px] border border-vf-line bg-vf-surface p-7 sm:p-9">
      <div className={EYEBROW}>Your name in the Lounge</div>
      <h1
        className="font-serif font-normal text-vf-text mt-3"
        style={{ fontSize: "28px", lineHeight: 1.2, letterSpacing: "-0.01em" }}
      >
        Pick a nickname.
      </h1>
      <p className="text-[14px] text-vf-muted leading-[1.6] mt-3">
        It's how you show up in group chats. Short, unique, and it stays with you.
      </p>

      <div className="relative mt-6">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-vf-faint text-[15px]">@</span>
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""));
            setTouched(true);
          }}
          placeholder="nickname"
          maxLength={20}
          autoFocus
          className={`${INPUT} pl-8`}
          data-testid="input-nickname"
        />
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
          {isFetching && <Loader2 className="w-4 h-4 animate-spin text-vf-faint" />}
        </span>
      </div>
      <p
        className={`text-[12px] mt-2 ${showError || showTaken ? "text-vf-ember" : "text-vf-faint"}`}
        role={showError || showTaken ? "alert" : undefined}
      >
        {showError
          ? "3–20 characters: letters, numbers and underscores."
          : showTaken
            ? "That one's taken."
            : ok
              ? "Available."
              : "3–20 characters: letters, numbers and underscores."}
      </p>

      {showTaken && Array.isArray(check?.suggestions) && check!.suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-[12px] text-vf-faint">Try</span>
          {check!.suggestions.map((s: string) => (
            <button
              key={s}
              onClick={() => { onChange(s); setTouched(true); }}
              className="text-[12px] px-3 h-8 rounded-full border border-vf-line text-vf-text hover:border-vf-text/25 transition-colors"
            >
              @{s}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-8">
        <button onClick={onExit} className="text-[13px] text-vf-muted hover:text-vf-text transition-colors" data-testid="button-exit">
          Exit
        </button>
        <button
          onClick={onNext}
          disabled={!ok}
          className="inline-flex items-center justify-center rounded-full bg-vf-ember text-vf-ink font-bold h-11 px-7 text-[14px] btn-press transition-colors hover:bg-[var(--vf-ember-soft)] disabled:opacity-40"
          data-testid="button-nickname-next"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
