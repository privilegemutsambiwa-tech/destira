import { useLocation, useSearch } from "wouter";
import { useSubscription } from "@/hooks/use-interactions";
import { VibeFlowLockup } from "@/components/brand/logo";
import { PLAN_CARDS, priceLabel, tierRank, type PlanCard } from "@shared/entitlements";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";

export default function Plans() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { data: sub } = useSubscription();
  const currentTier = (sub?.tier as string) || "free";
  const intro = new URLSearchParams(search).get("intro") === "1";

  const close = () => setLocation(intro ? "/discover" : "/settings");

  const choose = (card: PlanCard) => {
    if (card.tier === "free") return close();
    setLocation(`/plans/pay?tier=${card.tier}`);
  };

  return (
    <div className="min-h-screen bg-vf-ink text-vf-text">
      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-6">
        <div className="flex items-center justify-between">
          <button onClick={() => setLocation("/")} className="text-vf-text" data-testid="link-home">
            <VibeFlowLockup orientation="horizontal" size={26} />
          </button>
          <button
            onClick={close}
            className="text-[13px] text-vf-muted hover:text-vf-text transition-colors"
            data-testid="button-close-plans"
          >
            {intro ? "Skip — start on Free" : "Close"}
          </button>
        </div>

        <div className="mt-10 max-w-[42ch]">
          <div className={EYEBROW}>Plans</div>
          <h1 className="font-serif font-normal text-vf-text mt-3 text-[clamp(30px,4.5vw,46px)] leading-[1.06] tracking-[-0.02em]">
            Free is the real thing. Paying buys room and the transcript.
          </h1>
          <p className="text-[14px] text-vf-muted leading-[1.6] mt-4">
            Prices are in US dollars, per month. Nothing here buys you placement or a match —
            the twin does the introducing, and that part isn't for sale.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_CARDS.map((card) => {
            const isCurrent = card.tier === currentTier;
            const rec = !!card.recommended;
            return (
              <div
                key={card.tier}
                className={`rounded-[22px] border p-5 flex flex-col ${
                  rec ? "border-vf-ember/50 bg-vf-ember/[0.05]" : "border-vf-line bg-vf-surface"
                }`}
                data-testid={`plan-${card.tier}`}
              >
                <div className="flex items-center justify-between">
                  <div className={EYEBROW}>{card.name}</div>
                  {rec && (
                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-vf-ember">Most pick this</span>
                  )}
                  {isCurrent && !rec && (
                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-vf-faint">You're here</span>
                  )}
                </div>

                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="font-serif text-vf-text text-[34px] leading-none">{priceLabel(card.priceCents)}</span>
                  {card.priceCents > 0 && <span className="text-[13px] text-vf-faint">/ mo</span>}
                </div>

                <p className="text-[13px] text-vf-muted leading-[1.5] mt-3 min-h-[54px]">{card.pitch}</p>

                <ul className="mt-4 flex flex-col gap-2 text-[13px] text-vf-soft">
                  {card.gets.map((g) => (
                    <li key={g} className="leading-[1.45]">{g}</li>
                  ))}
                </ul>

                {card.notYet.length > 0 && (
                  <ul className="mt-3 pt-3 border-t border-vf-line flex flex-col gap-1.5 text-[12px] text-vf-faint">
                    {card.notYet.map((n) => (
                      <li key={n} className="leading-[1.4]">Not yet: {n}</li>
                    ))}
                  </ul>
                )}

                <div className="flex-1" />

                <button
                  onClick={() => choose(card)}
                  disabled={isCurrent}
                  className={`mt-5 h-11 rounded-full text-[13.5px] font-semibold btn-press transition-colors disabled:opacity-40 ${
                    rec
                      ? "bg-vf-ember text-vf-ink hover:bg-[#FF8163]"
                      : "border border-vf-line text-vf-text hover:border-white/25"
                  }`}
                  data-testid={`button-choose-${card.tier}`}
                >
                  {isCurrent
                    ? "Your plan"
                    : card.tier === "free"
                      ? "Stay on Free"
                      : tierRank(card.tier) < tierRank(currentTier)
                        ? `Move to ${card.name}`
                        : `Get ${card.name}`}
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-[12px] text-vf-faint mt-8 leading-[1.5]">
          Cancel any time from Settings — it takes one tap and there's no exit fee.
        </p>
      </div>
    </div>
  );
}
