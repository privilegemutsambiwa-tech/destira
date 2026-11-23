// "@" in a room's composer (docs/destira-3-upgrade-prompt.md Part J): the
// members whose names start with what you've typed, one tap to add them.
// The person you mention is told, unless they've muted the room.
import { mentionHandle } from "@shared/lounge";
import { VfAvatar } from "@/components/ui-vf";

type Member = { userId: string; nickname: string | null };

/** The "@fa" being typed at the end of the message, or null. */
export function mentionQuery(input: string): string | null {
  const m = input.match(/(?:^|\s)@([\p{L}\p{N}_.-]*)$/u);
  return m ? m[1] : null;
}

export function MentionPicker({ members, meId, input, onPick }: {
  members: Member[] | undefined;
  meId: string | undefined;
  input: string;
  onPick: (next: string) => void;
}) {
  const q = mentionQuery(input);
  if (q === null || !members?.length) return null;
  const needle = q.toLowerCase();
  const list = members
    .filter((m) => m.userId !== meId && m.nickname)
    .filter((m) => {
      const name = m.nickname!.toLowerCase();
      return !needle || name.startsWith(needle) || mentionHandle(name).startsWith(needle) || name.split(/\s+/).some((w) => w.startsWith(needle));
    })
    .slice(0, 5);
  if (!list.length) return null;
  return (
    <div className="px-3 pt-2" data-testid="mention-picker">
      <div className="rounded-2xl border border-vf-line bg-vf-surface2 overflow-hidden">
        {list.map((m) => (
          <button
            key={m.userId}
            type="button"
            // Keep focus in the composer.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(input.replace(/@([\p{L}\p{N}_.-]*)$/u, `@${mentionHandle(m.nickname)} `))}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--vf-elevated)]"
            data-testid={`mention-${m.userId}`}
          >
            <VfAvatar size={26} name={m.nickname!} seed={m.userId} />
            <span className="text-[14px] text-vf-text truncate">{m.nickname}</span>
            <span className="ml-auto font-mono text-[11px] text-vf-faint truncate">@{mentionHandle(m.nickname)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
