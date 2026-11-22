// Messages waiting in the outbox (lib/outbox.ts), shown at the end of the
// conversation in the member's own bubble style, faded, with their state.
import { useSyncExternalStore } from "react";
import { Clock, AlertCircle, X, Mic, EyeOff, Loader2 } from "lucide-react";
import { removeItem, useOutbox, type OutboxItem, type OutboxKind } from "@/lib/outbox";
import { clock, useQueuedFile } from "@/lib/dm-media";

function useOnline() {
  return useSyncExternalStore(
    (l) => {
      window.addEventListener("online", l);
      window.addEventListener("offline", l);
      return () => {
        window.removeEventListener("online", l);
        window.removeEventListener("offline", l);
      };
    },
    () => navigator.onLine,
  );
}

function QueuedBody({ item }: { item: OutboxItem }) {
  const url = useQueuedFile(item.op === "photo" ? item.id : undefined);
  if (item.op === "photo") {
    return (
      <div className="relative">
        {url ? (
          <img src={url} alt="" className="block max-h-[260px] max-w-[220px] rounded-[18px] object-cover opacity-70" />
        ) : (
          <div className="w-[180px] h-[180px] rounded-[18px] bg-vf-surface" />
        )}
        {item.viewOnce && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
            <EyeOff className="w-3 h-3" /> View once
          </span>
        )}
      </div>
    );
  }
  if (item.op === "voice") {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-[18px] rounded-br-[6px] bg-vf-ember/60 text-vf-ink font-medium text-sm">
        <Mic className="w-4 h-4" /> Voice note · {clock(item.durationMs ?? 0)}
      </div>
    );
  }
  return (
    <div className="max-w-[80%] px-4 py-2.5 text-sm leading-relaxed break-words rounded-[18px] rounded-br-[6px] bg-vf-ember/60 text-vf-ink font-medium">
      {item.content}
    </div>
  );
}

export function OutboxBubbles({ kind, targetId }: { kind: OutboxKind; targetId: number }) {
  const online = useOnline();
  // Reactions show on their message (DirectChat), not down here.
  const pending = useOutbox(kind, targetId).filter((i) => i.op !== "react");
  if (pending.length === 0) return null;
  return (
    <>
      {pending.map((item) => (
        <div key={item.id} className="flex flex-col items-end gap-1" data-testid="outbox-message" data-op={item.op ?? "text"}>
          <QueuedBody item={item} />
          {item.failed ? (
            <button
              onClick={() => removeItem(item.id)}
              className="inline-flex items-center gap-1 text-[11.5px] text-red-500"
              data-testid="outbox-remove"
            >
              <AlertCircle className="w-3 h-3" /> Couldn't be sent · Remove <X className="w-3 h-3" />
            </button>
          ) : online ? (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-vf-muted">
              <Loader2 className="w-3 h-3 animate-spin" /> Sending
            </span>
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
