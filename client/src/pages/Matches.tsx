import { LayoutShell } from "@/components/layout-shell";
import { useMatches, useRespondToMatch } from "@/hooks/use-interactions";
import { Button } from "@/components/ui/button";
import { Loader2, MessageCircle, Heart, Check, X, Search } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function Matches() {
  const { data: matches, isLoading } = useMatches();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const pendingReceived = matches?.filter((m: any) => m.status === "pending" && !m.isRequester) || [];
  const pendingSent = matches?.filter((m: any) => m.status === "pending" && m.isRequester) || [];
  const matched = matches?.filter((m: any) => m.status === "matched") || [];

  return (
    <LayoutShell>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold" data-testid="text-matches-title">Your Matches</h1>
          <p className="text-muted-foreground mt-1">People you've connected with.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-8">
          {pendingReceived.length > 0 && (
            <section>
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Heart className="w-5 h-5 text-pink-500" />
                Match Requests ({pendingReceived.length})
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pendingReceived.map((match: any) => (
                  <PendingMatchCard key={match.id} match={match} />
                ))}
              </div>
            </section>
          )}

          {matched.length > 0 && (
            <section>
              <h2 className="text-lg font-bold mb-4">Matched ({matched.length})</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {matched.map((match: any) => (
                  <MatchedCard key={match.id} match={match} />
                ))}
              </div>
            </section>
          )}

          {pendingSent.length > 0 && (
            <section>
              <h2 className="text-lg font-bold mb-4 text-muted-foreground">Pending Sent ({pendingSent.length})</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pendingSent.map((match: any) => (
                  <SentMatchCard key={match.id} match={match} />
                ))}
              </div>
            </section>
          )}

          {(!matches || matches.length === 0) && <EmptyState />}
        </div>
      )}
    </LayoutShell>
  );
}

function PendingMatchCard({ match }: { match: any }) {
  const respondToMatch = useRespondToMatch();
  const { toast } = useToast();

  const handleRespond = async (action: "accept" | "reject") => {
    try {
      await respondToMatch.mutateAsync({ matchId: match.id, action });
      toast({
        title: action === "accept" ? "Match Accepted!" : "Match Declined",
        description: action === "accept"
          ? `You and ${match.otherProfile?.displayName || "this person"} are now connected! You can start chatting.`
          : "No worries, they won't be notified.",
      });
    } catch (e) {
      toast({ title: "Error", description: "Failed to respond.", variant: "destructive" });
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 border border-pink-200 shadow-sm" data-testid={`card-pending-match-${match.id}`}>
      <div className="flex items-center gap-4 mb-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-100 to-purple-100 flex items-center justify-center text-xl font-bold text-primary">
          {match.otherProfile?.displayName?.[0] || "?"}
        </div>
        <div>
          <h3 className="font-bold text-lg">{match.otherProfile?.displayName || "Someone"}</h3>
          <p className="text-sm text-muted-foreground">{match.otherProfile?.location || "Somewhere"}</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{match.otherProfile?.bio || ""}</p>
      <div className="flex gap-2">
        <Button
          className="flex-1 rounded-xl"
          onClick={() => handleRespond("accept")}
          disabled={respondToMatch.isPending}
          data-testid={`button-accept-${match.id}`}
        >
          <Check className="w-4 h-4 mr-1" /> Accept
        </Button>
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={() => handleRespond("reject")}
          disabled={respondToMatch.isPending}
          data-testid={`button-reject-${match.id}`}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function MatchedCard({ match }: { match: any }) {
  const [, setLocation] = useLocation();

  return (
    <div className="bg-white rounded-3xl p-6 border border-purple-100 shadow-sm" data-testid={`card-matched-${match.id}`}>
      <div className="flex items-center gap-4 mb-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center text-xl font-bold text-primary">
          {match.otherProfile?.displayName?.[0] || "?"}
        </div>
        <div>
          <h3 className="font-bold text-lg">{match.otherProfile?.displayName || "Someone"}</h3>
          <div className="flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-full w-fit mt-1">
            <Heart className="w-3 h-3 fill-current" />
            Matched
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <Button
          className="flex-1 rounded-xl"
          variant="default"
          onClick={() => setLocation(`/chat/${match.id}`)}
          data-testid={`button-chat-${match.id}`}
        >
          <MessageCircle className="w-4 h-4 mr-2" />
          Chat Now
        </Button>
      </div>
    </div>
  );
}

function SentMatchCard({ match }: { match: any }) {
  return (
    <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm opacity-75" data-testid={`card-sent-match-${match.id}`}>
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gray-100 to-purple-50 flex items-center justify-center text-xl font-bold text-muted-foreground">
          {match.otherProfile?.displayName?.[0] || "?"}
        </div>
        <div>
          <h3 className="font-bold text-lg">{match.otherProfile?.displayName || "Someone"}</h3>
          <p className="text-sm text-muted-foreground">Waiting for response...</p>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  const [, setLocation] = useLocation();

  return (
    <div className="text-center py-20 px-6 bg-white rounded-3xl border border-dashed border-purple-200">
      <div className="w-20 h-20 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-6">
        <Heart className="w-10 h-10 text-purple-300" />
      </div>
      <h3 className="text-2xl font-bold font-display mb-2">No matches yet</h3>
      <p className="text-muted-foreground max-w-md mx-auto mb-8">
        Your soulmate is out there! Start by exploring potential connections and interviewing their AI Twins.
      </p>
      <Button size="lg" onClick={() => setLocation("/discover")} className="rounded-full" data-testid="button-discover">
        Discover People
      </Button>
    </div>
  );
}
