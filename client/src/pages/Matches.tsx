import { useState } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useMatches, useRespondToMatch, useSoftDeleteChat, useUnmatch } from "@/hooks/use-interactions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { Loader2, MessageCircle, Heart, Check, X, Search, Trash2, UserX } from "lucide-react";
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
          ? `You and ${match.otherProfile?.displayName || "this person"} are now connected!`
          : "No worries, they won't be notified.",
      });
    } catch (e) {
      toast({ title: "Error", description: "Failed to respond.", variant: "destructive" });
    }
  };

  return (
    <Card className="card-lift" data-testid={`card-pending-match-${match.id}`}>
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
            {match.otherProfile?.displayName?.[0] || "?"}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold truncate">{match.otherProfile?.displayName || "Someone"}</h3>
            <p className="text-xs text-muted-foreground">{match.otherProfile?.location || "Somewhere"}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{match.otherProfile?.bio || ""}</p>
        <div className="flex gap-2">
          <Button
            className="flex-1 btn-press"
            onClick={() => handleRespond("accept")}
            disabled={respondToMatch.isPending}
            data-testid={`button-accept-${match.id}`}
          >
            <Check className="w-4 h-4 mr-1" /> Accept
          </Button>
          <Button
            variant="outline"
            className="btn-press"
            onClick={() => handleRespond("reject")}
            disabled={respondToMatch.isPending}
            data-testid={`button-reject-${match.id}`}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MatchedCard({ match }: { match: any }) {
  const [, setLocation] = useLocation();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showUnmatchDialog, setShowUnmatchDialog] = useState(false);
  const softDelete = useSoftDeleteChat();
  const unmatch = useUnmatch();
  const { toast } = useToast();

  const handleSoftDelete = async () => {
    try {
      await softDelete.mutateAsync(match.id);
      toast({ title: "Chat deleted", description: "The chat has been removed from your view." });
      setShowDeleteDialog(false);
    } catch (e) {
      toast({ title: "Error", description: "Failed to delete chat.", variant: "destructive" });
    }
  };

  const handleUnmatch = async () => {
    try {
      await unmatch.mutateAsync(match.id);
      toast({ title: "Unmatched", description: "You've been unmatched." });
      setShowUnmatchDialog(false);
    } catch (e) {
      toast({ title: "Error", description: "Failed to unmatch.", variant: "destructive" });
    }
  };

  return (
    <>
      <Card className="card-lift" data-testid={`card-matched-${match.id}`}>
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
              {match.otherProfile?.displayName?.[0] || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold truncate">{match.otherProfile?.displayName || "Someone"}</h3>
              <div className="flex items-center gap-1 text-xs text-green-600 mt-0.5">
                <Heart className="w-3 h-3 fill-current" />
                Matched
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button
              className="flex-1 btn-press"
              onClick={() => setLocation(`/chat/${match.id}`)}
              data-testid={`button-chat-${match.id}`}
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Chat
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowDeleteDialog(true)} data-testid={`button-delete-chat-${match.id}`}>
              <Trash2 className="w-4 h-4 text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowUnmatchDialog(true)} data-testid={`button-unmatch-${match.id}`}>
              <UserX className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Chat?</DialogTitle>
            <DialogDescription>
              This will remove the chat from your view. The other person can still see it. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleSoftDelete} disabled={softDelete.isPending} data-testid="button-confirm-delete">
              {softDelete.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete Chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showUnmatchDialog} onOpenChange={setShowUnmatchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unmatch?</DialogTitle>
            <DialogDescription>
              This will remove the match entirely. You won't be able to chat anymore. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUnmatchDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleUnmatch} disabled={unmatch.isPending} data-testid="button-confirm-unmatch">
              {unmatch.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Unmatch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SentMatchCard({ match }: { match: any }) {
  return (
    <Card className="opacity-75" data-testid={`card-sent-match-${match.id}`}>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center text-lg font-bold text-muted-foreground">
            {match.otherProfile?.displayName?.[0] || "?"}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold truncate">{match.otherProfile?.displayName || "Someone"}</h3>
            <p className="text-sm text-muted-foreground">Waiting for response...</p>
          </div>
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
      <h3 className="text-2xl font-bold font-display mb-2">No matches yet</h3>
      <p className="text-muted-foreground max-w-md mx-auto mb-8">
        Your soulmate is out there! Start by exploring potential connections and interviewing their AI Twins.
      </p>
      <Button size="lg" className="btn-press" onClick={() => setLocation("/discover")} data-testid="button-discover">
        <Search className="w-4 h-4 mr-2" />
        Discover People
      </Button>
    </div>
  );
}
