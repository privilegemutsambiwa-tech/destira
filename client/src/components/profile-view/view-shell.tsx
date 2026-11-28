// Someone's profile: the page shell, back bar and small helpers (split out of pages/ProfileView.tsx).
import type React from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Pencil } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { getFromRoute } from "@/lib/from-route";

/** Small mono "Edit" affordance for an editable region in the preview. Quiet
 *  by default (visible-but-unobtrusive on touch, no hover to reveal it),
 *  full opacity on hover/focus on desktop. Never a bare icon — always labelled. */
export function EditAffordance({ onClick, label = "Edit" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-vf-line bg-vf-surface/90 backdrop-blur px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-vf-muted opacity-60 hover:opacity-100 focus-visible:opacity-100 transition-opacity"
      data-testid="button-preview-edit"
    >
      <Pencil className="w-3 h-3" />
      {label}
    </button>
  );
}

/** In preview mode the preview bar (rendered by ProfilePreview.tsx) is the
 *  only chrome — the real app nav would be redundant and confusing next to
 *  it. Real /u/:userId visits keep the normal LayoutShell. */
export function ViewShell({ preview, children }: { preview: boolean; children: React.ReactNode }) {
  if (preview) return <div className="px-4 py-6 sm:px-6">{children}</div>;
  return (
    <LayoutShell>
      <BackBar />
      {children}
    </LayoutShell>
  );
}

/** A profile opens from many places (Discover, Likes, Lounge, a chat…). An
 *  explicit ?from= wins; otherwise step back through history, and only fall
 *  back to Discover when there's nothing to go back to (a shared link). */
export function BackBar() {
  const [, setLocation] = useLocation();
  const goBack = () => {
    const from = getFromRoute(window.location.search, "");
    if (from) setLocation(from);
    else if (window.history.length > 1) window.history.back();
    else setLocation("/discover");
  };
  return (
    <button
      onClick={goBack}
      className="inline-flex items-center gap-1 -ml-1 mb-4 text-[13px] text-vf-muted hover:text-vf-text transition-colors"
      data-testid="button-profile-back"
    >
      <ChevronLeft className="w-4 h-4" /> Back
    </button>
  );
}

export const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";

export function firstName(p: any): string {
  return (p?.displayName || p?.user?.firstName || "Someone").split(" ")[0];
}

export function relAge(iso?: string): string {
  if (!iso) return "recently";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  return `${Math.floor(days / 7)} weeks ago`;
}
