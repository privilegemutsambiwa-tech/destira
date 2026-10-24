// Messages waiting in the outbox (lib/outbox.ts), shown at the end of the
// conversation in the member's own bubble style, faded, with their state.
import { Clock, AlertCircle, X } from "lucide-react";
import { removeItem, useOutbox, type OutboxKind } from "@/lib/outbox";

export function OutboxBubbles({ kind, targetId }: { kind: OutboxKind; targetId: number }) {
  const pending = useOutbox(kind, targetId);
  if (pending.length === 0) return null;
  return (
    <>
      {pending.map((item) => (
        <div key={item.id} className="flex flex-col items-end gap-1" data-testid="outbox-message">
          <div className="max-w-[80%] px-4 py-2.5 text-sm leading-relaxed break-words rounded-[18px] rounded-br-[6px] bg-vf-ember/60 text-vf-ink font-medium">
            {item.content}
          </div>
          {item.failed ? (
            <button
              onClick={() => removeItem(item.id)}
              className="inline-flex items-center gap-1 text-[11.5px] text-red-500"
              data-testid="outbox-remove"
            >
              <AlertCircle className="w-3 h-3" /> Couldn't be sent · Remove <X className="w-3 h-3" />
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-vf-muted">
              <Clock className="w-3 h-3" /> Sends when you're back online
            </span>
          )}
        </div>
      ))}
    </>
  );
}
