import { LayoutShell } from "@/components/layout-shell";
import { useInterviews } from "@/hooks/use-interactions";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { MessageCircle, Brain, ArrowRight } from "lucide-react";

export default function Interviews() {
  const { data: interviews, isLoading } = useInterviews();

  return (
    <LayoutShell>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold">Active Interviews</h1>
        <p className="text-muted-foreground mt-1">Talk to their Twin to see if there's a spark.</p>
      </div>

      <div className="grid gap-4">
        {/* Mock Interview Item for Demo */}
        <Link href="/interviews/1/chat">
            <div className="bg-white p-6 rounded-2xl border border-purple-100 shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center justify-between group">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center text-primary">
                        <Brain className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg group-hover:text-primary transition-colors">Sarah's AI Twin</h3>
                        <p className="text-sm text-muted-foreground">Last active: 2 mins ago</p>
                    </div>
                </div>
                <Button variant="ghost" size="icon">
                    <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </Button>
            </div>
        </Link>
        
        {/* Empty State if no interviews */}
        {(!interviews || interviews.length === 0) && (
            <div className="text-center py-12 text-muted-foreground">
                No active interviews. Go to Discover to find someone!
            </div>
        )}
      </div>
    </LayoutShell>
  );
}
