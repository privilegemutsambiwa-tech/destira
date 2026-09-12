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
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

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

function Avatar({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  return (
    <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 bg-vf-surface2 border border-vf-line flex items-center justify-center">
      {photoUrl ? (
        <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span className="font-serif text-vf-muted text-lg">{name[0]?.toUpperCase() || "?"}</span>
      )}
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
      <Avatar name={name} photoUrl={photoUrl} />
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[15px] text-vf-text truncate">
          {name}
          {age ? <span className="text-vf-muted">, {age}</span> : null}
        </p>
        {score !== null && (
          <p className="font-serif text-vf-text leading-none mt-0.5" style={{ fontSize: "20px" }}>
            {score}
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-vf-faint ml-1.5 align-middle">
              resonance
            </span>
          </p>
        )}
      </div>
    </>
  );

  return (
    <div
      className={`group flex items-center gap-3 border-b border-vf-line last:border-b-0 min-h-[72px] py-3 transition-colors ${
        onOpen ? "rounded-[14px] px-3 -mx-3 hover:bg-white/[0.035] focus-within:bg-white/[0.035]" : ""
      }`}
      data-testid={testId}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex flex-1 min-w-0 items-center gap-3 focus:outline-none rounded-[10px] focus-visible:ring-1 focus-visible:ring-vf-line"
          data-testid={testId ? `${testId}-open` : undefined}
        >
          {identity}
        </button>
      ) : (
        <div className="flex flex-1 min-w-0 items-center gap-3">{identity}</div>
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
      className="inline-flex items-center justify-center rounded-full bg-vf-ember text-vf-ink font-bold px-5 min-h-[44px] text-[13px] btn-press transition-colors hover:bg-[var(--vf-ember-soft)] disabled:opacity-40"
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
      className="text-[13px] font-medium text-vf-muted hover:text-vf-text px-2 min-h-[44px] transition-colors disabled:opacity-40"
      data-testid="button-pass"
    >
      Pass
    </button>
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

  const { data: incoming, isLoading: incomingLoading } = useIncomingLikes();
  const { data: outgoing, isLoading: outgoingLoading } = useOutgoingLikes();
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

  const acceptLike = async (matchId: number) => {
    try {
      const r = await likeBack.mutateAsync(matchId);
      if (r?.matchId || matchId) setLocation(`/chat/${r?.matchId ?? matchId}`);
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

  const acceptRequest = async (id: number) => {
    try {
      const r = await respondChatRequest.mutateAsync({ id, action: "accept" });
      if (r?.matchId) setLocation(`/chat/${r.matchId}`);
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
              style={{ color: isActive ? "#F5F0EA" : "#A79FB4" }}
              data-testid={`tab-${tab.value}`}
            >
              {tab.label}
              {count > 0 && (
                <span className="ml-1.5 font-mono text-[11px] text-vf-faint">{count}</span>
              )}
              {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-vf-ember rounded-full" />}
            </button>
          );
        })}
      </div>

      {activeTab === "waiting" && (
        waitingLoading ? (
          <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-vf-muted" /></div>
        ) : waitingCount === 0 ? (
          <EmptyState
            title="Nobody is waiting on you yet."
            body="Your twin is talking to people tonight. Check back tomorrow at 18:00."
          />
        ) : (
          <div data-testid="list-waiting">
            {incoming?.seeWhoAsked === false && likes.some((l: any) => l.masked) ? (
              <div className="rounded-[16px] border border-vf-line bg-vf-surface2 p-5 mb-3" data-testid="masked-asks">
                <p className="text-[15px] text-vf-text">
                  <span className="font-serif text-[22px] align-baseline">{likes.length}</span>{" "}
                  {likes.length === 1 ? "person has" : "people have"} asked to meet you.
                </p>
                <p className="text-[13px] text-vf-muted mt-1.5 leading-[1.5]">
                  Spark shows you who — names, photos, the whole profile — so you can decide.
                </p>
                <button
                  onClick={() => setLocation("/plans?feature=see_who_asked")}
                  className="mt-3 inline-flex items-center justify-center rounded-full bg-vf-ember text-vf-ink font-semibold h-9 px-4 text-[13px] btn-press transition-colors hover:bg-[var(--vf-ember-soft)]"
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
                      <MeetButton onClick={() => acceptLike(like.matchId)} pending={likeBack.isPending} />
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
                    <MeetButton onClick={() => acceptRequest(req.id)} pending={respondChatRequest.isPending} />
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
                  ? { label: "They said yes", action: () => setLocation(`/chat/${ask.matchId}`) }
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
    </LayoutShell>
  );
}
