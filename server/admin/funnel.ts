// Console: the sign-up funnel, from a landing visit to a first payment, by
// landing headline (?v=) and by source. Everyone who signed up in the
// period is followed through each step, whenever they did it; visits are
// the signed-out landing visits in the same period (server/growth.ts).
import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { adminRoute } from "./auth";
import { auditAdmin } from "./audit";

export const FUNNEL_STEPS = ["visits", "signups", "basics", "liked", "matched", "messaged", "paid"] as const;

type Row = Record<(typeof FUNNEL_STEPS)[number], number> & { key: string };

async function cohort(days: number, by: "variant" | "source"): Promise<Row[]> {
  const col = by === "variant" ? sql`coalesce(s.landing_variant, 'unknown')` : sql`coalesce(s.source, 'unknown')`;
  const r = await db.execute(sql`
    with c as (
      select u.id, ${col} as key
      from users u
      left join signup_sources s on s.user_id = u.id
      where u.created_at >= now() - (${days} || ' days')::interval
    )
    select
      c.key,
      count(*)::int as signups,
      count(*) filter (where exists (select 1 from profiles p where p.user_id = c.id))::int as basics,
      count(*) filter (where exists (select 1 from matches m where m.user1_id = c.id))::int as liked,
      count(*) filter (where exists (select 1 from matches m where m.status = 'matched' and (m.user1_id = c.id or m.user2_id = c.id)))::int as matched,
      count(*) filter (where exists (select 1 from direct_messages d where d.sender_id = c.id))::int as messaged,
      count(*) filter (where exists (select 1 from payments pa where pa.user_id = c.id and pa.status = 'paid'))::int as paid
    from c
    group by c.key
  `);
  const visits = await db.execute(sql`
    select ${by === "variant" ? sql`variant` : sql`source`} as key, sum(visits)::int as visits
    from landing_visits
    where day >= current_date - ${days}::int
    group by 1
  `);
  const v = new Map<string, number>((visits.rows as any[]).map((x) => [String(x.key), Number(x.visits)]));
  const rows = new Map<string, Row>();
  for (const x of r.rows as any[]) {
    rows.set(String(x.key), {
      key: String(x.key),
      visits: v.get(String(x.key)) ?? 0,
      signups: Number(x.signups),
      basics: Number(x.basics),
      liked: Number(x.liked),
      matched: Number(x.matched),
      messaged: Number(x.messaged),
      paid: Number(x.paid),
    });
  }
  // Headlines or sources with visits but no sign-ups yet still show.
  for (const [key, n] of Array.from(v.entries())) {
    if (!rows.has(key)) rows.set(key, { key, visits: n, signups: 0, basics: 0, liked: 0, matched: 0, messaged: 0, paid: 0 });
  }
  return Array.from(rows.values()).sort((a, b) => b.visits + b.signups - (a.visits + a.signups));
}

function total(rows: Row[]): Row {
  const t: Row = { key: "all", visits: 0, signups: 0, basics: 0, liked: 0, matched: 0, messaged: 0, paid: 0 };
  for (const r of rows) for (const s of FUNNEL_STEPS) t[s] += r[s];
  return t;
}

export function registerAdminFunnelRoutes(app: Express) {
  adminRoute(app, "get", "/api/admin/funnel", "read_only", async (req, res) => {
    const days = [7, 14, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    try {
      const [byVariant, bySource] = await Promise.all([cohort(days, "variant"), cohort(days, "source")]);
      await auditAdmin(req, (req as any).admin.userId, "funnel.view", { details: { days } });
      res.json({ days, total: total(byVariant), byVariant, bySource });
    } catch (e) {
      console.error("[admin] funnel error:", e);
      res.status(500).json({ message: "Failed to load the funnel" });
    }
  });
}
