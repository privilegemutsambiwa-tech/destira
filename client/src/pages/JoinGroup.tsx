import type React from "react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Users, CheckCircle, XCircle, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePaywall } from "@/hooks/use-paywall";
import { stashPendingInvite } from "@/lib/pending-invite";

interface InvitePreview {
  valid: boolean;
  reason?: "invalid" | "expired";
  groupId?: number;
  name?: string;
  description?: string | null;
  photoUrl?: string | null;
  memberCount?: number;
  categoryTags?: string[];
  approvalRequired?: boolean;
  isFull?: boolean;
  isMember?: boolean;
  createdAt?: string | null;
}

type ActionStatus = "idle" | "joining" | "success" | "requested" | "error";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";

function formatCreated(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `Started ${d.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
}

export default function JoinGroup({ params }: { params?: { token?: string } }) {
  const rawParam = params?.token || "";
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const paywall = usePaywall();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [action, setAction] = useState<ActionStatus>("idle");
  const [actionError, setActionError] = useState("");

  // The group is the page — fetch and show it regardless of auth state.
  // This never requires signing in first; only the actual join action does.
  useEffect(() => {
    if (!rawParam) {
      setPreview({ valid: false, reason: "invalid" });
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/groups/join-by-invite/${rawParam}/preview`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: InvitePreview) => {
        if (cancelled) return;
        setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setPreview({ valid: false, reason: "invalid" });
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rawParam]);

  // Stash the invite the moment we know this visitor is signed out — before
  // they ever tap anything — so it survives a detour through onboarding.
  useEffect(() => {
    if (!authLoading && !user && preview?.valid) {
      stashPendingInvite(rawParam);
    }
  }, [authLoading, user, preview?.valid, rawParam]);

  const goToGroup = () => {
    if (preview?.groupId) setLocation(`/lounge/group/${preview.groupId}`);
    else setLocation("/lounge");
  };

  const performJoin = async () => {
    setAction("joining");
    setActionError("");
    try {
      const res = await fetch(`/api/groups/join-by-invite/${rawParam}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.message === "group_full") {
        setPreview((p) => (p ? { ...p, isFull: true } : p));
        setAction("idle");
        return;
      }
      if (res.status === 409) {
        setAction("success"); // already a member — treat as success, straight in
        return;
      }
      if (res.ok) {
        if (data.status === "requested") setAction("requested");
        else setAction("success");
        return;
      }
      setAction("error");
      setActionError(data.message || "Something went wrong. Try again.");
    } catch {
      setAction("error");
      setActionError("Something went wrong. Try again.");
    }
  };

  const handleJoinTap = () => {
    if (!user) {
      stashPendingInvite(rawParam);
      setLocation("/signup");
      return;
    }
    paywall.guard("join_group", performJoin);
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-dvh flex flex-col bg-vf-ink">
      <div className="flex-1 flex flex-col items-center px-4 py-8 sm:py-14">
        <div className="w-full max-w-[480px]">{children}</div>
      </div>
      {paywall.sheet}
    </div>
  );

  // ── loading ──────────────────────────────────────────────────────────
  if (previewLoading || authLoading) {
    return (
      <Shell>
        <div className="rounded-[20px] overflow-hidden bg-vf-surface2 animate-pulse" style={{ aspectRatio: "16/10" }} />
        <div className="mt-6 h-9 w-2/3 rounded bg-vf-surface2 animate-pulse" />
        <div className="mt-3 h-4 w-1/3 rounded bg-vf-surface2 animate-pulse" />
      </Shell>
    );
  }

  // ── invalid / expired ────────────────────────────────────────────────
  if (!preview?.valid) {
    return (
      <Shell>
        <div className="rounded-[22px] border border-vf-line bg-vf-surface p-8 text-center">
          <XCircle className="w-11 h-11 mx-auto mb-4 text-vf-faint" />
          <h1 className="font-serif font-normal text-2xl text-vf-text mb-1.5">
            {preview?.reason === "expired" ? "This invite has expired." : "This invite link isn't valid."}
          </h1>
          <p className="text-[14px] text-vf-muted leading-[1.5]">
            {preview?.reason === "expired"
              ? "Invite links last 7 days. Ask whoever sent it for a fresh one."
              : "It may have been revoked, or the link got cut off somewhere."}
          </p>
          <button
            onClick={() => setLocation("/lounge")}
            className="mt-6 inline-flex items-center rounded-full border border-vf-line text-vf-text px-5 h-11 text-[14px] btn-press hover:border-vf-text/25 transition-colors"
            data-testid="button-browse-groups"
          >
            Browse groups instead
          </button>
        </div>
      </Shell>
    );
  }

  // ── already a member: go straight in, no ceremony ───────────────────
  if (preview.isMember || action === "success") {
    return (
      <Shell>
        <div className="rounded-[22px] border border-vf-line bg-vf-surface p-8 text-center">
          <CheckCircle className="w-11 h-11 mx-auto mb-4" style={{ color: "#8FE3C7" }} />
          <h1 className="font-serif font-normal text-2xl text-vf-text mb-1.5">
            {action === "success" ? "You're in." : "You're already in this one."}
          </h1>
          {preview.name && <p className="text-[14px] text-vf-muted mb-5">{preview.name}</p>}
          <button
            onClick={goToGroup}
            className="w-full h-12 rounded-full bg-vf-ember text-vf-ink font-bold text-[14.5px] btn-press hover:bg-[var(--vf-ember-soft)] transition-colors"
            data-testid="button-go-to-group"
          >
            Open the room
          </button>
        </div>
      </Shell>
    );
  }

  // ── request sent (approval-required groups) ─────────────────────────
  if (action === "requested") {
    return (
      <Shell>
        <div className="rounded-[22px] border border-vf-line bg-vf-surface p-8 text-center">
          <Users className="w-11 h-11 mx-auto mb-4 text-vf-ember" />
          <h1 className="font-serif font-normal text-2xl text-vf-text mb-1.5">Request sent.</h1>
          <p className="text-[14px] text-vf-muted leading-[1.5]">
            {preview.name ? <>An admin of <strong className="text-vf-text">{preview.name}</strong> will review it.</> : "An admin will review it."}
          </p>
          <button
            onClick={() => setLocation("/lounge")}
            className="mt-6 w-full h-12 rounded-full border border-vf-line text-vf-text font-medium text-[14.5px] btn-press hover:border-vf-text/25 transition-colors"
            data-testid="button-go-to-lounge"
          >
            Back to Lounge
          </button>
        </div>
      </Shell>
    );
  }

  // ── the group is full: honest, not a dead end ───────────────────────
  if (preview.isFull) {
    return (
      <Shell>
        <div className="rounded-[22px] border border-vf-line bg-vf-surface p-8 text-center">
          <Users className="w-11 h-11 mx-auto mb-4 text-vf-faint" />
          <h1 className="font-serif font-normal text-2xl text-vf-text mb-1.5">
            {preview.name ? <>{preview.name} is full.</> : "This group is full."}
          </h1>
          <p className="text-[14px] text-vf-muted leading-[1.5]">
            It's hit its member limit. Whoever sent this can let you know if a spot opens up.
          </p>
          <button
            onClick={() => setLocation("/lounge")}
            className="mt-6 w-full h-12 rounded-full border border-vf-line text-vf-text font-medium text-[14.5px] btn-press hover:border-vf-text/25 transition-colors"
            data-testid="button-browse-other-groups"
          >
            Browse other groups
          </button>
        </div>
      </Shell>
    );
  }

  // ── the real thing: the group is the page ───────────────────────────
  const memberCount = preview.memberCount ?? 0;
  const created = formatCreated(preview.createdAt);
  const signedIn = !!user;

  return (
    <Shell>
      <div
        className="rounded-[22px] overflow-hidden bg-vf-surface2"
        style={{ aspectRatio: "16/10" }}
        data-testid="join-group-photo"
      >
        {preview.photoUrl ? (
          <img src={preview.photoUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: "linear-gradient(160deg, rgba(255,107,74,.14), var(--vf-surface2))" }}
          >
            <Users className="w-10 h-10 text-vf-faint" />
          </div>
        )}
      </div>

      <h1 className="font-serif font-normal text-[clamp(30px,6vw,40px)] leading-[1.05] text-vf-text mt-6" data-testid="text-group-name">
        {preview.name}
      </h1>

      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-serif text-[22px] leading-none text-vf-text">{memberCount}</span>
        <span className={EYEBROW}>member{memberCount === 1 ? "" : "s"}</span>
      </div>

      <p className="mt-5 text-[16px] leading-[1.6] text-vf-text whitespace-pre-line" data-testid="text-group-description">
        {preview.description?.trim() || "No description yet — whoever's in this one hasn't written it up."}
      </p>

      {(created || preview.approvalRequired || (preview.categoryTags && preview.categoryTags.length > 0)) && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {created && (
            <span className={`${EYEBROW} border border-vf-line rounded-full px-3 py-1.5`}>{created}</span>
          )}
          <span className={`${EYEBROW} border border-vf-line rounded-full px-3 py-1.5 inline-flex items-center gap-1.5`}>
            {preview.approvalRequired ? (
              <>
                <Lock className="w-3 h-3" /> Approval required
              </>
            ) : (
              "Open — join instantly"
            )}
          </span>
          {(preview.categoryTags ?? []).map((tag) => (
            <span key={tag} className={`${EYEBROW} border border-vf-line rounded-full px-3 py-1.5`}>
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-8">
        {signedIn ? (
          <button
            onClick={handleJoinTap}
            disabled={action === "joining"}
            className="w-full h-12 rounded-full bg-vf-ember text-vf-ink font-bold text-[14.5px] btn-press hover:bg-[var(--vf-ember-soft)] transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
            data-testid="button-join-group"
          >
            {action === "joining" && <Loader2 className="w-4 h-4 animate-spin" />}
            {preview.approvalRequired ? `Ask to join ${preview.name}` : `Join ${preview.name}`}
          </button>
        ) : (
          <>
            <button
              onClick={handleJoinTap}
              className="w-full h-12 rounded-full bg-vf-ember text-vf-ink font-bold text-[14.5px] btn-press hover:bg-[var(--vf-ember-soft)] transition-colors"
              data-testid="button-join-group"
            >
              Join {preview.name}
            </button>
            <p className="mt-2.5 text-center text-[13px] text-vf-faint">
              Takes a minute to make an account.{" "}
              <button
                onClick={() => {
                  stashPendingInvite(rawParam);
                  setLocation("/login");
                }}
                className="text-vf-muted hover:text-vf-text underline underline-offset-2 transition-colors"
                data-testid="link-already-have-account"
              >
                Already here? Log in
              </button>
            </p>
          </>
        )}
        {action === "error" && (
          <p className="mt-3 text-center text-[13px] text-vf-warn" data-testid="text-join-error">
            {actionError}
          </p>
        )}
      </div>

      <p className="mt-10 text-[13px] leading-[1.55] text-vf-faint text-center">
        Destira is a place to actually meet people — your AI twin does the first awkward part, groups and events do
        the rest.
      </p>
    </Shell>
  );
}
