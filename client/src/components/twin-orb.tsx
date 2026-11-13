// The twin orb (docs/destira-upgrade-prompt.md §5.1): the twin's one
// standing presence on Discover. It breathes; tap it and it says what it
// actually did for you. Everything in the sheet is real: counts from real
// interviews of your twin, its real notices, and how much it has to work
// from. Never who asked (that has never been shown, and isn't now), and
// never a made-up line.
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { VfButton, VfSheet } from "@/components/ui-vf";
import { haptic } from "@/lib/haptics";

interface TwinToday {
  askedToday: number;
  answeredInThoseChats: number;
  askedThisWeek: number;
  notices: { id: number; title: string; body: string; createdAt: string | null }[];
  readinessPct: number;
  answeredCount: number;
}

function Orb({ size, lively }: { size: number; lively: boolean }) {
  return (
    <span className="relative block shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <span
        className="absolute -inset-1.5 rounded-full motion-safe:animate-[vf-breathe_5s_ease-in-out_infinite]"
        style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--vf-mint-vivid) 45%, transparent), transparent 70%)" }}
      />
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle at 35% 30%, #D8F6EA, var(--vf-mint-vivid) 38%, #2E7F6B 100%)",
          boxShadow: "inset 0 -3px 6px rgba(0,0,0,.18)",
        }}
      />
      {lively && (
        <span
          className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-vf-ember border-2 border-vf-ink"
          data-testid="twin-orb-dot"
        />
      )}
    </span>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex-1 rounded-[16px] border border-vf-line bg-vf-surface2 px-4 py-3">
      <div className="vf-figure text-[26px] leading-none text-vf-text">{value}</div>
      <div className="vf-small text-vf-muted mt-1.5">{label}</div>
    </div>
  );
}

export function TwinOrbButton() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const { data } = useQuery<TwinToday>({
    queryKey: ["/api/twin/today"],
    queryFn: async () => {
      const r = await fetch("/api/twin/today", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
    staleTime: 2 * 60 * 1000,
  });
  const asked = data?.askedToday ?? 0;
  const go = (href: string) => { setOpen(false); navigate(href); };

  const headline = !data
    ? "Checking in…"
    : asked > 0
      ? `${asked === 1 ? "Someone" : `${asked} people`} asked me about you today.`
      : data.askedThisWeek > 0
        ? "Quiet today. I'm here when someone asks."
        : "Nobody's asked about you yet. I'm ready when they do.";

  return (
    <>
      <button
        onClick={() => { haptic.tick(); setOpen(true); }}
        className="vf-press w-11 h-11 rounded-full flex items-center justify-center hover:bg-vf-surface2 transition-colors"
        aria-label={asked > 0 ? `Your twin: ${asked} asked about you today` : "Your twin today"}
        data-testid="button-twin-orb"
      >
        <Orb size={28} lively={asked > 0} />
      </button>

      <VfSheet
        open={open}
        onOpenChange={setOpen}
        tone="twin"
        eyebrow="Your twin · today"
        title={headline}
        data-testid="sheet-twin-today"
        footer={
          <div className="flex flex-col gap-2">
            <VfButton variant="twin" fullWidth onClick={() => go("/twin-chat?from=/discover")} data-testid="button-twin-talk">
              Talk to your twin
            </VfButton>
            <VfButton variant="quiet" size="sm" fullWidth onClick={() => go("/twin-disclosure")}>
              What it may say about you
            </VfButton>
          </div>
        }
      >
        {data && (
          <div className="flex flex-col gap-5">
            <div className="flex gap-3">
              <Figure value={data.answeredInThoseChats} label="questions answered in the last 24 hours" />
              <Figure value={data.askedThisWeek} label={data.askedThisWeek === 1 ? "person asked this week" : "people asked this week"} />
            </div>

            <p className="vf-small text-vf-muted">
              I don't tell you who asked. If they like you, they'll show up in Likes.
            </p>

            {data.notices.length > 0 && (
              <div>
                <div className="vf-label text-vf-faint mb-2">I noticed</div>
                <div className="flex flex-col">
                  {data.notices.map((n) => (
                    <div key={n.id} className="py-3 border-t border-vf-line first:border-t-0">
                      <div className="text-[15px] text-vf-text">{n.title}</div>
                      <div className="vf-small text-vf-muted mt-0.5">{n.body}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => go("/onboarding")}
              className="flex items-center gap-3 text-left rounded-[16px] border border-vf-mint/30 bg-vf-mint/[0.07] px-4 py-3.5 hover:bg-vf-mint/10 transition-colors"
              data-testid="link-twin-teach"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[15px] text-vf-text">
                  {data.answeredCount === 0
                    ? "I don't have any of your answers yet."
                    : `I'm working from ${data.answeredCount === 1 ? "one answer" : `${data.answeredCount} answers`}.`}
                </div>
                <div className="vf-small text-vf-muted mt-0.5">
                  {data.readinessPct >= 80 ? "That's plenty. Add more any time." : data.answeredCount === 0 ? "Answer a few questions and I can speak for you." : "A few more and I can speak for you properly."}
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-vf-mint shrink-0" />
            </button>
          </div>
        )}
      </VfSheet>
    </>
  );
}
