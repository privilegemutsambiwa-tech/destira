// Game Night: the play surface for every game. One component per game, all
// built the same way: the prompt big, the choices huge and in thumb reach,
// your pick locks in instantly (we don't wait for the server to show it),
// and the reveal is a moment: numbers count up, the winner is crowned.
//
// Game rules, scoring and what's hidden before a reveal all live on the
// server (server/group-games.ts); this file only draws them.
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Lock, Plus, X } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { useSubmitGameResponse, useRevealGame } from "@/hooks/use-interactions";
import { STAGE, type GameTheme } from "./game-theme";
import { CountUp, Face, Stamp, TimerBar, secondsLeft, useNow } from "./game-fx";

type State = any;

// ── shared pieces ────────────────────────────────────────────────────

function Prompt({ children, size = "lg" }: { children: React.ReactNode; size?: "lg" | "md" }) {
  return (
    <h2
      className="font-display text-center mx-auto max-w-[22ch]"
      style={{
        color: STAGE.cream,
        fontSize: size === "lg" ? "clamp(30px, 8vw, 46px)" : "clamp(24px, 6vw, 34px)",
        lineHeight: 1.08,
        letterSpacing: "-0.01em",
      }}
    >
      {children}
    </h2>
  );
}

function Kicker({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-center" style={{ color: color ?? STAGE.faint }}>
      {children}
    </div>
  );
}

function LockedIn({ t, line = "Locked in. Waiting on the room…" }: { t: GameTheme; line?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex items-center justify-center gap-2.5 rounded-full px-4 py-2.5 w-fit"
      style={{ background: STAGE.glass, border: `1px solid ${STAGE.line}` }}
      data-testid="game-locked-in"
    >
      <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: t.a }}>
        <Check className="w-3 h-3 text-white" strokeWidth={3.5} />
      </span>
      <span className="text-[14px]" style={{ color: STAGE.cream }}>{line}</span>
      <span className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-1 h-1 rounded-full animate-bounce" style={{ background: STAGE.dim, animationDelay: `${i * 140}ms` }} />
        ))}
      </span>
    </motion.div>
  );
}

function Verdict({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <motion.p
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.5, type: "spring", stiffness: 300, damping: 20 }}
      className="text-center text-[16px] font-semibold"
      style={{ color }}
    >
      {children}
    </motion.p>
  );
}

const cta = (t: GameTheme): React.CSSProperties => ({
  background: `linear-gradient(135deg, ${t.a}, ${t.b})`,
  color: "#fff",
  boxShadow: `0 12px 32px -12px ${t.a}`,
});

