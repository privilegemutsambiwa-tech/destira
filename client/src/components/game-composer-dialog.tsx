// "Start a new game" — lives in the Game Room lobby (client/src/pages/GameRoomLobby.tsx).
// Pulled out of GroupChat.tsx when games moved from inline chat cards to
// opt-in rooms, so this dialog is reachable from the lobby instead of the
// composer directly.
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { useGameKinds, useGameBank, useCreateGame } from "@/hooks/use-interactions";
import { useToast } from "@/hooks/use-toast";
import { GAME_ICON_LABEL } from "@/components/game-room";

const INK = "hsl(var(--vf-ink))";
const LINE = "var(--vf-line)";
const MUTED = "var(--vf-muted)";
const TEXT = "hsl(var(--vf-text))";
const EMBER = "hsl(var(--vf-ember))";

export function GameComposerDialog({ groupId, open, onClose, onCreated }: {
  groupId: number;
  open: boolean;
  onClose: () => void;
  onCreated?: (gameId: number) => void;
}) {
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
      const state = await createGame.mutateAsync({ kind: selectedKind, setup: buildSetup() });
      toast({ title: "Game started" });
      const gameId = state.id;
      reset();
      onClose();
      onCreated?.(gameId);
    } catch (e: any) {
      toast({ title: "Couldn't start that", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Play a game</DialogTitle>
          <DialogDescription>Start a room for the group to play together.</DialogDescription>
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
