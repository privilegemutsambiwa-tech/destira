// Landing: try it. The quiz, ask a twin, and two twins talking (examples).

import { useRef, useEffect, useState } from "react";
import { HeartHandshake, RotateCcw } from "lucide-react";
import { trackEvent } from "@/lib/pixel";
import { LANDING_QUIZ, saveQuizAnswers, twinNote, type QuizAnswers } from "@/lib/landing-quiz";
import { SignupButtons } from "./hero";
import { usePrefersReducedMotion, Eyebrow } from "./shared";

// ── 3 · The quiz ─────────────────────────────────────────────────────

export function TwinQuiz() {
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [i, setI] = useState(0);
  const started = useRef(false);
  const done = i >= LANDING_QUIZ.length;

  const pick = (orderIndex: number, value: string) => {
    if (!started.current) {
      started.current = true;
      trackEvent("ViewContent", { content_name: "twin_quiz" });
    }
    const next = { ...answers, [orderIndex]: value };
    setAnswers(next);
    window.setTimeout(() => {
      setI((n) => n + 1);
      if (i + 1 >= LANDING_QUIZ.length) {
        saveQuizAnswers(next);
        trackEvent("Lead", { content_name: "twin_quiz" });
      }
    }, 180);
  };

  const restart = () => {
    setAnswers({});
    setI(0);
  };

  const note = done ? twinNote(answers) : null;
  const q = LANDING_QUIZ[Math.min(i, LANDING_QUIZ.length - 1)];

  return (
    <div
      className="rounded-[28px] border border-vf-mint/25 p-5 sm:p-8 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.35)]"
      style={{ background: "linear-gradient(160deg, hsl(var(--vf-mint) / 0.10), var(--vf-surface) 55%)" }}
      data-testid="twin-quiz"
    >
      {!done ? (
        <div key={i} className="animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="flex items-center justify-between">
            <Eyebrow tone="mint">Question {i + 1} of {LANDING_QUIZ.length}</Eyebrow>
            <div className="flex gap-1.5" aria-hidden="true">
              {LANDING_QUIZ.map((_, n) => (
                <span key={n} className={`h-1.5 rounded-full transition-all ${n <= i ? "w-6 bg-vf-mint" : "w-3 bg-vf-text/15"}`} />
              ))}
            </div>
          </div>
          <p className="font-serif text-vf-text mt-4" style={{ fontSize: "clamp(23px, 3vw, 30px)", lineHeight: 1.15 }}>
            {q.prompt}
          </p>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {q.options.map((o) => {
              const on = answers[q.orderIndex] === o.value;
              return (
                <button
                  key={o.value}
                  onClick={() => pick(q.orderIndex, o.value)}
                  className={`text-left rounded-[16px] border px-4 py-3.5 text-[15px] font-medium transition-all btn-press ${
                    on ? "border-vf-mint bg-vf-mint/15 text-vf-text" : "border-vf-line bg-vf-surface text-vf-text hover:border-vf-mint/50"
                  }`}
                  data-testid={`quiz-option-${q.orderIndex}`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          {i > 0 && (
            <button onClick={() => setI((n) => n - 1)} className="mt-4 text-[13px] text-vf-muted underline underline-offset-2">
              Back
            </button>
          )}
        </div>
      ) : (
        <div className="animate-in fade-in zoom-in-95 duration-500" data-testid="quiz-result">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-vf-mint animate-pulse" aria-hidden="true" />
            <Eyebrow tone="mint">Your twin's first note about you</Eyebrow>
          </div>
          <p className="font-serif text-vf-text mt-4" style={{ fontSize: "clamp(22px, 2.8vw, 28px)", lineHeight: 1.25 }}>
            “{note!.about}”
          </p>
          <p className="mt-4 text-[15.5px] leading-[1.6] text-vf-muted">
            It would look for <span className="text-vf-text font-medium">{note!.looksFor}</span>, and talk to their twin
            before you ever have to.
          </p>
          <div className="mt-6 rounded-[16px] bg-vf-mint/10 border border-vf-mint/20 px-4 py-3 text-[14px] leading-[1.5] text-vf-text">
            <b className="font-semibold">Your 3 answers are saved.</b> Create your free account and your twin starts with
            them, already part-way to its first introductions.
          </div>
          <SignupButtons className="mt-5" testId="quiz" />
          <button onClick={restart} className="mt-4 text-[13px] text-vf-muted underline underline-offset-2">
            Start over
          </button>
        </div>
      )}
    </div>
  );
}

// ── 5 · Ask a twin ───────────────────────────────────────────────────
// A fictional member's twin, so visitors can feel how it answers, including
// how it declines a topic its owner hasn't switched on.

const ASK_EXAMPLES: { q: string; a: string; refused?: boolean }[] = [
  {
    q: "What's she like on a free weekend?",
    a: "Saturday mornings she's at the Avondale market before nine. Afternoons are for her sister's kids. She keeps Sunday slow on purpose.",
  },
  {
    q: "What would be a deal-breaker?",
    a: "Someone who goes quiet instead of saying what's wrong. She'd rather have the hard conversation early than guess for a week.",
  },
  {
    q: "How much does she earn?",
    a: "That's not something she's switched on for me to discuss. If it matters, it's a question for her, later, in person.",
    refused: true,
  },
  {
    q: "Would we get on?",
    a: "Probably on the things that matter: you both say what's bothering you straight away. You'd differ on pace. She plans, you improvise.",
  },
];

export function AskATwin() {
  const reduce = usePrefersReducedMotion();
  const [active, setActive] = useState<number | null>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (active == null) return;
    const full = ASK_EXAMPLES[active].a;
    if (reduce) {
      setTyped(full);
      return;
    }
    setTyped("");
    let n = 0;
    const id = window.setInterval(() => {
      n += 2;
      setTyped(full.slice(0, n));
      if (n >= full.length) window.clearInterval(id);
    }, 16);
    return () => window.clearInterval(id);
  }, [active, reduce]);

  const ex = active != null ? ASK_EXAMPLES[active] : null;

  return (
    <div className="rounded-[28px] border border-vf-line bg-vf-surface p-5 sm:p-7" data-testid="ask-a-twin">
      <div className="flex items-center gap-3">
        <div className="relative" aria-hidden="true">
          <span
            className="w-12 h-12 rounded-full flex items-center justify-center font-serif text-[22px] text-white"
            style={{ background: "linear-gradient(135deg, hsl(var(--vf-ember)), var(--vf-mint-vivid))" }}
          >
            R
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-vf-mint border-2 border-vf-surface" />
        </div>
        <div>
          <div className="text-[15px] font-semibold text-vf-text">Rufaro's twin</div>
          <div className="text-[12.5px] text-vf-muted">An example member · answers only what she allows</div>
        </div>
      </div>

      <div className="mt-5 min-h-[120px] rounded-[18px] bg-vf-surface2 p-4" aria-live="polite">
        {ex ? (
          <>
            <div className="flex justify-end">
              <span className="rounded-[14px] rounded-br-[4px] bg-vf-ember text-white px-3.5 py-2 text-[14px] max-w-[85%]">{ex.q}</span>
            </div>
            <div className="mt-3 flex">
              <span
                className={`rounded-[14px] rounded-bl-[4px] px-3.5 py-2.5 text-[14.5px] leading-[1.5] max-w-[92%] ${
                  ex.refused ? "bg-vf-text/[0.06] text-vf-muted italic" : "bg-vf-mint/15 text-vf-text"
                }`}
              >
                {typed}
                {typed.length < ex.a.length && <span className="inline-block w-1.5 h-4 align-middle bg-vf-mint/70 ml-0.5 animate-pulse" />}
              </span>
            </div>
          </>
        ) : (
          <p className="text-[14.5px] text-vf-muted">Tap a question below to ask her twin.</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {ASK_EXAMPLES.map((e, n) => (
          <button
            key={e.q}
            onClick={() => setActive(n)}
            className={`rounded-full border px-3.5 py-2 text-[13.5px] transition-colors btn-press ${
              active === n ? "border-vf-ember bg-vf-ember/10 text-vf-text" : "border-vf-line text-vf-text hover:border-vf-ember/50"
            }`}
            data-testid={`ask-chip-${n}`}
          >
            {e.q}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── 4 · Twins talking ────────────────────────────────────────────────
// An example conversation between two members' twins. It plays once when it
// scrolls into view (all at once under reduced motion) and can be replayed.

const TALK: { from: "r" | "t"; text: string }[] = [
  { from: "r", text: "Rufaro's at the Avondale market before nine most Saturdays. Is Tendai a morning person?" },
  { from: "t", text: "He'd tell you no. He's at the gym by six, though, and he'd go anywhere for good coffee." },
  { from: "r", text: "What does he do when something's bothering him?" },
  { from: "t", text: "Says it the same day. He hates going quiet on people." },
  { from: "r", text: "So does she. I think these two should meet." },
];

export function TwinsTalking() {
  const reduce = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(0); // bumps to (re)start playback
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce || typeof IntersectionObserver === "undefined") {
      setShown(TALK.length);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          io.disconnect();
          setRun(1);
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);

  useEffect(() => {
    if (!run) return;
    setShown(0);
    const timers: number[] = [];
    let at = 300;
    TALK.forEach((m, i) => {
      timers.push(window.setTimeout(() => setTyping(true), at));
      at += Math.min(1500, 500 + m.text.length * 12);
      timers.push(
        window.setTimeout(() => {
          setTyping(false);
          setShown(i + 1);
        }, at),
      );
      at += 650;
    });
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [run]);

  const done = shown >= TALK.length;
  const next = TALK[shown];

  return (
    <div ref={ref} className="rounded-[28px] border border-vf-line bg-vf-surface p-4 sm:p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.35)]" data-testid="twins-talking">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex -space-x-2.5" aria-hidden="true">
            <span className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-[18px] text-white ring-2 ring-vf-surface" style={{ background: "linear-gradient(135deg, var(--vf-mint-vivid), hsl(var(--vf-mint)))" }}>
              R
            </span>
            <span className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-[18px] text-white ring-2 ring-vf-surface" style={{ background: "linear-gradient(135deg, hsl(var(--vf-ember)), var(--vf-warn))" }}>
              T
            </span>
          </div>
          <div>
            <div className="text-[14.5px] font-semibold text-vf-text">Rufaro's twin and Tendai's twin</div>
            <div className="text-[12px] text-vf-muted">An example conversation</div>
          </div>
        </div>
        {done && !reduce && (
          <button onClick={() => setRun((n) => n + 1)} className="shrink-0 w-9 h-9 rounded-full border border-vf-line flex items-center justify-center text-vf-muted hover:text-vf-text btn-press" aria-label="Play the conversation again">
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="mt-5 space-y-3 min-h-[300px]" aria-live="polite">
        {TALK.slice(0, shown).map((m, i) => (
          <div key={`${run}-${i}`} className={`flex ${m.from === "t" ? "justify-end" : ""} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
            <div
              className={`max-w-[86%] rounded-[18px] px-3.5 py-2.5 text-[14.5px] leading-[1.45] text-vf-text ${
                m.from === "t" ? "rounded-br-[6px] bg-vf-ember/[0.12]" : "rounded-bl-[6px] bg-vf-mint/[0.14]"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {typing && next && (
          <div className={`flex ${next.from === "t" ? "justify-end" : ""}`} aria-hidden="true">
            <span className={`inline-flex gap-1 rounded-full px-3.5 py-3 ${next.from === "t" ? "bg-vf-ember/[0.12]" : "bg-vf-mint/[0.14]"}`}>
              {[0, 1, 2].map((d) => (
                <span key={d} className="w-1.5 h-1.5 rounded-full bg-vf-muted animate-bounce" style={{ animationDelay: `${d * 140}ms` }} />
              ))}
            </span>
          </div>
        )}
      </div>

      <div
        className={`mt-4 rounded-[20px] border border-vf-line bg-vf-surface2 p-3.5 flex items-center gap-3.5 transition-all duration-500 ${
          done ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
        }`}
        data-testid="twins-result"
      >
        {/* No score: Destira never puts a number on two people. */}
        <span className="shrink-0 w-14 h-14 rounded-full flex items-center justify-center bg-vf-ember/[0.12] text-vf-ember" aria-hidden="true">
          <HeartHandshake className="w-6 h-6" />
        </span>
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold text-vf-text">Introduced to both of them</div>
          <div className="text-[13px] leading-[1.45] text-vf-muted">Both say what's wrong straight away. Both love an early Saturday.</div>
        </div>
      </div>
    </div>
  );
}
