import { useLocation, useSearch } from "wouter";
import { X } from "lucide-react";
import { useSubscription } from "@/hooks/use-interactions";
import { DestiraLockup } from "@/components/brand/logo";
import {
  PLAN_CARDS,
  LIMITS,
  TIERS,
  priceLabel,
  limitLabel,
  tierRank,
  gateCopy,
  FEATURES,
  type PlanCard,
  type Feature,
  type Tier,
} from "@shared/entitlements";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";

const COMPARE_ROWS: { label: string; values: Record<Tier, string> }[] = [
  {
    label: "Likes a day",
    values: Object.fromEntries(TIERS.map((t) => [t, limitLabel(LIMITS[t].dailyLikes)])) as Record<Tier, string>,
  },
  {
    label: "Interviews a week",
    values: Object.fromEntries(TIERS.map((t) => [t, limitLabel(LIMITS[t].weeklyInterviews)])) as Record<Tier, string>,
  },
  {
    label: "Transcript",
    values: Object.fromEntries(
      TIERS.map((t) => [t, LIMITS[t].transcriptLines == null ? "Full" : `${LIMITS[t].transcriptLines} lines`]),
    ) as Record<Tier, string>,
  },
  {
    label: "Rooms you can join",
    values: Object.fromEntries(TIERS.map((t) => [t, limitLabel(LIMITS[t].groupsMax)])) as Record<Tier, string>,
  },
  {
    label: "Rooms you can create",
    values: Object.fromEntries(TIERS.map((t) => [t, limitLabel(LIMITS[t].groupsCreatedMax)])) as Record<Tier, string>,
  },
  {
    label: "See who asked",
    values: Object.fromEntries(TIERS.map((t) => [t, LIMITS[t].seeWhoAsked ? "Yes" : "—"])) as Record<Tier, string>,
  },
  {
    label: "Host events",
    values: Object.fromEntries(TIERS.map((t) => [t, LIMITS[t].canHostEvent ? "Yes" : "—"])) as Record<Tier, string>,
  },
];

