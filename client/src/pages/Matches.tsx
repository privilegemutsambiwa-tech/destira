import { LayoutShell } from "@/components/layout-shell";
import { useMatches, useCreateMatch, useStartInterview } from "@/hooks/use-interactions";
import { Button } from "@/components/ui/button";
import { Loader2, MessageCircle, Heart, Info } from "lucide-react";
import { useLocation } from "wouter";

export default function Matches() {
  const { data: matches, isLoading } = useMatches();
  // In a real app, this would fetch potential matches (users NOT yet matched)
  // For demo, we'll assume we have a list of potential users to "discover"
  // For now, let's just display a "Discover" view with mock data if list is empty

  return (
    <LayoutShell>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Your Matches</h1>
          <p className="text-muted-foreground mt-1">People you've connected with.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : matches && matches.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </LayoutShell>
  );
}

function MatchCard({ match }: { match: any }) {
    return (
        <div className="bg-white rounded-3xl p-6 border border-purple-100 shadow-sm hover:shadow-lg transition-all group">
            <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center text-xl font-bold text-primary">
                    ?
                </div>
                <div>
                    <h3 className="font-bold text-lg">User {match.user2Id.slice(0, 4)}</h3>
                    <div className="flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-full w-fit mt-1">
                        <Heart className="w-3 h-3 fill-current" />
                        98% Match
                    </div>
                </div>
            </div>
            <div className="flex gap-2 mt-4">
                <Button className="flex-1 rounded-xl" variant="default">Chat Now</Button>
                <Button className="flex-1 rounded-xl" variant="outline">View Profile</Button>
            </div>
        </div>
    )
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
            <Button size="lg" onClick={() => setLocation("/discover")} className="rounded-full">
                Discover People
            </Button>
        </div>
    )
}
