// The Pass / Interview / Like controls on Discover, kept within thumb reach
// the whole time someone reads a card. It used to sit at the very end of the
// card's read pane, so on a phone you had to scroll past everything to act.
//
// Sticky rather than fixed: it rides the bottom of the screen while the card
// is on screen and settles under it at the end, and on desktop it stays
// aligned with the content column instead of the whole window.
import { motion, AnimatePresence } from "framer-motion";
import { X, Heart, Brain, Loader2, RotateCcw, Star } from "lucide-react";

interface DecisionDockProps {
  name: string;
  onPass: () => void;
  onLike: () => void;
  onInterview: () => void;
  busy: boolean;
  likePending: boolean;
  interviewPending: boolean;
  /** Set for a few seconds after a pass, so it can be taken back. */
  undo: { name: string; onUndo: () => void } | null;
  /** Bring back the last pass (free right after it, a rewind later). */
  onRewind: () => void;
  rewindPending: boolean;
  /** A like they see first (server/discover-perks.ts). */
  onSuperLike: () => void;
  superPending: boolean;
}

export function DecisionDock({ name, onPass, onLike, onInterview, busy, likePending, interviewPending, undo, onRewind, rewindPending, onSuperLike, superPending }: DecisionDockProps) {
  const first = name.trim().split(/\s+/)[0] || "them";
  return (
    <div
      className="sticky z-40 flex flex-col items-center gap-2 pointer-events-none bottom-[calc(76px+env(safe-area-inset-bottom,0px))] md:bottom-6"
      data-testid="decision-dock"
    >
      <AnimatePresence>
        {undo && (
          <motion.div
            key="undo"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto flex items-center gap-3 rounded-full bg-vf-text text-vf-ink pl-4 pr-1.5 py-1.5 shadow-lg text-[13.5px]"
            role="status"
            data-testid="undo-pass"
          >
            <span>Passed on {undo.name.split(/\s+/)[0]}</span>
            <button
              onClick={undo.onUndo}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-vf-ink/10 font-semibold hover:bg-vf-ink/15 transition-colors"
              data-testid="button-undo-pass"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="pointer-events-auto w-full max-w-[440px] flex items-center gap-2 [@media(min-width:380px)]:gap-2.5 rounded-full border border-vf-line bg-vf-surface/90 backdrop-blur-md p-2 shadow-[0_12px_40px_rgba(12,9,16,0.28)]"
        role="group"
        aria-label={`Decide on ${first}`}
      >
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onRewind}
          disabled={rewindPending}
          className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-vf-muted hover:text-vf-text hover:bg-vf-text/5 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-vf-ember"
          aria-label="Bring back the last person you passed on"
          title="Rewind (Z)"
          data-testid="button-rewind"
        >
          {rewindPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-[18px] h-[18px]" />}
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onPass}
          disabled={busy}
          className="shrink-0 w-14 h-14 rounded-full flex items-center justify-center bg-vf-surface2 border-[1.5px] border-vf-text/20 text-vf-text hover:border-vf-text/40 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-vf-ember"
          aria-label={`Pass on ${first}`}
          title="Pass (←)"
          data-testid="button-pass"
        >
          <X className="w-6 h-6" strokeWidth={2.25} />
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onInterview}
          disabled={interviewPending}
          className="flex-1 min-w-0 h-14 rounded-full flex items-center justify-center gap-2 border border-vf-mint/35 bg-vf-mint/10 text-vf-mint font-semibold text-[14.5px] hover:bg-vf-mint/15 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-vf-mint"
          title="Interview their twin (I)"
          data-testid="button-interview"
        >
          {interviewPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4 shrink-0" />}
          {/* Long names would be cut mid-word, and a small phone has no room
              for a name at all. */}
          <span className="truncate hidden [@media(min-width:420px)]:inline">{first.length > 9 ? "Ask their twin" : `Ask ${first}'s twin`}</span>
          <span className="[@media(min-width:420px)]:hidden">Ask twin</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onSuperLike}
          disabled={busy || superPending}
          className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center border border-vf-ember/45 text-vf-ember bg-vf-ember/10 hover:bg-vf-ember/15 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-vf-ember"
          aria-label={`Super like ${first}: they see you first`}
          title="Super like: they see you first"
          data-testid="button-super-like"
        >
          {superPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-[18px] h-[18px]" fill="currentColor" strokeWidth={0} />}
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onLike}
          disabled={busy || likePending}
          className="shrink-0 w-16 h-16 -my-1 rounded-full flex items-center justify-center bg-vf-ember text-vf-ink hover:bg-[var(--vf-ember-soft)] shadow-[0_8px_22px_rgba(255,107,74,0.35)] transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-vf-text"
          aria-label={`Like ${first}`}
          title="Like (→)"
          data-testid="button-like"
        >
          {likePending ? <Loader2 className="w-6 h-6 animate-spin" /> : <Heart className="w-7 h-7" fill="currentColor" strokeWidth={0} />}
        </motion.button>
      </div>

      <p className="hidden lg:block text-[11.5px] text-vf-faint font-mono tracking-[0.06em]" aria-hidden="true">
        ← pass · → like · I interview · Z undo or rewind
      </p>
    </div>
  );
}
