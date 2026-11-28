import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Flag, Heart, Loader2 } from "lucide-react";
import { CrownBadge } from "@/components/crown-badge";
import { IntroduceButton } from "@/components/crown-intro";
import { DetailChips } from "@/components/detail-chips";
import { WhyYouMightClick, useClickReasons } from "@/components/why-click";
import { ResonanceGlyph, TwinGlyph, VfButton } from "@/components/ui-vf";
import { RefineWithAI } from "@/components/refine-with-ai";
import { useProfile, usePhotos, usePublicAnswers, useProfileGroups, useUpdateProfile } from "@/hooks/use-profiles";
import { useTwinReadiness, useSaveOnboardingAnswer } from "@/hooks/use-onboarding";
import { useGate } from "@/hooks/use-gate";
import { usePaywall } from "@/hooks/use-paywall";
import { useOutgoingLikes, useIncomingLikes, useStartInterview, useCreateMatch, useUnmatch, useTwinTalkSummary, UpgradeRequiredError, LikeWaitingError } from "@/hooks/use-interactions";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { overlap, distanceKm } from "@/lib/profile-derived";
import { useVouchesFor } from "@/hooks/use-vouches";
import { WingmanNote, WingmanSuggest } from "@/components/wingman";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { withFrom } from "@/lib/from-route";
import { MatchCelebration } from "@/components/match-celebration";
import { requestPushNudge } from "@/lib/engagement-prompts";
import { dataSaverOn } from "@/lib/data-saver";
import { ProfileViewSkeleton } from "@/components/ui-vf/skeletons";
import { useBackToClose } from "@/lib/back-button";
import { haptic } from "@/lib/haptics";
import { noteBadMoment } from "@/lib/review-prompt";
import { EditAffordance, ViewShell, EYEBROW, firstName, relAge } from "@/components/profile-view/view-shell";
import { BlockReportConfirm, OverlapChips, RoomsCard, TranscriptCard, VouchList } from "@/components/profile-view/profile-sections";

interface ProfileViewProps {
  /** Real route: wouter passes the URL param this way. */
  params?: { userId: string };
  /** Preview mount: caller passes the id directly instead. */
  userId?: string;
  /** True only when mounted by /profile/preview to show your own profile
   *  as the genuine /u/:userId component, with an editing layer on top. */
  preview?: boolean;
}