function BigButton({ t, children, onClick, disabled, testId }: { t: GameTheme; children: React.ReactNode; onClick: () => void; disabled?: boolean; testId?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="vf-press w-full h-14 rounded-full text-[16px] font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
      style={cta(t)}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

/** Ranked results with a podium for the top three. */
function Podium({ rows, t, unit }: { rows: { id: string; name: string; score: number; detail?: string }[]; t: GameTheme; unit: string }) {
  const reduce = useReducedMotion();
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  const top = sorted.slice(0, 3);
  const order = top.length === 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
  const heights: Record<string, number> = {};
  top.forEach((r, i) => (heights[r.id] = [96, 70, 52][i]));
  if (sorted.length === 0) return null;
  // Nobody scored: no crown for a zero.
  if (sorted[0].score <= 0) {
    return (
      <div data-testid="game-podium" className="pt-4 text-center">
        <div className="text-[40px]" aria-hidden="true">🫠</div>
        <div className="mt-1 font-display text-[22px]" style={{ color: STAGE.cream }}>Nobody scored this time</div>
        <div className="mt-1 text-[14px]" style={{ color: STAGE.dim }}>Tough round. The crown is still up for grabs.</div>
        <div className="mt-4 flex justify-center -space-x-2">
          {sorted.map((r) => <Face key={r.id} name={r.name} seed={r.id} size={34} />)}
        </div>
      </div>
    );
  }
  return (
    <div data-testid="game-podium">
      <div className="flex items-end justify-center gap-3 pt-6">
        {order.map((r) => {
          const place = top.indexOf(r);
          return (
            <motion.div
              key={r.id}
              initial={reduce ? false : { y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 + (2 - place) * 0.18, type: "spring", stiffness: 260, damping: 22 }}
              className="flex flex-col items-center w-[96px]"
            >
              {place === 0 && (
                <motion.span
                  className="text-[26px] -mb-1"
                  animate={reduce ? undefined : { y: [0, -5, 0] }}
                  transition={{ repeat: Infinity, duration: 1.8 }}
                  aria-hidden="true"
                >
                  👑
                </motion.span>
              )}
              <Face name={r.name} seed={r.id} size={place === 0 ? 54 : 44} ring={place === 0 ? t.a : undefined} />
              <div className="mt-1.5 text-[13px] font-semibold truncate max-w-full" style={{ color: STAGE.cream }}>{r.name}</div>
              <div className="font-mono text-[12px]" style={{ color: place === 0 ? t.a : STAGE.dim }}>
                <CountUp to={r.score} /> {unit}
              </div>
              <div
                className="mt-2 w-full rounded-t-[14px] flex items-start justify-center pt-2 font-display text-[24px]"
                style={{
                  height: heights[r.id],
                  background: place === 0 ? `linear-gradient(180deg, ${t.a}, ${t.b})` : STAGE.glass,
                  border: `1px solid ${STAGE.line}`,
                  color: place === 0 ? "#fff" : STAGE.dim,
                }}
              >
                {place + 1}
              </div>
            </motion.div>
          );
        })}
      </div>
      {sorted.length > 3 && (
        <div className="mt-3 rounded-[18px] overflow-hidden" style={{ border: `1px solid ${STAGE.line}` }}>
          {sorted.slice(3).map((r, i) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: i ? `1px solid ${STAGE.line}` : undefined }}>
              <span className="font-mono text-[12px] w-4" style={{ color: STAGE.faint }}>{i + 4}</span>
              <Face name={r.name} seed={r.id} size={26} />
              <span className="flex-1 truncate text-[14px]" style={{ color: STAGE.cream }}>{r.name}</span>
              <span className="font-mono text-[12px]" style={{ color: STAGE.dim }}>{r.score} {unit}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Split choice: Would You Rather, Never Have I Ever ────────────────

function SplitChoice({
  t, options, mine, revealed, counts, onPick,
}: {
  t: GameTheme;
  options: { key: string; label: string; emoji?: string }[];
  mine: string | null;
  revealed: boolean;
  counts: Record<string, number> | null;
  onPick: (key: string) => void;
}) {
  const total = counts ? Object.values(counts).reduce((s, n) => s + n, 0) : 0;
  const max = counts ? Math.max(...Object.values(counts)) : 0;
  return (
    <div className="relative grid gap-3">
      {options.map((o, i) => {
        const chosen = mine === o.key;
        const dim = !!mine && !chosen && !revealed;
        const n = counts?.[o.key] ?? 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        const leading = revealed && total > 0 && n === max;
        const colored = i === 0;
        return (
          <motion.button
            key={o.key}
            onClick={() => !mine && !revealed && onPick(o.key)}
            disabled={!!mine || revealed}
            animate={{ scale: chosen && !revealed ? 1.02 : dim ? 0.97 : 1, opacity: dim ? 0.42 : 1 }}
            whileTap={!mine && !revealed ? { scale: 0.97 } : undefined}
            transition={{ type: "spring", stiffness: 420, damping: 26 }}
            className="relative w-full min-h-[128px] rounded-[28px] px-6 py-5 text-left overflow-hidden"
            style={{
              background: colored ? `linear-gradient(135deg, ${t.a}, ${t.b})` : "linear-gradient(135deg, #2A2236, #17121F)",
              border: `1.5px solid ${chosen ? STAGE.cream : colored ? "transparent" : `${t.a}66`}`,
              boxShadow: chosen ? `0 18px 40px -16px ${t.a}` : "none",
            }}
            data-testid={`game-choice-${o.key}`}
          >
            {revealed && (
              <motion.span
                className="absolute inset-y-0 left-0"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1], delay: 0.15 }}
                style={{ background: "rgba(255,255,255,0.16)" }}
              />
            )}
            <span className="relative flex items-center gap-4">
              {o.emoji && <span className="text-[34px] leading-none" aria-hidden="true">{o.emoji}</span>}
              <span className="flex-1 text-[19px] sm:text-[21px] font-semibold leading-snug" style={{ color: "#fff" }}>{o.label}</span>
              {revealed ? (
                <span className="text-right">
                  <span className="block font-display text-[38px] leading-none" style={{ color: "#fff" }}>
                    <CountUp to={pct} suffix="%" />
                  </span>
                  <span className="font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.75)" }}>
                    {n} {n === 1 ? "vote" : "votes"}
                  </span>
                </span>
              ) : chosen ? (
                <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: STAGE.cream }}>
                  <Check className="w-4 h-4" style={{ color: t.b }} strokeWidth={3} />
                </span>
              ) : null}
            </span>
            {leading && (
              <span className="absolute top-3 right-4 text-[18px]" aria-label="Most votes">👑</span>
            )}
            {chosen && revealed && (
              <span className="relative mt-2 inline-block font-mono text-[10.5px] uppercase tracking-[0.16em]" style={{ color: "rgba(255,255,255,0.8)" }}>
                Your pick
              </span>
            )}
          </motion.button>
        );
      })}
      {options.length === 2 && (
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center font-display text-[18px] pointer-events-none"
          style={{ background: STAGE.ink, color: STAGE.cream, border: `1.5px solid ${STAGE.line}` }}
          aria-hidden="true"
        >
          or
        </span>
      )}
    </div>
  );
}

function SplitVerdict({ t, mine, counts }: { t: GameTheme; mine: string | null; counts: Record<string, number> }) {
  const vals = Object.values(counts);
  const total = vals.reduce((s, n) => s + n, 0);
  if (!total) return null;
  if (vals.every((v) => v === vals[0])) return <Verdict color={STAGE.cream}>Dead even. The room can't decide. ⚖️</Verdict>;
  if (!mine) return null;
  const max = Math.max(...vals);
  return counts[mine] === max ? (
    <Verdict color={STAGE.mint}>You're with the room. 🤝</Verdict>
  ) : (
    <Verdict color={t.a}>Rebel pick. You went against the room. 😎</Verdict>
  );
}

// ── Hot Take ─────────────────────────────────────────────────────────

const MOODS = [
  { to: 15, face: "🧊", word: "No way" },
  { to: 40, face: "🙄", word: "Nah" },
  { to: 59, face: "🤷", word: "Depends" },
  { to: 84, face: "👀", word: "Kinda" },
  { to: 100, face: "🔥", word: "Facts" },
];
const moodFor = (v: number) => MOODS.find((m) => v <= m.to) ?? MOODS[MOODS.length - 1];
const COOL = "#60A5FA";

