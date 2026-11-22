import { useEffect, useMemo, useState } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useProfile, useUpdateProfile, useUpdatePrompts, useProfileWeek, type ProfilePrompt } from "@/hooks/use-profiles";
import { useSubscription, useProfileCompletion, useTwinStructuredProfile, useTwinMemory, useGroups } from "@/hooks/use-interactions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, X, LogOut, Camera, ChevronRight, Eye, Images, MessageSquareQuote, Pencil, Settings as SettingsIcon, Gift, Gem } from "lucide-react";
import { CrownBadge } from "@/components/crown-badge";
import { AddStoryButton, OwnStoryViewer, type OwnStory } from "@/components/story-viewer";
import { RefineWithAI } from "@/components/refine-with-ai";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { PLAN_CARDS, priceLabel } from "@shared/entitlements";
import { NOTE_PRIORITY, ScreenNotes, TwinGlyph, VfButton } from "@/components/ui-vf";
import { avatarColor } from "@/lib/avatar-color";

// Below this many total photos (cover + portrait + gallery combined), a
// profile is genuinely light on the one thing that drives reads the most —
// worth a nudge, not a permanent one-time dismiss, since adding one photo
// today doesn't mean the next viewer three months from now won't still be
// looking at a mostly-empty gallery. Server-backed reminder (see
// REMINDER_KINDS in shared/schema.ts) so it resurfaces after the same
// 7-day window as the other "you're missing something" strips instead of
// vanishing forever after one dismiss.
const MIN_PHOTOS_BEFORE_NUDGE = 3;

const NUDGE_KEY = "vf_referral_nudge_dismissed";

const PROMPT_BANK = [
  "The last thing that made me change my mind",
  "A small thing I'd never compromise on",
  "What I'm actually looking for here",
  "Something I could talk about for an hour",
  "The way to my good side",
  "A quiet Sunday, done right",
  "What my closest friend would warn you about",
  "I get unreasonably excited about",
];

/** Shown once the user is clearly enjoying it (readiness > 60) and hasn't
 *  referred anyone yet. Dismissal persists. */
