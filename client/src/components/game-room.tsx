// Shared visual language + interactive body for group games, used by both
// the compact announcement in GroupChat.tsx (RichCard/CardHeader/StatusPill
// only) and the full GameRoomScreen (everything, including GameRoomBody —
// the actual play surface). Kept in one place so a room and its chat
// announcement always look like the same product, and so a per-kind bug
// only needs fixing once.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSubmitGameResponse, useRevealGame } from "@/hooks/use-interactions";

const INK = "hsl(var(--vf-ink))";
const SURFACE2 = "var(--vf-surface2)";
const LINE = "var(--vf-line)";
const MUTED = "var(--vf-muted)";
const FAINT = "var(--vf-faint)";
const TEXT = "hsl(var(--vf-text))";
const EMBER = "hsl(var(--vf-ember))";
const MINT = "hsl(var(--vf-mint))";

export const GAME_ICON_LABEL: Record<string, string> = {
  two_truths_one_lie: "🎭", would_you_rather: "🤔", this_or_that: "⚡",
  never_have_i_ever: "🙈", most_likely_to: "🏆", trivia_round: "🧠",
  category_sprint: "⏱️", emoji_charades: "🎬", icebreaker_roulette: "🎲",
};

// Shared shell for every rich, interactive chat card (polls, games) — always
// the same opaque, neutral surface regardless of who sent the message.
export function RichCard({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <div
      className="min-w-[240px] max-w-full"
      style={{ background: SURFACE2, border: `1px solid ${LINE}`, borderRadius: "16px", padding: "14px", boxShadow: "0 2px 10px rgba(0,0,0,0.18)" }}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

export function CardHeader({ icon, title, status }: { icon: string; title: string; status?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span
        className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0"
        style={{ background: "hsl(var(--vf-ember) / 0.14)" }}
      >
        {icon}
      </span>
      <p className="font-semibold text-sm flex-1 min-w-0" style={{ color: TEXT }}>{title}</p>
      {status}
    </div>
  );
}

export function StatusPill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "ember" | "mint" }) {
  const color = tone === "mint" ? MINT : tone === "ember" ? EMBER : MUTED;
  const bg = tone === "mint" ? "hsl(var(--vf-mint) / 0.14)" : tone === "ember" ? "hsl(var(--vf-ember) / 0.14)" : "rgba(255,255,255,0.06)";
  return (
    <span
      className="shrink-0 font-mono text-[10px] uppercase tracking-wide px-2 py-1 rounded-full"
      style={{ color, background: bg }}
    >
      {children}
    </span>
  );
}

export function GameProgress({ state }: { state: any }) {
  if (state.status === "revealed") return <StatusPill tone="mint">✓ Revealed</StatusPill>;
  return <StatusPill>{state.responseCount}/{state.eligibleCount} answered</StatusPill>;
}