function HotTakeSlider({ value, onChange, t }: { value: number; onChange: (v: number) => void; t: GameTheme }) {
  const track = useRef<HTMLDivElement>(null);
  const last = useRef(moodFor(value).word);
  const setFrom = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    const v = Math.round(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * 100);
    const m = moodFor(v).word;
    if (m !== last.current) {
      last.current = m;
      haptic.tick();
    }
    onChange(v);
  };
  return (
    <div className="px-3">
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="How much do you agree?"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={moodFor(value).word}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setFrom(e.clientX);
        }}
        onPointerMove={(e) => e.buttons && setFrom(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") onChange(Math.max(0, value - 5));
          if (e.key === "ArrowRight") onChange(Math.min(100, value + 5));
        }}
        className="relative h-16 touch-none cursor-pointer outline-none"
        data-testid="hot-take-slider"
      >
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-4 rounded-full" style={{ background: `linear-gradient(90deg, ${COOL}, #A78BFA 45%, ${t.a})` }} />
        <motion.div
          className="absolute top-1/2 w-16 h-16 rounded-full flex items-center justify-center text-[32px] select-none"
          style={{ left: `${value}%`, x: "-50%", y: "-50%", background: STAGE.cream, boxShadow: `0 10px 30px -8px ${value > 50 ? t.a : COOL}` }}
          animate={{ scale: 1 }}
          whileTap={{ scale: 1.12 }}
        >
          {moodFor(value).face}
        </motion.div>
      </div>
      <div className="flex justify-between mt-2 font-mono text-[11px] uppercase tracking-[0.16em]">
        <span style={{ color: COOL }}>🧊 No way</span>
        <span style={{ color: t.a }}>Facts 🔥</span>
      </div>
    </div>
  );
}

