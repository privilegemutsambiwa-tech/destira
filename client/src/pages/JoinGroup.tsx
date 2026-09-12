import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Users, CheckCircle, XCircle, LogIn } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function JoinGroup({ params }: { params?: { token?: string } }) {
  const rawParam = params?.token || "";
  const dashIdx = rawParam.indexOf("-");
  const parsedGroupId = dashIdx > 0 ? rawParam.slice(0, dashIdx) : "";
  const parsedToken = dashIdx > 0 ? rawParam.slice(dashIdx + 1) : rawParam;

  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const [status, setStatus] = useState<"loading" | "joining" | "success" | "requested" | "already" | "error">("loading");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [groupName, setGroupName] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setStatus("error");
      setErrorMsg("login_required");
      return;
    }
    if (!parsedToken) {
      setStatus("error");
      setErrorMsg("Invalid invite link.");
      return;
    }
    setStatus("joining");
    fetch(`/api/groups/join-by-invite/${parsedToken}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setStatus("already");
          const gid = data.groupId || (parsedGroupId ? parseInt(parsedGroupId) : null);
          if (gid) setGroupId(gid);
        } else if (res.status === 200 || res.status === 201) {
          if (data.status === "requested") {
            setStatus("requested");
            setGroupName(data.groupName || "");
            if (data.groupId) setGroupId(data.groupId);
          } else {
            setStatus("success");
            setGroupId(data.groupId || (parsedGroupId ? parseInt(parsedGroupId) : null));
            setGroupName(data.groupName || "");
          }
        } else {
          setStatus("error");
          setErrorMsg(data.message || "This invite link is invalid or has expired.");
        }
      })
      .catch(() => {
        setStatus("error");
        setErrorMsg("Something went wrong. Please try again.");
      });
  }, [user, authLoading, parsedToken]);

  const goToGroup = () => {
    if (groupId) setLocation(`/lounge/group/${groupId}`);
    else setLocation("/lounge");
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4" style={{ background: "hsl(var(--vf-ink))" }}>
      <div
        className="w-full max-w-sm rounded-2xl p-8 text-center"
        style={{ background: "var(--vf-surface2)", border: "1px solid var(--vf-line)" }}
      >
        {(status === "loading" || status === "joining") && (
          <>
            <Loader2 className="w-12 h-12 mx-auto animate-spin mb-4" style={{ color: "hsl(var(--vf-ember))" }} />
            <p className="text-foreground font-semibold text-lg">Joining group…</p>
            <p className="text-sm mt-1" style={{ color: "var(--vf-muted)" }}>Just a moment</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: "#22C55E" }} />
            <p className="text-foreground font-bold text-xl mb-1">You're in!</p>
            {groupName && <p className="text-sm mb-4" style={{ color: "var(--vf-muted)" }}>Joined <strong className="text-foreground">{groupName}</strong></p>}
            <button
              onClick={goToGroup}
              className="w-full py-3 rounded-xl font-semibold text-white btn-press"
              style={{ background: "hsl(var(--vf-ember))" }}
              data-testid="button-go-to-group"
            >
              Open Group
            </button>
          </>
        )}
        {status === "requested" && (
          <>
            <Users className="w-12 h-12 mx-auto mb-4" style={{ color: "hsl(var(--vf-ember))" }} />
            <p className="text-foreground font-bold text-xl mb-1">Request Sent</p>
            <p className="text-sm mb-4" style={{ color: "var(--vf-muted)" }}>
              Your request to join {groupName ? <strong className="text-foreground">{groupName}</strong> : "this group"} has been sent. An admin will review it shortly.
            </p>
            <button
              onClick={() => setLocation("/lounge")}
              className="w-full py-3 rounded-xl font-semibold text-white btn-press"
              style={{ background: "var(--vf-elevated)", border: "1px solid var(--vf-line)" }}
              data-testid="button-go-to-lounge"
            >
              Back to Lounge
            </button>
          </>
        )}
        {status === "already" && (
          <>
            <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--vf-muted)" }} />
            <p className="text-foreground font-bold text-xl mb-1">Already a Member</p>
            <p className="text-sm mb-4" style={{ color: "var(--vf-muted)" }}>You're already in this group.</p>
            <button
              onClick={goToGroup}
              className="w-full py-3 rounded-xl font-semibold text-white btn-press"
              style={{ background: "hsl(var(--vf-ember))" }}
              data-testid="button-go-to-group-already"
            >
              Open Group
            </button>
          </>
        )}
        {status === "error" && errorMsg === "login_required" && (
          <>
            <LogIn className="w-12 h-12 mx-auto mb-4" style={{ color: "hsl(var(--vf-ember))" }} />
            <p className="text-foreground font-bold text-xl mb-1">Join with Destira</p>
            <p className="text-sm mb-4" style={{ color: "var(--vf-muted)" }}>Log in or sign up to join this group.</p>
            <a
              href={`/api/login?returnTo=${encodeURIComponent(`/join/${rawParam}`)}`}
              className="block w-full py-3 rounded-xl font-semibold text-white text-center btn-press"
              style={{ background: "hsl(var(--vf-ember))" }}
              data-testid="button-login-to-join"
            >
              Log In / Sign Up
            </a>
          </>
        )}
        {status === "error" && errorMsg !== "login_required" && (
          <>
            <XCircle className="w-12 h-12 mx-auto mb-4" style={{ color: "#EF4444" }} />
            <p className="text-foreground font-bold text-xl mb-1">Link Invalid</p>
            <p className="text-sm mb-4" style={{ color: "var(--vf-muted)" }}>{errorMsg}</p>
            <button
              onClick={() => setLocation("/lounge")}
              className="w-full py-3 rounded-xl font-semibold text-white btn-press"
              style={{ background: "var(--vf-elevated)", border: "1px solid var(--vf-line)" }}
              data-testid="button-back-lounge"
            >
              Browse Groups
            </button>
          </>
        )}
      </div>
    </div>
  );
}
