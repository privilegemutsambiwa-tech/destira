import { LayoutShell } from "@/components/layout-shell";
import { useIncomingLikes, useLikeBack, useRespondToMatch } from "@/hooks/use-interactions";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heart, Crown, Check, X, Search, Loader2, Lock, Eye, Sparkles } from "lucide-react";
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
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Heart className="w-7 h-7 text-pink-500 fill-pink-500" />
          <h1 className="text-3xl font-display font-bold" data-testid="text-likes-title">Likes</h1>
        </div>
        <p className="text-muted-foreground" data-testid="text-likes-count">
          {totalCount > 0 ? `${totalCount} people liked you` : "No likes yet"}
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {isBlurred && totalCount > 0 && <UpgradeBanner />}

          {likes.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="grid-likes">
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
    <Card className="mb-6 overflow-visible border-0 bg-gradient-to-r from-pink-500 to-purple-600" data-testid="card-upgrade-banner">
      <CardContent className="p-6 text-white">
        <div className="flex items-start gap-3">
          <Crown className="w-8 h-8 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="text-lg font-bold mb-1">See who likes you</h2>
            <p className="text-sm opacity-90 mb-4">
              Upgrade to Plus or VIP to see clear photos and names of people who liked you
            </p>
            <Button
              variant="secondary"
              onClick={() => setLocation("/billing")}
              data-testid="button-upgrade-now"
            >
              <Sparkles className="w-4 h-4 mr-1" />
              Upgrade Now
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
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
  const location = profile.location;
  const photoUrl = profile.coverPhotoUrl || profile.photoUrl;

  const handleAccept = async () => {
    try {
      await likeBack.mutateAsync(like.id);
      toast({
        title: "It's a match!",
        description: `You and ${displayName} liked each other!`,
      });
    } catch {
      toast({ title: "Error", description: "Failed to like back.", variant: "destructive" });
    }
  };

  const handleDecline = async () => {
    try {
      await respondToMatch.mutateAsync({ matchId: like.id, action: "reject" });
      toast({
        title: "Declined",
        description: "No worries, they won't be notified.",
      });
    } catch {
      toast({ title: "Error", description: "Failed to decline.", variant: "destructive" });
    }
  };

  if (isBlurred) {
    return (
      <Card
        className="cursor-pointer hover-elevate"
        onClick={() => setLocation("/billing")}
        data-testid={`card-like-blurred-${like.id}`}
      >
        <CardContent className="p-4">
          <div className="relative mb-3 flex justify-center">
            <div style={{ filter: "blur(12px)" }}>
              <Avatar className="w-24 h-24">
                {photoUrl ? (
                  <AvatarImage src={photoUrl} alt="Blurred profile" />
                ) : (
                  <AvatarFallback className="text-2xl">
                    {displayName[0] || "?"}
                  </AvatarFallback>
                )}
              </Avatar>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Badge variant="secondary" className="no-default-hover-elevate">
                <Lock className="w-3 h-3 mr-1" />
                Unlock
              </Badge>
            </div>
          </div>
          <p className="font-bold text-center truncate">???</p>
          <p className="text-xs text-muted-foreground text-center truncate">
            {[age, location].filter(Boolean).join(" · ") || "Unknown"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid={`card-like-${like.id}`}>
      <CardContent className="p-4">
        <div className="mb-3 flex justify-center">
          <Avatar className="w-24 h-24">
            {photoUrl ? (
              <AvatarImage src={photoUrl} alt={displayName} />
            ) : (
              <AvatarFallback className="text-2xl">
                {displayName[0] || "?"}
              </AvatarFallback>
            )}
          </Avatar>
        </div>
        <p className="font-bold text-center truncate" data-testid={`text-name-${like.id}`}>
          {displayName}
        </p>
        <p className="text-xs text-muted-foreground text-center truncate mb-3">
          {[age, location].filter(Boolean).join(" · ") || "Unknown"}
        </p>
        <div className="flex gap-2">
          <Button
            className="flex-1 bg-green-600 border-green-700 text-white"
            onClick={handleAccept}
            disabled={likeBack.isPending}
            data-testid={`button-accept-${like.id}`}
          >
            {likeBack.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleDecline}
            disabled={respondToMatch.isPending}
            data-testid={`button-decline-${like.id}`}
          >
            {respondToMatch.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  const [, setLocation] = useLocation();

  return (
    <div className="text-center py-20 px-6">
      <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
        <Heart className="w-10 h-10 text-muted-foreground" />
      </div>
      <h3 className="text-2xl font-bold font-display mb-2" data-testid="text-empty-title">No likes yet</h3>
      <p className="text-muted-foreground max-w-md mx-auto mb-8">
        Keep exploring! Your perfect match is out there.
      </p>
      <Button size="lg" onClick={() => setLocation("/discover")} data-testid="button-discover">
        <Search className="w-4 h-4 mr-2" />
        Discover People
      </Button>
    </div>
  );
}