function HotTake({ state, t, mine, revealed, submit }: { state: State; t: GameTheme; mine: any; revealed: boolean; submit: (r: any) => void }) {
  const [value, setValue] = useState(50);
  const res = state.results;
  return (
    <div className="space-y-8">
      <Kicker color={t.a}>Hot take</Kicker>
      <Prompt>“{state.config.take}”</Prompt>

      {!revealed && !mine && (
        <>
          <div className="text-center">
            <motion.div key={moodFor(value).word} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-display text-[30px]" style={{ color: STAGE.cream }}>
              {moodFor(value).word}
            </motion.div>
          </div>
          <HotTakeSlider value={value} onChange={setValue} t={t} />
          <BigButton t={t} onClick={() => submit({ value })} testId="button-hot-take-lock">
            Lock it in <Lock className="w-4 h-4" />
          </BigButton>
        </>
      )}

      {!revealed && mine && (
        <div className="space-y-5 text-center">
          <div className="text-[56px]" aria-hidden="true">{moodFor(mine.value).face}</div>
          <LockedIn t={t} line={`You said: ${moodFor(mine.value).word}`} />
        </div>
      )}

      {revealed && res && (
        <div className="space-y-6">
          <div className="relative h-28 mx-3">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-3 rounded-full" style={{ background: `linear-gradient(90deg, ${COOL}, #A78BFA 45%, ${t.a})`, opacity: 0.85 }} />
            {res.values.map((v: any, i: number) => (
              <motion.div
                key={v.userId}
                initial={{ left: "50%", opacity: 0 }}
                animate={{ left: `${v.value}%`, opacity: 1 }}
                transition={{ delay: 0.1 + i * 0.07, type: "spring", stiffness: 140, damping: 18 }}
                className="absolute"
                style={{ top: i % 2 ? "8%" : "62%", transform: "translateX(-50%)" }}
                title={`${v.nickname}: ${v.value}`}
              >
                <Face name={v.nickname} seed={v.userId} size={30} />
              </motion.div>
            ))}
            <motion.div
              initial={{ left: "50%" }}
              animate={{ left: `${res.avg}%` }}
              transition={{ delay: 0.8, type: "spring", stiffness: 120, damping: 16 }}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-12 rounded-full"
              style={{ background: STAGE.cream, boxShadow: `0 0 18px ${STAGE.cream}` }}
            />
          </div>
          <div className="text-center">
            <div className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: STAGE.faint }}>The room</div>
            <div className="font-display text-[44px] leading-none mt-1" style={{ color: STAGE.cream }}>
              {moodFor(res.avg).face} {moodFor(res.avg).word}
            </div>
          </div>
          <Verdict color={res.spread > 30 ? t.a : STAGE.mint}>
            {res.values.length < 2
              ? "Just you this time. Bring the room next round."
              : res.spread > 30
                ? "This one split the room. ⚔️ Take it to the chat."
                : "The room mostly agrees."}
          </Verdict>
          {res.outlier && res.spread > 12 && (
            <p className="text-center text-[14px]" style={{ color: STAGE.dim }}>
              {moodFor(res.outlier.value).face} Furthest from the room: <span style={{ color: STAGE.cream, fontWeight: 600 }}>{res.outlier.nickname}</span>, who said “{moodFor(res.outlier.value).word}”
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Trivia Blitz ─────────────────────────────────────────────────────

const QUESTION_MS = 15_000; // keep in step with TRIVIA_QUESTION_MS in server/group-games.ts
const LETTERS = ["A", "B", "C", "D"];

function TriviaBlitz({ state, t, mine, revealed, submit }: { state: State; t: GameTheme; mine: any; revealed: boolean; submit: (r: any) => void }) {
  const qs: { question: string; options: string[] }[] = state.config.questions;
  const [phase, setPhase] = useState<"ready" | "count" | "play">("ready");
  const [count, setCount] = useState(3);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [times, setTimes] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [qStart, setQStart] = useState(0);
  const now = useNow(100, phase === "play" && !mine && !revealed);

  const record = (choice: number, ms: number) => {
    const a = [...answers, choice];
    const tm = [...times, Math.round(ms)];
    setAnswers(a);
    setTimes(tm);
    window.setTimeout(() => {
      setPicked(null);
      if (a.length >= qs.length) submit({ answers: a, times: tm });
      else {
        setI(a.length);
        setQStart(Date.now());
      }
    }, 380);
  };

  // The clock ran out on this question.
  useEffect(() => {
    if (phase !== "play" || mine || revealed || picked != null) return;
    if (now - qStart >= QUESTION_MS && answers.length === i) {
      setPicked(-1);
      haptic.warning();
      record(-1, QUESTION_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  const go = () => {
    setPhase("count");
    setCount(3);
    let n = 3;
    const id = window.setInterval(() => {
      n -= 1;
      haptic.tick();
      if (n <= 0) {
        window.clearInterval(id);
        setPhase("play");
        setQStart(Date.now());
      } else setCount(n);
    }, 650);
  };

  if (revealed && state.results) {
    const r = state.results;
    const myId = state.viewerId;
    return (
      <div className="space-y-6">
        <Kicker color={t.a}>Final scores</Kicker>
        <Podium t={t} unit="pts" rows={r.scores.map((s: any) => ({ id: s.userId, name: s.nickname, score: s.points ?? s.score * 100 }))} />
        <div className="space-y-2.5">
          {qs.map((q, qi) => {
            const right = r.correctIndexes[qi];
            const myPick = mine?.answers?.[qi];
            return (
              <div key={qi} className="rounded-[18px] px-4 py-3" style={{ background: STAGE.glass, border: `1px solid ${STAGE.line}` }}>
                <div className="text-[14px]" style={{ color: STAGE.cream }}>{q.question}</div>
                <div className="mt-1.5 flex items-center gap-2 text-[13px]">
                  <span style={{ color: STAGE.mint }}>✓ {q.options[right]}</span>
                  {myId && myPick != null && myPick !== right && (
                    <span style={{ color: STAGE.faint }}>· you: {myPick >= 0 ? q.options[myPick] : "out of time"}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (mine) {
    return (
      <div className="space-y-6 text-center py-6">
        <div className="text-[64px]" aria-hidden="true">⚡</div>
        <Prompt size="md">All {qs.length} answered.</Prompt>
        <LockedIn t={t} line="Scores land when everyone's done" />
      </div>
    );
  }

  if (phase === "ready") {
    return (
      <div className="text-center space-y-6 py-4">
        <motion.div className="text-[72px]" animate={{ rotate: [0, -8, 8, 0] }} transition={{ repeat: Infinity, duration: 2.4 }} aria-hidden="true">⚡</motion.div>
        <Prompt>{qs.length} questions. 15 seconds each.</Prompt>
        <p className="text-[15px]" style={{ color: STAGE.dim }}>Right answers score 100. Fast ones score up to 50 more.</p>
        <BigButton t={t} onClick={go} testId="button-trivia-start">
          I'm ready <ArrowRight className="w-4 h-4" />
        </BigButton>
      </div>
    );
  }

  if (phase === "count") {
    return (
      <div className="flex items-center justify-center py-16">
        <AnimatePresence mode="popLayout">
          <motion.span
            key={count}
            initial={{ scale: 2.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            className="font-display text-[120px] leading-none"
            style={{ color: t.a, textShadow: `0 0 40px ${t.a}` }}
          >
            {count}
          </motion.span>
        </AnimatePresence>
      </div>
    );
  }

  const q = qs[i];
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[12px] tracking-[0.16em]" style={{ color: STAGE.dim }}>
          {i + 1} / {qs.length}
        </span>
        <span className="font-mono text-[13px] tabular-nums" style={{ color: qStart + QUESTION_MS - now < 4000 ? "#FF6B6B" : STAGE.cream }}>
          {secondsLeft(qStart + QUESTION_MS, now)}
        </span>
      </div>
      <TimerBar start={qStart} end={qStart + QUESTION_MS} now={now} color={t.a} />
      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -40, opacity: 0 }} transition={{ duration: 0.22 }} className="space-y-5">
          <Prompt size="md">{q.question}</Prompt>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {q.options.map((opt, oi) => {
              const on = picked === oi;
              return (
                <motion.button
                  key={oi}
                  whileTap={{ scale: 0.96 }}
                  disabled={picked != null}
                  onClick={() => {
                    haptic.tick();
                    setPicked(oi);
                    record(oi, Date.now() - qStart);
                  }}
                  className="flex items-center gap-3 w-full min-h-[60px] px-4 rounded-[18px] text-left"
                  style={{
                    background: on ? `linear-gradient(135deg, ${t.a}, ${t.b})` : STAGE.glass,
                    border: `1.5px solid ${on ? STAGE.cream : STAGE.line}`,
                    opacity: picked != null && !on ? 0.4 : 1,
                  }}
                  data-testid={`trivia-option-${oi}`}
                >
                  <span className="w-8 h-8 rounded-[10px] flex items-center justify-center font-mono text-[13px] shrink-0" style={{ background: on ? "rgba(255,255,255,0.22)" : `${t.a}26`, color: on ? "#fff" : t.a }}>
                    {LETTERS[oi]}
                  </span>
                  <span className="text-[16px] font-medium" style={{ color: STAGE.cream }}>{opt}</span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── This or That ─────────────────────────────────────────────────────

function ThisOrThat({ state, t, mine, revealed, submit }: { state: State; t: GameTheme; mine: any; revealed: boolean; submit: (r: any) => void }) {
  const pairs: { a: string; b: string }[] = state.config.pairs;
  const [picks, setPicks] = useState<("a" | "b")[]>([]);
  const step = picks.length;

  if (revealed && state.results) {
    const r = state.results;
    const rows: any[] = Array.isArray(r) ? r : r.pairs;
    const matches: any[] = Array.isArray(r) ? [] : r.matches ?? [];
    return (
      <div className="space-y-6">
        <Kicker color={t.a}>How the room picked</Kicker>
        <div className="space-y-3">
          {rows.map((p, i) => {
            const total = p.aCount + p.bCount || 1;
            const aPct = Math.round((p.aCount / total) * 100);
            const my = mine?.choices?.[i];
            return (
              <div key={i}>
                <div className="flex justify-between text-[14px] mb-1.5">
                  <span style={{ color: my === "a" ? STAGE.cream : STAGE.dim, fontWeight: my === "a" ? 700 : 500 }}>{my === "a" && "● "}{p.a}</span>
                  <span style={{ color: my === "b" ? STAGE.cream : STAGE.dim, fontWeight: my === "b" ? 700 : 500 }}>{p.b}{my === "b" && " ●"}</span>
                </div>
                <div className="flex h-3 rounded-full overflow-hidden" style={{ background: STAGE.line }}>
                  <motion.div initial={{ width: "50%" }} animate={{ width: `${aPct}%` }} transition={{ delay: 0.1 + i * 0.1, duration: 0.7 }} style={{ background: `linear-gradient(90deg, ${t.a}, ${t.b})` }} />
                </div>
                <div className="flex justify-between font-mono text-[11px] mt-1" style={{ color: STAGE.faint }}>
                  <span>{aPct}%</span>
                  <span>{100 - aPct}%</span>
                </div>
              </div>
            );
          })}
        </div>
        {matches.length > 1 && (
          <>
            <Kicker>Most in sync with the room</Kicker>
            <Podium t={t} unit={`/ ${rows.length}`} rows={matches.map((m) => ({ id: m.userId, name: m.nickname, score: m.score }))} />
          </>
        )}
      </div>
    );
  }

  if (mine) {
    return (
      <div className="space-y-6 text-center py-6">
        <div className="text-[64px]" aria-hidden="true">🔀</div>
        <Prompt size="md">All {pairs.length} picked.</Prompt>
        <LockedIn t={t} />
      </div>
    );
  }

  const pick = (side: "a" | "b") => {
    haptic.tick();
    const next = [...picks, side];
    setPicks(next);
    if (next.length >= pairs.length) window.setTimeout(() => submit({ choices: next }), 250);
  };
  const p = pairs[Math.min(step, pairs.length - 1)];

  return (
    <div className="space-y-5">
      <div className="flex justify-center gap-1.5" aria-hidden="true">
        {pairs.map((_, i) => (
          <span key={i} className="h-1.5 rounded-full transition-all" style={{ width: i === step ? 26 : 10, background: i < step ? t.a : i === step ? STAGE.cream : STAGE.line }} />
        ))}
      </div>
      <Kicker>Tap one. Don't overthink it.</Kicker>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ y: 30, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -30, opacity: 0 }} transition={{ duration: 0.2 }} className="grid grid-cols-2 gap-3">
          {(["a", "b"] as const).map((side) => (
            <motion.button
              key={side}
              whileTap={{ scale: 0.94 }}
              onClick={() => pick(side)}
              disabled={step >= pairs.length}
              className="min-h-[190px] rounded-[26px] p-4 flex items-center justify-center text-center"
              style={{
                background: side === "a" ? `linear-gradient(160deg, ${t.a}, ${t.b})` : "linear-gradient(160deg, #2A2236, #15101C)",
                border: side === "b" ? `1.5px solid ${t.a}55` : "1.5px solid transparent",
              }}
              data-testid={`this-or-that-${side}`}
            >
              <span className="font-display text-[26px] leading-tight" style={{ color: "#fff" }}>{side === "a" ? p.a : p.b}</span>
            </motion.button>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── Most Likely To ───────────────────────────────────────────────────

function MostLikely({ state, t, mine, revealed, submit }: { state: State; t: GameTheme; mine: any; revealed: boolean; submit: (r: any) => void }) {
  const candidates: { userId: string; nickname: string }[] = state.config.candidates ?? [];
  const r = state.results;
  const totalVotes = r ? r.tally.reduce((s: number, x: any) => s + x.votes, 0) : 0;

  return (
    <div className="space-y-6">
      <Kicker color={t.a}>Most likely to…</Kicker>
      <Prompt>{String(state.config.prompt).replace(/^Most likely to\s*/i, "…")}</Prompt>

      {revealed && r ? (
        <div className="space-y-5">
          {r.winner ? (
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.2 }} className="flex flex-col items-center">
              <motion.span className="text-[40px]" initial={{ y: -30, rotate: -20 }} animate={{ y: 0, rotate: 0 }} transition={{ delay: 0.55, type: "spring", stiffness: 400, damping: 12 }} aria-hidden="true">
                👑
              </motion.span>
              <Face name={r.winner.nickname} seed={r.winner.userId} size={92} ring={t.a} />
              <div className="mt-3 font-display text-[34px]" style={{ color: STAGE.cream }}>{r.winner.nickname}</div>
              <div className="font-mono text-[12px]" style={{ color: t.a }}>{r.winner.votes} of {totalVotes} votes</div>
            </motion.div>
          ) : (
            <Verdict color={STAGE.dim}>No votes landed this round.</Verdict>
          )}
          <div className="space-y-2">
            {r.tally.filter((x: any) => x.votes > 0 && x.userId !== r.winner?.userId).map((x: any) => (
              <div key={x.userId} className="flex items-center gap-3">
                <Face name={x.nickname} seed={x.userId} size={28} />
                <span className="w-24 truncate text-[14px]" style={{ color: STAGE.cream }}>{x.nickname}</span>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: STAGE.line }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(x.votes / (totalVotes || 1)) * 100}%` }} transition={{ duration: 0.7, delay: 0.3 }} className="h-full" style={{ background: t.a }} />
                </div>
                <span className="font-mono text-[12px] w-5 text-right" style={{ color: STAGE.dim }}>{x.votes}</span>
              </div>
            ))}
          </div>
        </div>
      ) : candidates.length === 0 ? (
        <Verdict color={STAGE.dim}>You need more people in the room for this one.</Verdict>
      ) : (
        <>
          <div className="flex flex-wrap justify-center gap-3">
            {candidates.map((c) => {
              const on = mine?.targetUserId === c.userId;
              return (
                <motion.button
                  key={c.userId}
                  whileTap={{ scale: 0.93 }}
                  disabled={!!mine}
                  onClick={() => submit({ targetUserId: c.userId })}
                  className="flex flex-col items-center gap-2 rounded-[20px] py-4 px-2 w-[calc(33.333%-0.5rem)]"
                  style={{
                    background: on ? `linear-gradient(160deg, ${t.a}, ${t.b})` : STAGE.glass,
                    border: `1.5px solid ${on ? STAGE.cream : STAGE.line}`,
                    opacity: mine && !on ? 0.4 : 1,
                  }}
                  data-testid={`most-likely-${c.userId}`}
                >
                  <Face name={c.nickname} seed={c.userId} size={52} />
                  <span className="text-[13.5px] font-medium truncate max-w-full" style={{ color: STAGE.cream }}>{c.nickname}</span>
                </motion.button>
              );
            })}
          </div>
          {mine && <LockedIn t={t} line="Vote in. It's anonymous." />}
        </>
      )}
    </div>
  );
}

// ── Two Truths, One Lie ──────────────────────────────────────────────

function TwoTruths({ state, t, mine, revealed, submit, isHost }: { state: State; t: GameTheme; mine: any; revealed: boolean; submit: (r: any) => void; isHost: boolean }) {
  const statements: string[] = state.config.statements;
  const r = state.results;
  const lie = revealed ? r?.lieIndex : isHost ? state.config.lieIndex : null;
  return (
    <div className="space-y-6">
      <Kicker color={t.a}>{isHost ? "Your round · they're hunting your lie" : `${state.startedByNickname} says…`}</Kicker>
      <Prompt size="md">{isHost ? "Can they spot it?" : "Two are true. One's a lie. Which?"}</Prompt>
      <div className="space-y-3">
        {statements.map((s, i) => {
          const on = mine?.guessIndex === i;
          const isLie = lie === i;
          const guesses = revealed ? r.guesses.filter((g: any) => g.guessIndex === i).length : 0;
          return (
            <motion.button
              key={i}
              whileTap={!mine && !revealed && !isHost ? { scale: 0.97 } : undefined}
              disabled={!!mine || revealed || isHost}
              onClick={() => submit({ guessIndex: i })}
              className="relative w-full text-left rounded-[22px] px-5 py-4 min-h-[76px]"
              style={{
                background: revealed && isLie ? `linear-gradient(135deg, ${t.a}, ${t.b})` : on ? `${t.a}33` : STAGE.glass,
                border: `1.5px solid ${on ? STAGE.cream : STAGE.line}`,
                opacity: mine && !on && !revealed ? 0.45 : 1,
              }}
              data-testid={`truth-option-${i}`}
            >
              <div className="flex items-start gap-3">
                <span className="font-display text-[22px] leading-none mt-0.5" style={{ color: revealed && isLie ? "#fff" : t.a }}>{i + 1}</span>
                <span className="flex-1 text-[16.5px] leading-snug" style={{ color: STAGE.cream }}>{s}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 pl-8">
                {revealed ? (
                  isLie ? <Stamp color="#fff">THE LIE</Stamp> : <Stamp color={STAGE.mint} rotate={4}>TRUE</Stamp>
                ) : isHost && isLie ? (
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: t.a }}>Your lie</span>
                ) : null}
                {revealed && <span className="font-mono text-[11px]" style={{ color: STAGE.dim }}>{guesses} guessed this</span>}
              </div>
            </motion.button>
          );
        })}
      </div>
      {!revealed && (mine || isHost) && <LockedIn t={t} line={isHost ? "Waiting for guesses" : "Guess locked in"} />}
      {revealed && r && (
        <Verdict color={r.correctGuessers.length ? STAGE.mint : t.a}>
          {r.correctGuessers.length ? `Sharp: ${r.correctGuessers.join(", ")} 🕵️` : `Nobody caught it. ${state.startedByNickname} wins this one. 🎭`}
        </Verdict>
      )}
    </div>
  );
}

// ── Category Sprint ──────────────────────────────────────────────────

function CategorySprint({ state, t, mine, revealed, submit }: { state: State; t: GameTheme; mine: any; revealed: boolean; submit: (r: any) => void }) {
  const [items, setItems] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const sent = useRef(false);
  const end = state.revealAt ? new Date(state.revealAt).getTime() : 0;
  const start = state.createdAt ? new Date(state.createdAt).getTime() : end - 90_000;
  const now = useNow(250, !revealed);

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (!items.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setItems((cur) => [v, ...cur]);
      haptic.tick();
    }
    setDraft("");
  };

  // Time's nearly up: send what they have so it counts.
  useEffect(() => {
    if (!end || mine || revealed || sent.current) return;
    if (end - now < 1800 && items.length > 0) {
      sent.current = true;
      submit({ items });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  if (revealed && state.results) {
    const board: any[] = state.results.leaderboard;
    const seen = new Map<string, number>();
    for (const row of board) for (const it of row.items) seen.set(it.toLowerCase(), (seen.get(it.toLowerCase()) ?? 0) + 1);
    return (
      <div className="space-y-6">
        <Kicker color={t.a}>{state.config.category}</Kicker>
        <Podium t={t} unit="unique" rows={board.map((b) => ({ id: b.userId, name: b.nickname, score: b.uniqueCount }))} />
        <div className="space-y-3">
          {board.map((b) => (
            <div key={b.userId} className="rounded-[18px] p-3.5" style={{ background: STAGE.glass, border: `1px solid ${STAGE.line}` }}>
              <div className="flex items-center gap-2 mb-2">
                <Face name={b.nickname} seed={b.userId} size={24} />
                <span className="text-[14px] font-semibold" style={{ color: STAGE.cream }}>{b.nickname}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {b.items.length === 0 && <span className="text-[13px]" style={{ color: STAGE.faint }}>Nothing this time</span>}
                {b.items.map((it: string) => {
                  const unique = (seen.get(it.toLowerCase()) ?? 0) <= 1;
                  return (
                    <span
                      key={it}
                      className="px-2.5 py-1 rounded-full text-[13px]"
                      style={unique ? { background: `${t.a}30`, color: STAGE.cream, border: `1px solid ${t.a}88` } : { color: STAGE.faint, textDecoration: "line-through", border: `1px solid ${STAGE.line}` }}
                    >
                      {it}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="text-center text-[12.5px]" style={{ color: STAGE.faint }}>Only answers nobody else gave count.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Kicker color={t.a}>Name as many as you can</Kicker>
      <Prompt>{state.config.category}</Prompt>
      {end > 0 && (
        <div className="space-y-1.5">
          <TimerBar start={start} end={end} now={now} color={t.a} />
          <div className="text-center font-mono text-[13px] tabular-nums" style={{ color: STAGE.dim }}>{secondsLeft(end, now)} left</div>
        </div>
      )}
      {mine ? (
        <>
          <LockedIn t={t} line={`${mine.items?.length ?? 0} in. Results when time's up`} />
          <div className="flex flex-wrap gap-1.5 justify-center">
            {(mine.items ?? []).map((it: string) => (
              <span key={it} className="px-2.5 py-1 rounded-full text-[13px]" style={{ background: STAGE.glass, color: STAGE.cream }}>{it}</span>
            ))}
          </div>
        </>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
            className="flex gap-2"
          >
            <input
              value={draft}
              onChange={(e) => {
                const v = e.target.value;
                if (v.endsWith(",")) {
                  setDraft(v.slice(0, -1));
                  window.setTimeout(add, 0);
                } else setDraft(v);
              }}
              placeholder="Type one, hit enter"
              enterKeyHint="next"
              autoFocus
              className="flex-1 h-14 rounded-full px-5 text-[16px] outline-none"
              style={{ background: STAGE.glass, border: `1.5px solid ${STAGE.line}`, color: STAGE.cream }}
              data-testid="input-category-sprint"
            />
            <button type="submit" aria-label="Add" className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={cta(t)}>
              <Plus className="w-6 h-6" />
            </button>
          </form>
          <div className="text-center font-display text-[40px] leading-none" style={{ color: STAGE.cream }}>
            {items.length}
            <span className="font-mono text-[12px] ml-2" style={{ color: STAGE.faint }}>so far</span>
          </div>
          <div className="flex flex-wrap gap-1.5 justify-center">
            <AnimatePresence initial={false}>
              {items.map((it) => (
                <motion.button
                  key={it}
                  layout
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  onClick={() => setItems((cur) => cur.filter((x) => x !== it))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[14px]"
                  style={{ background: `${t.a}2A`, color: STAGE.cream, border: `1px solid ${t.a}66` }}
                  aria-label={`Remove ${it}`}
                >
                  {it} <X className="w-3 h-3 opacity-60" />
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
          <BigButton
            t={t}
            disabled={items.length === 0}
            onClick={() => {
              sent.current = true;
              submit({ items });
            }}
            testId="button-category-submit"
          >
            Lock in {items.length || ""}
          </BigButton>
        </>
      )}
    </div>
  );
}

// ── Emoji Charades ───────────────────────────────────────────────────

function EmojiCharades({ state, t, mine, revealed, submit, isHost, onReveal, revealing }: { state: State; t: GameTheme; mine: any; revealed: boolean; submit: (r: any) => void; isHost: boolean; onReveal: () => void; revealing: boolean }) {
  const [guess, setGuess] = useState("");
  const reduce = useReducedMotion();
  const r = state.results;
  return (
    <div className="space-y-6">
      <Kicker color={t.a}>{isHost ? "Your clue" : "What is it?"}</Kicker>
      <motion.div
        className="text-center select-none"
        style={{ fontSize: "clamp(64px, 20vw, 104px)", lineHeight: 1.1 }}
        animate={reduce ? undefined : { y: [0, -6, 0] }}
        transition={{ repeat: Infinity, duration: 3 }}
      >
        {state.config.emoji}
      </motion.div>

      {revealed && r ? (
        <div className="space-y-4 text-center">
          <Stamp color={t.a} rotate={-4}>THE ANSWER</Stamp>
          <motion.div initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} transition={{ delay: 0.3, duration: 0.5 }} className="font-display text-[38px]" style={{ color: STAGE.cream }}>
            {r.answer}
          </motion.div>
          <Verdict color={r.correctGuessers.length ? STAGE.mint : STAGE.dim}>
            {r.correctGuessers.length ? `Got it: ${r.correctGuessers.join(", ")} 🎉` : "Nobody cracked it."}
          </Verdict>
          {r.allGuesses?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 justify-center pt-1">
              {r.allGuesses.map((g: any, i: number) => (
                <span key={i} className="px-3 py-1 rounded-full text-[13px]" style={{ background: STAGE.glass, color: STAGE.dim }}>
                  {g.nickname}: “{g.guess}”
                </span>
              ))}
            </div>
          )}
        </div>
      ) : isHost ? (
        <div className="space-y-4 text-center">
          <p className="text-[15px]" style={{ color: STAGE.dim }}>
            The answer is <span style={{ color: STAGE.cream, fontWeight: 600 }}>{state.config.answer}</span>. {state.responseCount} {state.responseCount === 1 ? "guess" : "guesses"} so far.
          </p>
          <BigButton t={t} onClick={onReveal} disabled={revealing} testId="button-reveal-charades">
            Reveal the answer
          </BigButton>
        </div>
      ) : (
        <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!guess.trim()) return;
              submit({ guess: guess.trim() });
              setGuess("");
            }}
          >
            <input
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              placeholder={mine ? "Change your guess" : "Your guess"}
              className="flex-1 h-14 rounded-full px-5 text-[16px] outline-none"
              style={{ background: STAGE.glass, border: `1.5px solid ${STAGE.line}`, color: STAGE.cream }}
              data-testid="input-charades-guess"
            />
            <button type="submit" disabled={!guess.trim()} className="h-14 px-6 rounded-full font-semibold disabled:opacity-40" style={cta(t)}>
              Guess
            </button>
          </form>
          {mine && <LockedIn t={t} line={`Your guess: “${mine.guess}”`} />}
        </>
      )}
    </div>
  );
}

// ── Icebreaker ───────────────────────────────────────────────────────

function Icebreaker({ state, t, mine, submit }: { state: State; t: GameTheme; mine: any; submit: (r: any) => void }) {
  const [text, setText] = useState("");
  const answers: any[] = state.results?.live ?? [];
  return (
    <div className="space-y-6">
      <Kicker color={t.a}>Everyone answers</Kicker>
      <Prompt>{state.config.prompt}</Prompt>
      {!mine && state.status !== "revealed" && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            submit({ text: text.trim() });
            setText("");
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Your answer"
            className="flex-1 h-14 rounded-full px-5 text-[16px] outline-none"
            style={{ background: STAGE.glass, border: `1.5px solid ${STAGE.line}`, color: STAGE.cream }}
            data-testid="input-icebreaker"
          />
          <button type="submit" disabled={!text.trim()} className="h-14 px-6 rounded-full font-semibold disabled:opacity-40" style={cta(t)}>
            Share
          </button>
        </form>
      )}
      <div className="space-y-2.5">
        <AnimatePresence initial={false}>
          {answers.map((a, i) => (
            <motion.div key={`${a.nickname}-${i}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2.5">
              <Face name={a.nickname} seed={a.nickname} size={30} />
              <div className="rounded-[18px] rounded-tl-[6px] px-4 py-2.5" style={{ background: STAGE.glass, border: `1px solid ${STAGE.line}` }}>
                <div className="text-[12px] font-semibold" style={{ color: t.a }}>{a.nickname}</div>
                <div className="text-[15px]" style={{ color: STAGE.cream }}>{a.response?.text}</div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {answers.length === 0 && <p className="text-center text-[14px]" style={{ color: STAGE.faint }}>Be the first to answer.</p>}
      </div>
    </div>
  );
}

// ── the switch ───────────────────────────────────────────────────────

export function GamePlay({ state, groupId, meId, t }: { state: State; groupId: number; meId: string | undefined; t: GameTheme }) {
  const respond = useSubmitGameResponse(groupId);
  const reveal = useRevealGame(groupId);
  const [local, setLocal] = useState<any>(null);
  const revealed = state.status === "revealed";
  const mine = state.myResponse ?? local;
  const isHost = !!meId && state.startedBy === meId;
  const viewState = useMemo(() => ({ ...state, viewerId: meId }), [state, meId]);

  // A new round in the same screen starts clean.
  useEffect(() => setLocal(null), [state.id]);

  const submit = (response: any) => {
    setLocal(response); // shows as locked in straight away
    haptic.success();
    respond.mutate(
      { gameId: state.id, messageId: state.messageId, response },
      { onError: () => setLocal(null) },
    );
  };

  const common = { state: viewState, t, mine, revealed, submit };

  if (state.endedEmpty) {
    return (
      <div className="text-center py-10 space-y-3">
        <div className="text-[56px]" aria-hidden="true">💤</div>
        <Prompt size="md">This round went quiet.</Prompt>
        <p className="text-[15px]" style={{ color: STAGE.dim }}>Nobody played it in time. Start a fresh one below.</p>
      </div>
    );
  }

  switch (state.kind) {
    case "would_you_rather":
      return (
        <div className="space-y-6">
          <Kicker color={t.a}>Would you rather…</Kicker>
          <SplitChoice
            t={t}
            options={[{ key: "a", label: state.config.a }, { key: "b", label: state.config.b }]}
            mine={mine?.choice ?? null}
            revealed={revealed}
            counts={revealed && state.results ? { a: state.results.aCount, b: state.results.bCount } : null}
            onPick={(choice) => submit({ choice })}
          />
          {!revealed && mine && <LockedIn t={t} />}
          {revealed && state.results && <SplitVerdict t={t} mine={mine?.choice ?? null} counts={{ a: state.results.aCount, b: state.results.bCount }} />}
        </div>
      );
    case "never_have_i_ever":
      return (
        <div className="space-y-6">
          <Kicker color={t.a}>Never have I ever…</Kicker>
          <Prompt>{String(state.config.statement).replace(/^Never have I ever\s*/i, "…")}</Prompt>
          <SplitChoice
            t={t}
            options={[{ key: "have", label: "I have", emoji: "🙋" }, { key: "havent", label: "Never", emoji: "🙅" }]}
            mine={mine?.choice ?? null}
            revealed={revealed}
            counts={revealed && state.results ? { have: state.results.haveCount, havent: state.results.haventCount } : null}
            onPick={(choice) => submit({ choice })}
          />
          {!revealed && mine && <LockedIn t={t} line="Answer in. Only totals are shown." />}
          {revealed && state.results && <SplitVerdict t={t} mine={mine?.choice ?? null} counts={{ have: state.results.haveCount, havent: state.results.haventCount }} />}
        </div>
      );
    case "hot_take":
      return <HotTake {...common} />;
    case "trivia_round":
      return <TriviaBlitz {...common} />;
    case "this_or_that":
      return <ThisOrThat {...common} />;
    case "most_likely_to":
      return <MostLikely {...common} />;
    case "two_truths_one_lie":
      return <TwoTruths {...common} isHost={isHost} />;
    case "category_sprint":
      return <CategorySprint {...common} />;
    case "emoji_charades":
      return (
        <EmojiCharades
          {...common}
          isHost={isHost}
          revealing={reveal.isPending}
          onReveal={() => reveal.mutate({ gameId: state.id, messageId: state.messageId })}
        />
      );
    case "icebreaker_roulette":
      return <Icebreaker state={viewState} t={t} mine={mine} submit={submit} />;
    default:
      return <Prompt size="md">This game needs a newer version of Destira.</Prompt>;
  }
}
