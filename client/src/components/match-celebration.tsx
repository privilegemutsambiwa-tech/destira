import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Users } from "lucide-react";
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
        <span className="font-serif text-vf-text/25" style={{ fontSize: size * 0.42 }}>{name[0]?.toUpperCase() || "?"}</span>
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

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-6"
      // Theme ground, not a fixed near-black — the text below uses theme
      // tokens, so a fixed dark scrim made the heading unreadable in light mode.
      style={{ background: "hsl(var(--vf-ink) / .92)", backdropFilter: "blur(14px)" }}
      onClick={goToChat}
      data-testid="modal-match-celebration"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-[400px] text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center -space-x-5 mb-6">
          <Portrait name={myProfile?.displayName || "You"} photoUrl={(myProfile as any)?.coverPhotoUrl} size={92} />
          <Portrait name={otherName} photoUrl={otherPhotoUrl} size={92} />
        </div>
        <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-mint mb-2">Mutual</div>
        <h1 className="font-serif font-normal text-[32px] text-vf-text mb-2">It's a match!</h1>
        <p className="text-[14px] text-vf-muted mb-6">You and {otherName} both want to meet.</p>

        {top && (
          <div className="rounded-[16px] border border-vf-line bg-vf-surface2 px-4 py-3 mb-4 text-left flex items-start gap-2.5">
            <Users className="w-4 h-4 text-vf-faint shrink-0 mt-0.5" />
            <p className="text-[13px] text-vf-muted leading-[1.5]">
              {top.reason === "mutual" ? (
                <>You're both in <span className="text-vf-text">{top.name}</span> — a lower-pressure place to start.</>
              ) : top.reason === "their-interest" ? (
                <>{otherName} is in <span className="text-vf-text">{top.name}</span> — looks like your kind of thing. Join to interact with them there.</>
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
          </div>
        )}

        <button
          onClick={goToChat}
          className="vf-btn-primary w-full h-12 rounded-full bg-vf-ember text-vf-ink font-bold text-[14px] btn-press hover:bg-[var(--vf-ember-soft)] transition-colors mb-2.5"
          data-testid="button-celebration-chat"
        >
          Say hello
        </button>
        {top && (
          <button
            onClick={() => goToLounge(top.id)}
            className="w-full h-11 rounded-full border border-vf-line text-vf-text text-[13.5px] font-medium hover:bg-vf-elevated transition-colors"
            data-testid="button-celebration-lounge"
          >
            Meet in {top.name} first
          </button>
        )}
      </motion.div>
    </div>
  );
}
