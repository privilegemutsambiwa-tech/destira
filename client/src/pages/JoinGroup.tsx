import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Users, CheckCircle, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
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
      setLocation(`/?next=/join/${rawParam}`);
      return;
    }
    if (!parsedToken) {
      setStatus("error");
      setErrorMsg("Invalid invite link.");
      return;
    }
    setStatus("joining");
    apiRequest("POST", `/api/groups/join-by-invite/${parsedToken}`)
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
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "#0F0F14" }}>
      <div
        className="w-full max-w-sm rounded-2xl p-8 text-center"
        style={{ background: "#1A1A24", border: "1px solid #2E2E42" }}
      >
        {(status === "loading" || status === "joining") && (
          <>
            <Loader2 className="w-12 h-12 mx-auto animate-spin mb-4" style={{ color: "#7C3AED" }} />
            <p className="text-white font-semibold text-lg">Joining group…</p>
            <p className="text-sm mt-1" style={{ color: "#9090A8" }}>Just a moment</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: "#22C55E" }} />
            <p className="text-white font-bold text-xl mb-1">You're in!</p>
            {groupName && <p className="text-sm mb-4" style={{ color: "#9090A8" }}>Joined <strong className="text-white">{groupName}</strong></p>}
            <button
              onClick={goToGroup}
              className="w-full py-3 rounded-xl font-semibold text-white btn-press"
              style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)" }}
              data-testid="button-go-to-group"
            >
              Open Group
            </button>
          </>
        )}
        {status === "requested" && (
          <>
            <Users className="w-12 h-12 mx-auto mb-4" style={{ color: "#7C3AED" }} />
            <p className="text-white font-bold text-xl mb-1">Request Sent</p>
            <p className="text-sm mb-4" style={{ color: "#9090A8" }}>
              Your request to join {groupName ? <strong className="text-white">{groupName}</strong> : "this group"} has been sent. An admin will review it shortly.
            </p>
            <button
              onClick={() => setLocation("/lounge")}
              className="w-full py-3 rounded-xl font-semibold text-white btn-press"
              style={{ background: "#242433", border: "1px solid #2E2E42" }}
              data-testid="button-go-to-lounge"
            >
              Back to Lounge
            </button>
          </>
        )}
        {status === "already" && (
          <>
            <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: "#9090A8" }} />
            <p className="text-white font-bold text-xl mb-1">Already a Member</p>
            <p className="text-sm mb-4" style={{ color: "#9090A8" }}>You're already in this group.</p>
            <button
              onClick={goToGroup}
              className="w-full py-3 rounded-xl font-semibold text-white btn-press"
              style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)" }}
              data-testid="button-go-to-group-already"
            >
              Open Group
            </button>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="w-12 h-12 mx-auto mb-4" style={{ color: "#EF4444" }} />
            <p className="text-white font-bold text-xl mb-1">Link Invalid</p>
            <p className="text-sm mb-4" style={{ color: "#9090A8" }}>{errorMsg}</p>
            <button
              onClick={() => setLocation("/lounge")}
              className="w-full py-3 rounded-xl font-semibold text-white btn-press"
              style={{ background: "#242433", border: "1px solid #2E2E42" }}
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
