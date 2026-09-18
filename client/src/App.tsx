import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profiles";
import { DestiraLoadingScreen } from "@/components/brand/logo";
import { ErrorBoundary } from "@/components/error-boundary";
import { consumePendingInvite } from "@/lib/pending-invite";
import { useEffect, useLayoutEffect, lazy, Suspense } from "react";

// Code-split and NOT linked from anywhere in the member app (no nav item, no
// Settings row) — reachable only by knowing the exact path. Own session
// cookie, own QueryClient, own auth; see client/src/admin/.
const AdminConsoleRoot = lazy(() => import("@/admin"));

import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import AuthCallback from "@/pages/AuthCallback";
import Onboarding from "@/pages/Onboarding";
import Profile from "@/pages/Profile";
import ProfileView from "@/pages/ProfileView";
import Matches from "@/pages/Matches";
import Discover from "@/pages/Discover";
import Interviews from "@/pages/Interviews";
import InterviewChat from "@/pages/InterviewChat";
import Lounge from "@/pages/Lounge";
import Events from "@/pages/Events";
import EventDetail from "@/pages/EventDetail";
import EventPreferences from "@/pages/EventPreferences";
import HostEvent from "@/pages/HostEvent";
import PhotoManager from "@/pages/PhotoManager";
import ProfilePreview from "@/pages/ProfilePreview";
import ProfilePreviewFrame from "@/pages/ProfilePreviewFrame";
import DirectChat from "@/pages/DirectChat";
import TwinChat from "@/pages/TwinChat";
import TwinDisclosure from "@/pages/TwinDisclosure";
import Essentials from "@/pages/Essentials";
import Plans from "@/pages/Plans";
import PlansPay from "@/pages/PlansPay";
import GroupChatPage from "@/pages/GroupChat";
import GroupInfoPage from "@/pages/GroupInfo";
import GroupSettings from "@/pages/GroupSettings";
import JoinGroup from "@/pages/JoinGroup";
import Settings from "@/pages/Settings";

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return <DestiraLoadingScreen />;
  }

  if (!user) return null;

  // Per-screen, not just app-wide: a crash in one screen's render must not
  // blank every screen reachable from it. Keyed on the route so navigating
  // away (even back to the same broken screen via a fresh mount) clears a
  // previously caught error instead of it sticking around.
  return (
    <ErrorBoundary resetKey={location}>
      <Component {...rest} />
    </ErrorBoundary>
  );
}

function AuthenticatedHome() {
  const { data: profile, isLoading } = useProfile();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      // A fallback checkpoint for a pending group invite — Login/Signup's
      // own redirects (client/src/lib/pending-invite.ts) are the primary
      // path, but a page refresh mid-flow could land here first. Takes
      // priority over onboarding: joining a group doesn't need a finished
      // profile, and the whole point is not dropping this person on
      // Discover (or essentials/onboarding) instead of the group they came
      // from a WhatsApp forward to actually join.
      const pendingInvite = consumePendingInvite();
      if (pendingInvite) {
        setLocation(`/join/${pendingInvite}`);
      } else if (!profile || !profile.gender) {
        // Matching essentials come first — before the soul-mapping questions.
        setLocation("/essentials");
      } else if (!profile.onboardingCompleted) {
        setLocation("/onboarding");
      } else {
        setLocation("/discover");
      }
    }
  }, [profile, isLoading, setLocation]);

  return <DestiraLoadingScreen />;
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <DestiraLoadingScreen />;
  }

  return (
    <Switch>
      <Route path="/" component={user ? AuthenticatedHome : Landing} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/auth/callback" component={AuthCallback} />

      <Route path="/essentials">
        <ProtectedRoute component={Essentials} />
      </Route>
      <Route path="/onboarding">
        <ProtectedRoute component={Onboarding} />
      </Route>
      <Route path="/profile">
        <ProtectedRoute component={Profile} />
      </Route>
      <Route path="/u/:userId">
        {(params) => <ProtectedRoute component={ProfileView} params={params} />}
      </Route>
      <Route path="/photos">
        <ProtectedRoute component={PhotoManager} />
      </Route>
      <Route path="/profile/preview">
        <ProtectedRoute component={ProfilePreview} />
      </Route>
      <Route path="/profile/preview/frame">
        <ProtectedRoute component={ProfilePreviewFrame} />
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
      <Route path="/twin-disclosure">
        <ProtectedRoute component={TwinDisclosure} />
      </Route>
      <Route path="/plans">
        <ProtectedRoute component={Plans} />
      </Route>
      <Route path="/plans/pay">
        <ProtectedRoute component={PlansPay} />
      </Route>
      <Route path="/plans/pay/return">
        <ProtectedRoute component={PlansPay} />
      </Route>
      <Route path="/billing"><Redirect to="/plans" /></Route>
      <Route path="/upgrade"><Redirect to="/plans" /></Route>
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
  // Drops the inline pre-paint splash (client/index.html) the instant this
  // component's first commit is ready to paint — useLayoutEffect, not
  // useEffect, so removal happens in the same frame as the real UI's first
  // paint instead of one frame after it (which would show a flash of the
  // splash sitting over already-rendered content). Runs for both the member
  // app and /console below; either one being ready to paint is "the app can
  // paint" as far as the splash cares.
  useLayoutEffect(() => {
    document.getElementById("vf-splash")?.remove();
  }, []);

  // No theme effect here — the app is dark-only for now (index.css's :root
  // holds the dark palette unconditionally, no .dark class needed), so
  // there's nothing to apply after mount. The old version of this
  // (`classList.add("dark")` in a useEffect) had no state, no persistence,
  // and produced a frame of unstyled light before it ran; a real Light /
  // Dark / System setting replaces this when the light theme lands.

  // The admin console is a fully separate app: its own session cookie, own
  // QueryClient, own auth. Deciding this off window.location (not wouter)
  // means the member Router/auth hooks never mount for a /console request —
  // crossing the boundary is a full navigation, which is the right shape for
  // two surfaces that don't share a session.
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/console")) {
    return (
      <ErrorBoundary>
        <Suspense fallback={null}>
          <AdminConsoleRoot />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <ErrorBoundary>
          <Router />
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
