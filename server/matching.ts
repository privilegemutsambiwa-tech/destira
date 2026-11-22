// The one deck score (docs/destira-3-upgrade-prompt.md Part D3-D4). Server
// only, never shown as a number. It's a multiplier on the tier-weighted
// shuffle in storage.getDiscoverableProfiles, so a better fit comes up
// sooner on average while the order stays random, and nobody is buried.
//
// What goes in:
// - shared details: same faith, both Christian, children, marriage timing,
//   a shared language other than English
// - the viewer's non-dealbreaker preferences (shared/match-prefs.ts)
// - mutual age fit: the viewer is inside the candidate's own age range
// - reply likelihood: how often they answer a conversation someone else
//   started (member_match_stats.reply_rate, refreshed daily)
// - recent activity, and a fair first week for new members
// - fairness: someone dealt into a great many decks yesterday is damped
//   today (POPULAR_CAP), so nobody is shown to everyone at once
//
// Every input is fixed for the day (activity counts days before today, the
// stats are yesterday's), so keyset paging never sees a card move.
import { sql, type SQL } from "drizzle-orm";
import { db } from "./db";
import { discoverShownDaily, memberMatchStats, profiles, userActivityDaily, type Profile } from "@shared/schema";
import { CHRISTIAN, type ProfileDetails } from "@shared/profile-details";
import { ADVANCED_PREF_KEYS, type MatchPrefs } from "@shared/match-prefs";

/** Decks a member can be dealt into in a day before the next day damps them. */
export const POPULAR_CAP = 200;
const HARARE_UTC_OFFSET_MS = 2 * 60 * 60 * 1000;

const rows = (r: any) => (r?.rows ?? r ?? []) as any[];