export default function ProfileView({ params, userId: userIdProp, preview = false }: ProfileViewProps) {
  const userId = userIdProp ?? params?.userId ?? "";
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateProfile = useUpdateProfile();
  const saveAnswer = useSaveOnboardingAnswer();

  const { data: profile, isLoading, isError } = useProfile(userId);
  const { data: mine } = useProfile();
  const { data: photos = [], isLoading: photosLoading } = usePhotos(userId);
  const { data: answers = [], isLoading: answersLoading } = usePublicAnswers(userId);
  const { data: groups = [], isLoading: groupsLoading } = useProfileGroups(userId);
  const { data: outgoing } = useOutgoingLikes();
  const { data: incoming } = useIncomingLikes();
  const { data: myReadiness } = useTwinReadiness();
  const { data: transcriptGate } = useGate("read_transcript");
  const { data: twinTalk, isLoading: twinTalkLoading } = useTwinTalkSummary(userId);
  const { data: reasonsData, isLoading: reasonsLoading } = useClickReasons(userId, !preview);
  const { data: vouchList = [], isLoading: vouchesLoading } = useVouchesFor(userId);
  // The cards under the photo each load on their own; shown as they came,
  // each pushed the rest down. The profile appears once they're all in.
  // (isLoading, not isPending: a query switched off never stops pending.)
  const cardsLoading = photosLoading || answersLoading || groupsLoading || twinTalkLoading || reasonsLoading || vouchesLoading;
  const paywall = usePaywall();
  const createMatch = useCreateMatch();
  const [celebrating, setCelebrating] = useState<{ matchId: number } | null>(null);
  const startInterview = useStartInterview();
  const unmatch = useUnmatch();

  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [bioSaveState, setBioSaveState] = useState<"idle" | "saved" | "error">("idle");

  const [editingAnswers, setEditingAnswers] = useState(false);
  const [answerDrafts, setAnswerDrafts] = useState<Record<number, string>>({});
  const [savingAnswerId, setSavingAnswerId] = useState<number | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<"block" | "report" | null>(null);
  useBackToClose(!!confirm, () => setConfirm(null));

  const match = useMemo(() => {
    const ask = (outgoing?.asks || []).find((a: any) => a.toUserId === userId);
    if (ask) return { role: "asked" as const, matchId: ask.matchId, status: ask.status, createdAt: ask.createdAt };
    const like = (incoming?.likes || []).find((l: any) => l.fromUserId === userId);
    if (like) return { role: "incoming" as const, matchId: like.matchId, status: "incoming", createdAt: like.createdAt };
    return null;
  }, [outgoing, incoming, userId]);

  if (isLoading || cardsLoading) {
    return (
      <ViewShell preview={preview}>
        <ProfileViewSkeleton />
      </ViewShell>
    );
  }
  if (isError || !profile) {
    return (
      <ViewShell preview={preview}>
        <div className="py-20 text-center">
          <p className="font-serif text-vf-text mb-2" style={{ fontSize: "22px" }}>That profile isn't here.</p>
          <button onClick={() => setLocation("/matches")} className="text-sm font-medium text-vf-ember">
            Back to Likes
          </button>
        </div>
      </ViewShell>
    );
  }

  const her = profile.gender === "Female";
  const name = firstName(profile);
  const coverPhoto = photos.find((p: any) => p.role === "cover");
  const portraitPhoto = photos.find((p: any) => p.role === "portrait");
  const galleryPhotos = photos.filter((p: any) => p.role === "gallery" || (!p.role && !p.isMainProfilePhoto));
  // Data saver: the 800 px derivative instead of the original upload.
  const savingData = dataSaverOn();
  const coverUrl = (savingData ? coverPhoto?.variants?.w800 : null) || coverPhoto?.photoUrl || profile.coverPhotoUrl || null;
  const portraitUrl = (savingData ? portraitPhoto?.variants?.w800 : null) || portraitPhoto?.photoUrl || profile.user?.profileImageUrl || null;
  // Full, uncropped view for the lightbox — cover, then portrait, then the
  // gallery grid, in the same order they appear on the page. Prefers the
  // w1600 derivative (full photo, just not the original file size) over the
  // raw upload for load time; falls back to whatever URL each section
  // already uses when there's no derivative on record.
  const fullPhotoUrl = (p: any, fallback: string | null) =>
    (savingData ? p?.variants?.w800 : p?.variants?.w1600) || p?.photoUrl || fallback;
  const lightboxPhotos = [
    coverUrl ? { url: fullPhotoUrl(coverPhoto, coverUrl) } : null,
    portraitUrl ? { url: fullPhotoUrl(portraitPhoto, portraitUrl) } : null,
    ...galleryPhotos.map((p: any) => ({ url: fullPhotoUrl(p, p.photoUrl) })),
  ].filter((p): p is { url: string } => !!p);
  const coverLightboxIndex = coverUrl ? 0 : -1;
  const portraitLightboxIndex = portraitUrl ? (coverUrl ? 1 : 0) : -1;
  const galleryLightboxOffset = (coverUrl ? 1 : 0) + (portraitUrl ? 1 : 0);
  const coverPos = coverPhoto
    ? `${Math.round((coverPhoto.coverFocalX ?? 0.5) * 100)}% ${Math.round((coverPhoto.coverFocalY ?? 0.5) * 100)}%`
    : "center";

  const km = distanceKm(mine, profile);
  const meta = [
    profile.isVerified ? "VERIFIED" : null,
    profile.locationName || profile.location || null,
    km != null ? `${Math.round(km)} KM AWAY` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const reasons = reasonsData?.reasons ?? [];
  const transcript = twinTalk?.exists && twinTalk.lines?.length ? { lines: twinTalk.lines, total: twinTalk.total ?? twinTalk.lines.length } : null;
  const overlapChips = overlap(mine, profile, groups.filter((g: any) => g.viewerIsMember));
  const bioText = profile.aboutMe || profile.bio || "";

  const openTwin = () =>
    paywall.guard("start_interview", () =>
      startInterview.mutate(userId, {
        onSuccess: (iv: any) => { if (iv?.id) setLocation(`/interviews/${iv.id}/chat?from=/u/${userId}`); },
        onError: (err: any) => {
          // The client-side gate check above can race a server-side deny
          // (tier just lapsed, limit hit between the check and the click) —
          // route that case to the same upgrade screen the paywall sheet uses
          // instead of a generic toast.
          if (err instanceof UpgradeRequiredError) {
            setLocation(withFrom("/plans?feature=start_interview", window.location.pathname));
          } else {
            toast({ title: "Couldn't start that", description: err?.message, variant: "destructive" });
          }
        },
      }),
    );

  // Liking from a full profile (opened from tonight's three, a lounge, a
  // story…). If they'd already liked you, the server makes it a match.
  const like = () =>
    paywall.guard("daily_likes", () => {
      haptic.like();
      createMatch.mutate(userId, {
        onSuccess: (result: any) => {
          queryClient.invalidateQueries({ queryKey: ["/api/gate", "daily_likes"] });
          requestPushNudge("like");
          if (result?.mutual) setCelebrating({ matchId: result.id });
          else toast({ title: "Liked!", description: `${name} will be notified.` });
        },
        onError: (err: any) => {
          if (err instanceof LikeWaitingError) toast({ title: "Like saved", description: err.message });
          else if (err instanceof UpgradeRequiredError) {
            void queryClient.invalidateQueries({ queryKey: ["/api/gate", "daily_likes"] }).then(() => paywall.guard("daily_likes", () => {}));
          } else toast({ title: "Could not like", description: "Something went wrong. Please try again.", variant: "destructive" });
        },
      });
    });

  const withdraw = () => {
    if (!match) return;
    unmatch.mutate(match.matchId, {
      onSuccess: () => { toast({ title: "Like taken back" }); setLocation("/matches"); },
      onError: () => toast({ title: "Couldn't withdraw", variant: "destructive" }),
    });
  };

  const doBlock = async () => {
    setConfirm(null);
    try {
      noteBadMoment();
      await fetch(`/api/users/block/${userId}`, { method: "POST", credentials: "include" });
      toast({ title: `${name} blocked` });
      setLocation("/matches");
    } catch {
      toast({ title: "Couldn't block", variant: "destructive" });
    }
  };
  const doReport = async (reason: string, reportPhotoId: number | null) => {
    const evidence = reportPhotoId != null ? [{ type: "photo", id: reportPhotoId }] : undefined;
    setConfirm(null);
    try {
      noteBadMoment();
      await fetch(`/api/users/${userId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason, evidence }),
      });
      toast({ title: "Report sent", description: "Our team will review it. They're now blocked too." });
      setLocation("/matches");
    } catch {
      toast({ title: "Could not send report", variant: "destructive" });
    }
  };

  const openBioEdit = () => { setBioDraft(bioText); setBioSaveState("idle"); setEditingBio(true); };
  const saveBio = async () => {
    const text = bioDraft.trim();
    try {
      await updateProfile.mutateAsync({ userId, data: { aboutMe: text, bio: text } });
      setEditingBio(false);
      setBioSaveState("saved");
      window.setTimeout(() => setBioSaveState("idle"), 2500);
    } catch {
      setBioSaveState("error");
    }
  };

  const openAnswersEdit = () => {
    setAnswerDrafts(Object.fromEntries(answers.slice(0, 2).map((a) => [a.questionId, a.answer])));
    setEditingAnswers(true);
  };
  const saveOneAnswer = async (questionId: number) => {
    const text = (answerDrafts[questionId] ?? "").trim();
    if (!text) return;
    setSavingAnswerId(questionId);
    try {
      await saveAnswer.mutateAsync({ questionId, answerText: text });
      // usePublicAnswers reads a cache key the onboarding-answer mutation
      // doesn't know about — update it directly so the preview reflects the
      // edit immediately instead of waiting on an unrelated refetch.
      queryClient.setQueryData(
        ["/api/profiles", userId, "answers"],
        (old: Array<{ questionId: number; question: string; answer: string }> | undefined) =>
          (old ?? []).map((a) => (a.questionId === questionId ? { ...a, answer: text } : a)),
      );
      queryClient.invalidateQueries({ queryKey: ["/api/profiles", userId, "answers"] });
    } catch {
      toast({ title: "Couldn't save that answer", variant: "destructive" });
    } finally {
      setSavingAnswerId(null);
    }
  };

  // ── blocks ─────────────────────────────────────────────────────────────

  const hasCover = !!coverUrl;

  const Header = (
    <div>
      <div
        className={`relative w-full rounded-[20px] border border-vf-line overflow-hidden bg-vf-surface2 ${coverUrl ? "cursor-pointer" : ""}`}
        style={{ aspectRatio: "21 / 9" }}
        onClick={() => coverUrl && setLightboxIndex(coverLightboxIndex)}
        role={coverUrl ? "button" : undefined}
        tabIndex={coverUrl ? 0 : undefined}
        onKeyDown={(e) => {
          if (!coverUrl) return;
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLightboxIndex(coverLightboxIndex); }
        }}
        aria-label={coverUrl ? `View ${name}'s cover photo` : undefined}
        data-testid="button-view-cover-photo"
      >
        {coverUrl ? (
          <img src={coverUrl} alt={`${name}'s cover photo`} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: coverPos }} />
        ) : (
          // Real no-cover state — flat warm surface + a mono label, not a
          // scrim over nothing (that read as a broken image / grey wash).
          <div
            className="absolute inset-0 flex items-end p-4"
            style={{ background: "linear-gradient(160deg, rgba(255,107,74,.10), var(--vf-surface2) 65%)" }}
          >
            <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">
              No cover photo yet
            </span>
          </div>
        )}
        {hasCover && (
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(12,9,16,.9) 0%, rgba(12,9,16,.15) 55%, rgba(12,9,16,.35) 100%)",
            }}
          />
        )}
      </div>

      <div
        className="flex flex-col items-center text-center px-4 -mt-[62px] lg:flex-row lg:items-end lg:text-left lg:px-7 lg:-mt-[104px] lg:gap-6"
        style={!hasCover ? { marginTop: 0 } : undefined}
      >
        <div
          className={`shrink-0 overflow-hidden bg-vf-surface2 w-[120px] lg:w-[196px] ${portraitUrl ? "cursor-pointer" : ""}`}
          style={{ aspectRatio: "4 / 5", borderRadius: "12px", boxShadow: "0 18px 50px rgba(0,0,0,.55)", outline: "4px solid #0C0910" }}
          onClick={() => portraitUrl && setLightboxIndex(portraitLightboxIndex)}
          role={portraitUrl ? "button" : undefined}
          tabIndex={portraitUrl ? 0 : undefined}
          onKeyDown={(e) => {
            if (!portraitUrl) return;
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLightboxIndex(portraitLightboxIndex); }
          }}
          aria-label={portraitUrl ? `View ${name}'s portrait photo` : undefined}
          data-testid="button-view-portrait-photo"
        >
          {portraitUrl ? (
            <img src={portraitUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center" style={{ background: "var(--vf-ember)" }}>
              <span className="font-serif text-4xl leading-none text-vf-ink" style={{ transform: "translateY(-0.06em)" }}>
                {name[0]?.toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Only the portrait overlaps the cover (the negative margin above);
            this cluster always lands below the cover's bottom edge — under
            the portrait on phones, bottom-aligned beside it on desktop — so
            it sits on the page ground and uses theme colors. (Forcing light
            text here when a cover existed made the name unreadable in light
            mode.) */}
        <div className="mt-3 lg:mt-0 lg:pb-2 min-w-0">
          {meta && (
            <div className={`${EYEBROW} mb-1.5`}>
              {meta}
            </div>
          )}
          <h1 className="font-display font-normal leading-[1.02] tracking-[-0.01em] text-[clamp(36px,8vw,60px)] text-vf-text" data-testid="text-profile-view-name">
            {name}
            {profile.age ? <span>, {profile.age}</span> : null}
            <span className="inline-block align-middle ml-3">
              <CrownBadge userId={userId} size={30} />
            </span>
          </h1>
          <DetailChips details={(profile as any).details} className="mt-3 justify-center lg:justify-start" />
          {preview && (
            <div className="mt-3.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">
              What a visitor would do from here — chat with your twin, report, block
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const StatusStrip = (() => {
    if (!match) return null;
    if (match.role === "asked" && match.status === "matched") {
      return (
        <div className="rounded-[16px] bg-vf-surface p-4 flex items-center justify-between gap-3 vf-card" data-testid="status-strip">
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-mint">You're talking</div>
            <p className="text-[13.5px] text-vf-muted mt-0.5">This went somewhere.</p>
          </div>
          <button onClick={() => setLocation(`/chat/${match.matchId}?from=/u/${userId}`)} className="text-[13px] font-medium text-vf-mint hover:text-vf-text shrink-0">
            Open chat →
          </button>
        </div>
      );
    }
    if (match.role === "asked" && match.status === "rejected") {
      return (
        <div className="rounded-[16px] bg-vf-surface p-4 vf-card" data-testid="status-strip">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">She passed</div>
          <p className="text-[13.5px] text-vf-muted mt-0.5">It happens. There are more people on Discover, and three new ones every evening at 19:00.</p>
        </div>
      );
    }
    if (match.role === "asked") {
      return (
        <div className="rounded-[16px] bg-vf-surface p-4 flex items-start justify-between gap-3 vf-card" data-testid="status-strip">
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-ember">You liked {her ? "her" : "them"}</div>
            <p className="text-[13.5px] text-vf-muted mt-0.5">
              {relAge(match.createdAt)}. {her ? "She hasn't" : "They haven't"} answered yet. You'll see it in Likes first.
            </p>
          </div>
          <button
            onClick={withdraw}
            disabled={unmatch.isPending}
            className="text-[13px] text-vf-muted hover:text-vf-text shrink-0 disabled:opacity-50"
            data-testid="link-withdraw"
          >
            Take it back
          </button>
        </div>
      );
    }
    // they asked you
    return (
      <div className="rounded-[16px] bg-vf-surface p-4 vf-card" data-testid="status-strip">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-ember">
          {her ? "She likes" : "They like"} you
        </div>
        <p className="text-[13.5px] text-vf-muted mt-0.5">Like back below and it's a match.</p>
      </div>
    );
  })();

  const PullQuote = (() => {
    if (!preview && !bioText) return null;

    if (preview && editingBio) {
      return (
        <section>
          <div className={`${EYEBROW} mb-3`}>In your words</div>
          <Textarea
            value={bioDraft}
            onChange={(e) => setBioDraft(e.target.value.slice(0, 400))}
            rows={4}
            autoFocus
            placeholder="What someone should know before your twin does the talking."
            className="text-[16px] leading-[1.6] text-vf-text resize-none bg-vf-surface2 border-vf-line rounded-[12px]"
            data-testid="input-preview-bio"
          />
          <div className="mt-2.5">
            <RefineWithAI
              value={bioDraft}
              fieldType="bio"
              onApply={(text) => setBioDraft(text.slice(0, 400))}
            />
          </div>
          <div className="flex items-center gap-3 mt-2.5">
            <button
              onClick={saveBio}
              disabled={updateProfile.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-vf-ember text-vf-ink font-bold px-4 h-9 text-[13px] btn-press vf-btn-primary hover:bg-[var(--vf-ember-soft)] transition-colors disabled:opacity-40"
              data-testid="button-save-preview-bio"
            >
              {updateProfile.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save
            </button>
            <button onClick={() => setEditingBio(false)} className="text-[13px] text-vf-muted hover:text-vf-text">
              Cancel
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className="relative group">
        {preview && (
          <div className="absolute -top-1 right-0 flex items-center gap-2">
            {bioSaveState === "saved" && (
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-vf-mint" data-testid="text-bio-saved">
                Saved
              </span>
            )}
            {bioSaveState === "error" && (
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-vf-warn" data-testid="text-bio-error">
                Couldn't save
              </span>
            )}
            <EditAffordance onClick={openBioEdit} />
          </div>
        )}
        <div className={`${EYEBROW} mb-3`}>In {preview ? "your" : her ? "her" : "their"} words</div>
        {bioText ? (
          <p className="font-serif text-vf-text max-w-[38ch]" style={{ fontSize: "27px", lineHeight: 1.3 }}>
            {bioText}
          </p>
        ) : (
          <p className="text-[15px] text-vf-muted leading-[1.5]">Your profile has no words on it yet.</p>
        )}
      </section>
    );
  })();

  const TwoAnswers = (() => {
    if (!preview && !answers.length) return null;
    return (
      <section className="relative group">
        {preview && (
          <div className="absolute -top-1 right-0">
            {editingAnswers ? (
              <button
                onClick={() => setEditingAnswers(false)}
                className="inline-flex items-center gap-1 rounded-full border border-vf-line bg-vf-surface/90 backdrop-blur px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-vf-muted hover:text-vf-text transition-colors"
                data-testid="button-done-editing-answers"
              >
                Done
              </button>
            ) : (
              <EditAffordance onClick={openAnswersEdit} />
            )}
          </div>
        )}
        <div className={`${EYEBROW} mb-1`}>{preview ? "Two things you answered" : `Two things ${her ? "she" : "they"} answered`}</div>
        {answers.length ? (
          // Keyed and joined by questionId — the real FK the answer belongs
          // to — never by array position, so an edit can never land on the
          // wrong prompt.
          answers.slice(0, 2).map((a) => (
            <div key={a.questionId} className="border-t border-vf-line pt-4 mt-4 first:mt-2">
              <div className="text-[13.5px] text-vf-faint mb-1.5">{a.question}</div>
              {preview && editingAnswers ? (
                <div className="flex flex-col gap-2">
                  <Textarea
                    value={answerDrafts[a.questionId] ?? a.answer}
                    onChange={(e) => setAnswerDrafts((d) => ({ ...d, [a.questionId]: e.target.value.slice(0, 400) }))}
                    rows={3}
                    className="text-[15px] leading-[1.5] text-vf-text resize-none bg-vf-surface2 border-vf-line rounded-[12px]"
                    data-testid={`input-preview-answer-${a.questionId}`}
                  />
                  <RefineWithAI
                    value={answerDrafts[a.questionId] ?? a.answer}
                    fieldType="answer"
                    promptContext={a.question}
                    onApply={(text) => setAnswerDrafts((d) => ({ ...d, [a.questionId]: text.slice(0, 400) }))}
                  />
                  <div>
                    <button
                      onClick={() => saveOneAnswer(a.questionId)}
                      disabled={savingAnswerId === a.questionId}
                      className="inline-flex items-center gap-1.5 rounded-full bg-vf-ember text-vf-ink font-bold px-4 h-9 text-[13px] btn-press vf-btn-primary hover:bg-[var(--vf-ember-soft)] transition-colors disabled:opacity-40"
                      data-testid={`button-save-answer-${a.questionId}`}
                    >
                      {savingAnswerId === a.questionId && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-[16px] text-vf-text" style={{ lineHeight: 1.6 }}>{a.answer}</p>
              )}
            </div>
          ))
        ) : (
          <p className="text-[14px] text-vf-muted mt-2 leading-[1.5]">
            Zero — nothing you've answered publicly shows here yet.
          </p>
        )}
      </section>
    );
  })();

  const PhotoGrid = (() => {
    if (!preview && !galleryPhotos.length) return null;
    return (
      <section className="relative group">
        {preview && <div className="absolute -top-1 right-0"><EditAffordance onClick={() => setLocation("/photos")} /></div>}
        <div className="mb-3 flex items-baseline gap-1.5">
          <span className={EYEBROW}>Photos</span>
          {galleryPhotos.length > 0 && (
            <span className="font-serif text-vf-text text-[15px] leading-none">· {galleryPhotos.length}</span>
          )}
        </div>
        {galleryPhotos.length ? (
          <div className="grid grid-cols-3 gap-2.5">
            {galleryPhotos.slice(0, 9).map((p: any, i: number) => (
              <div
                key={p.id}
                className="overflow-hidden bg-vf-surface2 cursor-pointer"
                style={{ aspectRatio: "4 / 5", borderRadius: "12px" }}
                onClick={() => setLightboxIndex(galleryLightboxOffset + i)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLightboxIndex(galleryLightboxOffset + i); }
                }}
                aria-label={`View ${name}'s photo ${i + 1}`}
                data-testid={`button-view-gallery-photo-${p.id}`}
              >
                <img src={p.photoUrl} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[14px] text-vf-muted leading-[1.5]">No gallery photos beyond your cover and portrait.</p>
        )}
      </section>
    );
  })();

  const missingPortrait = !portraitUrl;
  const PreviewTruths = preview ? (
    <div className="rounded-[16px] border border-vf-line bg-vf-surface2 p-4 flex flex-col gap-2.5 vf-card" data-testid="section-preview-truths">
      {missingPortrait && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13.5px] text-vf-muted">Everyone sees a letter where your face would be.</p>
          <button
            onClick={() => setLocation("/photos")}
            className="shrink-0 text-[13px] text-vf-ember hover:text-[var(--vf-ember-soft)] transition-colors"
            data-testid="link-preview-add-photo"
          >
            Add a photo
          </button>
        </div>
      )}
      {!profile.isVerified && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13.5px] text-vf-muted">Not verified — the tick strangers look for isn't there.</p>
          <button
            onClick={() => setLocation("/settings")}
            className="shrink-0 text-[13px] text-vf-ember hover:text-[var(--vf-ember-soft)] transition-colors"
            data-testid="link-preview-verify"
          >
            Verify
          </button>
        </div>
      )}
      {!missingPortrait && profile.isVerified && (
        <p className="text-[13.5px] text-vf-mint">Your photo and verification are both in good shape.</p>
      )}
    </div>
  ) : null;

  // No score (docs/destira-upgrade-prompt.md §5.3). The old card showed a
  // number made up from the member's id; this shows only what's true.
  const ResonanceCard = preview ? (
    <div className="bg-vf-surface2 rounded-[20px] p-[22px]" data-testid="section-why-preview">
      <div className="vf-label text-vf-mint flex items-center gap-1.5">
        <ResonanceGlyph size={16} /> Why you might click
      </div>
      <p className="vf-small text-vf-muted mt-2">
        Each visitor sees what's true between the two of you: interests you share, the same city, wanting the same thing. There's no score.
      </p>
    </div>
  ) : reasons.length ? (
    <div className="bg-vf-surface2 rounded-[20px] p-[22px]" data-testid="section-why-click">
      <WhyYouMightClick name={name} reasons={reasons} onAsk={openTwin} />
    </div>
  ) : null;

  const Transcript = transcript ? (
    <TranscriptCard
      transcript={transcript}
      name={name}
      her={her}
      gate={transcriptGate}
      readiness={myReadiness}
      onReadAll={() => paywall.guard("read_transcript", () => {})}
      onSharpen={() => setLocation("/onboarding")}
    />
  ) : null;

  const Rooms = (
    <RoomsCard groups={groups} her={her} onOpen={(g) => setLocation(g.viewerIsMember ? `/lounge/group/${g.id}` : `/lounge/group/${g.id}/info`)} />
  );

  // Always in reach (docs/destira-upgrade-prompt.md §7.5): the same sticky
  // bar Discover has, so a long profile never means scrolling back up to act.
  const isMatched = match?.role === "asked" && match.status === "matched";
  const ActionBar = preview ? null : (
    <div
      className="sticky z-40 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] md:bottom-6 flex justify-center pointer-events-none"
      data-testid="profile-action-bar"
    >
      <div className="pointer-events-auto w-full max-w-[460px] flex items-center gap-2 rounded-full border border-vf-line bg-vf-surface/90 backdrop-blur-md p-2 vf-e3">
        <VfButton
          variant="twin"
          className="flex-1 min-w-0"
          loading={startInterview.isPending}
          leading={<TwinGlyph size={18} />}
          onClick={openTwin}
          data-testid="button-chat-twin"
        >
          Ask {her ? "her" : "their"} twin
        </VfButton>
        {isMatched ? (
          <VfButton className="flex-1 min-w-0" onClick={() => setLocation(`/chat/${match!.matchId}?from=/u/${userId}`)} data-testid="button-open-chat">
            Open chat
          </VfButton>
        ) : !match || match.role === "incoming" ? (
          <VfButton
            className="flex-1 min-w-0"
            loading={createMatch.isPending}
            leading={<Heart className="w-4 h-4" fill="currentColor" strokeWidth={0} />}
            onClick={like}
            data-testid="button-like-profile"
          >
            {match?.role === "incoming" ? "Like back" : "Like"}
          </VfButton>
        ) : null}
      </div>
    </div>
  );
  const SafetyRow = preview ? null : (
    <div className="flex items-center justify-center gap-2 pt-2">
      <button onClick={() => setConfirm("report")} className="inline-flex items-center gap-1 min-h-[40px] px-3 vf-small text-vf-faint hover:text-vf-text transition-colors" data-testid="link-report">
        <Flag className="w-3 h-3" /> Report {name}
      </button>
      <span className="text-vf-faint" aria-hidden="true">·</span>
      <button onClick={() => setConfirm("block")} className="min-h-[40px] px-3 vf-small text-vf-faint hover:text-vf-text transition-colors" data-testid="link-block">
        Block
      </button>
    </div>
  );

  return (
    <ViewShell preview={preview}>
      <div className="flex flex-col gap-8">
        {Header}
        {StatusStrip}
        {!preview && <WingmanNote candidateId={userId} />}
        {PreviewTruths}

        {/* desktop: two columns */}
        <div className="hidden lg:grid grid-cols-[minmax(0,1fr)_340px] gap-10 items-start">
          <div className="flex flex-col gap-[34px]">
            {PullQuote}
            {TwoAnswers}
            {PhotoGrid}
            <VouchList vouches={vouchList} />
            <OverlapChips chips={overlapChips} />
          </div>
          <div className="flex flex-col gap-4">
            {ResonanceCard}
            {Transcript}
            {Rooms}
          </div>
        </div>

        {/* mobile: one column, the read comes first */}
        <div className="lg:hidden flex flex-col gap-8">
          {ResonanceCard}
          {PullQuote}
          {Transcript}
          {TwoAnswers}
          {PhotoGrid}
          <VouchList vouches={vouchList} />
          <OverlapChips chips={overlapChips} />
          {Rooms}
        </div>
        {!preview && !match && (
          <div className="flex justify-center">
            <IntroduceButton targetId={userId} name={name} />
          </div>
        )}
        {!preview && <WingmanSuggest candidateId={userId} name={name} />}
        {SafetyRow}
        {ActionBar}
      </div>
      {paywall.sheet}
      {lightboxIndex !== null && lightboxPhotos.length > 0 && (
        <PhotoLightbox
          photos={lightboxPhotos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {confirm && (
        <BlockReportConfirm
          kind={confirm}
          name={name}
          galleryPhotos={galleryPhotos}
          onClose={() => setConfirm(null)}
          onBlock={doBlock}
          onReport={doReport}
        />
      )}
      {celebrating && (
        <MatchCelebration
          matchId={celebrating.matchId}
          otherUserId={userId}
          otherName={name}
          otherPhotoUrl={portraitUrl || coverUrl}
          onClose={() => setCelebrating(null)}
        />
      )}
    </ViewShell>
  );
}
