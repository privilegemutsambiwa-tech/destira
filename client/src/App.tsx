import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profiles";
import { useEffect } from "react";

import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Onboarding from "@/pages/Onboarding";
import Profile from "@/pages/Profile";
import Matches from "@/pages/Matches";
import Discover from "@/pages/Discover";
import Interviews from "@/pages/Interviews";
import InterviewChat from "@/pages/InterviewChat";
import Lounge from "@/pages/Lounge";
import Events from "@/pages/Events";
import EventDetail from "@/pages/EventDetail";
import EventPreferences from "@/pages/EventPreferences";
import HostEvent from "@/pages/HostEvent";
import DirectChat from "@/pages/DirectChat";
import TwinChat from "@/pages/TwinChat";
import Billing from "@/pages/Billing";
import Upgrade from "@/pages/Upgrade";
import GroupChatPage from "@/pages/GroupChat";
import GroupInfoPage from "@/pages/GroupInfo";
import GroupSettings from "@/pages/GroupSettings";
import JoinGroup from "@/pages/JoinGroup";
import Settings from "@/pages/Settings";

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
        <img src="/brand/logo.png" alt="VibeFlow" className="w-16 h-16 rounded-md object-cover animate-pulse" />
      </div>
    );
  }

  if (!user) return null;

  return <Component {...rest} />;
}

function AuthenticatedHome() {
  const { data: profile, isLoading } = useProfile();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (!profile || !profile.onboardingCompleted) {
        setLocation("/onboarding");
      } else {
        setLocation("/discover");
      }
    }
  }, [profile, isLoading, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <img src="/brand/logo.png" alt="VibeFlow" className="w-16 h-16 rounded-md object-cover animate-pulse" />
    </div>
  );
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <img src="/brand/logo.png" alt="VibeFlow" className="w-16 h-16 rounded-md object-cover animate-pulse" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/" component={user ? AuthenticatedHome : Landing} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />

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
      <Route path="/events">
        <ProtectedRoute component={Events} />
      </Route>
      <Route path="/settings/events">
        <ProtectedRoute component={EventPreferences} />
      </Route>
      <Route path="/events/host">
        <ProtectedRoute component={HostEvent} />
      </Route>
      <Route path="/events/:id">
        {(params) => <ProtectedRoute component={EventDetail} params={params} />}
      </Route>
      <Route path="/lounge/group/:groupId/info">
        {(params) => <ProtectedRoute component={GroupInfoPage} params={params} />}
      </Route>
      <Route path="/lounge/group/:groupId/settings">
        {(params) => <ProtectedRoute component={GroupSettings} params={params} />}
      </Route>
      <Route path="/lounge/group/:groupId">
        {(params) => <ProtectedRoute component={GroupChatPage} params={params} />}
      </Route>
      <Route path="/chat/:matchId">
        {(params) => <ProtectedRoute component={DirectChat} params={params} />}
      </Route>
      <Route path="/twin-chat">
        <ProtectedRoute component={TwinChat} />
      </Route>
      <Route path="/billing">
        <ProtectedRoute component={Billing} />
      </Route>
      <Route path="/upgrade">
        <ProtectedRoute component={Upgrade} />
      </Route>
      <Route path="/settings">
        <ProtectedRoute component={Settings} />
      </Route>
      <Route path="/join/:token">
        {(params) => <JoinGroup params={params} />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

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
