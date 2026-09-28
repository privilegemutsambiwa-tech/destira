import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft, Send, Info, Loader2, Paperclip, BarChart3, Dices,
  Heart, ThumbsUp, ThumbsDown, Laugh, Flame, Star,
  Reply, Copy, Trash2, X, Plus, Users, Image as ImageIcon,
  MessageSquarePlus, Crown, Flag, CheckCheck
} from "lucide-react";
import {
  useGroup, useEnrichedGroupMessages, useSendGroupMessage,
  useCreatePoll, usePollByMessage, useVotePoll,
  useGameKinds, useGameBank, useCreateGame, useGameByMessage, useSubmitGameResponse, useRevealGame,
  useAddReaction, useRemoveReaction, useDeleteOwnMessage,
  useDeleteGroupMessage, useJoinGroup, useLeaveGroup,
  useStarMessage, useUnstarMessage, useCreateChatRequest,
  useMarkGroupSeen, useGroupMessageReadInfo
} from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useKeyboardScroll } from "@/hooks/use-keyboard-scroll";
import { usePaywall } from "@/hooks/use-paywall";
import { apiRequest } from "@/lib/queryClient";
import { parseDestiraLink } from "@/lib/link-preview";
import { LinkPreviewCard } from "@/components/link-preview-card";
import { avatarColor } from "@/lib/avatar-color";

interface MessageAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  testId: string;
  danger?: boolean;
}

const REACTION_ICONS: Record<string, any> = {
  heart: Heart,
  thumbsup: ThumbsUp,
  thumbsdown: ThumbsDown,
  laugh: Laugh,
  flame: Flame,
  star: Star,
};

const REACTIONS = [
  { key: "heart", Icon: Heart },
  { key: "thumbsup", Icon: ThumbsUp },
  { key: "thumbsdown", Icon: ThumbsDown },
  { key: "laugh", Icon: Laugh },
  { key: "flame", Icon: Flame },
  { key: "star", Icon: Star },
];

