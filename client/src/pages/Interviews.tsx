import { LayoutShell } from "@/components/layout-shell";
import { useInterviews } from "@/hooks/use-interactions";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Brain, ArrowRight, Loader2, Search } from "lucide-react";

export default function Interviews() {
  const { data: interviews, isLoading } = useInterviews();
  const [, setLocation] = useLocation();

  return (
    <LayoutShell>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold" data-testid="text-interviews-title">Active Interviews</h1>
        <p className="text-muted-foreground mt-1">Talk to their AI Twin to see if there's a spark.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : interviews && interviews.length > 0 ? (
        <div className="grid gap-4">
          {interviews.map((interview: any) => (
            <Link key={interview.id} href={`/interviews/${interview.id}/chat`}>
              <div className="bg-white p-6 rounded-2xl border border-purple-100 shadow-sm cursor-pointer flex items-center justify-between gap-4 group" data-testid={`card-interview-${interview.id}`}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center text-primary">
                    <Brain className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg group-hover:text-primary transition-colors">
                      {interview.targetProfile?.displayName || "Unknown"}'s AI Twin
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {interview.status === "in_progress" ? "Conversation active" : interview.status}
                      {interview.targetProfile?.location && ` - ${interview.targetProfile.location}`}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon">
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 px-6 bg-white rounded-3xl border border-dashed border-purple-200">
          <div className="w-20 h-20 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Search className="w-10 h-10 text-purple-300" />
          </div>
          <h3 className="text-2xl font-bold font-display mb-2">No active interviews</h3>
          <p className="text-muted-foreground max-w-md mx-auto mb-8">
            Go to Discover to find interesting people and interview their AI Twins before connecting.
          </p>
          <Button size="lg" onClick={() => setLocation("/discover")} className="rounded-full" data-testid="button-go-discover">
            Discover People
          </Button>
        </div>
      )}
    </LayoutShell>
  );
}