export default function Plans() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { data: sub } = useSubscription();
  const currentTier = (sub?.tier as string) || "free";
  const params = new URLSearchParams(search);
  const intro = params.get("intro") === "1";

  // Arrived here from a specific refusal? Acknowledge it.
  const featureParam = params.get("feature");
  const feature = (FEATURES as readonly string[]).includes(featureParam as string)
    ? (featureParam as Feature)
    : null;
  const ctx = feature ? gateCopy(feature, {}) : null;
  const unlockRank = ctx ? tierRank(ctx.requiredTier) : -1;

  const close = () => setLocation(intro ? "/discover" : "/settings");

  const choose = (card: PlanCard) => {
    if (card.tier === "free") return close();
    const featureQs = feature ? `&feature=${feature}` : "";
    setLocation(`/plans/pay?tier=${card.tier}${featureQs}`);
  };

  return (
    <div className="min-h-dvh bg-vf-ink text-vf-text">
      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-6">
        <div className="flex items-center justify-between">
          <button onClick={() => setLocation("/")} className="text-vf-text" data-testid="link-home">
            <DestiraLockup orientation="horizontal" size={28} />
          </button>
          <button
            onClick={close}
            className="inline-flex items-center gap-1.5 h-11 -mr-2 px-3 rounded-full text-[13px] text-vf-text hover:bg-vf-text/[0.06] transition-colors"
            data-testid="button-close-plans"
          >
            {intro ? "Skip — start on Free" : (<><X className="w-4 h-4" /> Close</>)}
          </button>
        </div>

        <div className="mt-10 max-w-[46ch]">
          {ctx ? (
            <>
              <div className={EYEBROW}>Plans · {ctx.action}</div>
              <h1 className="font-serif font-normal text-vf-text mt-3 text-[clamp(26px,4vw,40px)] leading-[1.08] tracking-[-0.02em]">
                {ctx.line}
              </h1>
              <p className="text-[14px] text-vf-muted leading-[1.6] mt-4">
                Prices are in US dollars. Cancel any time — one tap, no exit fee.
              </p>
            </>
          ) : (
            <>
              <div className={EYEBROW}>Plans</div>
              <h1 className="font-serif font-normal text-vf-text mt-3 text-[clamp(30px,4.5vw,46px)] leading-[1.06] tracking-[-0.02em]">
                More room to explore. Better odds of finding your person.
              </h1>
              <p className="text-[14px] text-vf-muted leading-[1.6] mt-4">
                Prices are in US dollars. Nothing here buys you placement or a match —
                your twin does the introducing, and that part isn't for sale.
              </p>
            </>
          )}
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_CARDS.map((card) => {
            const isCurrent = card.tier === currentTier;
            const rec = !!card.recommended;
            const rank = tierRank(card.tier);
            const unlocks = ctx != null && rank >= unlockRank;
            const isCheapestUnlock = ctx != null && card.tier === ctx.requiredTier;
            const emphasise = isCheapestUnlock || (!ctx && rec);

            return (
              <div
                key={card.tier}
                className={`rounded-[22px] border p-5 flex flex-col ${
                  emphasise ? "border-vf-ember/60 bg-vf-ember/[0.06]" : "border-vf-line bg-vf-surface"
                }`}
                data-testid={`plan-${card.tier}`}
              >
                <div className="flex items-center justify-between min-h-[16px]">
                  <div className="flex items-baseline gap-2">
                    <div className={card.tier === "ember" ? "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-gold" : EYEBROW}>
                      {card.name}
                    </div>
                    {isCurrent && <span className="text-[10.5px] text-vf-faint">your plan</span>}
                  </div>
                  {isCheapestUnlock ? (
                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-vf-ember">Opens this up</span>
                  ) : rec && !ctx ? (
                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-vf-ember">Most pick this</span>
                  ) : null}
                </div>

                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="font-serif text-vf-text text-[32px] leading-none">{priceLabel(card.priceCents)}</span>
                  {card.priceCents > 0 && <span className="text-[13px] text-vf-faint">/ mo</span>}
                </div>

                {ctx && (
                  <p
                    className={`text-[11.5px] mt-2 ${unlocks ? "text-vf-ember" : "text-vf-faint"}`}
                    data-testid={`plan-${card.tier}-ctx`}
                  >
                    {unlocks ? `Includes ${ctx.action.toLowerCase()}` : `No ${ctx.action.toLowerCase()}`}
                  </p>
                )}

                <p className="text-[13px] text-vf-muted leading-[1.5] mt-3 min-h-[54px]">{card.pitch}</p>

                <ul className="mt-4 flex flex-col gap-2 text-[13px] text-vf-soft">
                  {card.gets.map((g) => (
                    <li key={g} className="leading-[1.45]">{g}</li>
                  ))}
                </ul>

                {card.notYet.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-vf-line">
                    <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-vf-faint">Not on this plan</div>
                    <ul className="mt-1.5 flex flex-col gap-1.5 text-[12px] text-vf-faint">
                      {card.notYet.map((n) => (
                        <li key={n} className="leading-[1.4]">{n}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex-1" />

                <button
                  onClick={() => choose(card)}
                  disabled={isCurrent}
                  className={`mt-5 h-11 rounded-full text-[13.5px] font-semibold btn-press transition-colors disabled:opacity-40 ${
                    emphasise
                      ? "bg-vf-ember text-vf-ink hover:bg-[var(--vf-ember-soft)]"
                      : "border border-vf-line text-vf-text hover:border-vf-text/25"
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

        <div className="mt-12">
          <div className={EYEBROW}>Compare</div>

          {/* ≥640px: a real grid table, no horizontal scroll needed at this width. */}
          <div className="hidden sm:block mt-4 rounded-[16px] border border-vf-line overflow-hidden">
            <div className="grid grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
              <div className="p-3" />
              {PLAN_CARDS.map((card) => (
                <div key={card.tier} className={`p-3 text-center ${EYEBROW}`}>
                  {card.name}
                </div>
              ))}
              {COMPARE_ROWS.map((row, i) => (
                <div key={row.label} className="contents">
                  <div className={`p-3 text-[13px] text-vf-muted border-t border-vf-line ${i === 0 ? "border-t-0" : ""}`}>
                    {row.label}
                  </div>
                  {PLAN_CARDS.map((card) => (
                    <div
                      key={card.tier}
                      className={`p-3 text-center font-serif text-[15px] text-vf-text border-t border-vf-line ${i === 0 ? "border-t-0" : ""}`}
                    >
                      {row.values[card.tier]}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* <640px: one stacked block per tier — a table would need to scroll sideways here, so this doesn't try to be one. */}
          <div className="sm:hidden mt-4 flex flex-col gap-3">
            {PLAN_CARDS.map((card) => (
              <div key={card.tier} className="rounded-[16px] border border-vf-line p-4">
                <div className={EYEBROW}>{card.name}</div>
                <dl className="mt-2 flex flex-col gap-1.5">
                  {COMPARE_ROWS.map((row) => (
                    <div key={row.label} className="flex items-baseline justify-between gap-3">
                      <dt className="text-[12.5px] text-vf-muted">{row.label}</dt>
                      <dd className="font-serif text-[14px] text-vf-text">{row.values[card.tier]}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[12px] text-vf-faint mt-8 leading-[1.5]">
          Cancel any time from Settings — it takes one tap and there's no exit fee.
        </p>
      </div>
    </div>
  );
}
