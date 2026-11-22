// Console: Revenue (docs/destira-3-upgrade-prompt.md Part L4). Straight from
// the payments and subscriptions tables, live, so the numbers always match
// them (the Metrics page's money charts come from the nightly rollup).
//
//   - revenue per day (Harare days) and totals for the period
//   - active paid plans by plan and period, and free trials, with the monthly
//     run-rate (what the active paid plans are worth per month)
//   - renewals due in the next 7 days
//   - renewal rate: of paid periods that ended in the window (and at least
//     3 days ago), how many were paid again by 3 days after they ended
//   - payments by method and outcome, and stuck ones (pending > 20 minutes)
import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { adminRoute } from "./auth";
import { auditAdmin } from "./audit";
import { PERIOD_PRICE_CENTS } from "@shared/entitlements";
import { CROWN_PRICE_CENTS } from "@shared/crown";

const PERIOD_DAYS_SQL = sql`(case period when 'weekly' then 7 when 'sixMonth' then 186 else 31 end)`;

function monthlyValueCents(tier: string, period: string): number {
  if (tier === "crown") return CROWN_PRICE_CENTS.monthly;
  const p = (PERIOD_PRICE_CENTS as Record<string, Record<string, number>>)[tier];
  if (!p) return 0;
  if (period === "weekly") return Math.round((p.weekly * 52) / 12);
  if (period === "sixMonth") return Math.round(p.sixMonth / 6);
  return p.monthly;
}

const rows = (r: any) => (r?.rows ?? []) as any[];

export async function revenueReport(days: number) {
  const [daily, plans, due, renewal, byMethod, stuck] = await Promise.all([
    db.execute(sql`
      select to_char((created_at + interval '2 hours')::date, 'YYYY-MM-DD') as day,
             sum(amount)::int as cents, count(*)::int as n, count(distinct user_id)::int as members
      from payments
      where status = 'paid' and created_at >= (now() + interval '2 hours')::date - interval '2 hours' - (${days - 1} || ' days')::interval
      group by 1 order by 1
    `),
    db.execute(sql`
      -- A Crown member's plan underneath is Ember; count them as Crown.
      select case when exists (
               select 1 from crown_members c
               where c.user_id = s.user_id and c.status = 'active' and c.active_until > now()
             ) then 'crown' else s.tier end as tier,
             s.period, (s.provider = 'trial') as trial, count(*)::int as n
      from subscriptions s
      where s.status = 'active' and s.tier <> 'free' and s.current_period_end > now()
      group by 1, 2, 3
    `),
    db.execute(sql`
      select s.user_id, s.tier, s.period, s.current_period_end as ends_at, s.cancel_at_period_end as cancelled,
             p.display_name
      from subscriptions s
      left join profiles p on p.user_id = s.user_id
      where s.status = 'active' and s.tier <> 'free' and s.provider <> 'trial'
        and s.current_period_end > now() and s.current_period_end <= now() + interval '7 days'
      order by s.current_period_end
      limit 100
    `),
    db.execute(sql`
      with p as (
        select id, user_id, created_at, created_at + ${PERIOD_DAYS_SQL} * interval '1 day' as due
        from payments where status = 'paid'
      )
      select count(*)::int as due,
             count(*) filter (where exists (
               select 1 from payments q
               where q.user_id = p.user_id and q.status = 'paid' and q.created_at > p.created_at
                 and q.created_at <= p.due + interval '3 days'
             ))::int as renewed
      from p
      where p.due >= now() - (${days} || ' days')::interval and p.due < now() - interval '3 days'
    `),
    db.execute(sql`
      select provider, status, count(*)::int as n, coalesce(sum(amount), 0)::int as cents
      from payments
      where created_at >= now() - (${days} || ' days')::interval
      group by 1, 2
    `),
    db.execute(sql`
      select
        count(*) filter (where created_at >= now() - interval '48 hours')::int as rechecking,
        count(*) filter (where created_at < now() - interval '48 hours' and created_at >= now() - interval '30 days')::int as for_a_human
      from payments
      where status = 'pending' and created_at < now() - interval '20 minutes'
    `),
  ]);

  // Every day in the window, zeros included, so the chart has no gaps.
  const byDay = new Map(rows(daily).map((r) => [String(r.day), r]));
  const series: { date: string; cents: number; payments: number }[] = [];
  const todayHarare = new Date(Date.now() + 2 * 3_600_000);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayHarare.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    const r = byDay.get(d);
    series.push({ date: d, cents: r ? Number(r.cents) : 0, payments: r ? Number(r.n) : 0 });
  }
  const [members] = rows(
    await db.execute(sql`
      select count(distinct user_id)::int as n from payments
      where status = 'paid' and created_at >= (now() + interval '2 hours')::date - interval '2 hours' - (${days - 1} || ' days')::interval
    `),
  );

  const planRows = rows(plans).map((r) => ({ tier: String(r.tier), period: String(r.period), trial: r.trial === true || r.trial === "t", count: Number(r.n) }));
  const paidPlans = planRows.filter((r) => !r.trial);
  const runRateCents = paidPlans.reduce((s, r) => s + r.count * monthlyValueCents(r.tier, r.period), 0);

  const methods = new Map<string, { method: string; paid: number; failed: number; pending: number; other: number; paidCents: number }>();
  for (const r of rows(byMethod)) {
    const key = String(r.provider);
    const m = methods.get(key) ?? { method: key, paid: 0, failed: 0, pending: 0, other: 0, paidCents: 0 };
    const n = Number(r.n);
    if (r.status === "paid") {
      m.paid += n;
      m.paidCents += Number(r.cents);
    } else if (r.status === "failed") m.failed += n;
    else if (r.status === "pending") m.pending += n;
    else m.other += n; // expired / cancelled: started and abandoned
    methods.set(key, m);
  }
  const ren = rows(renewal)[0] ?? { due: 0, renewed: 0 };
  const st = rows(stuck)[0] ?? { rechecking: 0, for_a_human: 0 };

  return {
    days,
    totals: {
      revenueCents: series.reduce((s, d) => s + d.cents, 0),
      payments: series.reduce((s, d) => s + d.payments, 0),
      payingMembers: Number(members?.n ?? 0),
      activePaid: paidPlans.reduce((s, r) => s + r.count, 0),
      activeTrials: planRows.filter((r) => r.trial).reduce((s, r) => s + r.count, 0),
      runRateCents,
    },
    series,
    plans: planRows,
    renewalsDue: rows(due).map((r) => ({
      userId: String(r.user_id),
      name: r.display_name ? String(r.display_name) : null,
      tier: String(r.tier),
      period: String(r.period),
      endsAt: new Date(r.ends_at).toISOString(),
      cancelled: r.cancelled === true || r.cancelled === "t",
    })),
    renewal: { due: Number(ren.due), renewed: Number(ren.renewed) },
    methods: Array.from(methods.values()).sort((a, b) => b.paid + b.failed - (a.paid + a.failed)),
    stuck: { rechecking: Number(st.rechecking), forAHuman: Number(st.for_a_human) },
  };
}

export function registerAdminRevenueRoutes(app: Express) {
  adminRoute(app, "get", "/api/admin/revenue", "support", async (req, res) => {
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    try {
      const out = await revenueReport(days);
      await auditAdmin(req, (req as any).admin.userId, "revenue.view", { details: { days } });
      res.json(out);
    } catch (e) {
      console.error("[admin] revenue error:", e);
      res.status(500).json({ message: "Failed to load revenue" });
    }
  });
}
