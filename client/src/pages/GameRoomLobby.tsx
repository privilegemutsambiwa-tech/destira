// Game Night: a room's games. What's live right now (one tap to jump in),
// the game of the day, every game on a shelf (one tap starts it, no setup),
// and what the room played earlier. Same dark stage as the rooms themselves
// (components/games/game-theme.ts), so it feels like walking into a place.
import { useState } from "react";
import { useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2, PenLine, Users } from "lucide-react";
import { useActiveGames, useCreateGame, useGroup } from "@/hooks/use-interactions";
import { useToast } from "@/hooks/use-toast";
import { haptic } from "@/lib/haptics";
import { GameComposerDialog } from "@/components/game-composer-dialog";
import { GameNightsSection } from "@/components/game-nights";
import { GAME_ORDER, GAME_THEMES, STAGE, instantSetup, themeFor, tileBackground } from "@/components/games/game-theme";

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

/** Changes once a day (Harare time): a reason to look in again tomorrow. */
function gameOfTheDay(): string {
  const instant = GAME_ORDER.filter((k) => GAME_THEMES[k].instant);
  const day = Math.floor((Date.now() + 2 * 3600e3) / 86400e3);
  return instant[day % instant.length];
}

export default function GameRoomLobby({ params }: { params?: { groupId?: string } }) {
  const groupId = Number(params?.groupId);
  const [, setLocation] = useLocation();
  const reduce = useReducedMotion();
  const { toast } = useToast();
  const { data: group } = useGroup(groupId);
  const { data, isLoading } = useActiveGames(groupId);
  const createGame = useCreateGame(groupId);
  const [starting, setStarting] = useState<string | null>(null);
  const [composer, setComposer] = useState<{ open: boolean; kind: string | null }>({ open: false, kind: null });
  const games = data?.games ?? [];
  const recent = data?.recent ?? [];
  const featured = themeFor(gameOfTheDay());

  const start = async (kind: string) => {
    const t = themeFor(kind);
    if (!t.instant) {
      setComposer({ open: true, kind });
      return;
    }
    if (starting) return;
    haptic.tick();
    setStarting(kind);
    try {
      const state = await createGame.mutateAsync({ kind, setup: instantSetup(kind) });
      setLocation(`/lounge/group/${groupId}/games/${state.id}`);
    } catch (e: any) {
      toast({ title: "Couldn't start that", description: e?.message, variant: "destructive" });
      setStarting(null);
    }
  };

  return (
    <div
      className="min-h-dvh flex flex-col"
      style={{
        background: `radial-gradient(80% 40% at 10% 0%, #FF5A3633, transparent 60%), radial-gradient(70% 40% at 100% 10%, #8B5CF633, transparent 60%), radial-gradient(80% 50% at 50% 100%, #3B82F622, transparent 60%), ${STAGE.ink}`,
        colorScheme: "dark",
      }}
      data-testid="game-night"
    >
      {/* Header */}
      <div className="sticky top-0 z-20 px-3 pt-3 pb-3 flex items-center gap-2.5" style={{ background: "rgba(13,10,18,0.72)", backdropFilter: "blur(14px)" }}>
        <button
          aria-label="Back to the room"
          onClick={() => setLocation(`/lounge/group/${groupId}`)}
          className="vf-press w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ background: STAGE.glass, color: STAGE.cream, border: `1px solid ${STAGE.line}` }}
          data-testid="button-back-group"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] truncate" style={{ color: STAGE.faint }}>{group?.name || "Room"}</div>
          <h1 className="font-display text-[24px] leading-none mt-0.5" style={{ color: STAGE.cream }}>Game Night</h1>
        </div>
        <button
          onClick={() => setComposer({ open: true, kind: null })}
          className="vf-press inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-[13.5px] font-semibold"
          style={{ background: STAGE.glass, color: STAGE.cream, border: `1px solid ${STAGE.line}` }}
          data-testid="button-new-game"
        >
          <PenLine className="w-4 h-4" /> Write your own
        </button>
      </div>

      <div className="flex-1 w-full max-w-[640px] mx-auto px-4 pb-10 space-y-9">
        {/* Live now */}
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: STAGE.cream }} />
          </div>
        ) : games.length > 0 ? (
          <section className="pt-2">
            <div className="flex items-center gap-2 mb-3 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: STAGE.mint }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: STAGE.mint }} /> Live now
            </div>
            <div className="space-y-3">
              {games.map((g: any, i: number) => {
                const t = themeFor(g.kind);
                return (
                  <motion.button
                    key={g.id}
                    initial={reduce ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setLocation(`/lounge/group/${groupId}/games/${g.id}`)}
                    className="relative w-full overflow-hidden rounded-[26px] p-5 text-left"
                    style={{ background: tileBackground(t), boxShadow: `0 20px 44px -22px ${t.a}` }}
                    data-testid={`active-game-${g.id}`}
                  >
                    <span className="absolute -right-4 -bottom-6 text-[110px] opacity-25 select-none" aria-hidden="true">{t.glyph}</span>
                    <div className="relative flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.85)" }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Live
                    </div>
                    <div className="relative mt-2 font-display text-[30px] leading-none text-white">{t.name}</div>
                    <div className="relative mt-2 flex items-center gap-3 text-[13.5px]" style={{ color: "rgba(255,255,255,0.85)" }}>
                      <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {g.participantCount} in</span>
                      <span>by {g.startedByNickname}</span>
                    </div>
                    <span className="relative mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-[14px] font-semibold" style={{ background: "#fff", color: t.b }}>
                      Jump in <ArrowRight className="w-4 h-4" />
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </section>
        ) : null}

        <GameNightsSection groupId={groupId} />

        {/* Game of the day */}
        <section className={games.length ? "" : "pt-2"}>
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] mb-3" style={{ color: STAGE.faint }}>Game of the day</div>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => start(featured.kind)}
            disabled={!!starting}
            className="relative w-full overflow-hidden rounded-[30px] p-6 text-left min-h-[220px] flex flex-col justify-end"
            style={{ background: tileBackground(featured), boxShadow: `0 30px 60px -28px ${featured.a}` }}
            data-testid="game-of-the-day"
          >
            <motion.span
              className="absolute right-5 top-4 text-[92px] select-none"
              animate={reduce ? undefined : { rotate: [0, -6, 6, 0], y: [0, -4, 0] }}
              transition={{ repeat: Infinity, duration: 4 }}
              aria-hidden="true"
            >
              {featured.glyph}
            </motion.span>
            <div className="relative font-display text-[40px] leading-none text-white">{featured.name}</div>
            <p className="relative mt-2 text-[15px] max-w-[30ch]" style={{ color: "rgba(255,255,255,0.88)" }}>{featured.tagline}</p>
            <span className="relative mt-5 inline-flex items-center gap-2 h-12 px-6 rounded-full text-[15px] font-semibold w-fit" style={{ background: "#fff", color: featured.b }}>
              {starting === featured.kind ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Start a round <ArrowRight className="w-4 h-4" />
            </span>
          </motion.button>
          {games.length === 0 && !isLoading && (
            <p className="mt-3 text-center text-[13px]" style={{ color: STAGE.faint }}>
              Nothing live yet. Whatever you start shows up in the room's chat so everyone can jump in.
            </p>
          )}
        </section>

        {/* Every game */}
        <section>
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] mb-3" style={{ color: STAGE.faint }}>Every game · tap to start</div>
          <div className="grid grid-cols-2 gap-3">
            {GAME_ORDER.filter((k) => k !== featured.kind).map((kind, i) => {
              const t = GAME_THEMES[kind];
              const busy = starting === kind;
              return (
                <motion.button
                  key={kind}
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.035 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => start(kind)}
                  disabled={!!starting}
                  className="relative overflow-hidden rounded-[24px] p-4 text-left min-h-[172px] flex flex-col"
                  style={{ background: `linear-gradient(160deg, ${t.a}26, ${t.b}40)`, border: `1px solid ${t.a}40` }}
                  data-testid={`game-kind-${kind}`}
                >
                  <span className="w-12 h-12 rounded-[15px] flex items-center justify-center text-[26px]" style={{ background: tileBackground(t), boxShadow: `0 10px 24px -10px ${t.a}` }} aria-hidden="true">
                    {busy ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : t.glyph}
                  </span>
                  <span className="mt-3 text-[15.5px] font-semibold leading-tight" style={{ color: STAGE.cream }}>{t.name}</span>
                  <span className="mt-1 text-[12.5px] leading-snug line-clamp-2" style={{ color: STAGE.dim }}>{t.tagline}</span>
                  <span className="mt-auto pt-2 font-mono text-[10.5px] uppercase tracking-[0.14em]" style={{ color: t.a }}>
                    {t.instant ? t.length : "Write yours"}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* Earlier */}
        {recent.length > 0 && (
          <section>
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] mb-3" style={{ color: STAGE.faint }}>Earlier today · see how it went</div>
            <div className="rounded-[22px] overflow-hidden" style={{ border: `1px solid ${STAGE.line}` }}>
              {recent.map((g: any, i: number) => {
                const t = themeFor(g.kind);
                return (
                  <button
                    key={g.id}
                    onClick={() => setLocation(`/lounge/group/${groupId}/games/${g.id}`)}
                    className="w-full flex items-center gap-3 text-left px-4 py-3 transition-colors hover:bg-white/[0.04]"
                    style={{ borderTop: i ? `1px solid ${STAGE.line}` : undefined }}
                    data-testid={`recent-game-${g.id}`}
                  >
                    <span className="w-9 h-9 rounded-[11px] flex items-center justify-center text-[17px] shrink-0" style={{ background: tileBackground(t) }} aria-hidden="true">{t.glyph}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14.5px] font-medium truncate" style={{ color: STAGE.cream }}>{t.name}</div>
                      <div className="text-[12.5px]" style={{ color: STAGE.dim }}>
                        {g.responseCount === 0 ? "Nobody played" : `${g.responseCount} played`} · {timeAgo(g.revealedAt)}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 shrink-0" style={{ color: STAGE.faint }} />
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <GameComposerDialog
        groupId={groupId}
        open={composer.open}
        initialKind={composer.kind}
        onClose={() => setComposer({ open: false, kind: null })}
        onCreated={(gameId) => setLocation(`/lounge/group/${groupId}/games/${gameId}`)}
      />
    </div>
  );
}
