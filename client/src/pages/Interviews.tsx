import { LayoutShell } from "@/components/layout-shell";
import { useInterviews } from "@/hooks/use-interactions";
import { useProfile } from "@/hooks/use-profiles";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import { Brain, ArrowRight, Loader2, Search, Sparkles, MessageCircle, Shield } from "lucide-react";

export default function Interviews() {
  const { data: interviews, isLoading } = useInterviews();
  const { data: profile } = useProfile();
  const [, setLocation] = useLocation();

  return (
    <LayoutShell>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold" data-testid="text-interviews-title">AI Twin Hub</h1>
        <p className="text-muted-foreground mt-1">Chat with your own Twin or interview others' Twins.</p>
      </div>

      {profile?.onboardingCompleted && (
        <Card className="mb-8 card-lift cursor-pointer" onClick={() => setLocation("/twin-chat")} data-testid="card-my-twin">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-md gradient-bg flex items-center justify-center text-white shrink-0">
                <Sparkles className="w-7 h-7" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h2 className="font-bold text-lg">Chat With My Twin</h2>
                  <Badge variant="secondary" className="text-xs">
                    <Shield className="w-3 h-3 mr-1" />
                    Private
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Train, coach, and reflect with your personal AI Twin. Your Twin learns from each conversation.
                </p>
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Active
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Brain className="w-3 h-3" />
                    Memory enabled
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon" data-testid="button-chat-my-twin">
                <ArrowRight className="w-5 h-5 text-muted-foreground" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-4">
        <h2 className="text-lg font-bold" data-testid="text-active-interviews">Active Interviews</h2>
        <p className="text-sm text-muted-foreground">Conversations with other people's AI Twins.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : interviews && interviews.length > 0 ? (
        <div className="grid gap-4">
          {interviews.map((interview: any) => (
            <Link key={interview.id} href={`/interviews/${interview.id}/chat`}>
              <div className="bg-card p-6 rounded-md border shadow-sm cursor-pointer flex items-center justify-between gap-4 group card-lift" data-testid={`card-interview-${interview.id}`}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-md gradient-bg flex items-center justify-center text-white">
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
        <div className="text-center py-16 px-6 bg-card rounded-md border border-dashed">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-bold font-display mb-2">No active interviews</h3>
          <p className="text-muted-foreground max-w-md mx-auto mb-6">
            Go to Discover to find interesting people and interview their AI Twins before connecting.
          </p>
          <Button size="lg" onClick={() => setLocation("/discover")} className="rounded-full btn-press" data-testid="button-go-discover">
            Discover People
          </Button>
        </div>
      )}
    </LayoutShell>
  );
}
