import { useEffect } from "react";
import { useLocation } from "wouter";
import { haptic } from "@/lib/haptics";
import { motion, useReducedMotion } from "framer-motion";
import { duration, ease } from "@/lib/motion";
import { VfButton } from "@/components/ui-vf";
import { Users } from "lucide-react";
import { useBackToClose } from "@/lib/back-button";
import { maybeAskForReview } from "@/lib/review-prompt";
import { useProfile, useSuggestedLounges } from "@/hooks/use-profiles";

// A real portrait, not a tiny circle — this is a page about specific
// people, and the old 44px avatar made everyone here look interchangeable.
// Falls back to the same serif-initial-on-surface2 language every other
// no-photo state in the app uses.
export function Portrait({ name, photoUrl, size = 56 }: { name: string; photoUrl?: string | null; size?: number }) {
  return (
    <div
      className="rounded-[16px] overflow-hidden shrink-0 bg-vf-surface2 border border-vf-line flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {photoUrl ? (
        <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span className="font-display text-vf-text/25" style={{ fontSize: size * 0.42 }}>{name[0]?.toUpperCase() || "?"}</span>
      )}
    </div>
  );
}

// The mutual-match moment — shown from Matches (like back) and from
// Discover (liking someone who'd already liked you) — and, since the pair is at their most
// receptive right here, the best spot to surface "meet in a group first"
// (the same shared/suggested Lounge logic DirectChat's own ongoing strip
// uses), not just as a quiet aside once the thread's already cold.
export function MatchCelebration({
  matchId,
  otherUserId,
  otherName,
  otherPhotoUrl,
  onClose,
}: {
  matchId: number;
  otherUserId?: string;
  otherName: string;
  otherPhotoUrl?: string | null;
  onClose: () => void;
}) {
  const [, setLocation] = useLocation();
  const { data: myProfile } = useProfile();
  const { lounges } = useSuggestedLounges(otherUserId);
  // Android back closes the moment instead of leaving the screen under it.
  useBackToClose(true, onClose);
  // Their first match is when we ask for a Play Store rating: once the
  // moment has closed and they've landed, never over it.
  useEffect(() => () => { window.setTimeout(() => void maybeAskForReview(), 1500); }, []);
  // The match is felt as well as seen (docs/destira-upgrade-prompt.md §4.6).
  useEffect(() => {
    haptic.match();
  }, []);
  const reduce = useReducedMotion();
  const firstName = otherName.trim().split(/\s+/)[0] || otherName;
  // Escape closes it, like any other dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const top = lounges[0];
  const rest = lounges.slice(1);

  const goToChat = () => {
    onClose();
    setLocation(`/chat/${matchId}?from=/matches`);
  };
  const goToLounge = (id: number) => {
    onClose();
    setLocation(`/lounge/group/${id}`);
  };

  // The match moment (docs/destira-upgrade-prompt.md §5.5): the two of you
  // arrive from either side and meet in the middle, a ring goes out, then
  // the words, then what to do. Under a second, felt as well as seen, and
  // just a fade for anyone who's asked for less motion.
  const calm = !!reduce;
  const fromSide = (dir: -1 | 1) =>
    calm ? { opacity: 0 } : { opacity: 0, x: dir * 70, rotate: dir * 8, scale: 0.9 };
  const rise = (delay: number) => ({
    initial: calm ? { opacity: 0 } : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: calm ? 0 : delay, duration: duration.small, ease: ease.standard },
  });

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-6"
      // Theme ground, not a fixed near-black: the text below uses theme
      // tokens, so a fixed dark scrim made the heading unreadable in light mode.
      style={{ background: "hsl(var(--vf-ink) / .94)", backdropFilter: "blur(16px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-title"
      data-testid="modal-match-celebration"
    >
      <div className="w-full max-w-[400px] text-center" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex items-center justify-center mb-8 h-[132px]">
          {!calm && (
            <motion.span
              aria-hidden="true"
              className="absolute w-[150px] h-[150px] rounded-full border-2 border-vf-ember"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: [0, 0.7, 0], scale: [0.5, 1, 1.9] }}
              transition={{ delay: 0.36, duration: 0.9, ease: ease.standard }}
            />
          )}
          <motion.div
            className="relative z-[1] -mr-4"
            initial={fromSide(-1)}
            animate={{ opacity: 1, x: 0, rotate: -6, scale: 1 }}
            transition={calm ? { duration: duration.small } : { type: "spring", stiffness: 260, damping: 20 }}
          >
            <div className="rounded-[19px] p-[3px] bg-vf-ink vf-e2"><Portrait name={myProfile?.displayName || "You"} photoUrl={(myProfile as any)?.coverPhotoUrl} size={112} /></div>
          </motion.div>
          <motion.div
            className="relative z-[2] -ml-4"
            initial={fromSide(1)}
            animate={{ opacity: 1, x: 0, rotate: 6, scale: 1 }}
            transition={calm ? { duration: duration.small } : { type: "spring", stiffness: 260, damping: 20, delay: 0.06 }}
          >
            <div className="rounded-[19px] p-[3px] bg-vf-ink vf-e2"><Portrait name={otherName} photoUrl={otherPhotoUrl} size={112} /></div>
          </motion.div>
        </div>

        <motion.div {...rise(0.42)}>
          <div className="vf-label text-vf-ember mb-2">It's mutual</div>
          <h1 id="match-title" className="vf-display text-vf-text mb-2">
            You and {firstName}.
          </h1>
          <p className="vf-body text-vf-muted mb-7">You both said yes. The first message is the hardest part, so keep it simple.</p>
        </motion.div>

        {top && (
          <motion.div {...rise(0.56)} className="rounded-[16px] border border-vf-line bg-vf-surface px-4 py-3 mb-5 text-left flex items-start gap-2.5">
            <Users className="w-4 h-4 text-vf-faint shrink-0 mt-0.5" />
            <p className="vf-small text-vf-muted">
              {top.reason === "mutual" ? (
                <>You're both in <span className="text-vf-text">{top.name}</span>, a lower-pressure place to start.</>
              ) : top.reason === "their-interest" ? (
                <>{firstName} is in <span className="text-vf-text">{top.name}</span>. Looks like your kind of thing too.</>
              ) : (
                <><span className="text-vf-text">{top.name}</span> could be a good place to meet in a group first.</>
              )}
              {rest.length > 0 && (
                <>
                  {" "}Also worth a look:{" "}
                  {rest.map((l, i) => (
                    <span key={l.id}>
                      <button
                        onClick={() => goToLounge(l.id)}
                        className="text-vf-ember hover:text-vf-text underline underline-offset-2 transition-colors"
                        data-testid={`link-celebration-lounge-${l.id}`}
                      >
                        {l.name}
                      </button>
                      {i < rest.length - 1 ? ", " : ""}
                    </span>
                  ))}
                  .
                </>
              )}
            </p>
          </motion.div>
        )}

        <motion.div {...rise(0.64)} className="flex flex-col gap-2">
          <VfButton size="lg" fullWidth onClick={goToChat} data-testid="button-celebration-chat">
            Say hello to {firstName}
          </VfButton>
          {top && (
            <VfButton variant="secondary" fullWidth onClick={() => goToLounge(top.id)} data-testid="button-celebration-lounge">
              Meet in {top.name} first
            </VfButton>
          )}
          <VfButton variant="quiet" size="sm" fullWidth onClick={onClose} data-testid="button-celebration-later">
            Keep looking
          </VfButton>
        </motion.div>
      </div>
    </div>
  );
}
