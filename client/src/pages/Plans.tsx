import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, X } from "lucide-react";
import { useGate } from "@/hooks/use-gate";
import { SegmentedControl } from "@/components/ui-vf";
import { useSubscription } from "@/hooks/use-interactions";
import { refreshPlanQueries } from "@/hooks/use-payments";
import { consumePendingInvite, resolvePendingInviteRoute } from "@/lib/pending-invite";
import { DestiraLockup } from "@/components/brand/logo";
import { getFromRoute, withFrom } from "@/lib/from-route";
import {
  PLAN_CARDS,
  LIMITS,
  TIERS,
  BILLING_PERIODS,
  PERIOD_LABEL,
  priceLabel,
  limitLabel,
  tierRank,
  gateCopy,
  periodPriceCents,
  periodPerMonthCents,
  periodSavingsPct,
  FEATURES,
  type PlanCard,
  type Feature,
  type Tier,
  type BillingPeriod,
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

const PERIOD_TAB_LABEL: Record<BillingPeriod, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  sixMonth: "6 months",
};

export default function Plans() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const qc = useQueryClient();
  const { data: sub } = useSubscription();
  const currentTier = (sub?.tier as string) || "free";
  const params = new URLSearchParams(search);
  const intro = params.get("intro") === "1";
  // Whoever linked here (a paywall refusal, a gated feature, a trial banner,
  // a direct Settings link) passes its own route as ?from — closing or
  // finishing here returns there instead of always landing on Settings.
  const from = getFromRoute(search, "/settings");

  // Monthly is the default no matter what — never pre-select the period that
  // maximises revenue, that's a dark pattern.
  const [period, setPeriod] = useState<BillingPeriod>("monthly");

  // Arrived here from a specific refusal? Acknowledge it.
  const featureParam = params.get("feature");
  const feature = (FEATURES as readonly string[]).includes(featureParam as string)
    ? (featureParam as Feature)
    : null;
  const ctx = feature ? gateCopy(feature, {}) : null;
  const unlockRank = ctx ? tierRank(ctx.requiredTier) : -1;

  // Lead with the member's own situation (docs/destira-upgrade-prompt.md §7.17).
  const { data: likesGate } = useGate("daily_likes");
  const currentCard = PLAN_CARDS.find((c) => c.tier === currentTier);
  const until = (sub as any)?.currentPeriodEnd ? new Date((sub as any).currentPeriodEnd) : null;
  const untilLabel = until && !Number.isNaN(until.getTime())
    ? until.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : null;
  const situation: string | null = (sub as any)?.isTrial && currentCard
    ? `You're trying ${currentCard.name}${(sub as any).daysRemaining != null ? `: ${(sub as any).daysRemaining} day${(sub as any).daysRemaining === 1 ? "" : "s"} left` : ""}.`
    : currentTier !== "free" && currentCard
      ? `You're on ${currentCard.name}${untilLabel ? ` until ${untilLabel}` : ""}.`
      : likesGate?.limit != null && likesGate.used != null
        ? `You've used ${likesGate.used} of ${likesGate.limit} likes today.`
        : null;

  // The only exit off Free/Continue — never re-enters onboarding. Refreshes
  // profile + subscription state so Discover doesn't render against stale
  // (pre-onboarding, pre-trial) query cache, then honors a WhatsApp group
  // invite that was stashed before signup over the default destination.
  const close = () => {
    refreshPlanQueries(qc);
    const pendingInvite = consumePendingInvite();
    if (pendingInvite) return setLocation(resolvePendingInviteRoute(pendingInvite));
    setLocation(intro ? "/discover" : from);
  };

  const choose = (card: PlanCard) => {
    if (card.tier === "free") return close();
    const featureQs = feature ? `&feature=${feature}` : "";
    setLocation(withFrom(`/plans/pay?tier=${card.tier}&period=${period}${featureQs}`, from));
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
            className="inline-flex items-center gap-1.5 h-11 -mr-2 px-3 rounded-full text-[13px] text-vf-muted hover:text-vf-text hover:bg-vf-text/[0.06] transition-colors"
            data-testid="button-close-plans"
          >
            <X className="w-4 h-4" /> {intro ? "Later" : "Close"}
          </button>
        </div>

        <div className="mt-10 max-w-[46ch]">
          {situation && (
            <p className="inline-flex items-center rounded-full border border-vf-line bg-vf-surface2 px-3.5 py-1.5 text-[13.5px] text-vf-text mb-5" data-testid="text-plan-situation">
              {situation}
            </p>
          )}
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

        {intro && (
          <div className="mt-6 max-w-[46ch]">
            <button
              onClick={close}
              className="w-full sm:w-auto sm:px-10 inline-flex items-center justify-center h-12 rounded-full bg-vf-ember text-vf-ink font-semibold text-[15px] btn-press hover:bg-[var(--vf-ember-soft)] transition-colors"
              data-testid="button-continue-free"
            >
              Continue to Destira — start free
            </button>
            <p className="text-[12px] text-vf-muted mt-2.5">
              You can pick a plan below any time from Settings — this won't slow you down.
            </p>
          </div>
        )}

        <div className="mt-8 w-full sm:w-[380px]" data-testid="period-selector">
          <SegmentedControl
            label="Billing period"
            fullWidth
            options={BILLING_PERIODS.map((p) => ({ value: p, label: PERIOD_TAB_LABEL[p] }))}
            value={period}
            onChange={(p) => setPeriod(p as BillingPeriod)}
          />
        </div>

        {period === "weekly" && (
          <p className="text-[12px] text-vf-faint mt-3 max-w-[46ch]">
            EcoCash doesn't support auto-renewing charges yet, so a weekly plan means a new prompt to approve
            each week — we'll remind you before it lapses.
          </p>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_CARDS.map((card) => {
            const isCurrent = card.tier === currentTier;
            const rec = !!card.recommended;
            const rank = tierRank(card.tier);
            const unlocks = ctx != null && rank >= unlockRank;
            const isCheapestUnlock = ctx != null && card.tier === ctx.requiredTier;
            const emphasise = isCheapestUnlock || (!ctx && rec);
            const priceCents = card.tier === "free" ? 0 : periodPriceCents(card.tier, period);
            const perMonthCents = card.tier === "free" ? null : periodPerMonthCents(card.tier, period);
            const savingsPct = card.tier === "free" ? null : periodSavingsPct(card.tier, period);

            return (
              <div
                key={card.tier}
                className={`rounded-[22px] border p-5 flex flex-col transition-transform ${
                  emphasise
                    ? "border-vf-ember/70 bg-vf-surface vf-e2 lg:-translate-y-1.5"
                    : card.tier === "ember"
                      ? "border-vf-gold/40 bg-vf-surface"
                      : "border-vf-line bg-vf-surface"
                }`}
                data-testid={`plan-${card.tier}`}
              >
                <div className="flex items-center justify-between min-h-[16px]">
                  <div className="flex items-baseline gap-2">
                    <div className={`font-display text-[26px] leading-none ${card.tier === "ember" ? "text-vf-gold" : "text-vf-text"}`}>
                      {card.name}
                    </div>
                    {isCurrent && <span className="vf-label text-vf-faint">your plan</span>}
                  </div>
                  {isCheapestUnlock ? (
                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-vf-ember">Opens this up</span>
                  ) : rec && !ctx ? (
                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-vf-ember">Most pick this</span>
                  ) : null}
                </div>

                <div className="mt-4 flex items-baseline gap-2">
                  <span className="font-mono text-vf-text text-[34px] leading-none tracking-[-0.02em]" data-testid={`price-${card.tier}`}>{priceLabel(priceCents)}</span>
                  {priceCents > 0 && <span className="vf-label text-vf-faint">per {period === "monthly" ? "month" : PERIOD_LABEL[period]}</span>}
                </div>
                {perMonthCents != null && savingsPct != null && (
                  <p className="text-[11.5px] text-vf-faint mt-1">
                    {priceLabel(perMonthCents)} a month · save {savingsPct}%
                  </p>
                )}

                {ctx && (
                  <p
                    className={`text-[11.5px] mt-2 ${unlocks ? "text-vf-ember" : "text-vf-faint"}`}
                    data-testid={`plan-${card.tier}-ctx`}
                  >
                    {unlocks ? `Includes ${ctx.action.toLowerCase()}` : `No ${ctx.action.toLowerCase()}`}
                  </p>
                )}

                <p className="text-[13px] text-vf-muted leading-[1.5] mt-3 min-h-[54px]">{card.pitch}</p>

                <ul className="mt-4 flex flex-col gap-2.5 text-[14px] text-vf-text">
                  {card.gets.slice(0, 5).map((g) => (
                    <li key={g} className="flex items-start gap-2 leading-[1.4]">
                      <Check className={`w-4 h-4 mt-0.5 shrink-0 ${card.tier === "ember" ? "text-vf-gold" : "text-vf-ember"}`} strokeWidth={2.5} />
                      {g}
                    </li>
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

        <details className="mt-12 group" data-testid="plans-compare">
          <summary className="list-none cursor-pointer inline-flex items-center gap-2 min-h-[44px] text-[15px] text-vf-text [&::-webkit-details-marker]:hidden">
            Compare every detail
            <ChevronDown className="w-4 h-4 text-vf-muted transition-transform group-open:rotate-180" />
          </summary>

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
        </details>

        <p className="text-[12px] text-vf-faint mt-8 leading-[1.5]">
          Cancel any time from Settings — it takes one tap and there's no exit fee.
        </p>
      </div>
    </div>
  );
}
