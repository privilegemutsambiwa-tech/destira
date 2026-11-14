// Game Night effects: the small things that make a round feel alive.
// Confetti on a reveal, faces lighting up as people lock in, a timer that
// drains, numbers that count up. All of it steps aside under reduced motion.
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { STAGE } from "./game-theme";

// ── Confetti ─────────────────────────────────────────────────────────

/** A one-shot burst over the whole screen. Bump `fire` to launch it. */
export function Confetti({ fire, colors }: { fire: number; colors: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!fire || reduce) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const palette = [...colors, STAGE.cream, STAGE.mint];
    const pieces = Array.from({ length: 140 }, (_, i) => {
      const fromLeft = i % 2 === 0;
      return {
        x: fromLeft ? -10 : w + 10,
        y: h * (0.55 + Math.random() * 0.3),
        vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 7),
        vy: -(9 + Math.random() * 9),
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.35,
        size: 5 + Math.random() * 7,
        color: palette[i % palette.length],
        shape: i % 3,
      };
    });

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      for (const p of pieces) {
        p.vy += 0.32;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t / 2600);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.color;
        if (p.shape === 0) ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        else if (p.shape === 1) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.6, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(-p.size / 4, -p.size / 2, p.size / 2, p.size);
        ctx.restore();
      }
      if (t < 2700) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fire, reduce]);

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[80] w-full h-full" aria-hidden="true" />;
}

// ── Presence ─────────────────────────────────────────────────────────

const AVATAR_HUES = ["#FF6B4A", "#8B5CF6", "#3B82F6", "#22C55E", "#EAB308", "#EC4899", "#14B8A6", "#F97316"];
function hueFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

export function Face({ name, seed, size = 34, ring }: { name: string; seed: string; size?: number; ring?: string }) {
  const c = hueFor(seed);
  return (
    <span
      className="relative inline-flex items-center justify-center rounded-full font-semibold shrink-0 select-none"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        color: "#fff",
        background: `linear-gradient(145deg, ${c}, ${c}99)`,
        boxShadow: ring ? `0 0 0 2px ${STAGE.ink}, 0 0 0 4px ${ring}` : `0 0 0 2px ${STAGE.ink}`,
      }}
      aria-hidden="true"
    >
      {(name || "?").trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

/** Everyone in the room; the ones who've locked in light up with a tick. */
export function Presence({
  participants,
  answered,
  accent,
  hostId,
}: {
  participants: { userId: string; nickname: string }[];
  answered: { userId: string }[];
  accent: string;
  hostId?: string;
}) {
  const done = new Set(answered.map((a) => a.userId));
  const players = participants.filter((p) => p.userId !== hostId);
  const lockedIn = players.filter((p) => done.has(p.userId)).length;
  return (
    <div className="flex items-center gap-3" data-testid="game-presence">
      <div className="flex -space-x-2">
        <AnimatePresence initial={false}>
          {players.slice(0, 7).map((p) => {
            const on = done.has(p.userId);
            return (
              <motion.span
                key={p.userId}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: on ? 1.06 : 1, opacity: on ? 1 : 0.55 }}
                transition={{ type: "spring", stiffness: 500, damping: 22 }}
                className="relative"
                title={p.nickname}
              >
                <Face name={p.nickname} seed={p.userId} size={30} ring={on ? accent : undefined} />
                {on && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ background: STAGE.mint }}>
                    <Check className="w-2.5 h-2.5" style={{ color: STAGE.ink }} strokeWidth={3.5} />
                  </span>
                )}
              </motion.span>
            );
          })}
        </AnimatePresence>
        {players.length > 7 && (
          <span className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px] font-semibold" style={{ background: STAGE.glass, color: STAGE.dim, boxShadow: `0 0 0 2px ${STAGE.ink}` }}>
            +{players.length - 7}
          </span>
        )}
      </div>
      <span className="font-mono text-[11.5px] tracking-[0.04em]" style={{ color: STAGE.dim }} aria-live="polite">
        {players.length === 0 ? "Waiting for players" : `${lockedIn} of ${players.length} locked in`}
      </span>
    </div>
  );
}

// ── Timers ───────────────────────────────────────────────────────────

/** Re-renders every `ms` while mounted. */
export function useNow(ms = 250, on = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms, on]);
  return now;
}

/** A bar that drains from full to empty between `start` and `end`. */
export function TimerBar({ start, end, color, now }: { start: number; end: number; color: string; now: number }) {
  const frac = Math.max(0, Math.min(1, (end - now) / Math.max(1, end - start)));
  const urgent = end - now < 4000;
  return (
    <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: STAGE.line }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}>
      <div
        className="h-full rounded-full"
        style={{
          width: `${frac * 100}%`,
          background: urgent ? "#FF4D4D" : color,
          transition: "width 250ms linear, background 300ms",
          boxShadow: `0 0 12px ${urgent ? "#FF4D4D" : color}`,
        }}
      />
    </div>
  );
}

export function secondsLeft(end: number, now: number) {
  const s = Math.max(0, Math.ceil((end - now) / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
}

// ── Numbers ──────────────────────────────────────────────────────────

/** Counts up to `to` once it changes (the reveal). */
export function CountUp({ to, ms = 900, suffix = "" }: { to: number; ms?: number; suffix?: string }) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) {
      setV(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms, reduce]);
  return (
    <>
      {v}
      {suffix}
    </>
  );
}

/** A small stamped label ("LIE", "TRUE", "WINNER") that lands with a thud. */
export function Stamp({ children, color, rotate = -8 }: { children: React.ReactNode; color: string; rotate?: number }) {
  return (
    <motion.span
      initial={{ scale: 2.2, opacity: 0, rotate: rotate - 10 }}
      animate={{ scale: 1, opacity: 1, rotate }}
      transition={{ type: "spring", stiffness: 520, damping: 18, delay: 0.15 }}
      className="inline-block font-mono text-[12px] font-semibold tracking-[0.18em] px-2.5 py-1 rounded-[8px]"
      style={{ color, border: `2px solid ${color}`, background: `${color}1A` }}
    >
      {children}
    </motion.span>
  );
}
