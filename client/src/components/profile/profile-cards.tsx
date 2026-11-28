// Your profile: the nudges, your events card and the small display pieces (split out of pages/Profile.tsx).
import { useState } from "react";
import { X, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { NOTE_PRIORITY, ScreenNotes } from "@/components/ui-vf";

// Below this many total photos (cover + portrait + gallery combined), a
// profile is genuinely light on the one thing that drives reads the most —
// worth a nudge, not a permanent one-time dismiss, since adding one photo
// today doesn't mean the next viewer three months from now won't still be
// looking at a mostly-empty gallery. Server-backed reminder (see
// REMINDER_KINDS in shared/schema.ts) so it resurfaces after the same
// 7-day window as the other "you're missing something" strips instead of
// vanishing forever after one dismiss.
export const MIN_PHOTOS_BEFORE_NUDGE = 3;

export const NUDGE_KEY = "vf_referral_nudge_dismissed";

/** Shown once the user is clearly enjoying it (readiness > 60) and hasn't
 *  referred anyone yet. Dismissal persists. */
export function ReferralNudge({ completionScore }: { completionScore: number }) {
  const [, setLocation] = useLocation();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(NUDGE_KEY) === "1"; } catch { return false; }
  });
  const { data } = useQuery<{ url: string; counts: { pending: number; qualified: number; rewarded: number } }>({
    queryKey: ["/api/referrals/me"],
  });

  const joined = data ? data.counts.pending + data.counts.qualified + data.counts.rewarded : 0;
  if (dismissed || completionScore <= 60 || joined > 0 || !data) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(NUDGE_KEY, "1"); } catch { /* noop */ }
  };
  const invite = () => setLocation("/invite");

  return (
    <div className="relative rounded-[18px] border border-vf-line bg-vf-surface2 p-4 pr-10 vf-card" data-testid="referral-nudge">
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 text-vf-faint hover:text-vf-text transition-colors"
        data-testid="button-dismiss-nudge"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">Bring your people</div>
      <p className="text-[14px] text-vf-text mt-1.5 leading-[1.5]">
        Bring a friend and you both get a free week once they've set up their twin.
      </p>
      <button
        onClick={invite}
        className="mt-3 inline-flex items-center rounded-full bg-vf-ember text-vf-ink font-bold px-4 h-9 text-[13px] btn-press vf-btn-primary hover:bg-[var(--vf-ember-soft)] transition-colors"
        data-testid="button-nudge-copy"
      >
        Invite friends
      </button>
    </div>
  );
}

/** Shown right where it's relevant — inside the Photos section itself, not
 *  at the top of the page with the other nudges — while the user has fewer
 *  than MIN_PHOTOS_BEFORE_NUDGE photos total (cover + portrait + gallery).
 *  Server-backed dismiss, same 7-day resurface as the Discover strips. */
export function PhotoNudge({ photoCount, onAddPhotos }: { photoCount: number; onAddPhotos: () => void }) {
  return (
    <ScreenNotes
      className="mb-4"
      notes={[
        {
          kind: "profile_photos_nudge",
          priority: NOTE_PRIORITY.setup,
          when: photoCount < MIN_PHOTOS_BEFORE_NUDGE,
          eyebrow: "Get seen",
          body: `Profiles with ${MIN_PHOTOS_BEFORE_NUDGE} or more photos get noticeably more likes. You have ${photoCount === 0 ? "none up yet" : `${photoCount} up`}.`,
          action: { label: photoCount === 0 ? "Add photos" : "Add a couple more", onClick: onAddPhotos, testId: "button-photo-nudge-add" },
          testId: "photo-nudge",
        },
      ]}
    />
  );
}

export function myEventStatusChip(status: string): { label: string; cls: string } | null {
  if (status === "pending_review") return { label: "In review", cls: "text-vf-gold border-vf-gold/30 bg-vf-gold/10" };
  if (status === "cancelled") return { label: "Called off", cls: "text-vf-faint border-vf-line" };
  if (status === "draft") return { label: "Draft", cls: "text-vf-faint border-vf-line" };
  return null;
}

export function YourEventsCard() {
  const [, setLocation] = useLocation();
  const { data } = useQuery<any[]>({
    queryKey: ["/api/events/mine"],
    queryFn: async () => {
      const r = await fetch("/api/events/mine", { credentials: "include" });
      return r.ok ? r.json() : [];
    },
  });
  const events = data ?? [];
  const shown = events
    .filter((e) => e.status === "cancelled" || new Date(e.startsAt).getTime() > Date.now())
    .slice(0, 4);

  return (
    <section data-testid="section-your-events">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Your events</SectionLabel>
        <button
          onClick={() => setLocation("/events/host")}
          className="text-[12px] text-vf-ember hover:text-[var(--vf-ember-soft)] transition-colors"
          data-testid="button-host-from-profile"
        >
          Host one
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="text-[13.5px] text-vf-muted leading-[1.55]">
          Nothing you're hosting yet. Put on the thing you'd want to be invited to.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {shown.map((e) => {
            const chip = myEventStatusChip(e.status);
            return (
              <button
                key={e.id}
                onClick={() => setLocation(`/events/${e.id}`)}
                className="text-left group"
                data-testid={`my-event-${e.id}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] text-vf-text truncate group-hover:text-vf-ember">{e.title}</span>
                  {chip && (
                    <span className={`shrink-0 font-mono text-[9.5px] uppercase tracking-[0.12em] border rounded-full px-1.5 py-0.5 ${chip.cls}`}>
                      {chip.label}
                    </span>
                  )}
                </div>
                <div className="text-[11.5px] text-vf-faint mt-0.5">
                  {new Date(e.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {e.goingCount} going
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">{children}</div>;
}

export function TwinOrb({ size = 44 }: { size?: number }) {
  return (
    <span
      className="block rounded-full shrink-0 motion-safe:animate-[vf-breathe_5s_ease-in-out_infinite]"
      style={{
        width: size,
        height: size,
        background: "radial-gradient(circle at 35% 30%, var(--vf-mint-vivid), #2E7F6B)",
      }}
      aria-hidden
    />
  );
}

export function focalPos(x?: number | null, y?: number | null): string {
  const fx = typeof x === "number" ? x : 0.5;
  const fy = typeof y === "number" ? y : 0.5;
  return `${Math.round(fx * 100)}% ${Math.round(fy * 100)}%`;
}

/** Profile strength as a ring (docs/destira-upgrade-prompt.md §7.15). */
export function StrengthRing({ value, size = 64 }: { value: number; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Profile strength ${v}%`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--vf-line)" strokeWidth={4} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--vf-ember))"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <span className="absolute font-mono text-[15px] text-vf-text">{v}</span>
    </span>
  );
}

export function ProfileRow({
  icon,
  label,
  sub,
  onClick,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string | null;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="vf-press w-full flex items-center gap-3.5 px-4 min-h-[60px] py-2.5 text-left hover:bg-vf-text/[0.03] transition-colors"
      data-testid={testId}
    >
      <span className="w-9 h-9 rounded-full bg-[var(--vf-elevated)] flex items-center justify-center text-vf-muted shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15.5px] text-vf-text">{label}</span>
        {sub && <span className="block vf-small text-vf-muted truncate">{sub}</span>}
      </span>
      <ChevronRight className="w-4 h-4 text-vf-faint shrink-0" />
    </button>
  );
}
