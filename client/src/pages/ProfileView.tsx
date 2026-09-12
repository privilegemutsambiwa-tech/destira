import { useMemo } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { ResonanceDial } from "@/components/resonance-dial";
import { ResonanceAxes } from "@/components/resonance-axes";
import { useProfile, usePhotos, usePublicAnswers, useProfileGroups } from "@/hooks/use-profiles";
import { useTwinReadiness } from "@/hooks/use-onboarding";
import { useGate } from "@/hooks/use-gate";
import { usePaywall } from "@/hooks/use-paywall";
import {
  useOutgoingLikes,
  useIncomingLikes,
  useStartInterview,
  useUnmatch,
} from "@/hooks/use-interactions";
import { useToast } from "@/hooks/use-toast";
import { resonanceRead, twinTranscript, vouches, overlap, distanceKm } from "@/lib/profile-derived";

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

export default function ProfileView({ params }: { params: { userId: string } }) {
  const userId = params.userId;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: profile, isLoading, isError } = useProfile(userId);
  const { data: mine } = useProfile();
  const { data: photos = [] } = usePhotos(userId);
  const { data: answers = [] } = usePublicAnswers(userId);
  const { data: groups = [] } = useProfileGroups(userId);
  const { data: outgoing } = useOutgoingLikes();
  const { data: incoming } = useIncomingLikes();
  const { data: myReadiness } = useTwinReadiness();
  const { data: transcriptGate } = useGate("read_transcript");
  const paywall = usePaywall();
  const startInterview = useStartInterview();
  const unmatch = useUnmatch();

  const match = useMemo(() => {
    const ask = (outgoing?.asks || []).find((a: any) => a.toUserId === userId);
    if (ask) return { role: "asked" as const, matchId: ask.matchId, status: ask.status, createdAt: ask.createdAt };
    const like = (incoming?.likes || []).find((l: any) => l.fromUserId === userId);
    if (like) return { role: "incoming" as const, matchId: like.matchId, status: "incoming", createdAt: like.createdAt };
    return null;
  }, [outgoing, incoming, userId]);

  if (isLoading) {
    return (
      <LayoutShell>
        <div className="h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-vf-mint" />
        </div>
      </LayoutShell>
    );
  }
  if (isError || !profile) {
    return (
      <LayoutShell>
        <div className="py-20 text-center">
          <p className="font-serif text-vf-text mb-2" style={{ fontSize: "22px" }}>That profile isn't here.</p>
          <button onClick={() => setLocation("/matches")} className="text-sm font-medium text-vf-ember">
            Back to Interest
          </button>
        </div>
      </LayoutShell>
    );
  }

  const her = profile.gender === "Female";
  const name = firstName(profile);
  const coverPhoto = photos.find((p: any) => p.role === "cover");
  const portraitPhoto = photos.find((p: any) => p.role === "portrait");
  const galleryPhotos = photos.filter((p: any) => p.role === "gallery" || (!p.role && !p.isMainProfilePhoto));
  const coverUrl = coverPhoto?.photoUrl || profile.coverPhotoUrl || null;
  const portraitUrl = portraitPhoto?.photoUrl || profile.user?.profileImageUrl || null;
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
  const transcript = twinTranscript(userId);
  const vouchList = vouches(userId);
  const overlapChips = overlap(mine, profile, groups.filter((g: any) => g.viewerIsMember));
  const bioText = profile.aboutMe || profile.bio || "";

  const openTwin = () =>
    paywall.guard("start_interview", () =>
      startInterview.mutate(userId, {
        onSuccess: (iv: any) => { if (iv?.id) setLocation(`/interviews/${iv.id}/chat`); },
        onError: (err: any) => {
          const msg = String(err?.message || "");
          if (msg.includes("upgradeRequired") || msg.toLowerCase().includes("week")) {
            paywall.guard("start_interview", () => {});
          } else {
            toast({ title: "Couldn't start that", variant: "destructive" });
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

  // ── blocks ─────────────────────────────────────────────────────────────

  const Header = (
    <div>
      <div
        className="relative w-full rounded-[20px] border border-vf-line overflow-hidden bg-vf-surface2"
        style={{ aspectRatio: "21 / 9" }}
      >
        {coverUrl ? (
          <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: coverPos }} />
        ) : null}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(12,9,16,.9) 0%, rgba(12,9,16,.15) 55%, rgba(12,9,16,.35) 100%)",
          }}
        />
      </div>

      <div className="flex flex-col items-center text-center px-4 -mt-[62px] lg:flex-row lg:items-end lg:text-left lg:px-7 lg:-mt-[104px] lg:gap-6">
        <div
          className="shrink-0 overflow-hidden bg-vf-surface2 w-[120px] lg:w-[196px]"
          style={{ aspectRatio: "4 / 5", borderRadius: "12px", boxShadow: "0 18px 50px rgba(0,0,0,.55)", outline: "4px solid #0C0910" }}
        >
          {portraitUrl ? (
            <img src={portraitUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <span className="font-serif text-4xl text-vf-muted">{name[0]?.toUpperCase()}</span>
            </div>
          )}
        </div>

        <div className="mt-3 lg:mt-0 lg:pb-2 min-w-0">
          {meta && <div className={`${EYEBROW} mb-1.5`}>{meta}</div>}
          <h1 className="font-serif font-normal text-vf-text leading-none tracking-[-0.02em] text-[clamp(30px,6vw,44px)]">
            {name}
            {profile.age ? <span className="text-vf-text">, {profile.age}</span> : null}
          </h1>
          <div className="mt-3.5 flex items-center justify-center lg:justify-start gap-4 flex-wrap">
            <button
              onClick={openTwin}
              disabled={startInterview.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-vf-mint/35 bg-vf-mint/10 text-vf-mint text-[14px] font-medium px-5 min-h-[44px] transition-colors hover:bg-vf-mint/15 disabled:opacity-50"
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
        </div>
      </div>
    </div>
  );

  const StatusStrip = (() => {
    if (!match) return null;
    if (match.role === "asked" && match.status === "matched") {
      return (
        <div className="rounded-[16px] bg-vf-surface p-4 flex items-center justify-between gap-3" data-testid="status-strip">
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-mint">You're talking</div>
            <p className="text-[13.5px] text-vf-muted mt-0.5">This went somewhere.</p>
          </div>
          <button onClick={() => setLocation(`/chat/${match.matchId}`)} className="text-[13px] font-medium text-vf-mint hover:text-vf-text shrink-0">
            Open chat →
          </button>
        </div>
      );
    }
    if (match.role === "asked" && match.status === "rejected") {
      return (
        <div className="rounded-[16px] bg-vf-surface p-4" data-testid="status-strip">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">She passed</div>
          <p className="text-[13.5px] text-vf-muted mt-0.5">It happens. Your next read lands at 18:00.</p>
        </div>
      );
    }
    if (match.role === "asked") {
      return (
        <div className="rounded-[16px] bg-vf-surface p-4 flex items-start justify-between gap-3" data-testid="status-strip">
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
      <div className="rounded-[16px] bg-vf-surface p-4" data-testid="status-strip">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-ember">
          {her ? "She asked" : "They asked"} to meet you
        </div>
        <p className="text-[13.5px] text-vf-muted mt-0.5">It's waiting for you in Interest.</p>
      </div>
    );
  })();

  const PullQuote = bioText ? (
    <section>
      <div className={`${EYEBROW} mb-3`}>In {her ? "her" : "their"} words</div>
      <p className="font-serif text-vf-text max-w-[38ch]" style={{ fontSize: "27px", lineHeight: 1.3 }}>
        {bioText}
      </p>
    </section>
  ) : null;

  const TwoAnswers = answers.length ? (
    <section>
      <div className={`${EYEBROW} mb-1`}>Two things {her ? "she" : "they"} answered</div>
      {answers.slice(0, 2).map((a, i) => (
        <div key={i} className="border-t border-vf-line pt-4 mt-4 first:mt-2">
          <div className="text-[13.5px] text-vf-faint mb-1.5">{a.question}</div>
          <p className="text-[16px] text-vf-text" style={{ lineHeight: 1.6 }}>{a.answer}</p>
        </div>
      ))}
    </section>
  ) : null;

  const PhotoGrid = galleryPhotos.length ? (
    <section>
      <div className="mb-3 flex items-baseline gap-1.5">
        <span className={EYEBROW}>Photos</span>
        <span className="font-serif text-vf-text text-[15px] leading-none">· {galleryPhotos.length}</span>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {galleryPhotos.slice(0, 9).map((p: any) => (
          <div key={p.id} className="overflow-hidden bg-vf-surface2" style={{ aspectRatio: "4 / 5", borderRadius: "12px" }}>
            <img src={p.photoUrl} alt="" className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
    </section>
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
    <div className="bg-vf-surface2 rounded-[20px]" style={{ padding: "22px" }}>
      <div className="flex items-center gap-4">
        <ResonanceDial score={read.score} size={92} />
        <div>
          <div className={EYEBROW}>Resonance read</div>
          <p className="text-[14px] text-vf-soft mt-1.5" style={{ lineHeight: 1.5 }}>{read.summary}</p>
        </div>
      </div>
      <div className="mt-5">
        <ResonanceAxes axes={read.axes} />
      </div>
    </div>
  );

  const TranscriptCard = transcript ? (
    <div className="rounded-[20px] p-[22px]" style={{ border: "1px solid rgba(143,227,199,.24)", background: "rgba(143,227,199,.045)" }}>
      <div className="flex items-center gap-2">
        <span
          className="block w-[11px] h-[11px] rounded-full shrink-0 animate-[vf-breathe_4.5s_ease-in-out_infinite] motion-reduce:animate-none"
          style={{ background: "radial-gradient(circle at 35% 30%, var(--vf-mint), #2E7F6B)" }}
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
                  <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-vf-faint mb-1">{l.who === "hers" ? "Hers" : "Yours"}</div>
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
                    className="text-vf-ember hover:text-[#FF8163] transition-colors"
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
    <div className="bg-vf-surface2 rounded-[20px]" style={{ padding: "22px" }}>
      <div className={`${EYEBROW} mb-3`}>Rooms {her ? "she's" : "they're"} in</div>
      <div className="flex flex-col gap-2.5">
        {groups.map((g: any) => (
          <button
            key={g.id}
            onClick={() => setLocation(g.viewerIsMember ? `/lounge/group/${g.id}` : `/lounge/group/${g.id}/info`)}
            className="flex items-center justify-between gap-3 text-left"
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
    <LayoutShell>
      <div className="flex flex-col gap-8">
        {Header}
        {StatusStrip}

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
    </LayoutShell>
  );
}
