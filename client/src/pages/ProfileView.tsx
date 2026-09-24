import type React from "react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { ResonanceDial } from "@/components/resonance-dial";
import { ResonanceAxes } from "@/components/resonance-axes";
import { RefineWithAI } from "@/components/refine-with-ai";
import { useProfile, usePhotos, usePublicAnswers, useProfileGroups, useUpdateProfile } from "@/hooks/use-profiles";
import { useTwinReadiness, useSaveOnboardingAnswer } from "@/hooks/use-onboarding";
import { useGate } from "@/hooks/use-gate";
import { usePaywall } from "@/hooks/use-paywall";
import {
  useOutgoingLikes,
  useIncomingLikes,
  useStartInterview,
  useUnmatch,
  useTwinTalkSummary,
  UpgradeRequiredError,
} from "@/hooks/use-interactions";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { resonanceRead, vouches, overlap, distanceKm } from "@/lib/profile-derived";
import { PhotoLightbox } from "@/components/photo-lightbox";

/** Small mono "Edit" affordance for an editable region in the preview. Quiet
 *  by default (visible-but-unobtrusive on touch, no hover to reveal it),
 *  full opacity on hover/focus on desktop. Never a bare icon — always labelled. */
function EditAffordance({ onClick, label = "Edit" }: { onClick: () => void; label?: string }) {
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
function ViewShell({ preview, children }: { preview: boolean; children: React.ReactNode }) {
  if (preview) return <div className="px-4 py-6 sm:px-6">{children}</div>;
  return <LayoutShell>{children}</LayoutShell>;
}

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";

function firstName(p: any): string {
  return (p?.displayName || p?.user?.firstName || "Someone").split(" ")[0];
}
function relAge(iso?: string): string {
  if (!iso) return "recently";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  return `${Math.floor(days / 7)} weeks ago`;
}

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
  const { data: photos = [] } = usePhotos(userId);
  const { data: answers = [] } = usePublicAnswers(userId);
  const { data: groups = [] } = useProfileGroups(userId);
  const { data: outgoing } = useOutgoingLikes();
  const { data: incoming } = useIncomingLikes();
  const { data: myReadiness } = useTwinReadiness();
  const { data: transcriptGate } = useGate("read_transcript");
  const { data: twinTalk } = useTwinTalkSummary(userId);
  const paywall = usePaywall();
  const startInterview = useStartInterview();
  const unmatch = useUnmatch();

  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [bioSaveState, setBioSaveState] = useState<"idle" | "saved" | "error">("idle");

  const [editingAnswers, setEditingAnswers] = useState(false);
  const [answerDrafts, setAnswerDrafts] = useState<Record<number, string>>({});
  const [savingAnswerId, setSavingAnswerId] = useState<number | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const match = useMemo(() => {
    const ask = (outgoing?.asks || []).find((a: any) => a.toUserId === userId);
    if (ask) return { role: "asked" as const, matchId: ask.matchId, status: ask.status, createdAt: ask.createdAt };
    const like = (incoming?.likes || []).find((l: any) => l.fromUserId === userId);
    if (like) return { role: "incoming" as const, matchId: like.matchId, status: "incoming", createdAt: like.createdAt };
    return null;
  }, [outgoing, incoming, userId]);

  if (isLoading) {
    return (
      <ViewShell preview={preview}>
        <div className="h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-vf-mint" />
        </div>
      </ViewShell>
    );
  }
  if (isError || !profile) {
    return (
      <ViewShell preview={preview}>
        <div className="py-20 text-center">
          <p className="font-serif text-vf-text mb-2" style={{ fontSize: "22px" }}>That profile isn't here.</p>
          <button onClick={() => setLocation("/matches")} className="text-sm font-medium text-vf-ember">
            Back to Interest
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
  const coverUrl = coverPhoto?.photoUrl || profile.coverPhotoUrl || null;
  const portraitUrl = portraitPhoto?.photoUrl || profile.user?.profileImageUrl || null;
  // Full, uncropped view for the lightbox — cover, then portrait, then the
  // gallery grid, in the same order they appear on the page. Prefers the
  // w1600 derivative (full photo, just not the original file size) over the
  // raw upload for load time; falls back to whatever URL each section
  // already uses when there's no derivative on record.
  const fullPhotoUrl = (p: any, fallback: string | null) => p?.variants?.w1600 || p?.photoUrl || fallback;
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

  const read = resonanceRead(profile);
  const transcript = twinTalk?.exists && twinTalk.lines?.length ? { lines: twinTalk.lines, total: twinTalk.total ?? twinTalk.lines.length } : null;
  const vouchList = vouches(userId);
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
            setLocation("/plans?feature=start_interview");
          } else {
            toast({ title: "Couldn't start that", description: err?.message, variant: "destructive" });
          }
        },
      }),
    );

  const withdraw = () => {
    if (!match) return;
    unmatch.mutate(match.matchId, {
      onSuccess: () => { toast({ title: "Ask withdrawn" }); setLocation("/matches"); },
      onError: () => toast({ title: "Couldn't withdraw", variant: "destructive" }),
    });
  };

  const block = async () => {
    if (!window.confirm(`Block ${name}? They won't be able to see you or your profile.`)) return;
    try {
      await fetch(`/api/users/block/${userId}`, { method: "POST", credentials: "include" });
      toast({ title: `${name} blocked` });
      setLocation("/matches");
    } catch {
      toast({ title: "Couldn't block", variant: "destructive" });
    }
  };
  const report = () => toast({ title: "Thanks — we'll take a look." });

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
        data-testid="button-view-cover-photo"
      >
        {coverUrl ? (
          <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: coverPos }} />
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

        {/* This cluster overlaps the cover photo's bottom edge (the negative
            margin above) only when there IS a cover — its scrim stays
            fixed-dark regardless of theme, so name/age/meta stay fixed light
            to match. With no cover there's no overlap and no dark scrim, so
            this falls through to the theme-aware colors below instead. */}
        <div className="mt-3 lg:mt-0 lg:pb-2 min-w-0">
          {meta && (
            <div
              className={`${EYEBROW} mb-1.5`}
              style={hasCover ? { color: "rgba(245,240,234,0.75)" } : undefined}
            >
              {meta}
            </div>
          )}
          <h1
            className="font-serif font-normal leading-none tracking-[-0.02em] text-[clamp(30px,6vw,44px)]"
            style={hasCover ? { color: "#F5F0EA" } : { color: "var(--vf-text)" }}
          >
            {name}
            {profile.age ? <span style={hasCover ? { color: "#F5F0EA" } : undefined}>, {profile.age}</span> : null}
          </h1>
          {preview ? (
            <div className="mt-3.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">
              What a visitor would do from here — chat with your twin, report, block
            </div>
          ) : (
            <div className="mt-3.5 flex items-center justify-center lg:justify-start gap-4 flex-wrap">
              <button
                onClick={openTwin}
                disabled={startInterview.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-vf-mint/35 bg-vf-mint/10 text-vf-mint text-[14px] font-medium px-5 min-h-[44px] btn-press vf-btn-primary transition-colors hover:bg-vf-mint/15 disabled:opacity-50"
                data-testid="button-chat-twin"
              >
                {startInterview.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Chat with {her ? "her" : "their"} twin
              </button>
              <button onClick={report} className="text-[13px] text-vf-muted hover:text-vf-text transition-colors" data-testid="link-report">
                Report
              </button>
              <button onClick={block} className="text-[13px] text-vf-muted hover:text-vf-text transition-colors" data-testid="link-block">
                Block
              </button>
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
          <p className="text-[13.5px] text-vf-muted mt-0.5">It happens. Your next read lands at 18:00.</p>
        </div>
      );
    }
    if (match.role === "asked") {
      return (
        <div className="rounded-[16px] bg-vf-surface p-4 flex items-start justify-between gap-3 vf-card" data-testid="status-strip">
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-ember">You asked to meet</div>
            <p className="text-[13.5px] text-vf-muted mt-0.5">
              {relAge(match.createdAt)}. {her ? "She hasn't" : "They haven't"} answered yet — you'll see it in Interest first.
            </p>
          </div>
          <button
            onClick={withdraw}
            disabled={unmatch.isPending}
            className="text-[13px] text-vf-muted hover:text-vf-text shrink-0 disabled:opacity-50"
            data-testid="link-withdraw"
          >
            Withdraw the ask
          </button>
        </div>
      );
    }
    // they asked you
    return (
      <div className="rounded-[16px] bg-vf-surface p-4 vf-card" data-testid="status-strip">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-ember">
          {her ? "She asked" : "They asked"} to meet you
        </div>
        <p className="text-[13.5px] text-vf-muted mt-0.5">It's waiting for you in Interest.</p>
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

  const VouchList = vouchList.length ? (
    <section>
      <div className={`${EYEBROW} mb-3`}>Vouched by</div>
      <div className="flex flex-col">
        {vouchList.map((v, i) => (
          <div key={i} className="flex gap-3 py-4 border-b border-vf-line last:border-b-0">
            <div className="shrink-0 w-9 bg-vf-surface2 overflow-hidden" style={{ aspectRatio: "4 / 5", borderRadius: "7px" }} />
            <div>
              <p className="text-[14.5px] text-vf-soft" style={{ lineHeight: 1.55 }}>&ldquo;{v.body}&rdquo;</p>
              <div className="text-[12.5px] text-vf-faint mt-1.5">{v.authorFirstName}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  ) : null;

  const OverlapChips = overlapChips.length ? (
    <section>
      <div className={`${EYEBROW} mb-3`}>Where you overlap</div>
      <div className="flex flex-wrap gap-2">
        {overlapChips.map((c) => (
          <span key={c} className="border border-vf-line rounded-full text-[13px] text-vf-soft" style={{ padding: "8px 15px" }}>
            {c}
          </span>
        ))}
      </div>
    </section>
  ) : null;

  const ResonanceCard = (
    <div className="bg-vf-surface2 rounded-[20px] vf-card" style={{ padding: "22px" }}>
      <div className="flex items-center gap-4" style={preview ? { opacity: 0.5 } : undefined}>
        <ResonanceDial score={read.score} size={92} />
        <div>
          <div className={EYEBROW}>Resonance read</div>
          <p className="text-[14px] text-vf-soft mt-1.5" style={{ lineHeight: 1.5 }}>{read.summary}</p>
        </div>
      </div>
      <div className="mt-5" style={preview ? { opacity: 0.5 } : undefined}>
        <ResonanceAxes axes={read.axes} />
      </div>
      {preview && (
        <p className="mt-4 pt-4 border-t border-vf-line text-[12.5px] text-vf-faint leading-[1.5]">
          This read is specific to whoever's looking — there's no truthful version of it to preview for yourself. Shown blurred.
        </p>
      )}
    </div>
  );

  const TranscriptCard = transcript ? (
    <div className="rounded-[20px] p-[22px] vf-card" style={{ border: "1px solid rgba(143,227,199,.24)", background: "rgba(143,227,199,.045)" }}>
      <div className="flex items-center gap-2">
        <span
          className="block w-[11px] h-[11px] rounded-full shrink-0 animate-[vf-breathe_4.5s_ease-in-out_infinite] motion-reduce:animate-none"
          style={{ background: "radial-gradient(circle at 35% 30%, var(--vf-mint-vivid), #2E7F6B)" }}
        />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-mint">When your twins talked</span>
      </div>
      {(() => {
        const full = transcriptGate?.ok === true;
        const shown = full ? transcript.lines : transcript.lines.slice(0, 2);
        return (
          <>
            <div className="mt-4 flex flex-col gap-3.5">
              {shown.map((l, i) => (
                <div key={i}>
                  <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-vf-faint mb-1">{l.who === "viewer" ? "You" : name}</div>
                  <p className="text-[14px] text-vf-soft" style={{ lineHeight: 1.55 }}>{l.text}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3.5 border-t border-vf-mint/15 text-[12.5px] text-vf-muted">
              {full ? (
                <>All <span className="font-serif text-vf-text">{transcript.total}</span> lines.</>
              ) : (
                <>
                  <span className="font-serif text-vf-text">Two</span> of{" "}
                  <span className="font-serif text-vf-text">{transcript.total}</span> lines.{" "}
                  <button
                    onClick={() => paywall.guard("read_transcript", () => {})}
                    className="text-vf-ember hover:text-[var(--vf-ember-soft)] transition-colors"
                    data-testid="link-read-transcript"
                  >
                    {transcriptGate?.requiredTierName || "Flame"} reads the rest.
                  </button>
                </>
              )}
            </div>
          </>
        );
      })()}
      {myReadiness && myReadiness.pct < 50 && (
        <div className="mt-2.5 text-[12px] text-vf-mint/80 leading-[1.5]">
          Your own twin has {myReadiness.answeredCount === 1 ? "one answer" : `${myReadiness.answeredCount} answers`} so far —{" "}
          <button onClick={() => setLocation("/onboarding")} className="underline underline-offset-2 hover:text-vf-text transition-colors">
            sharpen it
          </button>
          .
        </div>
      )}
    </div>
  ) : null;

  const RoomsCard = groups.length ? (
    <div className="bg-vf-surface2 rounded-[20px] vf-card" style={{ padding: "22px" }}>
      <div className={`${EYEBROW} mb-3`}>Rooms {her ? "she's" : "they're"} in</div>
      <div className="flex flex-col gap-2.5">
        {groups.map((g: any) => (
          <button
            key={g.id}
            onClick={() => setLocation(g.viewerIsMember ? `/lounge/group/${g.id}` : `/lounge/group/${g.id}/info`)}
            className="flex items-center justify-between gap-3 text-left -mx-2 px-2 py-1.5 rounded-lg transition-colors duration-150 hover:bg-vf-elevated"
          >
            <span className="text-[14px] text-vf-text truncate">{g.name}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] shrink-0 text-vf-faint">
              {g.viewerIsMember ? "You're in it" : "Join"}
            </span>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <ViewShell preview={preview}>
      <div className="flex flex-col gap-8">
        {Header}
        {StatusStrip}
        {PreviewTruths}

        {/* desktop: two columns */}
        <div className="hidden lg:grid grid-cols-[minmax(0,1fr)_340px] gap-10 items-start">
          <div className="flex flex-col gap-[34px]">
            {PullQuote}
            {TwoAnswers}
            {PhotoGrid}
            {VouchList}
            {OverlapChips}
          </div>
          <div className="flex flex-col gap-4">
            {ResonanceCard}
            {TranscriptCard}
            {RoomsCard}
          </div>
        </div>

        {/* mobile: one column, the read comes first */}
        <div className="lg:hidden flex flex-col gap-8">
          {ResonanceCard}
          {PullQuote}
          {TranscriptCard}
          {TwoAnswers}
          {PhotoGrid}
          {VouchList}
          {OverlapChips}
          {RoomsCard}
        </div>
      </div>
      {paywall.sheet}
      {lightboxIndex !== null && lightboxPhotos.length > 0 && (
        <PhotoLightbox
          photos={lightboxPhotos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </ViewShell>
  );
}
