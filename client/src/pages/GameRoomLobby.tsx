// "Join Game Room" — every game currently live in a group, so several
// rounds can run at once without piling up as interactive cards in the
// main chat feed. Tapping one goes to its dedicated room (GameRoomScreen.tsx).
import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2, Plus, Users } from "lucide-react";
import { useActiveGames, useGroup } from "@/hooks/use-interactions";
import { GameComposerDialog } from "@/components/game-composer-dialog";
import { GAME_ICON_LABEL } from "@/components/game-room";

const INK = "hsl(var(--vf-ink))";
const SURFACE2 = "var(--vf-surface2)";
const LINE = "var(--vf-line)";
const MUTED = "var(--vf-muted)";
const TEXT = "hsl(var(--vf-text))";
const EMBER = "hsl(var(--vf-ember))";
const SERIF: React.CSSProperties = { fontFamily: '"Instrument Serif", serif', fontWeight: 400 };
const MONO: React.CSSProperties = { fontFamily: '"DM Mono", ui-monospace, monospace', fontSize: "10.5px" };

export default function GameRoomLobby({ params }: { params?: { groupId?: string } }) {
  const groupId = Number(params?.groupId);
  const [, setLocation] = useLocation();
  const { data: group } = useGroup(groupId);
  const { data, isLoading } = useActiveGames(groupId);
  const [showComposer, setShowComposer] = useState(false);
  const games = data?.games ?? [];

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: INK }}>
      <div
        className="px-4 py-3 flex items-center gap-3 sticky top-0 z-50"
        style={{ background: SURFACE2, borderBottom: `1px solid ${LINE}` }}
      >
        <button
          onClick={() => setLocation(`/lounge/group/${groupId}`)}
          className="w-9 h-9 flex items-center justify-center btn-press rounded-full transition-colors"
          style={{ color: EMBER, background: "transparent" }}
          data-testid="button-back-group"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 style={{ ...SERIF, color: TEXT, fontSize: "18px" }}>Game Room</h2>
          <p className="truncate" style={{ ...MONO, color: MUTED, marginTop: "2px" }}>{group?.name || "Group"}</p>
        </div>
        <button
          onClick={() => setShowComposer(true)}
          className="inline-flex items-center gap-1.5 font-semibold px-3.5 h-9 rounded-full btn-press"
          style={{ background: EMBER, color: INK }}
          data-testid="button-new-game"
        >
          <Plus className="w-4 h-4" /> New game
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: EMBER }} />
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-16 max-w-sm mx-auto">
            <p className="mb-2" style={{ ...SERIF, color: TEXT, fontSize: "22px" }}>Nothing live right now.</p>
            <p className="text-sm mb-5" style={{ color: MUTED }}>
              Start a round and everyone in the group can jump in from here.
            </p>
            <button
              onClick={() => setShowComposer(true)}
              className="inline-flex items-center gap-2 font-semibold px-5 h-11 rounded-full btn-press"
              style={{ background: EMBER, color: INK }}
              data-testid="button-new-game-empty"
            >
              <Plus className="w-4 h-4" /> Start a game
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {games.map((g: any) => (
              <button
                key={g.id}
                onClick={() => setLocation(`/lounge/group/${groupId}/games/${g.id}`)}
                className="w-full flex items-center gap-3 text-left p-3.5 transition-colors hover:brightness-110"
                style={{ borderRadius: 14, border: `1px solid ${LINE}`, background: SURFACE2 }}
                data-testid={`active-game-${g.id}`}
              >
                <span className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0" style={{ background: "hsl(var(--vf-ember) / 0.14)" }}>
                  {GAME_ICON_LABEL[g.kind] || "🎮"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold" style={{ color: TEXT }}>{g.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: MUTED }}>Started by {g.startedByNickname}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 font-mono text-xs px-2.5 py-1 rounded-full" style={{ color: EMBER, background: "hsl(var(--vf-ember) / 0.12)" }}>
                  <Users className="w-3.5 h-3.5" /> {g.participantCount}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <GameComposerDialog
        groupId={groupId}
        open={showComposer}
        onClose={() => setShowComposer(false)}
        onCreated={(gameId) => setLocation(`/lounge/group/${groupId}/games/${gameId}`)}
      />
    </div>
  );
}
