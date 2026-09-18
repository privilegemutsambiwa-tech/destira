import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { DestiraLoadingScreen } from "@/components/brand/logo";
import { consumePendingInvite } from "@/lib/pending-invite";
import type { User } from "@shared/models/auth";

// Landed on after Google hands control back to Supabase, which redirects
// here with the OAuth result in the URL. supabase-js picks that up on init
// and fires SIGNED_IN (or already has the session by the time we check) —
// either way we take the resulting access token and hand it to our own
// backend to create/link the user record and start our real session.
export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const finishing = useRef(false);

  useEffect(() => {
    const finish = async (accessToken: string) => {
      if (finishing.current) return;
      finishing.current = true;
      try {
        const res = await fetch("/api/auth/google-callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ access_token: accessToken }),
        });
        if (!res.ok) throw new Error(await res.text());
        const user = (await res.json()) as User;
        queryClient.setQueryData(["/api/auth/user"], user);

        const pendingInvite = consumePendingInvite();
        setLocation(pendingInvite ? `/join/${pendingInvite}` : "/discover");
      } catch {
        finishing.current = false;
        setError("Couldn't complete Google sign-in. Please try again.");
      }
    };

    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error_description") || params.get("error");
    if (oauthError) {
      setError(oauthError);
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) finish(session.access_token);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) finish(data.session.access_token);
    });

    return () => subscription.unsubscribe();
  }, [setLocation]);

  if (error) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 bg-vf-ink text-vf-text text-center">
        <p className="text-sm text-vf-muted max-w-sm">{error}</p>
        <button
          onClick={() => setLocation("/login")}
          className="text-sm text-vf-text underline underline-offset-4 hover:text-vf-muted transition-colors"
          data-testid="link-callback-back-to-login"
        >
          Back to login
        </button>
      </div>
    );
  }

  return <DestiraLoadingScreen />;
}
