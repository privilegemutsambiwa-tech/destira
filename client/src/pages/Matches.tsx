import { useMemo, useState } from "react";
import { LayoutShell } from "@/components/layout-shell";
import {
  useIncomingLikes,
  useOutgoingLikes,
  useLikeBack,
  useRespondToMatch,
  useChatRequests,
  useRespondChatRequest,
} from "@/hooks/use-interactions";
import { Loader2, Users } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { ResonanceDial } from "@/components/resonance-dial";
import { useProfile, useSuggestedLounges } from "@/hooks/use-profiles";
import { withFrom } from "@/lib/from-route";

type TabType = "waiting" | "asked";

const TABS: { label: string; value: TabType }[] = [
  { label: "Waiting on you", value: "waiting" },
  { label: "You asked", value: "asked" },
];

/** Self-average of a profile's numeric personality traits — same basis as the
 *  server's computeResonance and Discover's getResonance. null when the profile
 *  only carries free-text answers. */
function resonanceScore(personalityProfile: unknown): number | null {
  if (!personalityProfile || typeof personalityProfile !== "object") return null;
  const nums = Object.values(personalityProfile as Record<string, unknown>).filter(
    (v): v is number => typeof v === "number",
  );
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

// A real portrait, not a tiny circle — this is a page about specific
// people, and the old 44px avatar made everyone here look interchangeable.
// Falls back to the same serif-initial-on-surface2 language every other
// no-photo state in the app uses.
function Portrait({ name, photoUrl, size = 56 }: { name: string; photoUrl?: string | null; size?: number }) {
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

// The moment that's been missing everywhere else in the app: a mutual match
// currently just drops you silently into a chat thread. This is the one
// place it's actually celebrated — and, since the pair is at their most
// receptive right here, the best spot to surface "meet in a group first"
// (the same shared/suggested Lounge logic DirectChat's own ongoing strip
// uses), not just as a quiet aside once the thread's already cold.
function MatchCelebration({
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
      style={{ background: "rgba(8,6,11,.88)", backdropFilter: "blur(14px)" }}
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

function InterestRow({
  name,
  age,
  photoUrl,
  score,
  right,
  onOpen,
  hoverLabel,
  testId,
}: {
  name: string;
  age?: number | null;
  photoUrl?: string | null;
  score: number | null;
  right: React.ReactNode;
  /** When set, the avatar + name/score area becomes a target that opens the profile. */
  onOpen?: () => void;
  /** Replaces the mono right-hand label on row hover (You asked tab). */
  hoverLabel?: string;
  testId?: string;
}) {
  const identity = (
    <>
      <Portrait name={name} photoUrl={photoUrl} />
      <div className="flex-1 min-w-0 text-left flex items-center gap-3">
        {/* The same dial used on Discover / Profile / the Landing page — one
            visual system for "resonance" everywhere it shows up, instead of
            this page inventing its own plain-number version of it. The
            number lives inside the dial; no need to also print it as text. */}
        {score !== null && <ResonanceDial score={score} size={40} />}
        <div className="min-w-0">
          <p className="text-[15.5px] text-vf-text truncate">
            {name}
            {age ? <span className="text-vf-muted">, {age}</span> : null}
          </p>
          {score !== null && (
            <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-vf-faint mt-1">
              resonance
            </p>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div
      className={`group vf-card vf-row flex items-center gap-3.5 rounded-[18px] border border-vf-line bg-vf-surface2 px-4 py-3.5 mb-3 last:mb-0 transition-colors duration-150 ${onOpen ? "focus-within:bg-vf-elevated" : ""}`}
      data-testid={testId}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex flex-1 min-w-0 items-center gap-3.5 focus:outline-none rounded-[10px] focus-visible:ring-1 focus-visible:ring-vf-line"
          data-testid={testId ? `${testId}-open` : undefined}
        >
          {identity}
        </button>
      ) : (
        <div className="flex flex-1 min-w-0 items-center gap-3.5">{identity}</div>
      )}
      <div className="flex items-center gap-2 shrink-0">
        {hoverLabel ? (
          <>
            <span className="group-hover:hidden">{right}</span>
            <span className="hidden group-hover:inline font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-text">
              {hoverLabel}
            </span>
          </>
        ) : (
          right
        )}
      </div>
    </div>
  );
}

function MeetButton({ onClick, pending }: { onClick: () => void; pending?: boolean }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={pending}
      className="vf-btn-primary inline-flex items-center justify-center rounded-full bg-vf-ember text-vf-ink font-bold px-5 min-h-[44px] text-[13px] btn-press transition-colors hover:bg-[var(--vf-ember-soft)] disabled:opacity-40"
      data-testid="button-meet"
    >
      {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Meet"}
    </button>
  );
}

function PassButton({ onClick, pending }: { onClick: () => void; pending?: boolean }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={pending}
      className="text-[13px] font-medium text-vf-muted hover:text-vf-text px-2.5 min-h-[44px] rounded-full transition-colors duration-150 hover:bg-vf-elevated disabled:opacity-40"
      data-testid="button-pass"
    >
      Pass
    </button>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="text-center py-20 px-6">
      <p className="font-serif text-vf-text mb-2" style={{ fontSize: "22px" }}>Couldn't load this.</p>
      <p className="text-sm text-vf-muted max-w-xs mx-auto">Check your connection and try again.</p>
      <button onClick={onRetry} className="mt-4 text-sm font-medium text-vf-ember" data-testid="button-retry">
        Try again
      </button>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  const [, setLocation] = useLocation();
  return (
    <div className="text-center py-20 px-6">
      <p className="font-serif text-vf-text mb-2" style={{ fontSize: "22px" }}>{title}</p>
      <p className="text-sm text-vf-muted max-w-xs mx-auto">{body}</p>
      <button
        onClick={() => setLocation("/discover")}
        className="mt-4 text-sm font-medium text-vf-ember"
        data-testid="link-discover"
      >
        Go to your read
      </button>
    </div>
  );
}

export default function Matches() {
  const [activeTab, setActiveTab] = useState<TabType>("waiting");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [celebrating, setCelebrating] = useState<{
    matchId: number;
    otherUserId?: string;
    name: string;
    photoUrl?: string | null;
  } | null>(null);

  const { data: incoming, isLoading: incomingLoading, isError: incomingError, refetch: refetchIncoming } = useIncomingLikes();
  const { data: outgoing, isLoading: outgoingLoading, isError: outgoingError, refetch: refetchOutgoing } = useOutgoingLikes();
  const { data: chatRequests, isLoading: crLoading } = useChatRequests();
  const likeBack = useLikeBack();
  const respondToMatch = useRespondToMatch();
  const respondChatRequest = useRespondChatRequest();

  const pendingRequests = useMemo(
    () => ((chatRequests as any[]) || []).filter((r) => r.status === "pending" && r.isIncoming),
    [chatRequests],
  );

  const likes = incoming?.likes || [];
  const asks = outgoing?.asks || [];

  const waitingCount = likes.length + pendingRequests.length;
  const waitingLoading = incomingLoading || crLoading;

  const err = () => toast({ title: "Something went wrong", variant: "destructive" });

  const acceptLike = async (like: any) => {
    try {
      const r = await likeBack.mutateAsync(like.matchId);
      setCelebrating({
        matchId: r?.matchId ?? like.matchId,
        otherUserId: like.fromUserId,
        name: like.profile?.displayName || "them",
        photoUrl: like.profile?.coverPhotoUrl || like.profile?.photoUrl,
      });
    } catch {
      err();
    }
  };

  const passLike = async (matchId: number) => {
    try {
      await respondToMatch.mutateAsync({ matchId, action: "reject" });
    } catch {
      err();
    }
  };

  const acceptRequest = async (req: any) => {
    try {
      const r = await respondChatRequest.mutateAsync({ id: req.id, action: "accept" });
      if (r?.matchId) {
        setCelebrating({
          matchId: r.matchId,
          otherUserId: req.requesterId,
          name: req.senderNickname || "them",
          photoUrl: req.senderAvatarUrl,
        });
      }
    } catch {
      err();
    }
  };

  const declineRequest = async (id: number) => {
    try {
      await respondChatRequest.mutateAsync({ id, action: "decline" });
    } catch {
      err();
    }
  };

  return (
    <LayoutShell>
      <div className="mb-5">
        <h1 className="font-serif font-normal text-vf-text" style={{ fontSize: "28px", letterSpacing: "-0.5px" }} data-testid="text-interest-title">
          Interest
        </h1>
      </div>

      <div className="flex items-center gap-6 mb-6 border-b border-vf-line">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.value;
          const count = tab.value === "waiting" ? waitingCount : asks.length;
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className="relative pb-3 pt-1 text-sm font-medium transition-colors"
              style={{ color: isActive ? "hsl(var(--vf-text))" : "var(--vf-muted)" }}
              data-testid={`tab-${tab.value}`}
            >
              {tab.label}
              {count > 0 && (
                <span className="ml-1.5 font-mono text-[11px] text-vf-faint">{count}</span>
              )}
              {/* A layoutId'd indicator slides between tabs instead of just
                  appearing under whichever one is active — small, but this
                  is exactly the kind of tap that should feel like something
                  moved, not like the page re-rendered. */}
              {isActive && (
                <motion.div
                  layoutId="interest-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-vf-ember rounded-full"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {activeTab === "waiting" && (
        waitingLoading ? (
          <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-vf-muted" /></div>
        ) : incomingError ? (
          <ErrorState onRetry={() => refetchIncoming()} />
        ) : waitingCount === 0 ? (
          <EmptyState
            title="Nobody is waiting on you yet."
            body="Your twin is talking to people tonight. Check back tomorrow at 18:00."
          />
        ) : (
          <div data-testid="list-waiting">
            {incoming?.seeWhoAsked === false && likes.some((l: any) => l.masked) ? (
              <div className="vf-card rounded-[16px] border border-vf-line bg-vf-surface2 p-5 mb-3" data-testid="masked-asks">
                <p className="text-[15px] text-vf-text">
                  <span className="font-serif text-[22px] align-baseline">{likes.length}</span>{" "}
                  {likes.length === 1 ? "person has" : "people have"} asked to meet you.
                </p>
                <p className="text-[13px] text-vf-muted mt-1.5 leading-[1.5]">
                  Spark shows you who — names, photos, the whole profile — so you can decide.
                </p>
                <button
                  onClick={() => setLocation(withFrom("/plans?feature=see_who_asked", "/matches"))}
                  className="vf-btn-primary mt-3 inline-flex items-center justify-center rounded-full bg-vf-ember text-vf-ink font-semibold h-9 px-4 text-[13px] btn-press transition-colors hover:bg-[var(--vf-ember-soft)]"
                  data-testid="button-see-who-asked"
                >
                  See plans
                </button>
              </div>
            ) : (
              likes.map((like: any) => (
                <InterestRow
                  key={`like-${like.matchId}`}
                  name={like.profile?.displayName || "Someone"}
                  age={like.profile?.age}
                  photoUrl={like.profile?.coverPhotoUrl || like.profile?.photoUrl}
                  score={resonanceScore(like.profile?.personalityProfile)}
                  onOpen={like.fromUserId ? () => setLocation(`/u/${like.fromUserId}`) : undefined}
                  testId={`row-like-${like.matchId}`}
                  right={
                    <>
                      <PassButton onClick={() => passLike(like.matchId)} pending={respondToMatch.isPending} />
                      <MeetButton onClick={() => acceptLike(like)} pending={likeBack.isPending} />
                    </>
                  }
                />
              ))
            )}
            {pendingRequests.map((req: any) => (
              <InterestRow
                key={`req-${req.id}`}
                name={req.senderNickname || "Someone"}
                score={null}
                testId={`row-request-${req.id}`}
                right={
                  <>
                    <PassButton onClick={() => declineRequest(req.id)} pending={respondChatRequest.isPending} />
                    <MeetButton onClick={() => acceptRequest(req)} pending={respondChatRequest.isPending} />
                  </>
                }
              />
            ))}
          </div>
        )
      )}

      {activeTab === "asked" && (
        outgoingLoading ? (
          <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-vf-muted" /></div>
        ) : outgoingError ? (
          <ErrorState onRetry={() => refetchOutgoing()} />
        ) : asks.length === 0 ? (
          <EmptyState
            title="You haven't asked anyone yet."
            body="When a read lands, ask to meet — it shows up here with where it stands."
          />
        ) : (
          <div data-testid="list-asked">
            {asks.map((ask: any) => {
              const status =
                ask.status === "matched"
                  ? { label: "They said yes", action: () => setLocation(`/chat/${ask.matchId}?from=/matches`) }
                  : ask.status === "pending"
                    ? { label: "Waiting", action: null }
                    : { label: "Passed", action: null };
              const her = ask.profile?.gender === "Female";
              return (
                <InterestRow
                  key={`ask-${ask.matchId}`}
                  name={ask.profile?.displayName || "Someone"}
                  age={ask.profile?.age}
                  photoUrl={ask.profile?.coverPhotoUrl || ask.profile?.photoUrl}
                  score={resonanceScore(ask.profile?.personalityProfile)}
                  onOpen={ask.toUserId ? () => setLocation(`/u/${ask.toUserId}`) : undefined}
                  hoverLabel={status.action ? undefined : her ? "Her profile →" : "Their profile →"}
                  testId={`row-ask-${ask.matchId}`}
                  right={
                    status.action ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); status.action!(); }}
                        className="text-[13px] font-medium text-vf-mint hover:text-vf-text px-2 min-h-[44px] transition-colors"
                        data-testid="button-open-chat"
                      >
                        {status.label} →
                      </button>
                    ) : (
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">
                        {status.label}
                      </span>
                    )
                  }
                />
              );
            })}
          </div>
        )
      )}
      {celebrating && (
        <MatchCelebration
          matchId={celebrating.matchId}
          otherUserId={celebrating.otherUserId}
          otherName={celebrating.name}
          otherPhotoUrl={celebrating.photoUrl}
          onClose={() => setCelebrating(null)}
        />
      )}
    </LayoutShell>
  );
}
