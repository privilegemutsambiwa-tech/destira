// A game's room: Game Night's stage. Always dark and lit in the game's own
// colours (components/games/game-theme.ts). Top to bottom: who's here and
// who has locked in, the round itself (components/games/game-play.tsx), the
// next round once this one is over, and a small chat for just this room
// with one-tap reactions.
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, LayoutGrid, Loader2, RotateCcw, Send } from "lucide-react";
import {
  useGameById, useJoinGame, useGameMessages, useSendGameMessage, useActiveGames, useCreateGame,
} from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
import { haptic } from "@/lib/haptics";
import { GamePlay } from "@/components/games/game-play";
import { Confetti, Face, Presence, secondsLeft, useNow } from "@/components/games/game-fx";
import { STAGE, instantSetup, stageBackground, themeFor, tileBackground } from "@/components/games/game-theme";

const REACTIONS = ["😂", "🔥", "😮", "👏", "💀", "❤️"];
// Kinds whose starter hosts the round rather than playing it.
const HOSTED = new Set(["two_truths_one_lie", "emoji_charades"]);

function TimeChip({ revealAt, color }: { revealAt: string; color: string }) {
  const end = new Date(revealAt).getTime();
  const now = useNow(500);
  const urgent = end - now < 10_000;
  return (
    <span
      className="font-mono text-[12px] tabular-nums px-2.5 py-1.5 rounded-full"
      style={{ color: urgent ? "#fff" : STAGE.cream, background: urgent ? "#E5484D" : `${color}33`, border: `1px solid ${urgent ? "#E5484D" : `${color}66`}` }}
      role="timer"
      data-testid="game-countdown"
    >
      {secondsLeft(end, now)}
    </span>
  );
}

