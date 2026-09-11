import { useEffect, useState } from "react";
import { Route, Switch, Router as WouterRouter, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { QueryClient } from "@tanstack/react-query";
import { adminGet } from "./api";
import AdminLogin from "./AdminLogin";
import { AdminShell, INK, TEXT } from "./AdminShell";
import AdminOverview from "./AdminOverview";
import AdminReports from "./AdminReports";
import AdminReportDetail from "./AdminReportDetail";
import AdminFeedback from "./AdminFeedback";
import AdminMetrics from "./AdminMetrics";
import AdminEmailConfig from "./AdminEmailConfig";

// A dedicated QueryClient — deliberately not the member app's queryClient
// (client/src/lib/queryClient.ts). Admin data must never share a cache key
// space with member data.
const adminQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 15_000 } },
});

type Auth = { loading: boolean; role: string | null };

function useAdminWhoAmI(): Auth & { refresh: () => void } {
  const [state, setState] = useState<Auth>({ loading: true, role: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    adminGet("/api/admin/auth/whoami")
      .then((r) => !cancelled && setState({ loading: false, role: r.role }))
      .catch(() => !cancelled && setState({ loading: false, role: null }));
    return () => {
      cancelled = true;
    };
  }, [tick]);
  return { ...state, refresh: () => setTick((t) => t + 1) };
}

function AdminApp() {
  const { loading, role, refresh } = useAdminWhoAmI();
  const [location] = useLocation();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: INK, color: TEXT, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 12, opacity: 0.6 }}>loading…</span>
      </div>
    );
  }

  if (!role) {
    return <AdminLogin onSignedIn={refresh} />;
  }

  return (
    <AdminShell role={role}>
      <Switch>
        <Route path="/console" component={AdminOverview} />
        <Route path="/console/reports" component={AdminReports} />
        <Route path="/console/reports/:id">{(params) => <AdminReportDetail id={params.id} />}</Route>
        <Route path="/console/feedback" component={AdminFeedback} />
        <Route path="/console/metrics" component={AdminMetrics} />
        <Route path="/console/email" component={AdminEmailConfig} />
        <Route>
          <p style={{ color: "#A79FB4" }}>Not found.</p>
        </Route>
      </Switch>
    </AdminShell>
  );
}

// Lazy-loaded from App.tsx — this whole subtree, and its API surface, never
// touches the member bundle's queryClient or router context.
export default function AdminConsoleRoot() {
  return (
    <QueryClientProvider client={adminQueryClient}>
      <WouterRouter>
        <AdminApp />
      </WouterRouter>
    </QueryClientProvider>
  );
}
