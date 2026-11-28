// Group chat: poll and game bubbles, the poll composer and message info (split out of pages/GroupChat.tsx).
import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Loader2, X, Plus, CheckCheck } from "lucide-react";
import { useCreatePoll, usePollByMessage, useVotePoll, useGameByMessage, useGroupMessageReadInfo } from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { RichCard, CardHeader, StatusPill, GAME_ICON_LABEL, GameProgress } from "@/components/game-room";
import { EMBER, FAINT, INK, LINE, MUTED, TEXT } from "@/components/group-chat/chat-utils";

export function PollBubble({ messageId, groupId }: { messageId: number; groupId: number }) {
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

export function PollComposerDialog({ groupId, open, onClose }: { groupId: number; open: boolean; onClose: () => void }) {
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
                  <Button variant="ghost" size="icon" onClick={() => removeOption(idx)} aria-label={`Remove option ${idx + 1}`} data-testid={`button-remove-option-${idx}`}>
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

// A game is now an opt-in room, not an inline card — this is just the
// pointer message announcing it, matching how a link preview points at a
// group invite instead of embedding the whole thing. The actual play
// surface lives at /lounge/group/:groupId/games/:gameId (GameRoomScreen).
export function GameBubble({ messageId, groupId }: { messageId: number; groupId: number }) {
  const { data: state, isLoading } = useGameByMessage(messageId);
  const [, setLocation] = useLocation();

  if (isLoading) return <Loader2 className="w-4 h-4 animate-spin" style={{ color: MUTED }} />;
  if (!state) return null;

  const revealed = state.status === "revealed";

  return (
    <RichCard testId={`game-bubble-${messageId}`}>
      <CardHeader
        icon={GAME_ICON_LABEL[state.kind] || "🎮"}
        title={state.label}
        status={<GameProgress state={state} />}
      />
      <p className="text-xs mb-3" style={{ color: MUTED }}>
        {state.startedByNickname} started this · {state.eligibleCount} playing
      </p>
      <Button
        size="sm"
        className="w-full btn-press"
        style={{ background: EMBER, color: INK, border: "none" }}
        onClick={() => setLocation(`/lounge/group/${groupId}/games/${state.id}`)}
        data-testid={`button-open-game-${state.id}`}
      >
        {revealed ? "See results" : "Join"}
      </Button>
    </RichCard>
  );
}

// Groups can have far more members than a "who's seen this" list should try
// to enumerate, so this leads with the count and only lists names up to the
// cap the API already applies — never a claim that the list is exhaustive.
export function MessageInfoDialog({ groupId, messageId, onClose }: { groupId: number; messageId: number | null; onClose: () => void }) {
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