export default function GameRoomScreen({ params }: { params?: { groupId?: string; gameId?: string } }) {
  const groupId = Number(params?.groupId);
  const gameId = Number(params?.gameId);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: state, isLoading } = useGameById(gameId);
  const join = useJoinGame();
  const { data: messagesData } = useGameMessages(gameId);
  const sendMessage = useSendGameMessage(gameId);
  const { data: lobby } = useActiveGames(groupId);
  const createGame = useCreateGame(groupId);
  const [input, setInput] = useState("");
  const [burst, setBurst] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasAutoJoined = useRef(false);
  const lastStatus = useRef<string | null>(null);

  // Opening a live room means you're in: no separate join step.
  useEffect(() => {
    if (state && !state.isParticipant && state.status === "active" && !hasAutoJoined.current) {
      hasAutoJoined.current = true;
      join.mutate(gameId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, gameId]);

  // The reveal, seen live: confetti and a buzz.
  useEffect(() => {
    if (!state) return;
    if (lastStatus.current === "active" && state.status === "revealed" && !state.endedEmpty) {
      setBurst((n) => n + 1);
      haptic.success();
    }
    lastStatus.current = state.status;
  }, [state?.status, state]);

  // A different room in the same screen (play again) starts fresh.
  useEffect(() => {
    hasAutoJoined.current = false;
    lastStatus.current = null;
  }, [gameId]);

  const messages = messagesData?.messages ?? [];
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length]);

  const send = async (text: string) => {
    if (!text.trim()) return;
    haptic.send();
    try {
      await sendMessage.mutateAsync(text);
    } catch {
      // Put a typed message back so it isn't lost; reactions just drop.
      if (!REACTIONS.includes(text)) setInput((cur) => cur || text);
    }
  };

  if (isLoading || !state) {
    return (
      <div className="h-dvh flex items-center justify-center" style={{ background: STAGE.ink }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: STAGE.cream }} />
      </div>
    );
  }

  const t = themeFor(state.kind);
  const revealed = state.status === "revealed";
  // Someone already started the next round of this game: point everyone at it.
  const nextLive = revealed
    ? (lobby?.games ?? []).find(
        (g: any) => g.kind === state.kind && g.id !== state.id && state.createdAt && new Date(g.createdAt) > new Date(state.createdAt),
      )
    : null;

  const playAgain = async () => {
    haptic.tick();
    try {
      const next = await createGame.mutateAsync({ kind: state.kind, setup: instantSetup(state.kind) });
      setLocation(`/lounge/group/${groupId}/games/${next.id}`);
    } catch {
      setLocation(`/lounge/group/${groupId}/games`);
    }
  };

  return (
    <div className="h-dvh flex flex-col relative overflow-hidden" style={{ background: stageBackground(t), colorScheme: "dark" }} data-testid="game-stage">
      <Confetti fire={burst} colors={[t.a, t.b]} />

      {/* Header */}
      <div className="relative z-10 px-3 pt-3 pb-2 flex items-center gap-2.5">
        <button
          onClick={() => setLocation(`/lounge/group/${groupId}/games`)}
          aria-label="Back to Game Night"
          className="vf-press w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ background: STAGE.glass, color: STAGE.cream, border: `1px solid ${STAGE.line}` }}
          data-testid="button-back-lobby"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="w-10 h-10 rounded-[13px] flex items-center justify-center text-[20px] shrink-0" style={{ background: tileBackground(t), boxShadow: `0 8px 24px -10px ${t.a}` }} aria-hidden="true">
          {t.glyph}
        </span>
        <div className="flex-1 min-w-0">
          <h1 className="truncate font-display text-[20px] leading-tight" style={{ color: STAGE.cream }}>{t.name}</h1>
          <div className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em]" style={{ color: revealed ? STAGE.faint : STAGE.mint }}>
            {!revealed && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: STAGE.mint }} />}
            {revealed ? "Round over" : "Live"} · by {state.startedByNickname}
          </div>
        </div>
        {!revealed && state.revealAt ? <TimeChip revealAt={state.revealAt} color={t.a} /> : null}
      </div>

      {/* Stage */}
      <div className="relative z-10 flex-1 overflow-y-auto vf-scroll">
        <div className="max-w-[560px] mx-auto px-5 pb-6">
          {!revealed && (
            <div className="py-3 flex justify-center">
              <Presence participants={state.participants} answered={state.answered ?? []} accent={t.a} hostId={HOSTED.has(state.kind) ? state.startedBy : undefined} />
            </div>
          )}

          <motion.section key={state.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="pt-4 pb-2" data-testid="game-surface">
            <GamePlay state={state} groupId={groupId} meId={user?.id} t={t} />
          </motion.section>

          {/* What next */}
          <AnimatePresence>
            {revealed && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="mt-8 space-y-2.5">
                {nextLive ? (
                  <button
                    onClick={() => setLocation(`/lounge/group/${groupId}/games/${nextLive.id}`)}
                    className="vf-press w-full h-14 rounded-full font-semibold text-[16px] flex items-center justify-center gap-2"
                    style={{ background: `linear-gradient(135deg, ${t.a}, ${t.b})`, color: "#fff", boxShadow: `0 14px 34px -12px ${t.a}` }}
                    data-testid="button-next-round"
                  >
                    {nextLive.startedByNickname} started the next round · Jump in <ArrowRight className="w-4 h-4" />
                  </button>
                ) : t.instant ? (
                  <button
                    onClick={playAgain}
                    disabled={createGame.isPending}
                    className="vf-press w-full h-14 rounded-full font-semibold text-[16px] flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ background: `linear-gradient(135deg, ${t.a}, ${t.b})`, color: "#fff", boxShadow: `0 14px 34px -12px ${t.a}` }}
                    data-testid="button-play-again"
                  >
                    {createGame.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Play another round
                  </button>
                ) : null}
                <button
                  onClick={() => setLocation(`/lounge/group/${groupId}/games`)}
                  className="vf-press w-full h-12 rounded-full font-medium text-[15px] flex items-center justify-center gap-2"
                  style={{ background: STAGE.glass, color: STAGE.cream, border: `1px solid ${STAGE.line}` }}
                  data-testid="button-more-games"
                >
                  <LayoutGrid className="w-4 h-4" /> Pick another game
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Room chat */}
          {messages.length > 0 && (
            <div className="mt-8 space-y-2" aria-label="Room chat">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-center pb-1" style={{ color: STAGE.faint }}>Room chat</div>
              {messages.map((m: any) => {
                const isMe = m.userId === user?.id;
                const onlyEmoji = /^\p{Extended_Pictographic}{1,3}$/u.test(m.content.trim());
                return (
                  <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex items-end gap-2 ${isMe ? "justify-end" : "justify-start"}`}>
                    {!isMe && <Face name={m.nickname} seed={m.userId} size={24} />}
                    {onlyEmoji ? (
                      <span className="text-[34px] leading-none">{m.content}</span>
                    ) : (
                      <div
                        className="max-w-[78%] px-3.5 py-2 text-[14.5px]"
                        style={{
                          borderRadius: isMe ? "18px 18px 6px 18px" : "18px 18px 18px 6px",
                          background: isMe ? `${t.a}40` : STAGE.glass,
                          border: `1px solid ${isMe ? `${t.a}66` : STAGE.line}`,
                          color: STAGE.cream,
                        }}
                      >
                        {!isMe && <div className="text-[11.5px] font-semibold mb-0.5" style={{ color: t.a }}>{m.nickname}</div>}
                        {m.content}
                      </div>
                    )}
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Reactions + chat */}
      <div className="relative z-10 px-3 pt-2 pb-3" style={{ background: "rgba(13,10,18,0.82)", borderTop: `1px solid ${STAGE.line}`, backdropFilter: "blur(14px)", paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}>
        <div className="flex gap-1.5 justify-center mb-2">
          {REACTIONS.map((r) => (
            <motion.button
              key={r}
              whileTap={{ scale: 1.35 }}
              onClick={() => send(r)}
              className="w-10 h-10 rounded-full text-[20px] flex items-center justify-center"
              style={{ background: STAGE.glass }}
              aria-label={`React ${r}`}
              data-testid={`reaction-${r}`}
            >
              {r}
            </motion.button>
          ))}
        </div>
        <form
          className="flex items-center gap-2 max-w-[560px] mx-auto"
          onSubmit={(e) => {
            e.preventDefault();
            const text = input;
            setInput("");
            send(text);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Talk to the room"
            className="flex-1 px-4 text-[15px] outline-none h-11 rounded-full"
            style={{ background: STAGE.glass, border: `1px solid ${STAGE.line}`, color: STAGE.cream }}
            data-testid="input-room-message"
          />
          <button
            type="submit"
            disabled={!input.trim() || sendMessage.isPending}
            aria-label="Send"
            className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40"
            style={{ background: input.trim() ? `linear-gradient(135deg, ${t.a}, ${t.b})` : STAGE.glass, color: "#fff" }}
            data-testid="button-send-room-message"
          >
            {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
