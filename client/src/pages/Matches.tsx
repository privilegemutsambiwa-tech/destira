import { useState } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useIncomingLikes, useLikeBack, useRespondToMatch, useChatRequests, useRespondChatRequest } from "@/hooks/use-interactions";
import { Heart, Crown, Check, X, Search, Loader2, Lock, Sparkles, MessageSquarePlus } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

type TabType = "liked-you" | "you-liked" | "matches" | "chat-requests";

const TABS: { label: string; value: TabType }[] = [
  { label: "Liked You", value: "liked-you" },
  { label: "You Liked", value: "you-liked" },
  { label: "Matches", value: "matches" },
  { label: "Chat Requests", value: "chat-requests" },
];

export default function Matches() {
  const { data, isLoading } = useIncomingLikes();
  const { data: chatRequests, isLoading: crLoading } = useChatRequests();
  const respondChatRequest = useRespondChatRequest();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>("liked-you");

  const pendingIncoming = (chatRequests as any[] || []).filter(
    (r: any) => r.status === "pending" && r.isIncoming
  );

  const likes = data?.likes || [];
  const totalCount = data?.totalCount || 0;
  const isBlurred = data?.isBlurred ?? true;

  return (
    <LayoutShell>
      {/* Header */}
      <div className="mb-5">
        <h1 className="font-bold text-white" style={{ fontSize: "28px", letterSpacing: "-0.5px" }} data-testid="text-likes-title">
          Likes
        </h1>
        <p className="mt-1" style={{ fontSize: "14px", color: "#9090A8" }} data-testid="text-likes-count">
          {totalCount > 0 ? `${totalCount} people liked you` : "No likes yet"}
        </p>
      </div>

      {/* Tabs — Liked You | You Liked | Matches */}
      <div className="flex items-center gap-0 mb-6" style={{ borderBottom: "1px solid #2E2E42" }}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className="relative pb-3 pt-1 px-4 text-sm font-medium transition-colors"
              style={{
                color: isActive ? "#FFFFFF" : "#9090A8",
                background: "transparent",
                border: "none",
              }}
              data-testid={`tab-${tab.value}`}
            >
              {tab.label}
              {isActive && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#7C3AED" }} />
        </div>
      ) : (
        <>
          {activeTab === "liked-you" && (
            <>
              {isBlurred && totalCount > 0 && <UpgradeBanner />}
              {likes.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3" data-testid="grid-likes">
                  {likes.map((like: any) => (
                    <LikeCard key={like.id} like={like} isBlurred={isBlurred} />
                  ))}
                </div>
              ) : (
                <EmptyState message="No one has liked you yet. Keep exploring!" />
              )}
            </>
          )}

          {activeTab === "you-liked" && (
            <EmptyState message="People you've liked will appear here." icon="heart" />
          )}

          {activeTab === "matches" && (
            <EmptyState
              message="Mutual matches will appear here. Like someone back to start chatting!"
              cta={{ label: "Discover People", onClick: () => setLocation("/discover") }}
            />
          )}

          {activeTab === "chat-requests" && (
            crLoading ? (
              <div className="flex justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#7C3AED" }} />
              </div>
            ) : pendingIncoming.length === 0 ? (
              <EmptyState message="No pending chat requests from group members." icon="message" />
            ) : (
              <div className="space-y-3" data-testid="list-chat-requests">
                {pendingIncoming.map((req: any) => (
                  <ChatRequestCard
                    key={req.id}
                    req={req}
                    onAccept={async () => {
                      try {
                        const result = await respondChatRequest.mutateAsync({ id: req.id, action: "accept" });
                        toast({ title: "Accepted!", description: "Chat started." });
                        if (result?.matchId) setLocation(`/chat/${result.matchId}`);
                      } catch {
                        toast({ title: "Error", description: "Failed to accept.", variant: "destructive" });
                      }
                    }}
                    onDecline={async () => {
                      try {
                        await respondChatRequest.mutateAsync({ id: req.id, action: "decline" });
                        toast({ title: "Declined" });
                      } catch {
                        toast({ title: "Error", description: "Failed to decline.", variant: "destructive" });
                      }
                    }}
                    isPending={respondChatRequest.isPending}
                  />
                ))}
              </div>
            )
          )}
        </>
      )}
    </LayoutShell>
  );
}