function ReferralNudge({ completionScore }: { completionScore: number }) {
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
function PhotoNudge({ photoCount, onAddPhotos }: { photoCount: number; onAddPhotos: () => void }) {
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

function myEventStatusChip(status: string): { label: string; cls: string } | null {
  if (status === "pending_review") return { label: "In review", cls: "text-vf-gold border-vf-gold/30 bg-vf-gold/10" };
  if (status === "cancelled") return { label: "Called off", cls: "text-vf-faint border-vf-line" };
  if (status === "draft") return { label: "Draft", cls: "text-vf-faint border-vf-line" };
  return null;
}

function YourEventsCard() {
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">{children}</div>;
}

function TwinOrb({ size = 44 }: { size?: number }) {
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

function focalPos(x?: number | null, y?: number | null): string {
  const fx = typeof x === "number" ? x : 0.5;
  const fy = typeof y === "number" ? y : 0.5;
  return `${Math.round(fx * 100)}% ${Math.round(fy * 100)}%`;
}

/** Profile strength as a ring (docs/destira-upgrade-prompt.md §7.15). */
function StrengthRing({ value, size = 64 }: { value: number; size?: number }) {
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

function ProfileRow({
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

export default function Profile() {
  const { data: profile, isLoading } = useProfile();
  const { data: subscription } = useSubscription();
  const { data: completion } = useProfileCompletion();
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const updateProfile = useUpdateProfile();
  const updatePrompts = useUpdatePrompts();
  const { data: structuredProfile } = useTwinStructuredProfile();
  const { data: twinMemory } = useTwinMemory();
  const { data: week } = useProfileWeek();
  const { data: groups } = useGroups();

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showOwnStoryViewer, setShowOwnStoryViewer] = useState(false);
  const [showStoryCreator, setShowStoryCreator] = useState(false);

  const [bioOpen, setBioOpen] = useState(false);
  const [bioValue, setBioValue] = useState("");
  const [bioDrafting, setBioDrafting] = useState(false);

  const [promptEditor, setPromptEditor] = useState<{ index: number; q: string; a: string } | null>(null);

  const { data: photos } = useQuery<any[]>({
    queryKey: ["/api/photos", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/photos/${user!.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user?.id,
  });

  const { data: ownStories } = useQuery<any[]>({
    queryKey: ["/api/stories/mine"],
    queryFn: async () => {
      const res = await fetch("/api/stories/mine", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user?.id,
  });

  const cover = useMemo(() => (photos ?? []).find((p) => p.role === "cover"), [photos]);
  const portrait = useMemo(
    () => (photos ?? []).find((p) => p.role === "portrait") ?? (photos ?? []).find((p) => p.isMainProfilePhoto),
    [photos],
  );
  const gallery = useMemo(
    () => (photos ?? []).filter((p) => p.id !== cover?.id && p.id !== portrait?.id),
    [photos, cover, portrait],
  );

  const facts: any[] = twinMemory?.facts ?? [];
  const messages: any[] = twinMemory?.messages ?? [];
  const twinWords = useMemo(() => {
    const text = [
      ...facts.map((f: any) => f.factText || ""),
      ...messages.filter((m: any) => m.role === "user").map((m: any) => m.message || ""),
    ].join(" ").trim();
    return text ? text.split(/\s+/).length : 0;
  }, [facts, messages]);

  const answered = (profile?.twinQuestionsAnswered || 0) + facts.filter((f: any) => f.source !== "onboarding").length;
  const answeredPct = Math.min(Math.round((answered / 100) * 100), 100);

  const completionScore = completion?.score ?? profile?.profileCompletionScore ?? 0;
  // The member's own plan (a paid one, or the signup trial), else Ember as
  // the one to look at. Names, prices and pitches come from the plan list.
  const myPlan = PLAN_CARDS.find((p) => p.tier === subscription?.tier && p.tier !== "free");
  const ember = PLAN_CARDS.find((p) => p.tier === "ember")!;

  if (isLoading) {
    return (
      <LayoutShell>
        <div className="h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-vf-mint" />
        </div>
      </LayoutShell>
    );
  }

  if (!profile) {
    return (
      <LayoutShell>
        <div className="text-center mt-20">
          <h2 className="font-serif font-normal text-2xl text-vf-text">Welcome to Destira!</h2>
          <p className="mt-2 mb-6 text-vf-muted">Complete your Soul-Mapping to get started.</p>
          <button
            onClick={() => setLocation("/onboarding")}
            className="font-semibold btn-press vf-btn-primary px-8 h-12 rounded-full bg-vf-ember text-vf-ink hover:bg-[var(--vf-ember-soft)] transition-colors"
            data-testid="button-start-onboarding"
          >
            Start Soul-Mapping
          </button>
        </div>
      </LayoutShell>
    );
  }

  const prompts: ProfilePrompt[] = Array.isArray(profile.prompts) ? profile.prompts : [];
  const leadPhoto: string | null = portrait?.photoUrl || cover?.photoUrl || profile.coverPhotoUrl || null;
  const leadFocal = portrait?.photoUrl
    ? focalPos(portrait.portraitFocalX, portrait.portraitFocalY)
    : cover?.photoUrl
      ? focalPos(cover.coverFocalX, cover.coverFocalY)
      : "50% 30%";
  // Older profiles keep their lead photo on the profile row, not in the gallery.
  const photoCount = Math.max(photos?.length ?? 0, leadPhoto ? 1 : 0);
  const nextTask = (completion?.tasks ?? []).find((t: { completed: boolean }) => !t.completed) as
    | { key: string; label: string; benefit: string }
    | undefined;
  const hasStories = (ownStories?.length ?? 0) > 0;
  const bio = profile.aboutMe || profile.bio || "";
  const metaLine = [
    profile.age ? String(profile.age) : null,
    profile.location || null,
    "here with intent",
  ].filter(Boolean).join(" · ");

  const openBio = () => { setBioValue(bio); setBioOpen(true); };
  const doTask = () => {
    if (!nextTask) return;
    if (nextTask.key === "photos") return setLocation("/photos");
    if (nextTask.key === "bio") {
      openBio();
      document.getElementById("profile-bio")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (nextTask.key === "verify") return setLocation("/settings");
    setLocation("/onboarding");
  };
  const saveBio = async () => {
    try {
      await updateProfile.mutateAsync({ userId: user!.id, data: { aboutMe: bioValue, bio: bioValue } });
      setBioOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      toast({ title: "Saved" });
    } catch {
      toast({ title: "Couldn't save", variant: "destructive" });
    }
  };
  // §D: drafts a starting point INTO the editor. Never auto-saves, never
  // overwrites — only offered while the editor is empty.
  const draftBio = async () => {
    setBioDrafting(true);
    try {
      const seed =
        (structuredProfile?.interests ?? []).join(", ") ||
        (structuredProfile?.topValues ?? []).join(", ") ||
        "someone here with intent";
      const res = await fetch("/api/profile/polish-bio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio: seed }),
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      const { polished } = await res.json();
      setBioValue(polished || "");
    } catch {
      toast({ title: "Your twin couldn't draft one right now", variant: "destructive" });
    } finally {
      setBioDrafting(false);
    }
  };

  const savePrompt = async () => {
    if (!promptEditor) return;
    const next = [...prompts];
    const entry = { q: promptEditor.q, a: promptEditor.a.trim() };
    if (promptEditor.index >= next.length) next.push(entry);
    else next[promptEditor.index] = entry;
    const cleaned = next.filter((p) => p.a.length > 0).slice(0, 3);
    try {
      await updatePrompts.mutateAsync(cleaned);
      setPromptEditor(null);
      toast({ title: "Saved" });
    } catch {
      toast({ title: "Couldn't save", variant: "destructive" });
    }
  };

  const myRooms = (groups ?? []).filter((g: any) => g.isMember);
  const referralUrl = (queryClient.getQueryData(["/api/referrals/me"]) as any)?.url as string | undefined;
  const askFriends = () => {
    if (referralUrl) navigator.clipboard?.writeText(referralUrl).catch(() => {});
    toast({ title: referralUrl ? "Invite link copied" : "Invite link isn't ready yet" });
  };

  return (
    <LayoutShell>
      <div className="flex flex-col gap-8">
        <ReferralNudge completionScore={completionScore} />

        {/* ── HEADER (§7.15): the lead photo, large ─────────────────── */}
        <header className="flex flex-col gap-5" data-testid="profile-header">
          <div className="relative overflow-hidden rounded-[28px] aspect-[4/5] sm:aspect-[16/10] max-h-[620px] w-full bg-vf-surface2" data-testid="portrait-photo">
            {leadPhoto ? (
              <img
                src={leadPhoto}
                alt={profile.displayName || "You"}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ objectPosition: leadFocal }}
              />
            ) : (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-5"
                style={{ background: `radial-gradient(120% 90% at 20% 10%, ${avatarColor(user?.id || "me")}, transparent 60%), radial-gradient(100% 90% at 90% 100%, ${avatarColor(profile.displayName || "me")}, transparent 60%), var(--vf-elevated)` }}
              >
                <span className="font-display text-white/90 text-[120px] leading-none" aria-hidden="true">
                  {(profile.displayName || user?.firstName || "?")[0]?.toUpperCase()}
                </span>
                <VfButton onClick={() => setLocation("/photos")} leading={<Camera className="w-4 h-4" />} data-testid="button-add-first-photo">
                  Add your first photo
                </VfButton>
              </div>
            )}
            {leadPhoto && (
              <div className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none" style={{ background: "linear-gradient(to top, rgba(12,9,16,.85), transparent)" }} />
            )}

            {/* Your story: the avatar with a ring, and a small + to add one. */}
            <div className="absolute top-3 left-3 flex items-center">
              <button
                onClick={() => (hasStories ? setShowOwnStoryViewer(true) : setShowStoryCreator(true))}
                className={`vf-press relative w-12 h-12 rounded-full overflow-hidden ${hasStories ? "ring-[2.5px] ring-vf-ember ring-offset-2 ring-offset-black/40" : "ring-2 ring-white/70"}`}
                style={{ background: avatarColor(user?.id || "me") }}
                aria-label={hasStories ? "View your story" : "Add to your story"}
                data-testid="button-view-own-story"
              >
                {leadPhoto ? (
                  <img src={leadPhoto} alt="" className="w-full h-full object-cover" style={{ objectPosition: leadFocal }} />
                ) : (
                  <span className="font-display text-white text-[20px]">{(profile.displayName || "?")[0]?.toUpperCase()}</span>
                )}
              </button>
              <button
                onClick={() => setShowStoryCreator(true)}
                className="vf-press -ml-3.5 mt-7 w-6 h-6 rounded-full bg-vf-ember text-vf-ink flex items-center justify-center border-2 border-black/40"
                aria-label="Add to your story"
                data-testid="button-add-story-avatar"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={3} />
              </button>
            </div>

            <span
              className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em]"
              style={{ background: "rgba(12,9,16,.55)", color: "#8FE3C7", backdropFilter: "blur(6px)" }}
              title="Your twin is learning"
              data-testid="badge-twin-avatar"
            >
              <TwinGlyph size={14} /> Twin {answeredPct}%
            </span>

            {leadPhoto && (
              <div className="absolute left-5 right-5 bottom-5" style={{ color: "#F5F0EA" }}>
                <h1 className="font-display leading-[1.02] text-[clamp(36px,8vw,52px)]" data-testid="text-display-name">
                  {profile.displayName || user?.firstName}
                  {profile.age ? <span className="opacity-80">, {profile.age}</span> : null}
                  <span className="inline-block align-middle ml-2.5">
                    <CrownBadge userId={profile.userId} size={28} onPhoto />
                  </span>
                </h1>
                <p className="text-[15px] mt-1 opacity-85" data-testid="text-meta-line">{metaLine}{profile.isVerified ? " · verified" : ""}</p>
              </div>
            )}
          </div>

          {!leadPhoto && (
            <div>
              <h1 className="vf-display text-vf-text text-[clamp(34px,7vw,48px)] leading-[1.02]" data-testid="text-display-name">
                {profile.displayName || user?.firstName}
                {profile.age ? <span className="text-vf-muted">, {profile.age}</span> : null}
                <span className="inline-block align-middle ml-2.5">
                  <CrownBadge userId={profile.userId} size={28} />
                </span>
              </h1>
              <p className="vf-body text-vf-muted mt-1" data-testid="text-meta-line">{metaLine}{profile.isVerified ? " · verified" : ""}</p>
            </div>
          )}

          {/* Profile strength: a ring and the one next step. */}
          <div className="flex items-center gap-4 rounded-[20px] border border-vf-line bg-vf-surface2 p-4" data-testid="chip-profile-completeness">
            <StrengthRing value={completionScore} />
            <div className="flex-1 min-w-0">
              <div className="vf-label text-vf-faint">Profile strength</div>
              {nextTask ? (
                <>
                  <div className="text-[15.5px] text-vf-text mt-0.5">{nextTask.label}</div>
                  <div className="vf-small text-vf-muted">{nextTask.benefit}.</div>
                </>
              ) : (
                <div className="text-[15.5px] text-vf-text mt-0.5">Everything's in. People see the whole of you.</div>
              )}
            </div>
            {nextTask && (
              <VfButton size="sm" variant="secondary" onClick={doTask} data-testid="button-next-task">
                Do it
              </VfButton>
            )}
          </div>

          {/* Everything about you, as rows. */}
          <nav className="rounded-[20px] border border-vf-line bg-vf-surface2 overflow-hidden divide-y divide-vf-line" aria-label="Your profile" data-testid="profile-rows">
            <ProfileRow icon={<Pencil className="w-4 h-4" />} label="Edit profile" sub="Name, words, where you are" onClick={() => setShowEditDialog(true)} testId="button-edit-profile" />
            <ProfileRow icon={<Images className="w-4 h-4" />} label="Photos" sub={`${photoCount} photo${photoCount === 1 ? "" : "s"}${photoCount < 3 ? " · profiles with 3+ get more likes" : ""}`} onClick={() => setLocation("/photos")} testId="button-photos" />
            <ProfileRow icon={<MessageSquareQuote className="w-4 h-4" />} label="Prompts" sub={`${prompts.length} of 3 answered`} onClick={() => document.getElementById("profile-prompts")?.scrollIntoView({ behavior: "smooth", block: "start" })} testId="row-prompts" />
            <ProfileRow icon={<TwinGlyph size={16} />} label="Your twin" sub="What it says about you, and what it won't" onClick={() => setLocation("/twin-disclosure?from=/profile")} testId="row-your-twin" />
            <ProfileRow icon={<Eye className="w-4 h-4" />} label="How others see you" sub="Your card and profile, exactly as shown" onClick={() => setLocation("/profile/preview")} testId="button-how-others-see-you" />
            <ProfileRow icon={<Gem className="w-4 h-4" />} label="Plan" sub={myPlan ? `You're on ${myPlan.name}` : "Free"} onClick={() => setLocation("/plans")} testId="row-plan" />
            <ProfileRow icon={<Gift className="w-4 h-4" />} label="Invite friends" sub="Bring your people" onClick={() => setLocation("/invite")} testId="row-invite" />
            <ProfileRow icon={<SettingsIcon className="w-4 h-4" />} label="Settings" onClick={() => setLocation("/settings")} testId="button-open-settings" />
          </nav>
        </header>

        {/* The story creator opens from the header avatar; its own trigger stays hidden. */}
        <div className="h-0 [&_[data-testid=add-story-button-wrapper]]:hidden">
          <AddStoryButton
            onStoryAdded={() => { setShowStoryCreator(false); queryClient.invalidateQueries({ queryKey: ["/api/stories/mine"] }); }}
            open={showStoryCreator}
            onOpenChange={setShowStoryCreator}
          />
        </div>

        {/* ── BODY ──────────────────────────────────────────────────── */}
        <div className="grid gap-6 lg:gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)]">
          {/* LEFT — you */}
          <div className="flex flex-col gap-9">
            {/* In your words */}
            <section id="profile-bio" className="scroll-mt-20">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-serif font-normal text-2xl text-vf-text">In your words</h2>
                {!bioOpen && (
                  <button onClick={openBio} className="text-[13px] text-vf-muted hover:text-vf-text transition-colors" data-testid="button-edit-bio">
                    Edit
                  </button>
                )}
              </div>
              {bioOpen ? (
                <div className="rounded-[16px] border border-vf-line bg-vf-surface2 p-4 vf-card">
                  <Textarea
                    value={bioValue}
                    onChange={(e) => setBioValue(e.target.value.slice(0, 400))}
                    rows={5}
                    placeholder="What someone should know before your twin does the talking."
                    className="text-[15px] leading-[1.6] text-vf-text resize-none bg-vf-ink border-vf-line rounded-[12px]"
                    data-testid="input-bio"
                  />
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    <button
                      onClick={saveBio}
                      disabled={updateProfile.isPending}
                      className="inline-flex items-center gap-1.5 rounded-full bg-vf-ember text-vf-ink font-bold px-4 h-9 text-[13px] btn-press vf-btn-primary hover:bg-[var(--vf-ember-soft)] transition-colors disabled:opacity-40"
                      data-testid="button-save-bio"
                    >
                      {updateProfile.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Save
                    </button>
                    <button onClick={() => setBioOpen(false)} className="text-[13px] text-vf-muted hover:text-vf-text">Cancel</button>
                    {bioValue.trim() === "" && (
                      <button
                        onClick={draftBio}
                        disabled={bioDrafting}
                        className="text-[13px] text-vf-mint hover:text-vf-text transition-colors ml-auto"
                        data-testid="button-draft-bio"
                      >
                        {bioDrafting ? "Drafting…" : "Ask your twin for a starting point"}
                      </button>
                    )}
                  </div>
                  <div className="mt-3">
                    <RefineWithAI
                      value={bioValue}
                      fieldType="bio"
                      onApply={(text) => setBioValue(text.slice(0, 400))}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-[16px] leading-[1.65] text-vf-muted whitespace-pre-line" data-testid="text-bio">
                  {bio || "Nothing here yet. A few honest lines help your twin sound like you."}
                </p>
              )}
            </section>

            {/* Prompts */}
            <section id="profile-prompts" className="scroll-mt-20">
              <SectionLabel>Prompts</SectionLabel>
              {prompts.length === 0 ? (
                // An empty section shouldn't look like a filled one — plain
                // text, no card, when there's nothing here yet.
                <div className="mt-3">
                  <p className="text-[14px] text-vf-muted">Nothing answered yet — your twin has nothing of yours to quote.</p>
                  <button
                    onClick={() => setPromptEditor({ index: 0, q: PROMPT_BANK[0], a: "" })}
                    className="mt-2 text-[13px] text-vf-mint hover:text-vf-text transition-colors"
                    data-testid="prompt-add"
                  >
                    Answer one
                  </button>
                </div>
              ) : (
                // Weighted, not uniform: the first prompt gets a full-width
                // featured card with the bigger serif treatment (it's the
                // one your twin reaches for most), the rest sit smaller,
                // side by side, below it.
                <div className="mt-3 flex flex-col gap-3">
                  <button
                    onClick={() => setPromptEditor({ index: 0, q: prompts[0].q, a: prompts[0].a })}
                    className="w-full text-left rounded-[18px] border border-vf-line bg-vf-surface2 p-5 transition-colors duration-150 hover:bg-[var(--vf-elevated)] vf-card"
                    data-testid="prompt-0"
                  >
                    <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-vf-faint">{prompts[0].q}</div>
                    <div className="font-serif text-[26px] leading-[1.25] text-vf-text mt-2 max-w-[520px]">{prompts[0].a}</div>
                  </button>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {prompts.slice(1).map((p, i) => (
                      <button
                        key={i + 1}
                        onClick={() => setPromptEditor({ index: i + 1, q: p.q, a: p.a })}
                        className="w-full text-left rounded-[16px] border border-vf-line bg-vf-surface2 p-4 transition-colors duration-150 hover:bg-[var(--vf-elevated)] vf-card"
                        data-testid={`prompt-${i + 1}`}
                      >
                        <div className="text-[12.5px] text-vf-muted">{p.q}</div>
                        <div className="text-[15px] text-vf-text mt-1 leading-[1.5]">{p.a}</div>
                      </button>
                    ))}
                    {prompts.length < 3 && (
                      <button
                        onClick={() => setPromptEditor({ index: prompts.length, q: PROMPT_BANK[0], a: "" })}
                        className="w-full text-left rounded-[16px] border border-dashed border-vf-line p-4 flex items-center transition-colors duration-150 hover:bg-[var(--vf-elevated)]"
                        data-testid="prompt-add"
                      >
                        <div className="text-[13.5px] text-vf-muted">Answer one more — your twin quotes these</div>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {promptEditor && (
                <div className="mt-3 rounded-[16px] border border-vf-line bg-vf-surface2 p-4 flex flex-col gap-3 vf-card" data-testid="prompt-editor">
                  <select
                    value={promptEditor.q}
                    onChange={(e) => setPromptEditor({ ...promptEditor, q: e.target.value })}
                    className="bg-vf-ink border border-vf-line rounded-[10px] h-10 px-3 text-[14px] text-vf-text outline-none focus:border-vf-mint/50"
                    data-testid="select-prompt-question"
                  >
                    {Array.from(new Set([promptEditor.q, ...PROMPT_BANK])).map((q) => (
                      <option key={q} value={q}>{q}</option>
                    ))}
                  </select>
                  <Textarea
                    value={promptEditor.a}
                    onChange={(e) => setPromptEditor({ ...promptEditor, a: e.target.value.slice(0, 400) })}
                    rows={3}
                    placeholder="Keep it specific. One real thing beats three vague ones."
                    className="text-[14px] leading-[1.5] text-vf-text resize-none bg-vf-ink border-vf-line rounded-[12px]"
                    data-testid="input-prompt-answer"
                  />
                  <RefineWithAI
                    key={`refine-prompt-${promptEditor.index}`}
                    value={promptEditor.a}
                    fieldType="answer"
                    promptContext={promptEditor.q}
                    onApply={(text) => setPromptEditor((cur) => (cur ? { ...cur, a: text.slice(0, 400) } : cur))}
                  />
                  <div className="flex items-center gap-3">
                    <button
                      onClick={savePrompt}
                      disabled={updatePrompts.isPending}
                      className="inline-flex items-center gap-1.5 rounded-full bg-vf-ember text-vf-ink font-bold px-4 h-9 text-[13px] btn-press vf-btn-primary hover:bg-[var(--vf-ember-soft)] transition-colors disabled:opacity-40"
                      data-testid="button-save-prompt"
                    >
                      {updatePrompts.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Save
                    </button>
                    <button onClick={() => setPromptEditor(null)} className="text-[13px] text-vf-muted hover:text-vf-text">Cancel</button>
                    {promptEditor.index < prompts.length && (
                      <button
                        onClick={async () => {
                          const next = prompts.filter((_, idx) => idx !== promptEditor.index);
                          try { await updatePrompts.mutateAsync(next); setPromptEditor(null); } catch { /* toasted below */ }
                        }}
                        className="text-[13px] text-vf-faint hover:text-vf-text ml-auto"
                        data-testid="button-remove-prompt"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Photos */}
            <section>
              <SectionLabel>Photos</SectionLabel>
              <div className="mt-3">
                <PhotoNudge photoCount={(photos ?? []).length} onAddPhotos={() => setLocation("/photos")} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {gallery.slice(0, 5).map((p: any) => (
                  <div key={p.id} className="rounded-[16px] overflow-hidden border border-vf-line bg-vf-surface2" style={{ aspectRatio: "3 / 4" }} data-testid={`gallery-photo-${p.id}`}>
                    <img src={p.photoUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
                <button aria-label="Add photos"
                  onClick={() => setLocation("/photos")}
                  className="rounded-[16px] border border-dashed border-vf-line text-vf-faint hover:border-vf-text/25 hover:text-vf-text transition-colors flex items-center justify-center"
                  style={{ aspectRatio: "3 / 4" }}
                  data-testid="button-add-photo"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </section>

            {/* Vouched by */}
            <section>
              <SectionLabel>Vouched by</SectionLabel>
              <p className="text-[14px] text-vf-muted mt-3">Nobody has vouched for you yet.</p>
              <button
                onClick={askFriends}
                className="mt-3 inline-flex items-center rounded-full border border-vf-line text-vf-soft hover:border-vf-text/25 px-4 h-9 text-[13px] transition-colors"
                data-testid="button-ask-friends"
              >
                Ask two friends
              </button>
            </section>

            {/* Rooms you're in */}
            <section>
              <SectionLabel>Rooms you're in</SectionLabel>
              {myRooms.length === 0 ? (
                <p className="text-[14px] text-vf-muted mt-3">
                  You haven't joined a room yet.{" "}
                  <button onClick={() => setLocation("/lounge")} className="text-vf-mint hover:text-vf-text">Find one</button>
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {myRooms.map((g: any) => (
                    <button
                      key={g.id}
                      onClick={() => setLocation(`/lounge/group/${g.id}`)}
                      className="inline-flex items-center gap-2 rounded-full border border-vf-line text-vf-soft hover:border-vf-text/25 px-3.5 h-9 text-[13px] transition-colors"
                      data-testid={`room-chip-${g.id}`}
                    >
                      {g.name}
                      <span className="font-mono text-[10.5px] text-vf-faint">{g.memberCount}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <YourEventsCard />
          </div>

          {/* RIGHT — your twin and your state */}
          <div className="flex flex-col gap-9">
            {/* Your twin */}
            <section>
              <div className="flex items-center gap-3">
                <TwinOrb size={44} />
                <div className="min-w-0">
                  <h2 className="font-serif font-normal text-2xl text-vf-text leading-none">Your twin</h2>
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint mt-1.5">
                    learning · {twinWords.toLocaleString()} words of you so far
                  </p>
                </div>
              </div>
              <button
                onClick={() => setLocation("/twin-chat?from=/profile")}
                className="mt-4 inline-flex items-center rounded-full bg-vf-ember text-vf-ink font-bold px-5 h-10 text-[13.5px] btn-press vf-btn-primary hover:bg-[var(--vf-ember-soft)] transition-colors"
                data-testid="button-talk-to-twin"
              >
                Talk to your twin
              </button>
              <div className="mt-4">
                <div className="h-1 rounded-full bg-vf-text/10 overflow-hidden">
                  <div className="h-full bg-vf-mint transition-all duration-500" style={{ width: `${answeredPct}%` }} data-testid="bar-twin-training" />
                </div>
                <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint mt-2">{answered} of 100 · conversation depth, not Soul-Mapping</p>
              </div>
            </section>

            {/* What your twin can say */}
            <section>
              <SectionLabel>What your twin can say</SectionLabel>
              {facts.length > 0 ? (
                // Whole sentences, so a list of boxes that wrap, not pills
                // (a pill can't hold two lines without the text spilling
                // past its rounded ends).
                <ul className="mt-3 flex flex-col gap-2">
                  {facts.slice(0, 10).map((f: any, i: number) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 rounded-[14px] border border-vf-mint/20 bg-vf-mint/[0.07] px-3.5 py-2.5 text-[14px] leading-[1.45] text-vf-text break-words min-w-0"
                      data-testid={`twin-fact-${i}`}
                    >
                      <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-vf-mint shrink-0" aria-hidden="true" />
                      <span className="min-w-0">{f.factText}</span>
                    </li>
                  ))}
                  {facts.length > 10 && (
                    <li className="text-[13px] text-vf-muted px-1">+{facts.length - 10} more your twin knows</li>
                  )}
                </ul>
              ) : (
                <p className="text-[14px] text-vf-muted mt-3">Nothing yet — a few conversations fill this in.</p>
              )}
              <button
                onClick={() => setLocation("/twin-chat?from=/profile")}
                className="mt-3 text-[13px] text-vf-mint hover:text-vf-text transition-colors"
                data-testid="button-manage-twin"
              >
                Manage what it knows
              </button>
            </section>

            {/* This week — one ticker strip instead of three boxed tiles.
                Three identical rounded cards read as dashboard widgets; a
                single strip with numerals divided by hairlines reads as an
                editorial stat line, which is the register the rest of this
                page is already in (mono eyebrows, serif numerals). */}
            <section>
              <SectionLabel>This week</SectionLabel>
              <div className="mt-3 rounded-[16px] border border-vf-line bg-vf-surface2 p-4 flex vf-card">
                {[
                  { n: week?.twinTalks ?? 0, label: "twin talks" },
                  { n: week?.readsOver80 ?? 0, label: "reads over 80" },
                  { n: week?.meetsSet ?? 0, label: "meetings set" },
                ].map((s, i) => (
                  <div
                    key={s.label}
                    className={`flex-1 text-center px-2 ${i > 0 ? "border-l border-vf-line" : ""}`}
                    data-testid={`stat-${s.label.replace(/\s+/g, "-")}`}
                  >
                    <div className="font-serif text-[30px] leading-none text-vf-text">{s.n}</div>
                    <div className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-vf-faint mt-2 leading-[1.3]">{s.label}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Plan */}
            <section
              className="rounded-[22px] border border-vf-gold/30 p-5 vf-card"
              style={{ background: "linear-gradient(150deg, rgba(233,196,106,.11), transparent)" }}
              data-testid="card-ember"
            >
              {myPlan ? (
                <>
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-gold">
                    {myPlan.name} · {subscription?.isTrial ? "free trial" : "active"}
                  </div>
                  <p className="text-[13.5px] text-vf-muted mt-2 leading-[1.55]">{myPlan.pitch}</p>
                  <button onClick={() => setLocation("/plans")} className="mt-3 text-[13px] text-vf-gold hover:text-vf-text transition-colors" data-testid="button-manage-ember">
                    {subscription?.isTrial ? "See plans" : "Manage"}
                  </button>
                </>
              ) : (
                <>
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-gold">
                    {ember.name} · {priceLabel(ember.priceCents)} / month
                  </div>
                  <p className="font-serif font-normal text-2xl text-vf-text mt-2 leading-[1.2]">{ember.pitch}</p>
                  <button
                    onClick={() => setLocation("/plans")}
                    className="mt-4 inline-flex items-center rounded-full bg-vf-gold text-vf-ink font-bold px-5 h-10 text-[13.5px] btn-press vf-btn-primary hover:bg-[#F3D890] transition-colors"
                    data-testid="button-see-ember"
                  >
                    See plans
                  </button>
                </>
              )}
            </section>
          </div>
        </div>

        {/* Mobile sign out */}
        <div className="md:hidden">
          <button
            className="w-full flex justify-center items-center gap-2 font-medium btn-press py-3 rounded-2xl border border-vf-line text-vf-faint hover:text-vf-text transition-colors text-[14px]"
            onClick={() => logout()}
            data-testid="button-logout-profile"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      <EditProfileDialog open={showEditDialog} onOpenChange={setShowEditDialog} profile={profile} userId={user?.id || ""} />

      {showOwnStoryViewer && hasStories && (
        <OwnStoryViewer
          stories={ownStories as OwnStory[]}
          onClose={() => setShowOwnStoryViewer(false)}
          onAddStory={() => { setShowOwnStoryViewer(false); setShowStoryCreator(true); }}
          userName={profile.displayName || user?.firstName || "You"}
          profileImageUrl={portrait?.photoUrl || cover?.photoUrl || undefined}
        />
      )}
    </LayoutShell>
  );
}

function EditProfileDialog({
  open,
  onOpenChange,
  profile,
  userId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: any;
  userId: string;
}) {
  const initialName = profile.displayName || "";
  const initialBio = profile.bio || "";
  const initialLocation = profile.location || "";

  const [displayName, setDisplayName] = useState(initialName);
  const [bio, setBio] = useState(initialBio);
  const [location, setLocation] = useState(initialLocation);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const updateProfile = useUpdateProfile();

  const BIO_MAX = 240;
  const pristine =
    displayName === initialName &&
    bio === initialBio &&
    location === initialLocation;

  const inputClass =
    "bg-vf-text/5 border-vf-line rounded-[12px] text-vf-text focus-visible:ring-2 focus-visible:ring-vf-ember/60 focus-visible:ring-offset-2 focus-visible:ring-offset-vf-surface";

  const handleSave = async () => {
    if (pristine) return;
    setSaving(true);
    try {
      await updateProfile.mutateAsync({
        userId,
        data: { displayName, bio: bio.slice(0, BIO_MAX), location },
      });
      toast({ title: "Profile updated" });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Error", description: "Failed to update profile.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-vf-surface border-vf-line" style={{ borderRadius: "26px" }}>
        <DialogHeader>
          <DialogTitle className="font-serif font-normal text-vf-text text-2xl">Edit profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-display-name" className="text-vf-soft text-[13px]">Display name</Label>
            <Input id="edit-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} data-testid="input-display-name" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-bio" className="text-vf-soft text-[13px]">In your words</Label>
              <span className="font-mono text-[10.5px] text-vf-faint tabular-nums">{bio.length}/{BIO_MAX}</span>
            </div>
            <Textarea
              id="edit-bio"
              value={bio}
              maxLength={BIO_MAX}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
              rows={4}
              className={`${inputClass} resize-none`}
              data-testid="input-bio-dialog"
            />
            <RefineWithAI
              value={bio}
              fieldType="bio"
              onApply={(text) => setBio(text.slice(0, BIO_MAX))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-location" className="text-vf-soft text-[13px]">Location</Label>
            <Input id="edit-location" value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} data-testid="input-location" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <button onClick={() => onOpenChange(false)} className="text-sm font-medium text-vf-muted hover:text-vf-text px-4 h-11 transition-colors" data-testid="button-cancel-edit">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || pristine}
            className="inline-flex items-center justify-center rounded-full bg-vf-ember text-vf-ink font-bold px-6 h-11 text-sm btn-press vf-btn-primary transition-colors hover:bg-[var(--vf-ember-soft)] disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="button-save-profile"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
