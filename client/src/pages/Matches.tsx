import { LayoutShell } from "@/components/layout-shell";
import { useIncomingLikes, useLikeBack, useRespondToMatch } from "@/hooks/use-interactions";
import { Button } from "@/components/ui/button";
import { Heart, Crown, Check, X, Search, Loader2, Lock, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function Matches() {
  const { data, isLoading } = useIncomingLikes();
  const [, setLocation] = useLocation();

  const likes = data?.likes || [];
  const totalCount = data?.totalCount || 0;
  const isBlurred = data?.isBlurred ?? true;

  return (
    <LayoutShell>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display font-bold text-[#1F2937]" style={{ fontSize: "28px" }} data-testid="text-likes-title">
          Likes
        </h1>
        <p className="text-[#6B7280] mt-1" style={{ fontSize: "14px" }} data-testid="text-likes-count">
          {totalCount > 0 ? `${totalCount} people liked you` : "No likes yet"}
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#7C3AED" }} />
        </div>
      ) : (
        <>
          {isBlurred && totalCount > 0 && <UpgradeBanner />}

          {likes.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3" data-testid="grid-likes">
              {likes.map((like: any) => (
                <LikeCard key={like.id} like={like} isBlurred={isBlurred} />
              ))}
            </div>
          ) : (
            <EmptyState />
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
      className="mb-6 rounded-2xl p-5 text-white"
      style={{ background: "linear-gradient(135deg, #EC4899, #7C3AED)" }}
      data-testid="card-upgrade-banner"
    >
      <div className="flex items-start gap-3">
        <Crown className="w-7 h-7 shrink-0 mt-0.5" />
        <div className="flex-1">
          <h2 className="font-bold mb-1" style={{ fontSize: "16px" }}>See who likes you</h2>
          <p className="text-white/85 mb-4" style={{ fontSize: "13px" }}>
            Upgrade to Plus or VIP to see clear photos and names of people who liked you
          </p>
          <button
            onClick={() => setLocation("/upgrade")}
            className="btn-press font-semibold px-4 py-2 rounded-lg bg-white"
            style={{ color: "#7C3AED", fontSize: "14px" }}
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
        className="relative cursor-pointer overflow-hidden rounded-xl"
        onClick={() => setLocation("/upgrade")}
        style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.08)", aspectRatio: "1/1" }}
        data-testid={`card-like-blurred-${like.id}`}
      >
        {/* Square image */}
        <div className="absolute inset-0" style={{ filter: "blur(10px)" }}>
          {photoUrl ? (
            <img src={photoUrl} alt="Blurred" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full gradient-bg" />
          )}
        </div>
        {/* Lock overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="bg-white/90 rounded-lg px-3 py-1.5 flex items-center gap-1">
            <Lock className="w-3 h-3 text-[#7C3AED]" />
            <span className="text-[#7C3AED] font-semibold text-xs">Unlock</span>
          </div>
        </div>
        {/* Name overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-2"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }}>
          <p className="text-white font-bold text-sm">???</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-xl"
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.08)", aspectRatio: "1/1" }}
      data-testid={`card-like-${like.id}`}
    >
      {/* Square image */}
      {photoUrl ? (
        <img src={photoUrl} alt={displayName} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full gradient-bg flex items-center justify-center">
          <span className="text-5xl font-display font-bold text-white/30">{displayName[0]}</span>
        </div>
      )}

      {/* Gradient overlay */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.65) 30%, transparent 70%)" }}
      />

      {/* Name bottom-left, age bottom-right */}
      <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between">
        <p className="text-white font-bold text-sm leading-tight" data-testid={`text-name-${like.id}`}>
          {displayName}
        </p>
        {age && (
          <p className="text-white/75 text-xs">{age}</p>
        )}
      </div>

      {/* Accept/Decline buttons */}
      <div className="absolute top-2 right-2 flex gap-1">
        <button
          className="w-8 h-8 rounded-full flex items-center justify-center btn-press"
          style={{ background: "#DCF5E5", color: "#059669" }}
          onClick={handleAccept}
          disabled={likeBack.isPending}
          data-testid={`button-accept-${like.id}`}
        >
          {likeBack.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </button>
        <button
          className="w-8 h-8 rounded-full flex items-center justify-center btn-press"
          style={{ background: "#FEE2E2", color: "#EF4444" }}
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

function EmptyState() {
  const [, setLocation] = useLocation();

  return (
    <div className="text-center py-20 px-6">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
        style={{ background: "#FCE7F3" }}
      >
        <Heart className="w-10 h-10" style={{ color: "#EC4899" }} />
      </div>
      <h3 className="font-display font-bold mb-2 text-[#1F2937]" style={{ fontSize: "22px" }} data-testid="text-empty-title">
        No likes yet
      </h3>
      <p className="text-[#6B7280] max-w-xs mx-auto mb-8" style={{ fontSize: "15px" }}>
        Keep exploring! Your perfect match is out there.
      </p>
      <button
        onClick={() => setLocation("/discover")}
        className="font-semibold btn-press px-8 py-3 rounded-lg text-white"
        style={{ background: "#7C3AED", height: "48px", fontSize: "15px", borderRadius: "8px", border: "none" }}
        data-testid="button-discover"
      >
        <Search className="w-4 h-4 inline mr-2" />
        Discover People
      </button>
    </div>
  );
}