function UpgradeBanner() {
  const [, setLocation] = useLocation();

  return (
    <div
      className="mb-6 p-5 text-white"
      style={{
        background: "linear-gradient(135deg, #7C3AED, #EC4899)",
        borderRadius: "20px",
        boxShadow: "0 4px 20px rgba(124,58,237,0.4)",
      }}
      data-testid="card-upgrade-banner"
    >
      <div className="flex items-start gap-3">
        <Crown className="w-7 h-7 shrink-0 mt-0.5" />
        <div className="flex-1">
          <h2 className="font-bold mb-1" style={{ fontSize: "16px" }}>See who likes you</h2>
          <p className="mb-4" style={{ fontSize: "13px", color: "rgba(255,255,255,0.85)" }}>
            Upgrade to Plus or VIP to see clear photos and names of people who liked you
          </p>
          <button
            onClick={() => setLocation("/upgrade")}
            className="btn-press font-semibold px-4 py-2"
            style={{
              background: "rgba(255,255,255,0.95)",
              color: "#7C3AED",
              fontSize: "14px",
              borderRadius: "10px",
              border: "none",
            }}
            data-testid="button-upgrade-now"
          >
            <Sparkles className="w-4 h-4 inline mr-1" />
            Upgrade Now
          </button>
        </div>
      </div>
    </div>
  );
}

