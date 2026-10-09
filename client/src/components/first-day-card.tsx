// "Your first day on Destira": five steps that turn a fresh account into one
// that gets something back, with a real reward for finishing (7 more days of
// Flame). Hidden once claimed, or for a few days after "Not now".
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Gift, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FirstDayStep {
  key: string;
  title: string;
  detail: string;
  href: string;
  done: boolean;
}
interface FirstDayState {
  steps: FirstDayStep[];
  doneCount: number;
  allDone: boolean;
  claimed: boolean;
  rewardLabel: string;
}

const SNOOZE_KEY = "vf_first_day_snooze_until";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

function snoozed(): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

export function FirstDayCard() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [hidden, setHidden] = useState(snoozed);
  const [celebrate, setCelebrate] = useState<string | null>(null);

  const { data } = useQuery<FirstDayState | null>({
    queryKey: ["/api/first-day"],
    queryFn: async () => {
      const r = await fetch("/api/first-day", { credentials: "include" });
      return r.ok ? r.json() : null;
    },
    staleTime: 30_000,
  });

  const claim = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/first-day/claim", { method: "POST", credentials: "include" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.message || "Couldn't claim it");
      return body as { granted: "extended" | "started" | "none"; until: string | null };
    },
    onSuccess: (r) => {
      const until = r.until ? new Date(r.until).toLocaleDateString(undefined, { day: "numeric", month: "long" }) : null;
      setCelebrate(
        r.granted === "none"
          ? "Thanks for settling in. You're on a paid plan already, so there was nothing to add."
          : `Flame is yours${until ? ` until ${until}` : ""}: more likes a day, full twin transcripts and more.`,
      );
      qc.invalidateQueries({ queryKey: ["/api/first-day"] });
      qc.invalidateQueries({ queryKey: ["/api/subscription"] });
    },
    onError: (e: Error) => toast({ title: "Couldn't claim the reward", description: e.message, variant: "destructive" }),
  });

  if (celebrate) {
    return (
      <div className="mb-5 rounded-[20px] border border-vf-gold/40 bg-vf-gold/[0.07] p-5" data-testid="first-day-claimed">
        <div className="flex items-center gap-2 mb-1.5">
          <Gift className="w-4 h-4 text-vf-gold" />
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-gold">Reward unlocked</span>
        </div>
        <p className="text-[14.5px] text-vf-text leading-[1.55]">{celebrate}</p>
        <button onClick={() => setCelebrate(null)} className="mt-3 text-[13px] text-vf-muted hover:text-vf-text">Close</button>
      </div>
    );
  }

  if (!data || data.claimed || hidden) return null;

  const pct = Math.round((data.doneCount / data.steps.length) * 100);
  const next = data.steps.find((s) => !s.done);

  return (
    <div className="mb-5 rounded-[20px] border border-vf-line bg-vf-surface2 p-5" data-testid="first-day-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-ember">Your first day</div>
          <h3 className="font-serif text-[22px] leading-tight text-vf-text mt-1">
            {data.allDone ? "All done. Your reward is ready." : `${data.doneCount} of ${data.steps.length} done`}
          </h3>
          <p className="text-[13px] text-vf-muted mt-1">
            Finish all five and get <span className="text-vf-gold font-semibold">{data.rewardLabel}</span>, free.
          </p>
        </div>
        <button
          onClick={() => {
            try {
              localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
            } catch {
              /* ignore */
            }
            setHidden(true);
          }}
          className="text-vf-faint hover:text-vf-text transition-colors shrink-0"
          aria-label="Hide for now"
          data-testid="first-day-snooze"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-4 h-1.5 rounded-full bg-vf-line overflow-hidden" aria-hidden="true">
        <div className="h-full rounded-full bg-vf-ember transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-4 flex flex-col">
        {data.steps.map((s) => (
          <button
            key={s.key}
            onClick={() => !s.done && setLocation(s.href)}
            disabled={s.done}
            className="flex items-center gap-3 py-2.5 text-left border-t border-vf-line first:border-t-0 disabled:cursor-default group"
            data-testid={`first-day-step-${s.key}`}
          >
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${s.done ? "bg-vf-mint/20 text-vf-mint" : "border border-vf-line text-transparent"}`}
            >
              <Check className="w-3.5 h-3.5" />
            </span>
            <span className="flex-1 min-w-0">
              <span className={`block text-[14.5px] ${s.done ? "text-vf-faint line-through" : "text-vf-text"}`}>{s.title}</span>
              {!s.done && <span className="block text-[12.5px] text-vf-muted">{s.detail}</span>}
            </span>
            {!s.done && <ChevronRight className="w-4 h-4 text-vf-faint group-hover:text-vf-text transition-colors" />}
          </button>
        ))}
      </div>

      {data.allDone ? (
        <button
          onClick={() => claim.mutate()}
          disabled={claim.isPending}
          className="mt-4 w-full h-11 rounded-full bg-vf-gold text-vf-ink font-semibold text-[14px] btn-press disabled:opacity-60 inline-flex items-center justify-center gap-2"
          data-testid="first-day-claim"
        >
          {claim.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Claim {data.rewardLabel}
        </button>
      ) : next ? (
        <button
          onClick={() => setLocation(next.href)}
          className="mt-4 w-full h-11 rounded-full bg-vf-ember text-vf-ink font-semibold text-[14px] btn-press"
          data-testid="first-day-next"
        >
          Next: {next.title}
        </button>
      ) : null}
    </div>
  );
}
