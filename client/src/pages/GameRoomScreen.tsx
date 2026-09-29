// A single game's dedicated room: the interactive round (GameRoomBody, the
// exact same per-kind content that used to live inline in group chat) plus
// a small text thread scoped to just the people who joined this game —
// separate from the group's main chat.
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import {
  useGameById, useJoinGame, useGameMessages, useSendGameMessage,
} from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
import { AvatarStack } from "@/components/avatar-stack";
import { RichCard, CardHeader, StatusPill, GAME_ICON_LABEL, GameRoomBody } from "@/components/game-room";

const INK = "hsl(var(--vf-ink))";
const SURFACE2 = "var(--vf-surface2)";
const ELEVATED = "var(--vf-elevated)";
const LINE = "var(--vf-line)";
const MUTED = "var(--vf-muted)";
const TEXT = "hsl(var(--vf-text))";
const EMBER = "hsl(var(--vf-ember))";
const SERIF: React.CSSProperties = { fontFamily: '"Instrument Serif", serif', fontWeight: 400 };

export default function GameRoomScreen({ params }: { params?: { groupId?: string; gameId?: string } }) {
  const groupId = Number(params?.groupId);
  const gameId = Number(params?.gameId);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: state, isLoading } = useGameById(gameId);
  const join = useJoinGame();
  const { data: messagesData } = useGameMessages(gameId);
  const sendMessage = useSendGameMessage(gameId);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasAutoJoined = useRef(false);

  // A room's whole point is opt-in play, but simply opening it (from the
  // lobby, or the chat announcement) reads as "yes, I'm in" — nobody should
  // have to find a separate join button once they're already here. Skipped
  // once revealed: there's nothing left to join.
  useEffect(() => {
    if (state && !state.isParticipant && state.status === "active" && !hasAutoJoined.current) {
      hasAutoJoined.current = true;
      join.mutate(gameId);
    }
  }, [state, gameId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesData]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const text = input;
    setInput("");
    try {
      await sendMessage.mutateAsync(text);
    } catch {
      setInput(text);
    }
  };

  if (isLoading || !state) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: INK }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: EMBER }} />
      </div>
    );
  }

  const messages = messagesData?.messages ?? [];

  return (
    <div className="h-dvh flex flex-col" style={{ background: INK }}>
      <div
        className="px-4 py-3 flex items-center gap-3 sticky top-0 z-50"
        style={{ background: SURFACE2, borderBottom: `1px solid ${LINE}` }}
      >
        <button
          onClick={() => setLocation(`/lounge/group/${groupId}/games`)}
          className="w-9 h-9 flex items-center justify-center btn-press rounded-full transition-colors"
          style={{ color: EMBER, background: "transparent" }}
          data-testid="button-back-lobby"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0" style={{ background: "hsl(var(--vf-ember) / 0.14)" }}>
          {GAME_ICON_LABEL[state.kind] || "🎮"}
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="truncate" style={{ ...SERIF, color: TEXT, fontSize: "17px" }}>{state.label}</h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <AvatarStack members={state.participants.map((p: any) => ({ nickname: p.nickname }))} max={4} size="w-4 h-4" />
            <span className="text-xs" style={{ color: MUTED }}>{state.participants.length} here</span>
          </div>
        </div>
        <StatusPill tone={state.status === "revealed" ? "mint" : "muted"}>
          {state.status === "revealed" ? "✓ Revealed" : "Live"}
        </StatusPill>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <RichCard>
          <CardHeader icon={GAME_ICON_LABEL[state.kind] || "🎮"} title={state.label} status={undefined} />
          <GameRoomBody state={state} groupId={groupId} />
        </RichCard>

        {messages.length > 0 && (
          <div className="space-y-2">
            {messages.map((m: any) => {
              const isMe = m.userId === user?.id;
              return (
                <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[80%] px-3.5 py-2 text-sm"
                    style={{
                      borderRadius: isMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      background: isMe ? EMBER : ELEVATED,
                      color: isMe ? INK : TEXT,
                    }}
                  >
                    {!isMe && <div className="text-xs font-medium mb-0.5" style={{ color: EMBER }}>{m.nickname}</div>}
                    {m.content}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="p-3" style={{ background: SURFACE2, borderTop: `1px solid ${LINE}` }}>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Chat with the room..."
            className="flex-1 px-4 py-2 text-sm outline-none"
            style={{ background: ELEVATED, borderRadius: "100px", border: `1px solid ${LINE}`, color: TEXT, height: "40px" }}
            data-testid="input-room-message"
          />
          <button
            type="submit"
            disabled={!input.trim() || sendMessage.isPending}
            className="flex items-center justify-center btn-press shrink-0"
            style={{
              width: "40px", height: "40px", borderRadius: "50%",
              background: input.trim() ? EMBER : ELEVATED,
              border: "none", color: input.trim() ? INK : MUTED,
            }}
            data-testid="button-send-room-message"
          >
            {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