function LikeCard({ like, isBlurred }: { like: any; isBlurred: boolean }) {
  const [, setLocation] = useLocation();
  const likeBack = useLikeBack();
  const respondToMatch = useRespondToMatch();
  const { toast } = useToast();

  const profile = like.profile || like.otherProfile || {};
  const displayName = profile.displayName || "Someone";
  const age = profile.age;
  const photoUrl = profile.coverPhotoUrl || profile.photoUrl;

  const handleAccept = async () => {
    try {
      await likeBack.mutateAsync(like.id);
      toast({ title: "It's a match!", description: `You and ${displayName} liked each other!` });
    } catch {
      toast({ title: "Error", description: "Failed to like back.", variant: "destructive" });
    }
  };

  const handleDecline = async () => {
    try {
      await respondToMatch.mutateAsync({ matchId: like.id, action: "reject" });
      toast({ title: "Declined", description: "No worries, they won't be notified." });
    } catch {
      toast({ title: "Error", description: "Failed to decline.", variant: "destructive" });
    }
  };

  if (isBlurred) {
    return (
      <div
        className="relative cursor-pointer overflow-hidden"
        onClick={() => setLocation("/upgrade")}
        style={{ borderRadius: "16px", aspectRatio: "1/1", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}
        data-testid={`card-like-blurred-${like.id}`}
      >
        <div className="absolute inset-0" style={{ filter: "blur(10px)" }}>
          {photoUrl ? (
            <img src={photoUrl} alt="Blurred" className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full"
              style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)" }}
            />
          )}
        </div>
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.25)" }}>
          <div
            className="px-3 py-1.5 flex items-center gap-1"
            style={{ background: "rgba(255,255,255,0.95)", borderRadius: "10px" }}
          >
            <Lock className="w-3 h-3" style={{ color: "#7C3AED" }} />
            <span className="font-semibold text-xs" style={{ color: "#7C3AED" }}>Unlock</span>
          </div>
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 p-2"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75), transparent)" }}
        >
          <p className="text-white font-bold text-sm">???</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden"
      style={{ borderRadius: "16px", aspectRatio: "1/1", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}
      data-testid={`card-like-${like.id}`}
    >
      {photoUrl ? (
        <img src={photoUrl} alt={displayName} className="w-full h-full object-cover" />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)" }}
        >
          <span className="font-bold text-white/30" style={{ fontSize: "48px" }}>{displayName[0]}</span>
        </div>
      )}

      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 30%, transparent 70%)" }}
      />

      <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between">
        <p className="text-white font-bold text-sm leading-tight" data-testid={`text-name-${like.id}`}>
          {displayName}
        </p>
        {age && (
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>{age}</p>
        )}
      </div>

      {/* Accept / Decline */}
      <div className="absolute top-2 right-2 flex gap-1">
        <button
          className="w-8 h-8 rounded-full flex items-center justify-center btn-press"
          style={{ background: "rgba(34,197,94,0.2)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.4)" }}
          onClick={handleAccept}
          disabled={likeBack.isPending}
          data-testid={`button-accept-${like.id}`}
        >
          {likeBack.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </button>
        <button
          className="w-8 h-8 rounded-full flex items-center justify-center btn-press"
          style={{ background: "rgba(239,68,68,0.2)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.4)" }}
          onClick={handleDecline}
          disabled={respondToMatch.isPending}
          data-testid={`button-decline-${like.id}`}
        >
          {respondToMatch.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

function ChatRequestCard({
  req,
  onAccept,
  onDecline,
  isPending,
}: {
  req: any;
  onAccept: () => void;
  onDecline: () => void;
  isPending: boolean;
}) {
  const expiresAt = req.expiresAt ? new Date(req.expiresAt) : null;
  const isExpired = expiresAt && expiresAt < new Date();

  return (
    <div
      className="flex items-center gap-4 p-4"
      style={{ background: "#1A1A24", border: "1px solid #2E2E42", borderRadius: "16px" }}
      data-testid={`card-chat-request-${req.id}`}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 font-bold text-white"
        style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)", fontSize: "18px" }}
      >
        {(req.senderNickname || "?")[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white truncate" style={{ fontSize: "15px" }} data-testid={`text-cr-sender-${req.id}`}>
          {req.senderNickname || "Someone"}
        </p>
        <p className="text-xs truncate" style={{ color: "#9090A8" }}>
          {isExpired ? "Expired" : expiresAt ? `Expires ${expiresAt.toLocaleDateString()}` : "Wants to chat privately"}
        </p>
      </div>
      {!isExpired && (
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onAccept}
            disabled={isPending}
            className="w-9 h-9 rounded-full flex items-center justify-center btn-press"
            style={{ background: "rgba(34,197,94,0.15)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.3)" }}
            data-testid={`button-accept-cr-${req.id}`}
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          </button>
          <button
            onClick={onDecline}
            disabled={isPending}
            className="w-9 h-9 rounded-full flex items-center justify-center btn-press"
            style={{ background: "rgba(239,68,68,0.15)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.3)" }}
            data-testid={`button-decline-cr-${req.id}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyState({
  message,
  icon = "heart",
  cta,
}: {
  message: string;
  icon?: "heart" | "search" | "message";
  cta?: { label: string; onClick: () => void };
}) {
  const [, setLocation] = useLocation();

  return (
    <div className="text-center py-20 px-6">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
        style={{ background: icon === "heart" ? "rgba(236,72,153,0.15)" : "rgba(124,58,237,0.15)" }}
      >
        {icon === "heart" ? (
          <Heart className="w-10 h-10" style={{ color: "#EC4899" }} />
        ) : icon === "message" ? (
          <MessageSquarePlus className="w-10 h-10" style={{ color: "#7C3AED" }} />
        ) : (
          <Search className="w-10 h-10" style={{ color: "#7C3AED" }} />
        )}
      </div>
      <p className="max-w-xs mx-auto mb-8" style={{ fontSize: "15px", color: "#9090A8" }} data-testid="text-empty-title">
        {message}
      </p>
      {cta && (
        <button
          onClick={cta.onClick}
          className="font-semibold btn-press px-8 py-3 text-white"
          style={{
            background: "linear-gradient(135deg, #7C3AED, #EC4899)",
            height: "48px",
            fontSize: "15px",
            borderRadius: "14px",
            border: "none",
            boxShadow: "0 4px 20px rgba(124,58,237,0.4)",
          }}
          data-testid="button-discover"
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