export function harareDay(at = new Date()): string {
  return new Date(at.getTime() + HARARE_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

export function matchScoreExpr(viewer: Profile | undefined, prefs: MatchPrefs): SQL {
  const d = (viewer?.details ?? {}) as ProfileDetails;
  const field = (k: string) => sql`(${profiles.details} ->> ${k})`;
  const list = (vals: string[]) => sql.join(vals.map((v) => sql`${v}`), sql`, `);
  const terms: SQL[] = [];
  if (d.faith && d.faith !== "prefer_not") {
    terms.push(sql`(case when ${field("faith")} = ${d.faith} then 0.6 else 0 end)`);
    if (CHRISTIAN.has(d.faith)) {
      terms.push(sql`(case when ${field("faith")} <> ${d.faith} and ${field("faith")} in (${list(Array.from(CHRISTIAN))}) then 0.3 else 0 end)`);
    }
  }
  if (d.wantsChildren === "yes" || d.wantsChildren === "no") {
    const other = d.wantsChildren === "yes" ? "no" : "yes";
    terms.push(sql`(case ${field("wantsChildren")} when ${d.wantsChildren} then 0.5 when ${other} then -0.4 else 0 end)`);
  }
  if (d.marriage && d.marriage !== "prefer_not") {
    terms.push(sql`(case when ${field("marriage")} = ${d.marriage} then 0.3 else 0 end)`);
  }
  const langs = (d.languages ?? []).filter((l) => l !== "english");
  if (langs.length > 0) {
    terms.push(sql`(case when jsonb_exists_any(${profiles.details} -> 'languages', array[${list(langs)}]::text[]) then 0.3 else 0 end)`);
  }
  // A preference that isn't a dealbreaker only lifts people who meet it.
  for (const k of ADVANCED_PREF_KEYS) {
    const p = prefs[k];
    if (!p || p.must || p.values.length === 0) continue;
    terms.push(sql`(case when ${field(k)} in (${list(p.values)}) then 0.8 else 0 end)`);
  }
  // They'd want this viewer back: the viewer's age is inside their range.
  if (viewer?.age != null) {
    terms.push(sql`(case when coalesce(${profiles.ageMinPreference}, 18) <= ${viewer.age} and coalesce(${profiles.ageMaxPreference}, 99) >= ${viewer.age} then 0.4 else 0 end)`);
  }
  // Reply likelihood: -0.4 (never answers) to +0.4 (always does); nothing
  // until there are 3 conversations to go on.
  terms.push(sql`coalesce((select (${memberMatchStats.replyRate} - 0.5) * 0.8 from ${memberMatchStats} where ${memberMatchStats.userId} = ${profiles.userId}), 0)`);
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  terms.push(sql`(case when exists (select 1 from ${userActivityDaily} where ${userActivityDaily.userId} = ${profiles.userId} and ${userActivityDaily.date} >= ${weekAgo} and ${userActivityDaily.date} < ${today}) then 0.5 else 0 end)`);
  // A fair first week.
  const newSince = new Date(Date.now() - 7 * 86400000);
  newSince.setUTCHours(0, 0, 0, 0);
  terms.push(sql`(case when ${profiles.createdAt} >= ${newSince} then 0.4 else 0 end)`);
  const fit = sql`greatest(0.3, 1 + ${sql.join(terms, sql` + `)})`;
  // Fairness: dealt into more than POPULAR_CAP decks yesterday -> damped in
  // proportion today, never below a quarter.
  const damp = sql`least(1, greatest(0.25, ${POPULAR_CAP}::double precision / greatest(coalesce((select ${memberMatchStats.shownYesterday} from ${memberMatchStats} where ${memberMatchStats.userId} = ${profiles.userId}), 0), 1)))`;
  return sql`(${fit} * ${damp})`;
}

/** Count a page of cards as dealt today. Never blocks the response. */
export async function recordShown(userIds: string[]): Promise<void> {
  const ids = Array.from(new Set(userIds)).filter(Boolean);
  if (ids.length === 0) return;
  const day = harareDay();
  await db.insert(discoverShownDaily)
    .values(ids.map((userId) => ({ userId, day, shown: 1 })))
    .onConflictDoUpdate({
      target: [discoverShownDaily.userId, discoverShownDaily.day],
      set: { shown: sql`${discoverShownDaily.shown} + 1` },
    });
}

/**
 * The daily pass: reply rates from the last 60 days of messages, and
 * yesterday's dealt counts. Run once per Harare day.
 */
export async function refreshMatchStats(): Promise<{ members: number; withRate: number }> {
  const today = harareDay();
  const yesterday = harareDay(new Date(Date.now() - 86400000));
  const replies = rows(await db.execute(sql`
    with firsts as (
      select distinct on (dm.match_id) dm.match_id, dm.sender_id as first_sender
      from direct_messages dm
      where dm.created_at > now() - interval '60 days'
      order by dm.match_id, dm.created_at, dm.id
    ),
    recv as (
      select f.match_id, case when m.user1_id = f.first_sender then m.user2_id else m.user1_id end as receiver
      from firsts f join matches m on m.id = f.match_id
    )
    select r.receiver as user_id,
           count(*)::int as received,
           (count(*) filter (where exists (
             select 1 from direct_messages d2 where d2.match_id = r.match_id and d2.sender_id = r.receiver
           )))::int as replied
    from recv r
    group by r.receiver
  `));
  const shown = await db.select({ userId: discoverShownDaily.userId, shown: discoverShownDaily.shown })
    .from(discoverShownDaily).where(sql`${discoverShownDaily.day} = ${yesterday}`);

  const byUser = new Map<string, { replyRate: number | null; replySample: number; shownYesterday: number }>();
  for (const r of replies) {
    const received = Number(r.received);
    byUser.set(r.user_id, { replyRate: received >= 3 ? Number(r.replied) / received : null, replySample: received, shownYesterday: 0 });
  }
  for (const s of shown) {
    const cur = byUser.get(s.userId) ?? { replyRate: null, replySample: 0, shownYesterday: 0 };
    cur.shownYesterday = s.shown;
    byUser.set(s.userId, cur);
  }

  await db.transaction(async (tx) => {
    // Everyone not in today's numbers goes back to neutral.
    await tx.update(memberMatchStats).set({ replyRate: null, replySample: 0, shownYesterday: 0, updatedDay: today });
    const values = [...byUser.entries()].map(([userId, v]) => ({ userId, ...v, updatedDay: today }));
    for (let i = 0; i < values.length; i += 500) {
      await tx.insert(memberMatchStats).values(values.slice(i, i + 500)).onConflictDoUpdate({
        target: memberMatchStats.userId,
        set: {
          replyRate: sql`excluded.reply_rate`,
          replySample: sql`excluded.reply_sample`,
          shownYesterday: sql`excluded.shown_yesterday`,
          updatedDay: sql`excluded.updated_day`,
        },
      });
    }
    // Two days of dealt counts is all the cap ever reads.
    await tx.delete(discoverShownDaily).where(sql`${discoverShownDaily.day} < ${yesterday}`);
  });
  lastRunDay = today;
  return { members: byUser.size, withRate: [...byUser.values()].filter((v) => v.replyRate != null).length };
}

let lastRunDay: string | null = null;

/** Hourly check: run the daily pass once per Harare day, from 03:00. */
export function startMatchStatsSweep() {
  const tick = async () => {
    try {
      const today = harareDay();
      if (lastRunDay === today) return;
      const hour = new Date(Date.now() + HARARE_UTC_OFFSET_MS).getUTCHours();
      if (lastRunDay === null) {
        // After a restart: catch up only if today's pass hasn't run.
        const [r] = rows(await db.execute(sql`select max(updated_day)::text as d from member_match_stats`));
        if (r?.d === today) { lastRunDay = today; return; }
      }
      if (hour < 3 && lastRunDay !== null) return;
      const out = await refreshMatchStats();
      console.log(`[matching] daily stats: ${out.members} members, ${out.withRate} with a reply rate`);
    } catch (e) {
      console.error("[matching] daily stats failed:", e);
    }
  };
  setTimeout(tick, 60_000);
  setInterval(tick, 60 * 60 * 1000);
}
