import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
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
  "w-full rounded-[12px] border border-vf-line bg-white/5 px-3.5 h-11 text-[15px] text-vf-text placeholder:text-vf-faint outline-none focus:border-vf-ember/60 transition-colors";

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
  // local edits keyed by question id
  const [text, setText] = useState<Record<number, string>>({});
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [seeded, setSeeded] = useState(false);

  // Seed local state from the server once, and jump to where the user left off.
  useEffect(() => {
    if (seeded || !data) return;
    setNickname(data.nickname || "");
    const t: Record<number, string> = {};
    const c: Record<number, string> = {};
    data.questions.forEach((q) => {
      if (q.answerText) t[q.id] = q.answerText;
      if (q.selectedOptions?.[0]) c[q.id] = q.selectedOptions[0];
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
      await complete.mutateAsync({ groupNickname: nickname || undefined, isPublic });
      setLocation("/plans?intro=1");
    } catch (e: any) {
      toast({ title: e?.message || "Couldn't finish", variant: "destructive" });
    }
  };

  const saveCurrent = async (q: OnboardingQuestion): Promise<boolean> => {
    const t = text[q.id]?.trim();
    const c = choice[q.id];
    if (!t && !c) return true; // nothing to save, treat as skip
    try {
      await saveAnswer.mutateAsync(
        q.answerType === "multiple_choice"
          ? { questionId: q.id, selectedOptions: c ? [c] : [] }
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
      <div className="min-h-screen bg-vf-ink flex items-center justify-center">
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
              className="inline-flex items-center justify-center rounded-full bg-vf-ember text-vf-ink font-bold h-12 text-[15px] btn-press transition-colors hover:bg-[#FF8163]"
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
    const ok = await saveCurrent(q);
    if (!ok) return;
    if (isLast) return finishAndLeave();
    setStep(idx + 1);
  };
  const skipOne = () => {
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
      <div className="h-1 rounded-full bg-white/10 overflow-hidden mb-8">
        <div className="h-full bg-vf-ember transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>

      <div className="rounded-[24px] border border-vf-line bg-vf-surface p-7 sm:p-9">
        <h1
          className="font-serif font-normal text-vf-text"
          style={{ fontSize: "24px", lineHeight: 1.25, letterSpacing: "-0.01em" }}
          data-testid="text-question"
        >
          {q.text}
        </h1>

        {q.answerType === "multiple_choice" && q.options ? (
          <div className="flex flex-col gap-2.5 mt-7">
            {q.options.map((opt) => {
              const on = choice[q.id] === opt;
              return (
                <button
                  key={opt}
                  onClick={() => setChoice((c) => ({ ...c, [q.id]: on ? "" : opt }))}
                  className={`text-left rounded-[12px] border px-4 py-3 text-[14.5px] transition-colors ${
                    on
                      ? "border-vf-ember/60 bg-vf-ember/[0.08] text-vf-text"
                      : "border-vf-line text-vf-muted hover:text-vf-text hover:border-white/20"
                  }`}
                  data-testid={`option-${opt}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        ) : (
          <textarea
            value={text[q.id] ?? ""}
            onChange={(e) => setText((t) => ({ ...t, [q.id]: e.target.value }))}
            placeholder="In your own words…"
            className="mt-7 w-full min-h-[140px] bg-transparent border-0 border-b-2 border-vf-line focus:border-vf-ember rounded-none outline-none text-[16px] leading-[1.6] text-vf-text placeholder:text-vf-faint resize-none px-0"
            autoFocus
            data-testid="input-answer"
          />
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
            className="inline-flex items-center justify-center gap-2 rounded-full bg-vf-ember text-vf-ink font-bold h-11 px-7 text-[14px] btn-press transition-colors hover:bg-[#FF8163] disabled:opacity-50"
            data-testid="button-next"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLast ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-vf-ink text-vf-text flex items-center justify-center px-6 py-16">
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
        on ? "bg-vf-ember justify-end" : "bg-white/[0.14] justify-start"
      }`}
      data-testid="toggle-public"
    >
      <span className="block w-[20px] h-[20px] rounded-full" style={{ background: on ? "#0C0910" : "#CFC7DA" }} />
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
              className="text-[12px] px-3 h-8 rounded-full border border-vf-line text-vf-text hover:border-white/25 transition-colors"
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
          className="inline-flex items-center justify-center rounded-full bg-vf-ember text-vf-ink font-bold h-11 px-7 text-[14px] btn-press transition-colors hover:bg-[#FF8163] disabled:opacity-40"
          data-testid="button-nickname-next"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
