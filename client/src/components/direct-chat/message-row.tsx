import { Fragment } from "react";
import { motion } from "framer-motion";
import { parseDestiraLink } from "@/lib/link-preview";
import { LinkPreviewCard } from "@/components/link-preview-card";
import { DmSpecialBody, MessageActions, ReactionChips } from "@/components/dm-message";
import { DateCard } from "@/components/date-plan";
import { dayLabel, sameDay, timeLabel, when } from "./chat-utils";

type Reaction = { userId: string; emoji: string };

/** One message in a direct chat: a day separator when the day changes,
 *  the bubble (grouped with its neighbours from the same sender), its
 *  reactions, and the actions or "Seen" under it. */
export function MessageRow({
  msg,
  prev,
  next,
  myId,
  isMyLast,
  otherLastReadAt,
  showActions,
  editingThis,
  otherFirst,
  reduce,
  reactions,
  onToggleActions,
  onShowActions,
  onPlan,
  onChanged,
  onReact,
  onEdit,
  onUnsend,
  onReport,
}: {
  msg: any;
  prev?: any;
  next?: any;
  myId?: string;
  isMyLast: boolean;
  otherLastReadAt: Date | null;
  showActions: boolean;
  editingThis: boolean;
  otherFirst: string;
  reduce: boolean | null;
  reactions: Reaction[];
  onToggleActions: () => void;
  onShowActions: () => void;
  onPlan: () => void;
  onChanged: () => void;
  onReact: (emoji: string | null) => void;
  onEdit: () => void;
  onUnsend: () => void;
  onReport: () => void;
}) {
  const isMe = msg.senderId === myId;
  const at = when(msg);
  const prevAt = prev ? when(prev) : null;
  const nextAt = next ? when(next) : null;
  const newDay = !prevAt || !sameDay(prevAt, at);
  // Grouped: same sender, same day, within five minutes.
  const joinsPrev = !!prev && !newDay && prev.senderId === msg.senderId && at.getTime() - prevAt!.getTime() < 5 * 60_000;
  const joinsNext = !!next && nextAt && sameDay(at, nextAt) && next.senderId === msg.senderId && nextAt.getTime() - at.getTime() < 5 * 60_000;
  const link = parseDestiraLink(msg.content);
  const showTime = showActions;
  const seen = isMyLast && otherLastReadAt && otherLastReadAt.getTime() >= at.getTime();
  const corner = isMe
    ? `rounded-[20px] ${joinsPrev ? "rounded-tr-[6px]" : ""} ${joinsNext ? "rounded-br-[6px]" : ""}`
    : `rounded-[20px] ${joinsPrev ? "rounded-tl-[6px]" : ""} ${joinsNext ? "rounded-bl-[6px]" : ""}`;
  return (
    <Fragment>
      {newDay && (
        <div className="vf-label text-vf-faint text-center my-4" data-testid="day-separator">{dayLabel(at)}</div>
      )}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className={`flex flex-col ${isMe ? "items-end" : "items-start"} ${joinsPrev ? "mt-0.5" : newDay ? "" : "mt-3"}`}
      >
        {msg.unsentAt || (msg.contentType && msg.contentType !== "text") ? (
          <div
            className={`max-w-[80%] ${msg.pending ? "opacity-70" : ""}`}
            // Tapping the bubble (not its play button or photo) shows the actions;
            // a long press works on a photo too.
            onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) onToggleActions(); }}
            onContextMenu={(e) => { e.preventDefault(); onShowActions(); }}
            data-testid={`message-${msg.id}`}
          >
            {msg.contentType === "date" && msg.plan ? (
              <DateCard plan={msg.plan} isMe={isMe} otherFirst={otherFirst} onSuggestAnother={onPlan} />
            ) : (
              <DmSpecialBody msg={msg} isMe={isMe} corner={corner} onChanged={onChanged} />
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggleActions}
            className={`text-left max-w-[80%] px-4 py-2.5 text-[15px] leading-[1.45] break-words whitespace-pre-wrap ${corner} ${msg.pending ? "opacity-70" : ""} ${
              isMe
                ? "bg-vf-ember/[0.16] border border-vf-ember/25 text-vf-text"
                : "bg-vf-surface border border-vf-line text-vf-text"
            } ${editingThis ? "ring-2 ring-vf-ember/50" : ""}`}
            data-testid={`message-${msg.id}`}
          >
            {link ? <LinkPreviewCard content={msg.content} /> : msg.content}
          </button>
        )}
        {!msg.pending && (
          <ReactionChips
            reactions={reactions}
            myId={myId}
            isMe={isMe}
            onTap={(e) => onReact(reactions.some((r) => r.userId === myId && r.emoji === e) ? null : e)}
          />
        )}
        {showTime && !msg.pending ? (
          <MessageActions
            msg={msg}
            isMe={isMe}
            myReaction={reactions.find((r) => r.userId === myId)?.emoji}
            onReact={(e) => onReact(e)}
            onEdit={onEdit}
            onUnsend={onUnsend}
            onReport={onReport}
          >
            <span>{timeLabel(at)}</span>
            {msg.editedAt && !msg.unsentAt && <span data-testid={`edited-${msg.id}`}>Edited</span>}
            {isMyLast && <span data-testid="message-state">{seen ? "Seen" : "Sent"}</span>}
          </MessageActions>
        ) : (isMyLast || (msg.editedAt && !msg.unsentAt)) && (
          <div className={`flex items-center gap-2 mt-1 px-1 font-mono text-[11px] text-vf-faint ${isMe ? "justify-end" : ""}`}>
            {msg.editedAt && !msg.unsentAt && <span data-testid={`edited-${msg.id}`}>Edited</span>}
            {isMyLast && <span data-testid="message-state">{seen ? "Seen" : "Sent"}</span>}
          </div>
        )}
      </motion.div>
    </Fragment>
  );
}
