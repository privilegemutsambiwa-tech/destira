import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

// Pages
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Onboarding from "@/pages/Onboarding";
import Profile from "@/pages/Profile";
import Matches from "@/pages/Matches";
import Discover from "@/pages/Discover";
import Interviews from "@/pages/Interviews";
import InterviewChat from "@/pages/InterviewChat";
import Lounge from "@/pages/Lounge";

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  // If user hasn't completed onboarding, force them there (unless they are already there)
  // Note: We need to check if 'onboardingCompleted' exists on the user object or profile
  // For now, assuming basic auth check is enough, but in real app we'd fetch profile here.

  return <Component {...rest} />;
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/" component={user ? Profile : Landing} />
      
      {/* Auth-protected routes */}
      <Route path="/onboarding">
        <ProtectedRoute component={Onboarding} />
      </Route>
      <Route path="/profile">
        <ProtectedRoute component={Profile} />
      </Route>
      <Route path="/matches">
        <ProtectedRoute component={Matches} />
      </Route>
      <Route path="/discover">
        <ProtectedRoute component={Discover} />
      </Route>
      <Route path="/interviews">
        <ProtectedRoute component={Interviews} />
      </Route>
      <Route path="/interviews/:id/chat">
        {(params) => <ProtectedRoute component={InterviewChat} params={params} />}
      </Route>
      <Route path="/lounge">
        <ProtectedRoute component={Lounge} />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
