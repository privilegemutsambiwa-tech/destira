// Straight after onboarding: the member meets their own twin — two real
// answers it gives when people ask about them (POST /api/twin/preview, the
// same prompt and disclosure filters a real interview uses) — then tries it
// the other way round on one suggested person. This replaces landing new
// members on the Plans page before they'd seen anything the app does.
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { DestiraLockup } from "@/components/brand/logo";
import { useStartInterview, UpgradeRequiredError } from "@/hooks/use-interactions";
import { refreshPlanQueries } from "@/hooks/use-payments";
import { consumePendingInvite, resolvePendingInviteRoute } from "@/lib/pending-invite";
import { avatarColor } from "@/lib/avatar-color";
import { withFrom } from "@/lib/from-route";
import { useToast } from "@/hooks/use-toast";

interface TwinPreview {
  answers: { question: string; answer: string | null; withheld?: boolean }[];
  suggestion: { userId: string; displayName: string; photoUrl: string | null; reason: string | null } | null;
}

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em]";

export default function MeetYourTwin() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const startInterview = useStartInterview();
  const preview = useMutation<TwinPreview>({
    mutationFn: async () => {
      const res = await fetch("/api/twin/preview", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Couldn't reach your twin");
      return res.json();
    },
  });
  // Once per visit — it's a generation, not a cheap read.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    preview.mutate();
  }, [preview]);

  // Same exit the Plans intro used to own: refresh post-onboarding state,
  // and honor a WhatsApp group invite stashed before signup.
  const leave = (to = "/discover") => {
    refreshPlanQueries(qc);
    const pendingInvite = consumePendingInvite();
    setLocation(pendingInvite ? resolvePendingInviteRoute(pendingInvite) : to);
  };

  const tryOn = (userId: string) =>
    startInterview.mutate(userId, {
      onSuccess: (iv: any) => {
        refreshPlanQueries(qc);
        if (iv?.id) setLocation(`/interviews/${iv.id}/chat?from=/discover`);
      },
      onError: (err: any) => {
        if (err instanceof UpgradeRequiredError) setLocation(withFrom("/plans?feature=start_interview", "/discover"));
        else toast({ title: "Couldn't start that", description: err?.message, variant: "destructive" });
      },
    });

  const data = preview.data;
  const answered = data?.answers.filter((a) => a.answer && !a.withheld) ?? [];
  const withheldCount = data?.answers.filter((a) => a.withheld).length ?? 0;
  const s = data?.suggestion;

  return (
    <div className="min-h-dvh bg-vf-ink text-vf-text">
      <div className="max-w-xl mx-auto px-5 sm:px-8 py-6">
        <div className="flex items-center justify-between">
          <DestiraLockup orientation="horizontal" size={28} />
          <button
            onClick={() => leave()}
            className="h-11 -mr-2 px-3 rounded-full text-[13px] text-vf-muted hover:text-vf-text transition-colors"
            data-testid="button-skip-twin"
          >
            Skip
          </button>
        </div>

        <div className="mt-10">
          <div className={`${EYEBROW} text-vf-mint flex items-center gap-2`}>
            <span className="w-2 h-2 rounded-full bg-vf-mint" /> Your twin is ready
          </div>
          <h1 className="font-serif font-normal mt-3 text-[clamp(28px,6vw,40px)] leading-[1.08] tracking-[-0.02em]">
            This is how your twin talks about you
          </h1>
          <p className="text-[14px] text-vf-muted leading-[1.6] mt-3">
            When someone's curious about you, they ask your twin first. Here's what it says, from your answers.
          </p>
        </div>

        <div className="mt-7 flex flex-col gap-4" data-testid="twin-preview">
          {preview.isPending || !data ? (
            preview.isError ? (
              <p className="text-[14px] text-vf-muted">Your twin couldn't answer just now. You'll see it in action on Discover.</p>
            ) : (
              <div className="flex items-center gap-2.5 text-[14px] text-vf-muted py-6">
                <Loader2 className="w-4 h-4 animate-spin text-vf-mint" /> Your twin is thinking…
              </div>
            )
          ) : answered.length === 0 && withheldCount === 0 ? (
            <p className="text-[14px] text-vf-muted">
              Your twin doesn't know enough about you to answer yet. A few more answers will give it something to say.
            </p>
          ) : (
            answered.map((a) => (
              <div key={a.question}>
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-[16px] rounded-br-[6px] bg-vf-surface2 border border-vf-line px-4 py-2.5 text-[14px] text-vf-muted">
                    {a.question}
                  </div>
                </div>
                <div className="mt-2 flex">
                  <div className="max-w-[90%] rounded-[16px] rounded-bl-[6px] bg-vf-mint/10 border border-vf-mint/30 px-4 py-3 text-[14.5px] leading-[1.55] text-vf-text">
                    <div className={`${EYEBROW} text-vf-mint mb-1`}>Your twin</div>
                    {a.answer}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {data && withheldCount > 0 && (
          <p className="text-[13px] text-vf-muted mt-4 leading-[1.55] rounded-[14px] border border-vf-line bg-vf-surface2 px-4 py-3" data-testid="twin-withheld-note">
            Your twin held back on {withheldCount === 1 ? "one question" : `${withheldCount} questions`} because the answer
            touched something you've kept private, like religion or past relationships. It does that with everyone.{" "}
            <button onClick={() => setLocation("/twin-disclosure")} className="text-vf-ember underline underline-offset-2">Change what it may say</button>
          </p>
        )}

        {data && (
          <p className="text-[12.5px] text-vf-muted mt-4 leading-[1.55]">
            Not quite you?{" "}
            <button onClick={() => setLocation("/onboarding")} className="text-vf-ember underline underline-offset-2">Answer more questions</button>
            {" "}or{" "}
            <button onClick={() => setLocation("/twin-disclosure")} className="text-vf-ember underline underline-offset-2">choose what it may say</button>.
          </p>
        )}

        {data && (
          <div className="mt-9 rounded-[20px] border border-vf-line bg-vf-surface2 p-5" data-testid="twin-try-on">
            <div className={`${EYEBROW} text-vf-faint`}>Now the other way round</div>
            {s ? (
              <>
                <div className="mt-3 flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-[14px] overflow-hidden shrink-0 border border-vf-line">
                    {s.photoUrl ? (
                      <img src={s.photoUrl} alt={s.displayName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: avatarColor(s.userId) }}>
                        <span className="font-serif text-[22px] text-white/85">{s.displayName[0]?.toUpperCase()}</span>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-serif text-[20px] leading-tight">Ask {s.displayName}'s twin anything</div>
                    {s.reason && <div className="text-[12.5px] text-vf-muted mt-0.5">{s.reason}</div>}
                  </div>
                </div>
                <button
                  onClick={() => tryOn(s.userId)}
                  disabled={startInterview.isPending}
                  className="mt-4 w-full h-12 rounded-full bg-vf-ember text-vf-ink font-semibold text-[15px] btn-press disabled:opacity-60 inline-flex items-center justify-center gap-2"
                  data-testid="button-try-twin"
                >
                  {startInterview.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Talk to {s.displayName}'s twin
                </button>
                <button
                  onClick={() => leave()}
                  className="mt-2 w-full h-11 rounded-full text-[14px] text-vf-muted hover:text-vf-text"
                  data-testid="button-go-discover"
                >
                  Go to Discover
                </button>
              </>
            ) : (
              <>
                <p className="text-[14px] text-vf-muted mt-2">
                  On Discover, tap "Interview Twin" on anyone to ask their twin what you'd want to know first.
                </p>
                <button
                  onClick={() => leave()}
                  className="mt-4 w-full h-12 rounded-full bg-vf-ember text-vf-ink font-semibold text-[15px] btn-press"
                  data-testid="button-go-discover"
                >
                  Go to Discover
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
