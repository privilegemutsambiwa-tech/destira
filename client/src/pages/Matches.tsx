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
import { MatchCelebration, Portrait } from "@/components/match-celebration";
import { useProfile, useSuggestedLounges } from "@/hooks/use-profiles";
import { withFrom } from "@/lib/from-route";
import { EmptyState, UnderlineTabs, VfButton, VfSkeleton } from "@/components/ui-vf";

type TabType = "waiting" | "asked";

// One name per thing (docs/destira-upgrade-prompt.md §6.2): the tab bar says
// Likes, so the page and its tabs say it too.
const TABS: { label: string; value: TabType }[] = [
  { label: "Liked you", value: "waiting" },
  { label: "You liked", value: "asked" },
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

function LikesEmpty({ title, body }: { title: string; body: string }) {
  const [, setLocation] = useLocation();
  return (
    <EmptyState
      title={title}
      body={body}
      action={
        <VfButton variant="secondary" onClick={() => setLocation("/discover")} data-testid="link-discover">
          Go to Discover
        </VfButton>
      }
    />
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
        <h1 className="vf-h1 text-vf-text" data-testid="text-interest-title">
          Likes
        </h1>
      </div>

      <UnderlineTabs
        label="Likes"
        className="mb-6"
        value={activeTab}
        onChange={setActiveTab}
        options={TABS.map((tab) => ({
          ...tab,
          count: tab.value === "waiting" ? waitingCount : asks.length,
          testId: `tab-${tab.value}`,
        }))}
      />

      {activeTab === "waiting" && (
        waitingLoading ? (
          <div className="space-y-3 py-2" aria-busy="true" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <VfSkeleton className="w-14 h-14 rounded-full" />
                <div className="flex-1 space-y-2">
                  <VfSkeleton className="h-4 w-1/3" />
                  <VfSkeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : incomingError ? (
          <ErrorState onRetry={() => refetchIncoming()} />
        ) : waitingCount === 0 ? (
          <LikesEmpty
            title="Nobody's waiting on you yet."
            body="Your twin is talking to people tonight. When someone likes you, they show up here."
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
                  They're mixed into your Discover — like them back there and it's an instant match.
                  Spark shows you exactly who, so you can decide here.
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
          <div className="space-y-3 py-2" aria-busy="true" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <VfSkeleton className="w-14 h-14 rounded-full" />
                <div className="flex-1 space-y-2">
                  <VfSkeleton className="h-4 w-1/3" />
                  <VfSkeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : outgoingError ? (
          <ErrorState onRetry={() => refetchOutgoing()} />
        ) : asks.length === 0 ? (
          <LikesEmpty
            title="You haven't liked anyone yet."
            body="When you like someone, they show up here with where it stands."
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
