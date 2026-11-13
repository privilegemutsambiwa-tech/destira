// "Your first day on Destira": five steps that turn a fresh account into one
// that gets something back, with a real reward for finishing (7 more days of
// Flame). A chip in Discover's top bar; the steps open in a sheet. Hidden
// once claimed, or for a few days after "Hide for a few days".
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight } from "lucide-react";
import { VfButton, VfSheet } from "@/components/ui-vf";
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

export function FirstDayChip() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [hidden, setHidden] = useState(snoozed);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data } = useQuery<FirstDayState | null>({
    queryKey: ["/api/first-day"],
    queryFn: async () => {
      const r = await fetch("/api/first-day", { credentials: "include" });
      return r.ok ? r.json() : null;
    },
    staleTime: 30_000,
    refetchOnMount: "always", // a step may have been done on another screen
  });

  // Liking someone, joining a group or saving a seat happens on this same
  // screen: re-check the steps after anything the member does, so a step
  // ticks off the moment it's done.
  const open = !!data && !data.claimed;
  useEffect(() => {
    if (!open) return;
    return qc.getMutationCache().subscribe((e) => {
      if (e.type === "updated" && e.action.type === "success") qc.invalidateQueries({ queryKey: ["/api/first-day"] });
    });
  }, [open, qc]);

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

  if (!data || (data.claimed && !celebrate)) return null;
  if (hidden && !celebrate && !sheetOpen) return null;

  const pct = Math.round((data.doneCount / data.steps.length) * 100);
  const next = data.steps.find((s) => !s.done);
  const snooze = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      /* ignore */
    }
    setSheetOpen(false);
    setHidden(true);
  };

  return (
    <>
      {/* The chip (docs/destira-upgrade-prompt.md §7.4): it used to be a
          full card above the first person on Discover. Now it waits in the
          top bar, and the steps open in a sheet. */}
      <button
        onClick={() => setSheetOpen(true)}
        className={`vf-press inline-flex items-center gap-2 h-9 pl-2 pr-3.5 rounded-full border text-[13px] font-medium transition-colors ${
          data.allDone || celebrate
            ? "border-vf-gold/45 bg-vf-gold/10 text-vf-gold"
            : "border-vf-line bg-vf-surface text-vf-text hover:border-vf-text/25"
        }`}
        data-testid="first-day-chip"
      >
        <span className="relative w-5 h-5" aria-hidden="true">
          <svg viewBox="0 0 20 20" className="w-5 h-5 -rotate-90">
            <circle cx="10" cy="10" r="8" fill="none" stroke="var(--vf-line)" strokeWidth="2.5" />
            <circle
              cx="10" cy="10" r="8" fill="none" strokeWidth="2.5" strokeLinecap="round"
              stroke={data.allDone ? "hsl(var(--vf-gold))" : "hsl(var(--vf-ember))"}
              strokeDasharray={`${(pct / 100) * 50.27} 50.27`}
              className="transition-[stroke-dasharray] duration-500"
            />
          </svg>
        </span>
        {data.allDone ? "Reward ready" : `First day ${data.doneCount}/${data.steps.length}`}
      </button>

      <VfSheet
        open={sheetOpen}
        onOpenChange={(o) => { setSheetOpen(o); if (!o) setCelebrate(null); }}
        eyebrow={celebrate ? "Reward unlocked" : "Your first day"}
        tone={celebrate || data.allDone ? "premium" : "default"}
        title={celebrate ? "Enjoy it." : data.allDone ? "All done. Your reward is ready." : `${data.doneCount} of ${data.steps.length} done`}
        description={celebrate ? undefined : <>Finish all five and get <span className="text-vf-gold font-semibold">{data.rewardLabel}</span>, free.</>}
        data-testid="first-day-card"
        footer={
          celebrate ? (
            <VfButton fullWidth variant="secondary" onClick={() => { setSheetOpen(false); setCelebrate(null); }}>Close</VfButton>
          ) : data.allDone ? (
            <VfButton fullWidth variant="premium" loading={claim.isPending} onClick={() => claim.mutate()} data-testid="first-day-claim">
              Claim {data.rewardLabel}
            </VfButton>
          ) : next ? (
            <div className="flex flex-col gap-2">
              <VfButton fullWidth onClick={() => { setSheetOpen(false); setLocation(next.href); }} data-testid="first-day-next">
                Next: {next.title}
              </VfButton>
              <VfButton fullWidth variant="quiet" size="sm" onClick={snooze} data-testid="first-day-snooze">
                Hide for a few days
              </VfButton>
            </div>
          ) : null
        }
      >
        {celebrate ? (
          <p className="vf-body text-vf-soft" data-testid="first-day-claimed">{celebrate}</p>
        ) : (
          <>
            <div className="h-1.5 rounded-full bg-vf-line overflow-hidden" aria-hidden="true">
              <div className="h-full rounded-full bg-vf-ember transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-3 flex flex-col">
              {data.steps.map((s) => (
                <button
                  key={s.key}
                  onClick={() => { if (!s.done) { setSheetOpen(false); setLocation(s.href); } }}
                  disabled={s.done}
                  className="flex items-center gap-3 py-3 text-left border-t border-vf-line first:border-t-0 disabled:cursor-default group"
                  data-testid={`first-day-step-${s.key}`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${s.done ? "bg-vf-success/20 text-vf-success" : "border border-vf-line text-transparent"}`}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-[15px] ${s.done ? "text-vf-faint line-through" : "text-vf-text"}`}>{s.title}</span>
                    {!s.done && <span className="block text-[13px] text-vf-muted">{s.detail}</span>}
                  </span>
                  {!s.done && <ChevronRight className="w-4 h-4 text-vf-faint group-hover:text-vf-text transition-colors" />}
                </button>
              ))}
            </div>
          </>
        )}
      </VfSheet>
    </>
  );
}
