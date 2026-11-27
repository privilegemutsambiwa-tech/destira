import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";

/** The twin's reply ideas above the composer. A tap puts one in the
 *  composer to edit; nothing is sent on its own. */
export function ReplySuggestions({
  open,
  loading,
  error,
  options,
  onClose,
  onPick,
}: {
  open: boolean;
  loading: boolean;
  error: string | null;
  options: string[] | null;
  onClose: () => void;
  onPick: (text: string) => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18 }}
          className="mb-2 rounded-[18px] border border-vf-mint/25 bg-vf-mint/[0.06] p-2"
          data-testid="reply-suggestions"
        >
          <div className="flex items-center justify-between px-2 pt-1 pb-1.5">
            <span className="vf-label text-vf-mint">From your twin · tap one to edit</span>
            <button onClick={onClose} className="w-8 h-8 -mr-1 flex items-center justify-center text-vf-faint hover:text-vf-text" aria-label="Close ideas">
              <X className="w-4 h-4" />
            </button>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 px-2 pb-2 vf-small text-vf-muted">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…
            </div>
          ) : error ? (
            <p className="px-2 pb-2 vf-small text-vf-muted">{error}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {options!.map((o, i) => (
                <button
                  key={i}
                  onClick={() => onPick(o)}
                  className="text-left rounded-[14px] bg-vf-surface border border-vf-line px-3.5 py-2.5 text-[14.5px] leading-[1.4] text-vf-text hover:border-vf-mint/40 transition-colors"
                  data-testid={`suggestion-${i}`}
                >
                  {o}
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