// vf-* tokens, theme-aware — see client/src/index.css for the light/dark
// values these resolve through (this file styles inline rather than via
// Tailwind's vf-* classes, so a value only needs to change here once).
const INK = "hsl(var(--vf-ink))";
const SURFACE2 = "var(--vf-surface2)";
const ELEVATED = "var(--vf-elevated)";
const LINE = "var(--vf-line)";
const MUTED = "var(--vf-muted)";
const FAINT = "var(--vf-faint)";
const TEXT = "hsl(var(--vf-text))";
const EMBER = "hsl(var(--vf-ember))";
const MINT = "hsl(var(--vf-mint))";
const SERIF: React.CSSProperties = { fontFamily: '"Instrument Serif", serif', fontWeight: 400 };
const MONO: React.CSSProperties = {
  fontFamily: '"DM Mono", ui-monospace, monospace',
  fontSize: "10.5px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

// Groups exist to find love here, not just to chat about a shared interest —
// knowing who's replying matters. Only the two binary answers get a label;
// non-binary/self-describe/prefer-not/unset stay unlabeled rather than
// forcing a category on someone who deliberately didn't pick one.
function genderLabel(gender: string | null | undefined): string | null {
  if (gender === "man") return "Man";
  if (gender === "woman") return "Woman";
  return null;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateSeparator(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = today.getTime() - msgDate.getTime();
  if (diff === 0) return "Today";
  if (diff === 86400000) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function isSameDay(a: string, b: string) {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

// Shared shell for every rich, interactive chat card (polls, games — the
// same role LinkPreviewCard's CardShell plays for link previews). Always
// the same opaque, neutral surface regardless of who sent the message —
// an "isMe" ember bubble is fine for a line of text, but a multi-element
// widget with buttons and progress bars needs one consistent, explicitly
// colored surface to stay readable no matter whose message it's in.
function RichCard({ children, testId }: { children: React.ReactNode; testId?: string }) {
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

function CardHeader({ icon, title, status }: { icon: string; title: string; status?: React.ReactNode }) {
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

function StatusPill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "ember" | "mint" }) {
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

function PollBubble({ messageId, groupId }: { messageId: number; groupId: number }) {
  const { data: pollData, isLoading } = usePollByMessage(messageId);
  const votePoll = useVotePoll(groupId);
  const { user } = useAuth();

  if (isLoading) return <Loader2 className="w-4 h-4 animate-spin" style={{ color: MUTED }} />;
  if (!pollData || !pollData.poll) return null;

  const { poll, options, votes } = pollData;
  const totalVotes = votes?.length || 0;
  const userVotes = votes?.filter((v: any) => v.userId === user?.id).map((v: any) => v.optionId) || [];

  const handleVote = async (optionId: number) => {
    try {
      await votePoll.mutateAsync({ pollId: poll.id, optionId, messageId });
    } catch {}
  };

  return (
    <RichCard testId={`poll-bubble-${messageId}`}>
      <CardHeader icon="📊" title={poll.question} status={<StatusPill>{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</StatusPill>} />
      {poll.allowMultiple && <p className="text-xs mb-2" style={{ color: FAINT }}>Multiple answers allowed</p>}
      <div className="space-y-1.5">
        {options?.map((opt: any) => {
          const optVotes = votes?.filter((v: any) => v.optionId === opt.id).length || 0;
          const pct = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
          const isVoted = userVotes.includes(opt.id);
          return (
            <button
              key={opt.id}
              onClick={() => handleVote(opt.id)}
              disabled={votePoll.isPending}
              className="w-full text-left p-2.5 text-[13px] relative overflow-hidden transition-colors hover:brightness-110"
              style={{
                borderRadius: "10px",
                border: isVoted ? `1px solid ${EMBER}` : `1px solid ${LINE}`,
                background: isVoted ? "hsl(var(--vf-ember) / 0.14)" : "rgba(255,255,255,0.03)",
              }}
              data-testid={`poll-option-${opt.id}`}
            >
              <div
                className="absolute inset-y-0 left-0 transition-[width] duration-500"
                style={{ width: `${pct}%`, background: "hsl(var(--vf-ember) / 0.12)" }}
              />
              <div className="relative flex items-center justify-between gap-2">
                <span style={{ color: TEXT, fontWeight: isVoted ? 600 : 500 }}>{opt.text}</span>
                <span className="font-mono text-[11px] shrink-0" style={{ color: MUTED }}>{optVotes} · {pct}%</span>
              </div>
            </button>
          );
        })}
      </div>
    </RichCard>
  );
}

function PollComposerDialog({ groupId, open, onClose }: { groupId: number; open: boolean; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const createPoll = useCreatePoll(groupId);
  const { toast } = useToast();

  const addOption = () => {
    if (options.length < 12) setOptions([...options, ""]);
  };

  const updateOption = (idx: number, val: string) => {
    const updated = [...options];
    updated[idx] = val;
    setOptions(updated);
  };

  const removeOption = (idx: number) => {
    if (options.length > 2) setOptions(options.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    const validOptions = options.filter((o) => o.trim());
    if (!question.trim() || validOptions.length < 2) return;
    try {
      await createPoll.mutateAsync({ question, options: validOptions, allowMultiple });
      toast({ title: "Poll created" });
      setQuestion("");
      setOptions(["", ""]);
      setAllowMultiple(false);
      onClose();
    } catch {
      toast({ title: "Error", description: "Failed to create poll.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a Poll</DialogTitle>
          <DialogDescription>Ask a question and add options for the group to vote on.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block text-foreground">Question</label>
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What do you want to ask?"
              data-testid="input-poll-question"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium mb-1 block text-foreground">Options</label>
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={opt}
                  onChange={(e) => updateOption(idx, e.target.value)}
                  placeholder={`Option ${idx + 1}`}
                  data-testid={`input-poll-option-${idx}`}
                />
                {options.length > 2 && (
                  <Button variant="ghost" size="icon" onClick={() => removeOption(idx)} data-testid={`button-remove-option-${idx}`}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
            {options.length < 12 && (
              <Button variant="outline" size="sm" onClick={addOption} data-testid="button-add-poll-option">
                <Plus className="w-4 h-4 mr-1" /> Add Option
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="text-sm font-medium text-foreground">Allow multiple answers</label>
            <Switch checked={allowMultiple} onCheckedChange={setAllowMultiple} data-testid="switch-allow-multiple" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!question.trim() || options.filter((o) => o.trim()).length < 2 || createPoll.isPending}
            className="btn-press"
            style={{ background: EMBER, border: "none", color: INK }}
            data-testid="button-submit-poll"
          >
            {createPoll.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Create Poll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const GAME_ICON_LABEL: Record<string, string> = {
  two_truths_one_lie: "🎭", would_you_rather: "🤔", this_or_that: "⚡",
  never_have_i_ever: "🙈", most_likely_to: "🏆", trivia_round: "🧠",
  category_sprint: "⏱️", emoji_charades: "🎬", icebreaker_roulette: "🎲",
};

function GameProgress({ state }: { state: any }) {
  if (state.status === "revealed") return <StatusPill tone="mint">✓ Revealed</StatusPill>;
  return <StatusPill>{state.responseCount}/{state.eligibleCount} answered</StatusPill>;
}

// `correctKey`, when set, gives that one choice the mint "this was right"
// treatment once revealed — used by two_truths_one_lie for the actual lie.
// Every color here is explicit (never inherited/Tailwind `text-foreground`)
// on purpose: these cards render inside a chat bubble whose own background
// flips between a bright ember fill and a near-transparent one depending on
// who sent it, so any color that isn't nailed down goes unreadable in one
// of those two contexts.
function ChoiceRound({ state, choices, onPick, resultsFor, correctKey }: {
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
function GamePrompt({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] mb-2.5" style={{ color: TEXT }}>{children}</p>;
}

const inputCardCls = "text-[13px] h-9 border-0";
function gameInputStyle(): React.CSSProperties {
  return { background: "rgba(255,255,255,0.05)", color: TEXT };
}

function GameBubble({ messageId, groupId }: { messageId: number; groupId: number }) {
  const { data: state, isLoading } = useGameByMessage(messageId);
  const respond = useSubmitGameResponse(groupId);
  const reveal = useRevealGame(groupId);
  const [draftText, setDraftText] = useState("");
  const [draftPairChoices, setDraftPairChoices] = useState<Record<number, "a" | "b">>({});
  const [draftAnswers, setDraftAnswers] = useState<Record<number, number>>({});

  if (isLoading) return <Loader2 className="w-4 h-4 animate-spin" style={{ color: MUTED }} />;
  if (!state) return null;

  const submit = (response: any) => respond.mutate({ gameId: state.id, messageId, response });
  const hasResponded = !!state.myResponse;
  const revealed = state.status === "revealed";
  const showFooter = state.kind !== "icebreaker_roulette";

  return (
    <RichCard testId={`game-bubble-${messageId}`}>
      <CardHeader
        icon={GAME_ICON_LABEL[state.kind] || "🎮"}
        title={state.label}
        status={showFooter ? <GameProgress state={state} /> : undefined}
      />

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
            <p className="text-xs" style={{ color: FAINT }}>Submitted — waiting on the rest of the group.</p>
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
            <Button size="sm" variant="outline" onClick={() => reveal.mutate({ gameId: state.id, messageId })} style={{ borderColor: LINE, color: MUTED }} data-testid="button-reveal-charades">
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
    </RichCard>
  );
}

function GameComposerDialog({ groupId, open, onClose }: { groupId: number; open: boolean; onClose: () => void }) {
  const { data: kindsData } = useGameKinds();
  const [selectedKind, setSelectedKind] = useState<string | null>(null);
  const { data: bankData } = useGameBank(selectedKind);
  const createGame = useCreateGame(groupId);
  const { toast } = useToast();

  // Setup-form local state, cleared whenever the picked kind changes.
  const [statements, setStatements] = useState(["", "", ""]);
  const [lieIndex, setLieIndex] = useState<number | null>(null);
  const [promptIndex, setPromptIndex] = useState<number | null>(null);
  const [customA, setCustomA] = useState("");
  const [customB, setCustomB] = useState("");
  const [customStatement, setCustomStatement] = useState("");
  const [charadesFromBank, setCharadesFromBank] = useState(true);
  const [charadesAnswer, setCharadesAnswer] = useState("");
  const [charadesEmoji, setCharadesEmoji] = useState("");

  const reset = () => {
    setSelectedKind(null);
    setStatements(["", "", ""]);
    setLieIndex(null);
    setPromptIndex(null);
    setCustomA(""); setCustomB(""); setCustomStatement("");
    setCharadesFromBank(true); setCharadesAnswer(""); setCharadesEmoji("");
  };

  const buildSetup = (): any => {
    switch (selectedKind) {
      case "two_truths_one_lie": return { statements, lieIndex };
      case "would_you_rather": return customA.trim() && customB.trim() ? { a: customA.trim(), b: customB.trim() } : {};
      case "never_have_i_ever": return customStatement.trim() ? { statement: customStatement.trim() } : {};
      case "most_likely_to": return { promptIndex };
      case "emoji_charades": return charadesFromBank ? { fromBank: true } : { answer: charadesAnswer, emoji: charadesEmoji };
      default: return {};
    }
  };

  const canSubmit = (): boolean => {
    if (!selectedKind) return false;
    if (selectedKind === "two_truths_one_lie") return statements.every((s) => s.trim()) && lieIndex !== null;
    if (selectedKind === "most_likely_to") return promptIndex !== null;
    if (selectedKind === "emoji_charades" && !charadesFromBank) return !!charadesAnswer.trim() && !!charadesEmoji.trim();
    return true;
  };

  const handleSubmit = async () => {
    if (!selectedKind || !canSubmit()) return;
    try {
      await createGame.mutateAsync({ kind: selectedKind, setup: buildSetup() });
      toast({ title: "Game started" });
      reset();
      onClose();
    } catch (e: any) {
      toast({ title: "Couldn't start that", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Play a game</DialogTitle>
          <DialogDescription>Pick something for the group to play together, right here in chat.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {!selectedKind ? (
            <div className="space-y-2">
              {(kindsData?.kinds ?? []).map((k) => (
                <button
                  key={k.kind}
                  onClick={() => setSelectedKind(k.kind)}
                  className="w-full flex items-center gap-3 text-left p-3 transition-colors hover:brightness-110"
                  style={{ borderRadius: 12, border: `1px solid ${LINE}`, background: "rgba(255,255,255,0.03)" }}
                  data-testid={`game-kind-${k.kind}`}
                >
                  <span className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0" style={{ background: "hsl(var(--vf-ember) / 0.14)" }}>
                    {GAME_ICON_LABEL[k.kind] || "🎮"}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold" style={{ color: TEXT }}>{k.label}</div>
                    <div className="text-xs mt-0.5" style={{ color: MUTED }}>{k.blurb}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3.5">
              <button onClick={() => setSelectedKind(null)} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: MUTED }}>
                ← Back to games
              </button>
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0" style={{ background: "hsl(var(--vf-ember) / 0.14)" }}>
                  {GAME_ICON_LABEL[selectedKind] || "🎮"}
                </span>
                <span className="text-sm font-semibold" style={{ color: TEXT }}>
                  {kindsData?.kinds.find((k) => k.kind === selectedKind)?.label}
                </span>
              </div>

              {selectedKind === "two_truths_one_lie" && (
                <div className="space-y-2">
                  {statements.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input value={s} onChange={(e) => { const next = [...statements]; next[i] = e.target.value; setStatements(next); }} placeholder={`Statement ${i + 1}`} data-testid={`input-truth-${i}`} />
                      <button
                        onClick={() => setLieIndex(i)}
                        className="text-xs px-2.5 py-1.5 rounded-full shrink-0 font-medium transition-colors"
                        style={{ border: `1px solid ${lieIndex === i ? EMBER : LINE}`, color: lieIndex === i ? EMBER : MUTED, background: lieIndex === i ? "hsl(var(--vf-ember) / 0.12)" : "transparent" }}
                        data-testid={`button-mark-lie-${i}`}
                      >
                        {lieIndex === i ? "✓ Lie" : "Mark as lie"}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {selectedKind === "would_you_rather" && (
                <div className="space-y-2">
                  <p className="text-xs" style={{ color: MUTED }}>Leave blank to get a random one from the bank.</p>
                  <Input value={customA} onChange={(e) => setCustomA(e.target.value)} placeholder="Option A (optional)" data-testid="input-wyr-a" />
                  <Input value={customB} onChange={(e) => setCustomB(e.target.value)} placeholder="Option B (optional)" data-testid="input-wyr-b" />
                </div>
              )}

              {selectedKind === "never_have_i_ever" && (
                <div className="space-y-2">
                  <p className="text-xs" style={{ color: MUTED }}>Leave blank to get a random one from the bank.</p>
                  <Input value={customStatement} onChange={(e) => setCustomStatement(e.target.value)} placeholder="Never have I ever... (optional)" data-testid="input-nhie" />
                </div>
              )}

              {selectedKind === "most_likely_to" && (
                <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                  {(bankData?.items ?? []).map((item: any) => (
                    <button
                      key={item.promptIndex}
                      onClick={() => setPromptIndex(item.promptIndex)}
                      className="w-full text-left p-2.5 text-[13px] transition-colors hover:brightness-110"
                      style={{
                        borderRadius: 10,
                        border: `1px solid ${promptIndex === item.promptIndex ? EMBER : LINE}`,
                        background: promptIndex === item.promptIndex ? "hsl(var(--vf-ember) / 0.14)" : "rgba(255,255,255,0.03)",
                        color: TEXT,
                        fontWeight: promptIndex === item.promptIndex ? 600 : 500,
                      }}
                      data-testid={`most-likely-prompt-${item.promptIndex}`}
                    >
                      {promptIndex === item.promptIndex && "✓ "}{item.prompt}
                    </button>
                  ))}
                </div>
              )}

              {selectedKind === "emoji_charades" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCharadesFromBank(true)}
                      className="text-xs px-2.5 py-1.5 rounded-full font-medium transition-colors"
                      style={{ border: `1px solid ${charadesFromBank ? EMBER : LINE}`, color: charadesFromBank ? EMBER : MUTED, background: charadesFromBank ? "hsl(var(--vf-ember) / 0.12)" : "transparent" }}
                    >
                      Surprise me
                    </button>
                    <button
                      onClick={() => setCharadesFromBank(false)}
                      className="text-xs px-2.5 py-1.5 rounded-full font-medium transition-colors"
                      style={{ border: `1px solid ${!charadesFromBank ? EMBER : LINE}`, color: !charadesFromBank ? EMBER : MUTED, background: !charadesFromBank ? "hsl(var(--vf-ember) / 0.12)" : "transparent" }}
                    >
                      Write my own
                    </button>
                  </div>
                  {!charadesFromBank && (
                    <>
                      <Input value={charadesEmoji} onChange={(e) => setCharadesEmoji(e.target.value)} placeholder="Emoji clue, e.g. 🦁👑🌍" data-testid="input-charades-emoji" />
                      <Input value={charadesAnswer} onChange={(e) => setCharadesAnswer(e.target.value)} placeholder="Answer" data-testid="input-charades-answer" />
                    </>
                  )}
                </div>
              )}

              {["this_or_that", "trivia_round", "category_sprint", "icebreaker_roulette"].includes(selectedKind) && (
                <p className="text-xs" style={{ color: MUTED }}>Nothing to set up — this one's ready to go.</p>
              )}
            </div>
          )}
        </div>
        {selectedKind && (
          <DialogFooter>
            <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit() || createGame.isPending}
              className="btn-press"
              style={{ background: EMBER, border: "none", color: INK }}
              data-testid="button-submit-game"
            >
              {createGame.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Start
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Groups can have far more members than a "who's seen this" list should try
// to enumerate, so this leads with the count and only lists names up to the
// cap the API already applies — never a claim that the list is exhaustive.
function MessageInfoDialog({ groupId, messageId, onClose }: { groupId: number; messageId: number | null; onClose: () => void }) {
  const { data, isLoading, isError } = useGroupMessageReadInfo(groupId, messageId);
  return (
    <Dialog open={messageId !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Message info</DialogTitle>
          <DialogDescription>Who's seen this message so far.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: MUTED }} />
          </div>
        ) : isError || !data ? (
          <p className="text-sm py-4" style={{ color: MUTED }}>Couldn't load this right now.</p>
        ) : (
          <div className="py-2">
            <div className="flex items-center gap-2 mb-3">
              <CheckCheck className="w-4 h-4" style={{ color: EMBER }} />
              <p className="text-sm font-medium" style={{ color: TEXT }} data-testid="text-message-info-count">
                Seen by {data.readCount} of {data.totalCount} member{data.totalCount === 1 ? "" : "s"}
              </p>
            </div>
            {data.readerNames.length > 0 ? (
              <p className="text-sm" style={{ color: MUTED }}>
                {data.readerNames.join(", ")}
                {data.readCount > data.readerNames.length ? ` and ${data.readCount - data.readerNames.length} more` : ""}
              </p>
            ) : (
              <p className="text-sm" style={{ color: MUTED }}>No one else has seen it yet.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function GroupChatPage({ params }: { params?: { groupId?: string } }) {
  const groupId = Number(params?.groupId);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const highlightMsgId = (() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const match = search.match(/[?&]msg=(\d+)/);
    return match ? parseInt(match[1]) : null;
  })();

  const { data: group, isLoading: groupLoading } = useGroup(groupId);
  const { data: messages, isLoading: msgsLoading } = useEnrichedGroupMessages(groupId);
  const sendMessage = useSendGroupMessage(groupId);
  const deleteOwnMsg = useDeleteOwnMessage(groupId);
  const deleteGroupMsg = useDeleteGroupMessage(groupId);
  const addReaction = useAddReaction(groupId);
  const removeReaction = useRemoveReaction(groupId);
  const joinGroup = useJoinGroup();
  const starMessage = useStarMessage(groupId);
  const unstarMessage = useUnstarMessage(groupId);
  const createChatRequest = useCreateChatRequest();
  const paywall = usePaywall();
  const markSeen = useMarkGroupSeen(groupId);

  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<any>(null);
  const [activeMessageId, setActiveMessageId] = useState<number | null>(null);
  const [showPollDialog, setShowPollDialog] = useState(false);
  const [showGameDialog, setShowGameDialog] = useState(false);
  const [messageInfoId, setMessageInfoId] = useState<number | null>(null);
  const [reportTarget, setReportTarget] = useState<{ userId: string; messageId: number } | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState<number | null>(highlightMsgId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isMember = group?.isMember || hasJoined;
  const isAdmin = group?.myRole === "owner" || group?.myRole === "admin";

  useEffect(() => {
    if (highlightMsgId && messages) {
      const el = document.getElementById(`msg-${highlightMsgId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => setHighlightedMsgId(null), 3000);
      }
    } else if (!highlightMsgId) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, highlightMsgId]);
  useKeyboardScroll(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }));

  // Advances this viewer's own read watermark once they've actually been
  // shown the latest message — mirrors the read-marking-on-real-view
  // reasoning already used for stories, just for "message info" read counts
  // instead of a view counter.
  const latestMessageId = messages && messages.length > 0 ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (isMember && latestMessageId !== null) markSeen.mutate(latestMessageId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMember, latestMessageId]);

  const messagesMap = useMemo(() => {
    const map: Record<number, any> = {};
    messages?.forEach((m: any) => { map[m.id] = m; });
    return map;
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const text = input;
    setInput("");
    const payload: any = { content: text, contentType: "text" };
    if (replyTo) {
      payload.replyToMessageId = replyTo.id;
      setReplyTo(null);
    }
    try {
      await sendMessage.mutateAsync(payload);
    } catch (error: any) {
      toast({ title: "Couldn't send that", description: error?.message || "Must join group first.", variant: "destructive" });
    }
  };

  const handleJoin = async () => {
    try {
      const result = await joinGroup.mutateAsync(groupId);
      if (result.status === "requested") {
        toast({ title: "Request Sent", description: "Your join request has been sent." });
      } else {
        setHasJoined(true);
        toast({ title: "Joined!", description: `You're now part of ${group?.name}.` });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "";
      if (errMsg.includes("Already")) {
        setHasJoined(true);
      } else {
        toast({ title: "Error", description: errMsg || "Failed to join.", variant: "destructive" });
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("image", file);
    try {
      const res = await fetch("/api/uploads/image", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      await sendMessage.mutateAsync({ content: "", contentType: "image", mediaUrl: data.url || data.imageUrl });
    } catch {
      toast({ title: "Error", description: "Failed to upload image.", variant: "destructive" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleReact = async (messageId: number, reaction: string) => {
    try {
      await addReaction.mutateAsync({ messageId, reaction });
    } catch {}
    setActiveMessageId(null);
  };

  const handleDeleteOwn = async (messageId: number) => {
    try {
      await deleteOwnMsg.mutateAsync(messageId);
      toast({ title: "Message deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    }
    setActiveMessageId(null);
  };

  const handleAdminDelete = async (messageId: number) => {
    try {
      await deleteGroupMsg.mutateAsync(messageId);
      toast({ title: "Message deleted by admin" });
    } catch {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    }
    setActiveMessageId(null);
  };

  const submitReport = async () => {
    if (!reportTarget) return;
    setReportBusy(true);
    try {
      await apiRequest("POST", `/api/users/${reportTarget.userId}/report`, {
        reason: reportReason.trim(),
        evidence: [{ type: "group_message", id: reportTarget.messageId }],
      });
      toast({ title: "Report sent", description: "Our team will review it." });
      setReportTarget(null);
      setReportReason("");
    } catch {
      toast({ title: "Could not send report", variant: "destructive" });
    } finally {
      setReportBusy(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
    setActiveMessageId(null);
  };

  if (!groupId || isNaN(groupId)) {
    setLocation("/lounge");
    return null;
  }

  return (
    <div className="h-dvh flex flex-col" style={{ background: INK }}>
      <div
        className="px-4 py-3 flex items-center gap-3 sticky top-0 z-50"
        style={{
          background: SURFACE2,
          borderBottom: `1px solid ${LINE}`,
        }}
      >
        <button
          onClick={() => setLocation("/lounge")}
          className="w-9 h-9 flex items-center justify-center btn-press rounded-full transition-colors"
          style={{ color: EMBER, background: "transparent" }}
          data-testid="button-back-lounge"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => setLocation(`/lounge/group/${groupId}/info`)}
          className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
          style={{ background: SURFACE2, border: `1px solid ${LINE}` }}
          data-testid="img-group-avatar"
        >
          {group?.iconUrl ? (
            <img src={group.iconUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span style={{ ...SERIF, color: TEXT, fontSize: "15px" }}>{(group?.name || "G")[0].toUpperCase()}</span>
          )}
        </button>
        <button
          onClick={() => setLocation(`/lounge/group/${groupId}/info`)}
          className="flex-1 min-w-0 text-left"
          data-testid="button-open-group-header"
        >
          <h2 className="truncate" style={{ ...SERIF, color: TEXT, fontSize: "18px" }} data-testid="text-group-name">
            {group?.name || "Group"}
          </h2>
          <p style={{ ...MONO, color: MUTED, marginTop: "2px" }}>
            {group?.memberCount || 0} members
          </p>
        </button>
        <button
          onClick={() => setLocation(`/lounge/group/${groupId}/info`)}
          className="w-9 h-9 flex items-center justify-center btn-press rounded-full transition-colors"
          style={{ color: MUTED, background: "transparent" }}
          data-testid="button-group-info"
        >
          <Info className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1" onClick={() => setActiveMessageId(null)}>
        {msgsLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: EMBER }} />
          </div>
        ) : messages && messages.length > 0 ? (
          messages.map((msg: any, idx: number) => {
            const isMe = msg.userId === user?.id;
            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const showDate = idx === 0 || !isSameDay(prevMsg!.createdAt, msg.createdAt);
            const groupedWithPrev = !!prevMsg && !showDate && prevMsg.userId === msg.userId && isSameDay(prevMsg.createdAt, msg.createdAt);
            const isDeleted = msg.isDeletedByAdmin || msg.deletedForEveryone;
            const repliedMsg = msg.replyToMessageId ? messagesMap[msg.replyToMessageId] : null;

            const groupedReactions: Record<string, number> = {};
            msg.reactions?.forEach((r: any) => {
              groupedReactions[r.reaction] = (groupedReactions[r.reaction] || 0) + 1;
            });

            const initials = (msg.nickname || "?")[0]?.toUpperCase();

            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="flex justify-center my-4">
                    <span
                      style={{
                        fontSize: "11px",
                        color: MUTED,
                        background: SURFACE2,
                        borderRadius: "100px",
                        padding: "2px 12px",
                        border: `1px solid ${LINE}`,
                      }}
                      data-testid={`date-separator-${idx}`}
                    >
                      {formatDateSeparator(msg.createdAt)}
                    </span>
                  </div>
                )}

                <div
                  id={`msg-${msg.id}`}
                  className={`flex ${isMe ? "justify-end" : "justify-start"} ${groupedWithPrev ? "mb-0.5" : "mb-2"} transition-all duration-500`}
                  style={highlightedMsgId === msg.id ? { background: "hsl(var(--vf-ember) / 0.12)", borderRadius: "12px", marginLeft: "-8px", marginRight: "-8px", paddingLeft: "8px", paddingRight: "8px" } : undefined}
                  data-testid={`message-${msg.id}`}
                >
                  {!isMe && (
                    groupedWithPrev ? (
                      <div className="w-8 mr-2 shrink-0" />
                    ) : (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mr-2 self-end"
                        style={{ background: avatarColor(msg.userId), fontSize: "12px", fontWeight: 600, color: "#FFFFFF" }}
                      >
                        {initials}
                      </div>
                    )
                  )}

                  <div className="max-w-[75%]">
                    {!isMe && !groupedWithPrev && (
                      <span
                        className="flex items-center gap-1 ml-1 mb-0.5"
                        style={{ fontSize: "12.5px", color: MUTED, fontWeight: 500 }}
                        data-testid={`nickname-${msg.id}`}
                      >
                        {msg.nickname || "Anonymous"}
                        {msg.subscriptionTier === "vip" && (
                          <Crown className="w-3 h-3 shrink-0" style={{ color: TEXT }} />
                        )}
                        {genderLabel(msg.gender) && (
                          <span
                            className="font-mono uppercase tracking-[0.08em]"
                            style={{ fontSize: "9.5px", color: FAINT }}
                            data-testid={`gender-${msg.id}`}
                          >
                            · {genderLabel(msg.gender)}
                          </span>
                        )}
                      </span>
                    )}

                    <Popover
                      open={activeMessageId === msg.id && !isDeleted}
                      onOpenChange={(open) => {
                        if (!isDeleted) setActiveMessageId(open ? msg.id : null);
                      }}
                    >
                      <PopoverTrigger asChild>
                        <div
                          className={`px-4 py-2.5 text-sm leading-relaxed break-words ${isDeleted ? "" : "cursor-pointer"}`}
                          style={{
                            borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                            ...(isDeleted
                              ? { background: ELEVATED, color: MUTED, fontStyle: "italic" }
                              : isMe
                                ? {
                                    background: EMBER,
                                    color: "hsl(var(--vf-ink))",
                                    fontWeight: 500,
                                  }
                                : {
                                    background: ELEVATED,
                                    color: TEXT,
                                  }),
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isDeleted) setActiveMessageId(activeMessageId === msg.id ? null : msg.id);
                          }}
                        >
                          {repliedMsg && !isDeleted && (
                            <div
                              className="mb-1.5 p-1.5"
                              style={{
                                borderRadius: "6px",
                                borderLeft: isMe ? "2px solid rgba(255,255,255,0.4)" : "2px solid hsl(var(--vf-ember))",
                                background: isMe ? "rgba(255,255,255,0.1)" : "hsl(var(--vf-ember) / 0.12)",
                                fontSize: "12px",
                              }}
                            >
                              <span className="font-medium" style={{ color: isMe ? "rgba(255,255,255,0.9)" : EMBER }}>
                                {repliedMsg.nickname || "Anonymous"}
                              </span>
                              <p className="truncate" style={{ color: isMe ? "rgba(255,255,255,0.7)" : MUTED }}>
                                {repliedMsg.content}
                              </p>
                            </div>
                          )}
                          {isDeleted ? (
                            "[Message deleted]"
                          ) : msg.contentType === "image" && msg.mediaUrl ? (
                            <img src={msg.mediaUrl} alt="shared" className="rounded-lg max-w-[250px] max-h-[300px] object-cover" data-testid={`image-${msg.id}`} />
                          ) : msg.contentType === "video" && msg.mediaUrl ? (
                            <video src={msg.mediaUrl} className="rounded-lg max-w-[250px] max-h-[300px]" controls data-testid={`video-${msg.id}`} />
                          ) : msg.contentType === "poll" ? (
                            <PollBubble messageId={msg.id} groupId={groupId} />
                          ) : msg.contentType === "game" ? (
                            <GameBubble messageId={msg.id} groupId={groupId} />
                          ) : parseDestiraLink(msg.content) ? (
                            <LinkPreviewCard content={msg.content} />
                          ) : (
                            msg.content
                          )}
                        </div>
                      </PopoverTrigger>
                      {!isDeleted && (
                        <PopoverContent
                          className="w-auto p-2"
                          side="bottom"
                          align={isMe ? "end" : "start"}
                          collisionPadding={12}
                          style={{ background: SURFACE2, border: `1px solid ${LINE}` }}
                        >
                          <div className="flex items-center gap-1 mb-2 flex-wrap">
                            {REACTIONS.map(({ key, Icon }) => (
                              <button
                                key={key}
                                onClick={() => handleReact(msg.id, key)}
                                className="w-8 h-8 rounded-full flex items-center justify-center btn-press transition-colors"
                                style={{ color: MUTED }}
                                data-testid={`reaction-${key}-${msg.id}`}
                              >
                                <Icon className="w-4 h-4" />
                              </button>
                            ))}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            {((): MessageAction[] => [
                              {
                                icon: <Reply className="w-4 h-4 mr-2" />,
                                label: "Reply",
                                onClick: () => { setReplyTo(msg); setActiveMessageId(null); },
                                testId: `action-reply-${msg.id}`,
                              },
                              {
                                icon: <Star className={`w-4 h-4 mr-2 ${msg.isStarred ? "fill-yellow-400 text-yellow-400" : ""}`} />,
                                label: msg.isStarred ? "Unstar" : "Star",
                                onClick: async () => {
                                  try {
                                    if (msg.isStarred) {
                                      await unstarMessage.mutateAsync({ messageId: msg.id });
                                      toast({ title: "Message unstarred" });
                                    } else {
                                      await starMessage.mutateAsync({ messageId: msg.id });
                                      toast({ title: "Message starred" });
                                    }
                                  } catch {}
                                  setActiveMessageId(null);
                                },
                                testId: `action-star-${msg.id}`,
                              },
                              ...(msg.contentType === "text" ? [{
                                icon: <Copy className="w-4 h-4 mr-2" />,
                                label: "Copy",
                                onClick: () => handleCopy(msg.content),
                                testId: `action-copy-${msg.id}`,
                              }] : []),
                              ...(isMe ? [{
                                icon: <CheckCheck className="w-4 h-4 mr-2" />,
                                label: "Message info",
                                onClick: () => { setMessageInfoId(msg.id); setActiveMessageId(null); },
                                testId: `action-message-info-${msg.id}`,
                              }] : []),
                              ...(isMe ? [{
                                icon: <Trash2 className="w-4 h-4 mr-2" />,
                                label: "Delete",
                                onClick: () => handleDeleteOwn(msg.id),
                                testId: `action-delete-${msg.id}`,
                                danger: true,
                              }] : []),
                              ...(!isMe ? [{
                                icon: <MessageSquarePlus className="w-4 h-4 mr-2" />,
                                label: "Request Private Chat",
                                onClick: () => {
                                  paywall.guard("group_chat_request", async () => {
                                    try {
                                      const result = await createChatRequest.mutateAsync({ targetId: msg.userId, groupId });
                                      if (result.status === "matched" || result.status === "already_matched") {
                                        const matchId = result.match?.id;
                                        if (matchId) {
                                          setLocation(`/chat/${matchId}?from=/lounge/group/${groupId}`);
                                        } else {
                                          toast({ title: "You can now chat privately!" });
                                        }
                                      } else {
                                        toast({ title: "Request sent!", description: "They'll be notified of your request." });
                                      }
                                    } catch (err) {
                                      const msg = err instanceof Error ? err.message : "Failed to send request.";
                                      toast({ title: "Error", description: msg, variant: "destructive" });
                                    }
                                  });
                                  setActiveMessageId(null);
                                },
                                testId: `action-chat-request-${msg.id}`,
                              }] : []),
                              ...(!isMe ? [{
                                icon: <Flag className="w-4 h-4 mr-2" />,
                                label: "Report",
                                onClick: () => {
                                  setReportTarget({ userId: msg.userId, messageId: msg.id });
                                  setActiveMessageId(null);
                                },
                                testId: `action-report-${msg.id}`,
                                danger: true,
                              }] : []),
                              ...(isAdmin && !isMe ? [{
                                icon: <Trash2 className="w-4 h-4 mr-2" />,
                                label: "Admin Delete",
                                onClick: () => handleAdminDelete(msg.id),
                                testId: `action-admin-delete-${msg.id}`,
                                danger: true,
                              }] : []),
                            ])().map((action) => (
                              <button
                                key={action.testId}
                                onClick={action.onClick}
                                className="flex items-center w-full px-3 py-1.5 text-sm rounded-md btn-press transition-colors text-left"
                                style={{
                                  color: action.danger ? "#EF4444" : TEXT,
                                  background: "transparent",
                                }}
                                data-testid={action.testId}
                              >
                                {action.icon}
                                {action.label}
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      )}
                    </Popover>

                    {Object.keys(groupedReactions).length > 0 && (
                      <div className={`flex items-center gap-1 mt-1 flex-wrap ${isMe ? "justify-end" : "justify-start"} px-2`}>
                        {Object.entries(groupedReactions).map(([reaction, count]) => {
                          const RIcon = REACTION_ICONS[reaction];
                          return RIcon ? (
                            <span
                              key={reaction}
                              className="text-xs gap-1 px-1.5 py-0.5 flex items-center"
                              style={{ background: ELEVATED, borderRadius: "100px", border: `1px solid ${LINE}`, color: MUTED }}
                              data-testid={`reactions-${reaction}-${msg.id}`}
                            >
                              <RIcon className="w-3 h-3" /> {count}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}

                    <p
                      className={`mt-0.5 px-2 ${isMe ? "text-right" : "text-left"}`}
                      style={{ fontSize: "10px", color: MUTED }}
                    >
                      {formatTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-16 max-w-sm mx-auto">
            <p className="mb-2" style={{ ...SERIF, color: TEXT, fontSize: "22px" }}>Nothing here yet.</p>
            <p className="text-sm" style={{ color: MUTED }}>
              Say the first thing. Your twin learns most from how you are with your own people.
            </p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ background: SURFACE2, borderTop: `1px solid ${LINE}` }}>
        {isMember && (
          <div className="px-4 pt-2.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: MINT }} />
            <span style={{ ...MONO, color: MINT }}>Your twin is listening in this room</span>
          </div>
        )}
        {replyTo && (
          <div className="px-4 pt-2 flex items-center gap-2">
            <div
              className="flex-1 min-w-0 p-2 text-xs"
              style={{ background: ELEVATED, borderRadius: "8px", borderLeft: `2px solid ${EMBER}` }}
            >
              <span className="font-medium" style={{ color: EMBER }}>{replyTo.nickname || "Anonymous"}</span>
              <p className="truncate" style={{ color: MUTED }}>{replyTo.content}</p>
            </div>
            <button
              className="w-7 h-7 flex items-center justify-center btn-press rounded-full"
              style={{ color: MUTED, background: "transparent" }}
              onClick={() => setReplyTo(null)}
              data-testid="button-cancel-reply"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="p-3">
          {groupLoading ? (
            // Group membership hasn't loaded yet — showing the join button
            // here (isMember defaults false pre-load) would flash "Join
            // Group to Chat" at existing members for a moment on every
            // visit, so this stays neutral until the real answer is in.
            <div className="w-full flex items-center justify-center" style={{ height: "48px" }}>
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: MUTED }} />
            </div>
          ) : !isMember ? (
            <button
              className="w-full flex items-center justify-center gap-2 font-semibold btn-press"
              onClick={handleJoin}
              disabled={joinGroup.isPending}
              style={{
                background: EMBER,
                color: "hsl(var(--vf-ink))",
                height: "48px",
                borderRadius: "12px",
                border: "none",
              }}
              data-testid="button-join-group"
            >
              {joinGroup.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Users className="w-5 h-5" />}
              {group?.privacyMode === "request-to-join" ? "Request to Join" : "Join Group to Chat"}
            </button>
          ) : (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            >
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
                data-testid="input-file-upload"
              />
              <button
                type="button"
                className="w-9 h-9 flex items-center justify-center btn-press rounded-full"
                style={{ color: MUTED, background: "transparent" }}
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-attach"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                type="button"
                className="w-9 h-9 flex items-center justify-center btn-press rounded-full"
                style={{ color: MUTED, background: "transparent" }}
                onClick={() => setShowPollDialog(true)}
                data-testid="button-poll"
              >
                <BarChart3 className="w-4 h-4" />
              </button>
              <button
                type="button"
                className="w-9 h-9 flex items-center justify-center btn-press rounded-full"
                style={{ color: MUTED, background: "transparent" }}
                onClick={() => setShowGameDialog(true)}
                data-testid="button-game"
              >
                <Dices className="w-4 h-4" />
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 text-sm outline-none"
                style={{
                  background: ELEVATED,
                  borderRadius: "100px",
                  border: `1px solid ${LINE}`,
                  color: TEXT,
                  height: "40px",
                }}
                data-testid="input-group-message"
              />
              <button
                type="submit"
                disabled={!input.trim() || sendMessage.isPending}
                className="flex items-center justify-center btn-press shrink-0"
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  background: input.trim() ? EMBER : ELEVATED,
                  border: "none",
                  color: input.trim() ? "hsl(var(--vf-ink))" : MUTED,
                  transition: "all 0.2s ease",
                }}
                data-testid="button-send-group"
              >
                {sendMessage.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </form>
          )}
        </div>
      </div>

      <PollComposerDialog groupId={groupId} open={showPollDialog} onClose={() => setShowPollDialog(false)} />
      <GameComposerDialog groupId={groupId} open={showGameDialog} onClose={() => setShowGameDialog(false)} />
      <MessageInfoDialog groupId={groupId} messageId={messageInfoId} onClose={() => setMessageInfoId(null)} />
      {paywall.sheet}

      <Dialog open={!!reportTarget} onOpenChange={(v) => { if (!v) { setReportTarget(null); setReportReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this message</DialogTitle>
            <DialogDescription>This sends a record to our team for review, citing this exact message.</DialogDescription>
          </DialogHeader>
          <textarea
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            placeholder="What's going on? (optional)"
            rows={3}
            className="w-full rounded-[12px] border p-3 text-sm outline-none resize-none"
            style={{ background: ELEVATED, borderColor: LINE, color: TEXT }}
            data-testid="input-group-report-reason"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setReportTarget(null); setReportReason(""); }} data-testid="button-cancel-group-report">
              Cancel
            </Button>
            <Button onClick={submitReport} disabled={reportBusy} data-testid="button-submit-group-report">
              {reportBusy ? "Sending…" : "Send report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