// `correctKey`, when set, gives that one choice the mint "this was right"
// treatment once revealed. Every color here is explicit (never inherited)
// on purpose — see the note this replaced in GroupChat.tsx for why.
export function ChoiceRound({ state, choices, onPick, resultsFor, correctKey }: {
  state: any;
  choices: { key: string; label: string }[];
  onPick: (key: string) => void;
  resultsFor?: (key: string) => { count: number; pct: number } | null;
  correctKey?: string;
}) {
  const revealed = state.status === "revealed";
  return (
    <div className="space-y-1.5">
      {choices.map((c) => {
        const isMine = state.myResponse && Object.values(state.myResponse)[0] === c.key;
        const res = revealed ? resultsFor?.(c.key) : null;
        const isCorrect = revealed && correctKey != null && c.key === correctKey;
        const accent = isCorrect ? MINT : isMine ? EMBER : null;
        return (
          <button
            key={c.key}
            onClick={() => !state.myResponse && onPick(c.key)}
            disabled={!!state.myResponse}
            className="w-full text-left p-2.5 text-[13px] relative overflow-hidden transition-colors hover:brightness-110"
            style={{
              borderRadius: "10px",
              border: `1px solid ${accent ?? LINE}`,
              background: isCorrect ? "hsl(var(--vf-mint) / 0.14)" : isMine ? "hsl(var(--vf-ember) / 0.14)" : "rgba(255,255,255,0.03)",
            }}
            data-testid={`game-choice-${c.key}`}
          >
            {res && (
              <div
                className="absolute inset-y-0 left-0 transition-[width] duration-500"
                style={{ width: `${res.pct}%`, background: isCorrect ? "hsl(var(--vf-mint) / 0.1)" : "hsl(var(--vf-ember) / 0.1)" }}
              />
            )}
            <div className="relative flex items-center justify-between gap-2">
              <span style={{ color: TEXT, fontWeight: accent ? 600 : 500 }}>
                {isCorrect && "✓ "}{c.label}
              </span>
              {res && <span className="font-mono text-[11px] shrink-0" style={{ color: MUTED }}>{res.count} · {res.pct}%</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// A subordinate line under the header — the prompt/statement/category text
// every kind but the roulette-style ones needs. Explicit TEXT (not MUTED):
// this is the actual content of the round, not metadata.
export function GamePrompt({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] mb-2.5" style={{ color: TEXT }}>{children}</p>;
}

const inputCardCls = "text-[13px] h-9 border-0";
function gameInputStyle(): React.CSSProperties {
  return { background: "rgba(255,255,255,0.05)", color: TEXT };
}

// The actual play surface, per kind — shared by the chat announcement's
// (now-removed) inline card and, going forward, only GameRoomScreen. Kept
// as its own component (rather than folded into GameRoomScreen) so it's
// obvious this is the one place that ever needs updating per game kind.
export function GameRoomBody({ state, groupId }: { state: any; groupId: number }) {
  const respond = useSubmitGameResponse(groupId);
  const reveal = useRevealGame(groupId);
  const [draftText, setDraftText] = useState("");
  const [draftPairChoices, setDraftPairChoices] = useState<Record<number, "a" | "b">>({});
  const [draftAnswers, setDraftAnswers] = useState<Record<number, number>>({});

  const submit = (response: any) => respond.mutate({ gameId: state.id, messageId: state.messageId, response });
  const hasResponded = !!state.myResponse;
  const revealed = state.status === "revealed";

  return (
    <>
      {state.kind === "would_you_rather" && (
        <>
          <GamePrompt>{state.config.a} <span style={{ color: FAINT }}>or</span> {state.config.b}</GamePrompt>
          <ChoiceRound
            state={state}
            choices={[{ key: "a", label: state.config.a }, { key: "b", label: state.config.b }]}
            onPick={(choice) => submit({ choice })}
            resultsFor={(key) => revealed ? { count: key === "a" ? state.results.aCount : state.results.bCount, pct: key === "a" ? state.results.aPct : state.results.bPct } : null}
          />
        </>
      )}

      {state.kind === "never_have_i_ever" && (
        <>
          <GamePrompt>{state.config.statement}</GamePrompt>
          <ChoiceRound
            state={state}
            choices={[{ key: "have", label: "I have" }, { key: "havent", label: "I haven't" }]}
            onPick={(choice) => submit({ choice })}
            resultsFor={(key) => {
              if (!revealed) return null;
              const total = (state.results.haveCount + state.results.haventCount) || 1;
              const count = key === "have" ? state.results.haveCount : state.results.haventCount;
              return { count, pct: Math.round((count / total) * 100) };
            }}
          />
        </>
      )}

      {state.kind === "two_truths_one_lie" && (
        <>
          <ChoiceRound
            state={state}
            choices={state.config.statements.map((s: string, i: number) => ({ key: String(i), label: s }))}
            onPick={(key) => submit({ guessIndex: Number(key) })}
            correctKey={revealed ? String(state.results.lieIndex) : undefined}
            resultsFor={(key) => {
              if (!revealed) return null;
              const count = state.results.guesses.filter((g: any) => g.guessIndex === Number(key)).length;
              const total = state.results.guesses.length || 1;
              return { count, pct: Math.round((count / total) * 100) };
            }}
          />
          {revealed && (
            <p className="text-xs mt-2.5" style={{ color: MUTED }}>
              {state.results.correctGuessers.length ? `Guessed right: ${state.results.correctGuessers.join(", ")}` : "Nobody guessed it."}
            </p>
          )}
        </>
      )}

      {state.kind === "most_likely_to" && (
        <>
          <GamePrompt>{state.config.prompt}</GamePrompt>
          <ChoiceRound
            state={state}
            choices={state.config.candidates.map((c: any) => ({ key: c.userId, label: c.nickname }))}
            onPick={(targetUserId) => submit({ targetUserId })}
            resultsFor={(key) => {
              if (!revealed) return null;
              const row = state.results.tally.find((t: any) => t.userId === key);
              const total = state.results.tally.reduce((s: number, t: any) => s + t.votes, 0) || 1;
              return { count: row?.votes ?? 0, pct: Math.round(((row?.votes ?? 0) / total) * 100) };
            }}
          />
          {revealed && state.results.winner && (
            <p className="text-xs mt-2.5 font-medium" style={{ color: EMBER }}>🏆 {state.results.winner.nickname}</p>
          )}
        </>
      )}

      {state.kind === "this_or_that" && (
        <div className="space-y-2.5">
          {state.config.pairs.map((p: { a: string; b: string }, i: number) => {
            const picked = hasResponded ? state.myResponse.choices?.[i] : draftPairChoices[i];
            const res = revealed ? state.results[i] : null;
            return (
              <div key={i} className="flex items-center gap-2 text-[13px]">
                {(["a", "b"] as const).map((side) => (
                  <button
                    key={side}
                    disabled={hasResponded}
                    onClick={() => setDraftPairChoices((cur) => ({ ...cur, [i]: side }))}
                    className="flex-1 p-2 text-left relative overflow-hidden transition-colors hover:brightness-110"
                    style={{
                      borderRadius: 10,
                      border: `1px solid ${picked === side ? EMBER : LINE}`,
                      background: picked === side ? "hsl(var(--vf-ember) / 0.14)" : "rgba(255,255,255,0.03)",
                    }}
                  >
                    <div className="relative flex items-center justify-between gap-1.5">
                      <span style={{ color: TEXT, fontWeight: picked === side ? 600 : 500 }}>{side === "a" ? p.a : p.b}</span>
                      {res && <span className="font-mono text-[11px] shrink-0" style={{ color: MUTED }}>{side === "a" ? res.aCount : res.bCount}</span>}
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
          {!hasResponded && (
            <Button
              size="sm"
              disabled={Object.keys(draftPairChoices).length < state.config.pairs.length || respond.isPending}
              onClick={() => submit({ choices: state.config.pairs.map((_: any, i: number) => draftPairChoices[i]) })}
              className="w-full btn-press"
              style={{ background: EMBER, color: INK, border: "none" }}
              data-testid="button-submit-this-or-that"
            >
              Submit
            </Button>
          )}
        </div>
      )}

      {state.kind === "trivia_round" && (
        <div className="space-y-3">
          {state.config.questions.map((q: { question: string; options: string[] }, i: number) => {
            const picked = hasResponded ? state.myResponse.answers?.[i] : draftAnswers[i];
            return (
              <div key={i} className="space-y-1.5">
                <p className="text-[13px] font-medium" style={{ color: TEXT }}>{i + 1}. {q.question}</p>
                <div className="space-y-1">
                  {q.options.map((opt, oi) => {
                    const isCorrect = revealed && state.results.correctIndexes[i] === oi;
                    const isPicked = picked === oi;
                    const accent = isCorrect ? MINT : isPicked ? EMBER : null;
                    return (
                      <button
                        key={oi}
                        disabled={hasResponded}
                        onClick={() => setDraftAnswers((cur) => ({ ...cur, [i]: oi }))}
                        className="w-full text-left p-2 text-[12.5px] transition-colors hover:brightness-110"
                        style={{
                          borderRadius: 8,
                          border: `1px solid ${accent ?? LINE}`,
                          background: isCorrect ? "hsl(var(--vf-mint) / 0.14)" : isPicked ? "hsl(var(--vf-ember) / 0.14)" : "rgba(255,255,255,0.03)",
                          color: TEXT,
                          fontWeight: accent ? 600 : 400,
                        }}
                      >
                        {isCorrect && "✓ "}{opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!hasResponded && (
            <Button
              size="sm"
              disabled={Object.keys(draftAnswers).length < state.config.questions.length || respond.isPending}
              onClick={() => submit({ answers: state.config.questions.map((_: any, i: number) => draftAnswers[i]) })}
              className="w-full btn-press"
              style={{ background: EMBER, color: INK, border: "none" }}
              data-testid="button-submit-trivia"
            >
              Submit answers
            </Button>
          )}
          {revealed && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {state.results.scores.map((s: any) => (
                <span key={s.userId} className="text-[11px] font-mono px-2 py-1 rounded-full" style={{ color: TEXT, background: "rgba(255,255,255,0.05)" }}>
                  {s.nickname}: {s.score}/{state.config.questions.length}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {state.kind === "category_sprint" && (
        <div className="space-y-2.5">
          <GamePrompt>Category: <span style={{ color: EMBER, fontWeight: 600 }}>{state.config.category}</span> — list as many as you can</GamePrompt>
          {!hasResponded ? (
            <div className="flex items-center gap-2">
              <Input value={draftText} onChange={(e) => setDraftText(e.target.value)} placeholder="comma-separated..." className={inputCardCls} style={gameInputStyle()} data-testid="input-category-sprint" />
              <Button size="sm" disabled={!draftText.trim() || respond.isPending} onClick={() => submit({ items: draftText.split(",").map((s) => s.trim()).filter(Boolean) })} style={{ background: EMBER, color: INK, border: "none" }}>
                Submit
              </Button>
            </div>
          ) : (
            <p className="text-xs" style={{ color: FAINT }}>Submitted — waiting on the rest of the room.</p>
          )}
          {revealed && (
            <div className="space-y-1.5 pt-1">
              {state.results.leaderboard.map((row: any, i: number) => (
                <div key={row.userId} className="text-xs p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <span style={{ color: i === 0 ? EMBER : TEXT, fontWeight: 600 }}>{i === 0 ? "🏆 " : ""}{row.nickname}</span>
                  <span className="font-mono ml-1.5" style={{ color: MUTED }}>{row.uniqueCount} unique</span>
                  <p className="mt-0.5" style={{ color: MUTED }}>{row.items.join(", ") || "—"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {state.kind === "emoji_charades" && (
        <div className="space-y-2.5">
          <p className="text-3xl mb-1">{state.config.emoji}</p>
          {!revealed ? (
            <div className="flex items-center gap-2">
              <Input value={draftText} onChange={(e) => setDraftText(e.target.value)} placeholder="Your guess..." className={inputCardCls} style={gameInputStyle()} data-testid="input-charades-guess" />
              <Button size="sm" disabled={!draftText.trim() || respond.isPending} onClick={() => { submit({ guess: draftText.trim() }); setDraftText(""); }} style={{ background: EMBER, color: INK, border: "none" }}>
                Guess
              </Button>
            </div>
          ) : (
            <p className="text-[13px] font-medium" style={{ color: MINT }}>
              It was "{state.results.answer}" — {state.results.correctGuessers.length ? `guessed by ${state.results.correctGuessers.join(", ")}` : "nobody got it"}
            </p>
          )}
          {state.canRevealEarly && (
            <Button size="sm" variant="outline" onClick={() => reveal.mutate({ gameId: state.id, messageId: state.messageId })} style={{ borderColor: LINE, color: MUTED }} data-testid="button-reveal-charades">
              Reveal answer
            </Button>
          )}
        </div>
      )}

      {state.kind === "icebreaker_roulette" && (
        <div className="space-y-2.5">
          <GamePrompt>{state.config.prompt}</GamePrompt>
          {!hasResponded && (
            <div className="flex items-center gap-2">
              <Input value={draftText} onChange={(e) => setDraftText(e.target.value)} placeholder="Your answer..." className={inputCardCls} style={gameInputStyle()} data-testid="input-icebreaker" />
              <Button size="sm" disabled={!draftText.trim() || respond.isPending} onClick={() => { submit({ text: draftText.trim() }); setDraftText(""); }} style={{ background: EMBER, color: INK, border: "none" }}>
                Share
              </Button>
            </div>
          )}
          {state.results?.live?.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {state.results.live.map((r: any, i: number) => (
                <p key={i} className="text-xs p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <span className="font-medium" style={{ color: TEXT }}>{r.nickname}:</span> <span style={{ color: MUTED }}>{r.response?.text}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
