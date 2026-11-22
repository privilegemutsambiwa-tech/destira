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
import { Heart, Loader2, X } from "lucide-react";
import { CrownBadge, CROWN_GRADIENT } from "@/components/crown-badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { motion, useReducedMotion } from "framer-motion";
import { MatchCelebration, Portrait } from "@/components/match-celebration";
import { useProfile, useSuggestedLounges } from "@/hooks/use-profiles";
import { withFrom } from "@/lib/from-route";
import { EmptyState, UnderlineTabs, VfAvatar, VfButton, VfSkeleton } from "@/components/ui-vf";
import { avatarColor } from "@/lib/avatar-color";
import { haptic } from "@/lib/haptics";

type TabType = "waiting" | "asked";

// One name per thing (docs/destira-upgrade-prompt.md §6.2): the tab bar says
// Likes, so the page and its tabs say it too.
const TABS: { label: string; value: TabType }[] = [
  { label: "Liked you", value: "waiting" },
  { label: "You liked", value: "asked" },
];

function InterestRow({
  name,
  age,
  photoUrl,
  sub,
  right,
  onOpen,
  hoverLabel,
  testId,
}: {
  name: string;
  age?: number | null;
  photoUrl?: string | null;
  /** One honest line under the name (a status, a city). */
  sub?: string | null;
  right: React.ReactNode;
  /** When set, the avatar + name/score area becomes a target that opens the profile. */
  onOpen?: () => void;
  /** Replaces the mono right-hand label on row hover (You asked tab). */
  hoverLabel?: string;
  testId?: string;
}) {
  const identity = (
    <>
      <VfAvatar size={52} name={name} seed={testId} src={photoUrl ?? undefined} />
      <div className="flex-1 min-w-0 text-left">
        <p className="font-display text-[19px] leading-tight text-vf-text truncate">
          {name}
          {age ? <span className="text-vf-muted">, {age}</span> : null}
        </p>
        {sub && <p className="vf-small text-vf-muted truncate mt-0.5">{sub}</p>}
      </div>
    </>
  );

  return (
    <div
      className={`group flex items-center gap-3.5 rounded-[18px] px-2 py-2.5 transition-colors duration-150 hover:bg-vf-surface ${onOpen ? "focus-within:bg-vf-surface" : ""}`}
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
            <span className="hidden group-hover:inline vf-label text-vf-text">
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
      className="vf-press inline-flex items-center justify-center rounded-full bg-vf-ember text-vf-ink font-semibold px-4 min-h-[44px] text-[14px] transition-colors hover:bg-[var(--vf-ember-soft)] disabled:opacity-40"
      data-testid="button-meet"
    >
      {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Accept"}
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

/** "Liked you" as portraits (§7.11): the person first, two actions. */
function LikeCard({
  like,
  onOpen,
  onPass,
  onLike,
  busy,
  index,
}: {
  like: any;
  onOpen?: () => void;
  onPass: () => void;
  onLike: () => void;
  busy: boolean;
  index: number;
}) {
  const reduce = useReducedMotion();
  const name: string = like.profile?.displayName || "Someone";
  const first = name.split(/\s+/)[0];
  const photo: string | null = like.profile?.coverPhotoUrl || like.profile?.photoUrl || null;
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.04, duration: 0.24 }}
      className="relative rounded-[20px] overflow-hidden border border-vf-line bg-vf-surface2 aspect-[4/5]"
      data-testid={`row-like-${like.matchId}`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 w-full h-full text-left"
        aria-label={`Open ${name}'s profile`}
        data-testid={`row-like-${like.matchId}-open`}
      >
        {photo ? (
          <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center" style={{ background: avatarColor(like.fromUserId) }}>
            <span className="font-display text-white/85 text-[56px]">{first[0]?.toUpperCase()}</span>
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-vf-scrim to-transparent" />
        <span className="absolute left-3 right-3 bottom-[60px] font-display text-[20px] leading-tight truncate" style={{ color: "#F5F0EA" }}>
          {first}{like.profile?.age ? `, ${like.profile.age}` : ""}
        </span>
      </button>
      <span className="absolute top-2.5 right-2.5">
        <CrownBadge userId={like.fromUserId} onPhoto size={26} />
      </span>
      <div className="absolute left-2 right-2 bottom-2 flex gap-2">
        <button
          onClick={onPass}
          disabled={busy}
          className="vf-press w-11 h-11 shrink-0 rounded-full flex items-center justify-center backdrop-blur-md disabled:opacity-50"
          style={{ background: "rgba(12,9,16,.55)", color: "#F5F0EA", border: "1px solid rgba(255,255,255,.18)" }}
          aria-label={`Pass on ${first}`}
          data-testid="button-pass"
        >
          <X className="w-5 h-5" />
        </button>
        <button
          onClick={onLike}
          disabled={busy}
          className="vf-press flex-1 h-11 rounded-full inline-flex items-center justify-center gap-1.5 bg-vf-ember text-vf-ink font-semibold text-[14px] disabled:opacity-50"
          aria-label={`Like ${first} back`}
          data-testid="button-meet"
        >
          <Heart className="w-4 h-4" fill="currentColor" strokeWidth={0} /> Like back
        </button>
      </div>
    </motion.div>
  );
}

/** Free members: the count is real, the faces wait (§7.11). */
function MaskedLikes({ count, onPlans }: { count: number; onPlans: () => void }) {
  const tiles = Math.min(Math.max(count, 2), 6);
  return (
    <div data-testid="masked-asks">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: tiles }).map((_, i) => (
          <div
            key={i}
            className="relative rounded-[20px] overflow-hidden border border-vf-line aspect-[4/5]"
            aria-hidden="true"
          >
            <div
              className="absolute inset-0 scale-125 blur-xl opacity-80"
              style={{ background: `radial-gradient(circle at ${30 + (i * 17) % 40}% ${35 + (i * 23) % 30}%, hsl(var(--vf-ember) / .55), transparent 60%), radial-gradient(circle at 70% 75%, hsl(var(--vf-mint) / .35), transparent 55%), var(--vf-surface2)` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-[20px] border border-vf-gold/35 bg-vf-gold/[0.06] p-5">
        <p className="vf-h3 text-vf-text">
          {count === 1 ? "Someone likes you." : `${count} people like you.`}
        </p>
        <p className="vf-small text-vf-muted mt-1.5">
          They're also mixed into your Discover: like them there and it's a match straight away. Spark shows you exactly who, so you can decide here.
        </p>
        <VfButton variant="premium" size="sm" className="mt-4" onClick={onPlans} data-testid="button-see-who-asked">
          See Spark
        </VfButton>
      </div>
    </div>
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
  // Crown introductions: a like with a note, shown with who sent it on every
  // plan (server/crown-perks.ts).
  const qc = useQueryClient();
  const { data: intros = [] } = useQuery<Intro[]>({ queryKey: ["/api/crown/intros/incoming"] });

  const waitingCount = likes.length + pendingRequests.length + intros.length;
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

  const acceptIntro = async (intro: Intro) => {
    await acceptLike({ matchId: intro.matchId, fromUserId: intro.fromUserId, profile: { displayName: intro.displayName, photoUrl: intro.photoUrl } });
    qc.invalidateQueries({ queryKey: ["/api/crown/intros/incoming"] });
  };
  const declineIntro = async (intro: Intro) => {
    await passLike(intro.matchId);
    qc.invalidateQueries({ queryKey: ["/api/crown/intros/incoming"] });
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
            {intros.length > 0 && (
              <div className="mb-6" data-testid="list-intros">
                <div className="vf-label text-vf-faint mb-2">Introductions</div>
                <div className="flex flex-col gap-3">
                  {intros.map((intro) => (
                    <IntroCard
                      key={`intro-${intro.matchId}`}
                      intro={intro}
                      onOpen={() => setLocation(withFrom(`/u/${intro.fromUserId}`, "/matches"))}
                      onAccept={() => { haptic.like(); acceptIntro(intro); }}
                      onDecline={() => { haptic.pass(); declineIntro(intro); }}
                      busy={respondToMatch.isPending || likeBack.isPending}
                    />
                  ))}
                </div>
              </div>
            )}
            {incoming?.seeWhoAsked === false && likes.some((l: any) => l.masked) ? (
              <MaskedLikes count={likes.length} onPlans={() => setLocation(withFrom("/plans?feature=see_who_asked", "/matches"))} />
            ) : likes.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {likes.map((like: any, i: number) => (
                  <LikeCard
                    key={`like-${like.matchId}`}
                    like={like}
                    index={i}
                    onOpen={like.fromUserId ? () => setLocation(withFrom(`/u/${like.fromUserId}`, "/matches")) : undefined}
                    onPass={() => { haptic.pass(); passLike(like.matchId); }}
                    onLike={() => { haptic.like(); acceptLike(like); }}
                    busy={respondToMatch.isPending || likeBack.isPending}
                  />
                ))}
              </div>
            ) : null}
            {pendingRequests.length > 0 && (
              <div className="mt-6">
                <div className="vf-label text-vf-faint mb-2">Want to chat</div>
                {pendingRequests.map((req: any) => (
                  <InterestRow
                    key={`req-${req.id}`}
                    name={req.senderNickname || "Someone"}
                    photoUrl={req.senderAvatarUrl}
                    sub="Asked to chat from a Lounge"
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
            )}
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
                  sub={ask.status === "matched" ? "It's mutual" : ask.status === "pending" ? "Waiting for them" : "Not this time"}
                  onOpen={ask.toUserId ? () => setLocation(withFrom(`/u/${ask.toUserId}`, "/matches")) : undefined}
                  hoverLabel={status.action ? undefined : her ? "Her profile →" : "Their profile →"}
                  testId={`row-ask-${ask.matchId}`}
                  right={
                    status.action ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); status.action!(); }}
                        className="vf-press text-[14px] font-medium text-vf-ember hover:text-vf-text px-3 min-h-[44px] transition-colors"
                        data-testid="button-open-chat"
                      >
                        Chat →
                      </button>
                    ) : (
                      <span className="vf-label text-vf-faint">{status.label}</span>
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

type Intro = {
  matchId: number;
  fromUserId: string;
  note: string;
  createdAt: string;
  displayName: string | null;
  age: number | null;
  location: string | null;
  isVerified: boolean | null;
  photoUrl: string | null;
};

/** A Crown introduction: who, their note, and two plain choices. Declining
 *  is silent; they aren't told. */
function IntroCard({ intro, onOpen, onAccept, onDecline, busy }: { intro: Intro; onOpen: () => void; onAccept: () => void; onDecline: () => void; busy: boolean }) {
  const name = intro.displayName || "Someone";
  return (
    <div className="rounded-[20px] p-[1.5px]" style={{ background: CROWN_GRADIENT }} data-testid={`card-intro-${intro.matchId}`}>
      <div className="rounded-[18.5px] bg-vf-surface p-4">
        <button onClick={onOpen} className="flex items-center gap-3 text-left w-full">
          {intro.photoUrl ? (
            <img src={intro.photoUrl} alt="" className="w-14 h-14 rounded-full object-cover shrink-0" />
          ) : (
            <VfAvatar name={name} size={56} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[16px] text-vf-text truncate">{name}{intro.age ? `, ${intro.age}` : ""}</span>
              <CrownBadge userId={intro.fromUserId} size={22} />
            </div>
            <div className="text-[12.5px] text-vf-muted truncate">
              {intro.isVerified ? "Verified" : ""}{intro.isVerified && intro.location ? " · " : ""}{intro.location ?? ""}
            </div>
          </div>
        </button>
        <p className="mt-3 text-[15px] text-vf-text leading-[1.5] whitespace-pre-line" data-testid="text-intro-note">"{intro.note}"</p>
        <div className="mt-4 flex gap-2">
          <VfButton variant="secondary" className="flex-1" disabled={busy} onClick={onDecline} data-testid={`button-decline-intro-${intro.matchId}`}>
            Not for me
          </VfButton>
          <VfButton className="flex-1" disabled={busy} onClick={onAccept} leading={<Heart className="w-4 h-4" fill="currentColor" strokeWidth={0} />} data-testid={`button-accept-intro-${intro.matchId}`}>
            Like back
          </VfButton>
        </div>
        <p className="mt-2 text-[11.5px] text-vf-faint text-center">If it's not for you, they won't be told.</p>
      </div>
    </div>
  );
}
