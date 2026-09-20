import { useEffect, useMemo, useState } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useProfile, useUpdateProfile, useUpdatePrompts, useProfileWeek, type ProfilePrompt } from "@/hooks/use-profiles";
import { useSubscription, useProfileCompletion, useTwinStructuredProfile, useTwinMemory, useGroups } from "@/hooks/use-interactions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, X, LogOut } from "lucide-react";
import { AddStoryButton, OwnStoryViewer, type OwnStory } from "@/components/story-viewer";
import { RefineWithAI } from "@/components/refine-with-ai";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

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
  const copy = () => { navigator.clipboard?.writeText(data.url).catch(() => {}); };

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
        Every friend who joins gets you five more profile views. Your daily read stays one a day.
      </p>
      <button
        onClick={copy}
        className="mt-3 inline-flex items-center rounded-full bg-vf-ember text-vf-ink font-bold px-4 h-9 text-[13px] btn-press vf-btn-primary hover:bg-[var(--vf-ember-soft)] transition-colors"
        data-testid="button-nudge-copy"
      >
        Copy invite link
      </button>
    </div>
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
  const emberActive = subscription?.tier && subscription.tier !== "free";

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
  const hasStories = (ownStories?.length ?? 0) > 0;
  const hasCover = !!(cover?.photoUrl || profile.coverPhotoUrl);
  const bio = profile.aboutMe || profile.bio || "";
  const metaLine = [
    profile.age ? String(profile.age) : null,
    profile.location || null,
    "here with intent",
  ].filter(Boolean).join(" · ");

  const openBio = () => { setBioValue(bio); setBioOpen(true); };
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

        {/* ── HEADER ────────────────────────────────────────────────── */}
        <header className="relative">
          {/* Cover wrapper — its own positioning context for the portrait,
              separate from the cover box itself (which needs overflow-hidden
              to clip the photo). That separation is what lets the portrait
              overlap the cover dramatically without either clipping the
              portrait or, worse, coupling the *name's* position to the
              portrait's height (see the note below — that coupling was a
              real bug, not a hypothetical one). */}
          <div className="relative">
            <div className="relative overflow-hidden rounded-[24px] aspect-[16/9] sm:aspect-[21/9] bg-vf-surface2">
              {cover?.photoUrl ? (
                <img
                  src={cover.photoUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  style={{ objectPosition: focalPos(cover.coverFocalX, cover.coverFocalY) }}
                />
              ) : profile.coverPhotoUrl ? (
                <img src={profile.coverPhotoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                // Real no-cover state: a flat warm surface (no mint — mint is the
                // twin layer only, never decoration), with a mono label instead of
                // the scrim-over-nothing "grey wash" this used to render as.
                <div
                  className="w-full h-full flex items-end justify-start p-4"
                  style={{ background: "linear-gradient(160deg, rgba(255,107,74,.10), var(--vf-surface2) 65%)" }}
                >
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">
                    No cover photo — this is what strangers see first
                  </span>
                </div>
              )}
              {hasCover && (
                <div
                  className="absolute inset-x-0 bottom-0 pointer-events-none"
                  style={{ height: "55%", background: "linear-gradient(to top, rgba(12,9,16,.9), transparent)" }}
                />
              )}
              {/* On the cover photo, fixed dark chip + fixed light text
                  regardless of theme, same as the scrim above it; off the
                  photo, themed like the rest of the (now non-scrimmed) card. */}
              <div
                className={
                  hasCover
                    ? "absolute top-4 right-4 font-mono text-[10.5px] uppercase tracking-[0.16em] backdrop-blur px-2.5 py-1 rounded-full border"
                    : "absolute top-4 right-4 font-mono text-[10.5px] uppercase tracking-[0.16em] backdrop-blur px-2.5 py-1 rounded-full border border-vf-line text-vf-muted bg-vf-surface/70"
                }
                style={
                  hasCover
                    ? { color: "rgba(245,240,234,0.9)", background: "rgba(12,9,16,0.45)", borderColor: "rgba(255,255,255,.12)" }
                    : undefined
                }
                data-testid="chip-profile-completeness"
              >
                Profile completeness {completionScore}%
              </div>
            </div>

            {/* Portrait — absolutely positioned against the cover wrapper
                above, not a flex sibling of the name block. It used to be:
                both sat in one flex row, bottom-aligned, so the name's
                position was "portrait's bottom minus the name block's own
                height" — which put the name back on top of the cover photo
                at ~640–900px viewports, exactly the range this pane defaults
                to, once the portrait got big enough to overlap that much.
                Positioning it independently of the name removes that
                coupling: the two no longer fight over the same alignment. */}
            <div
              className={`absolute rounded-[22px] left-1/2 -translate-x-1/2 sm:left-9 sm:translate-x-0 w-[clamp(148px,18vw,208px)] ${
                hasCover ? "top-[calc(100%-56px)] sm:top-[calc(100%-80px)]" : "top-[calc(100%+16px)]"
              }`}
              data-testid="portrait-wrap"
            >
              <div
                className="relative overflow-hidden rounded-[22px] bg-vf-surface2"
                style={{ aspectRatio: "4 / 5", border: "5px solid var(--vf-ink)", boxShadow: "0 14px 30px rgba(12,9,16,.28)" }}
                data-testid="portrait-photo"
              >
                {portrait?.photoUrl ? (
                  <img
                    src={portrait.photoUrl}
                    alt={profile.displayName || "Portrait"}
                    className="w-full h-full object-cover"
                    style={{ objectPosition: focalPos(portrait.portraitFocalX, portrait.portraitFocalY) }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--vf-ember)" }}>
                    <span
                      className="font-serif text-4xl leading-none text-vf-ink"
                      style={{ transform: "translateY(-0.06em)" }}
                    >
                      {(profile.displayName || user?.firstName || "?")[0]?.toUpperCase()}
                    </span>
                  </div>
                )}
                {hasStories && (
                  <button
                    onClick={() => setShowOwnStoryViewer(true)}
                    className="absolute inset-0 ring-2 ring-inset ring-vf-ember/80 rounded-[18px]"
                    data-testid="button-view-own-story"
                    aria-label="View your story"
                  />
                )}
              </div>

              {/* Twin badge, pinned to the portrait's corner — sits outside
                  the portrait's own overflow-hidden box (this wrapper is the
                  one with the clip; the badge is a sibling of it, not a
                  child), so it isn't cut off by the portrait's rounded
                  corner. Mint because this is the one thing on the page
                  that's actually about the twin, not decoration. */}
              <div
                className="absolute -top-2.5 -right-2.5 w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: "var(--vf-ink)", border: "2.5px solid var(--vf-mint)", boxShadow: "0 4px 10px rgba(12,9,16,.25)" }}
                title="Your twin is learning"
                data-testid="badge-twin-avatar"
              >
                <TwinOrb size={16} />
              </div>
            </div>
          </div>

          {/* Name block — normal flow, starts safely clear of both the cover
              and the portrait by construction: its margin-top is computed
              from the exact same numbers used for the portrait's size and
              overlap above, not just "enough in practice". On mobile it sits
              centered below the (also centered) portrait; at sm+ it sits
              beside the portrait, offset by the portrait's own max width
              rather than sharing a flex alignment with it. Theme-aware
              tokens throughout — this text reliably lands on the plain page
              background now, never the cover's dark scrim, at any width. */}
          <div
            className={`text-center sm:text-left min-w-0 ${
              hasCover
                ? "mt-[calc(clamp(185px,22.5vw,260px)-40px)] sm:mt-0 sm:pt-[calc(clamp(185px,22.5vw,260px)-64px)]"
                : "mt-[calc(clamp(185px,22.5vw,260px)+32px)] sm:mt-0 sm:pt-[calc(clamp(185px,22.5vw,260px)+32px)]"
            } sm:ml-[260px]`}
          >
            <div className="sm:pb-2">
              <h1 className="font-serif font-normal leading-[1.02] tracking-[-0.02em] text-[clamp(32px,4.2vw,48px)] text-vf-text" data-testid="text-display-name">
                {profile.displayName || user?.firstName}
              </h1>
              <p className="text-[14px] mt-1 text-vf-muted" data-testid="text-meta-line">
                {metaLine}{profile.isVerified ? " · verified" : ""}
              </p>
              <div className="mt-3 flex items-center gap-4 justify-center sm:justify-start flex-wrap">
                <button
                  onClick={() => setShowEditDialog(true)}
                  className="inline-flex items-center rounded-full bg-vf-ember text-vf-ink font-bold px-5 h-10 text-[13.5px] btn-press vf-btn-primary hover:bg-[var(--vf-ember-soft)] transition-colors"
                  data-testid="button-edit-profile"
                >
                  Edit profile
                </button>
                <button
                  onClick={() => setLocation("/photos")}
                  className="text-[13px] text-vf-muted hover:text-vf-text transition-colors"
                  data-testid="button-photos"
                >
                  Photos
                </button>
                <button
                  onClick={() => setLocation("/settings")}
                  className="text-[13px] text-vf-muted hover:text-vf-text transition-colors"
                  data-testid="button-open-settings"
                >
                  Settings
                </button>
                <button
                  onClick={() => setLocation("/profile/preview")}
                  className="text-[13px] text-vf-muted hover:text-vf-text transition-colors"
                  data-testid="button-how-others-see-you"
                >
                  How others see you
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Surfaced here — right where the completeness figure lives — because
            a thin profile is exactly when "what does this actually look like"
            is most useful to know. */}
        {completionScore < 50 && (
          <div
            className="rounded-[14px] border border-vf-line bg-vf-surface2 px-4 py-3 flex items-center justify-between gap-3 vf-card"
            data-testid="nudge-preview-thin-profile"
          >
            <p className="text-[13.5px] text-vf-muted">Your profile is thin — see what strangers actually get.</p>
            <button
              onClick={() => setLocation("/profile/preview")}
              className="shrink-0 text-[13px] text-vf-ember hover:text-[var(--vf-ember-soft)] transition-colors"
              data-testid="link-nudge-preview"
            >
              How others see you
            </button>
          </div>
        )}

        {/* story creator entry (kept compact — stories are a separate feature).
            No negative margin here: the header above already overlaps its own
            cover photo via -mt-7/-mt-8, and stacking a second pull-up caused
            this to clip into (or scroll partly under) the button row above it. */}
        <div className="mt-2">
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
            <section>
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
            <section>
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
                    className="w-full text-left rounded-[18px] border border-vf-line bg-vf-surface2 p-5 transition-colors duration-150 hover:bg-vf-elevated vf-card"
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
                        className="w-full text-left rounded-[16px] border border-vf-line bg-vf-surface2 p-4 transition-colors duration-150 hover:bg-vf-elevated vf-card"
                        data-testid={`prompt-${i + 1}`}
                      >
                        <div className="text-[12.5px] text-vf-muted">{p.q}</div>
                        <div className="text-[15px] text-vf-text mt-1 leading-[1.5]">{p.a}</div>
                      </button>
                    ))}
                    {prompts.length < 3 && (
                      <button
                        onClick={() => setPromptEditor({ index: prompts.length, q: PROMPT_BANK[0], a: "" })}
                        className="w-full text-left rounded-[16px] border border-dashed border-vf-line p-4 flex items-center transition-colors duration-150 hover:bg-vf-elevated"
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
              <div className="mt-3 grid grid-cols-3 gap-3">
                {gallery.slice(0, 5).map((p: any) => (
                  <div key={p.id} className="rounded-[16px] overflow-hidden border border-vf-line bg-vf-surface2" style={{ aspectRatio: "3 / 4" }} data-testid={`gallery-photo-${p.id}`}>
                    <img src={p.photoUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
                <button
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
                <div className="mt-3 flex flex-wrap gap-2">
                  {facts.slice(0, 10).map((f: any, i: number) => (
                    <span key={i} className="text-[12.5px] px-2.5 py-1 rounded-full border border-vf-mint/25 bg-vf-mint/10 text-vf-mint" data-testid={`twin-fact-${i}`}>
                      {f.factText}
                    </span>
                  ))}
                </div>
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

            {/* Ember */}
            <section
              className="rounded-[22px] border border-vf-gold/30 p-5 vf-card"
              style={{ background: "linear-gradient(150deg, rgba(233,196,106,.11), transparent)" }}
              data-testid="card-ember"
            >
              {emberActive ? (
                <>
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-gold">Ember · active</div>
                  <p className="text-[13.5px] text-vf-muted mt-2 leading-[1.55]">
                    Four twin conversations a night, full transcripts, first pick at dinners.
                  </p>
                  <button onClick={() => setLocation("/billing")} className="mt-3 text-[13px] text-vf-gold hover:text-vf-text transition-colors" data-testid="button-manage-ember">
                    Manage
                  </button>
                </>
              ) : (
                <>
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-gold">Ember · $9.99 / month</div>
                  <p className="font-serif font-normal text-2xl text-vf-text mt-2 leading-[1.2]">
                    Four twin conversations a night. Full transcripts. First pick at dinners.
                  </p>
                  <p className="text-[13.5px] text-vf-muted mt-3 leading-[1.55]">
                    Your one daily read stays free and is never for sale. Ember only makes your twin work harder.
                  </p>
                  <button
                    onClick={() => setLocation("/billing")}
                    className="mt-4 inline-flex items-center rounded-full bg-vf-gold text-vf-ink font-bold px-5 h-10 text-[13.5px] btn-press vf-btn-primary hover:bg-[#F3D890] transition-colors"
                    data-testid="button-see-ember"
                  >
                    See what changes
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
