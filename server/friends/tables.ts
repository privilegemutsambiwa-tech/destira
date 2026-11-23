// The Sunday Table (docs/destira-3-upgrade-prompt.md Part O2).
//   GET    /api/tables/me             this weekend: sign-up, your table, the reveal so far
//   POST   /api/tables/signup         { mix }  (until Thursday 18:00)
//   DELETE /api/tables/signup         change of plans, same deadline
//   POST   /api/tables/:id/pick       { toId, kind: "friends" | "love" | null }
// The Friday run seats people; the hourly sweep reveals the place on
// Saturday and asks "who would you see again?" after lunch. Nobody pays
// through the app: everyone pays the venue for their own food.
import type { Express, Request } from "express";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  groups, matches, places, profiles, sundayTables, tablePicks, tableSignups, twinProfilesStructured, type SundayTable,
} from "@shared/schema";
import { ageFromDob } from "@shared/essentials";
import { wantsFriends, wantsLove } from "@shared/friends";
import {
  TABLE_AGE_SPREAD, TABLE_MIN, TABLE_MIX_VALUES, TABLE_SIZE, signupWeekend, weekendLabel, weekendTimes,
  type TableMix, type TablePickKind, type TablesMe, type TableView,
} from "@shared/tables";
import type { ProfileDetails } from "@shared/profile-details";
import { genderMatchesSeeking, storage } from "../storage";
import { getEffectiveTier } from "../gate";
import { notify } from "../push";

// ── the matcher (pure, so it can be tested on its own) ─────────────────

export interface Seatable {
  userId: string;
  gender: string | null;
  age: number | null;
  area: string | null;
  city: string | null;
  interests: string[];
  faith: string | null;
  languages: string[];
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** How well two people would sit together. Same suburb matters most. */
export function pairScore(a: Seatable, b: Seatable): number {
  let s = 0;
  if (a.area && norm(a.area) === norm(b.area)) s += 6;
  else if (a.city && norm(a.city) === norm(b.city)) s += 1;
  if (a.age != null && b.age != null) {
    const d = Math.abs(a.age - b.age);
    s += d <= 3 ? 3 : d <= 6 ? 1 : 0;
  }
  const mine = new Set(a.interests.map(norm));
  s += Math.min(3, b.interests.filter((i) => mine.has(norm(i))).length);
  if (a.faith && a.faith === b.faith && a.faith !== "none") s += 1;
  if (a.languages.some((l) => b.languages.includes(l))) s += 1;
  return s;
}

function spreadOk(table: Seatable[], c: Seatable): boolean {
  const ages = [...table, c].map((m) => m.age).filter((a): a is number => a != null);
  return !ages.length || Math.max(...ages) - Math.min(...ages) <= TABLE_AGE_SPREAD;
}

/**
 * Tables of up to six (at least four) from one pool. Greedy: start from the
 * person with the fewest good options, add whoever sits best with everyone
 * already there, inside the age band. A mixed table leans towards three
 * women and three men; it never takes a fifth of one gender while the other
 * is still available.
 */
export function seat(pool: Seatable[], mixed: boolean): { tables: Seatable[][]; unseated: Seatable[] } {
  let left = [...pool];
  const tables: Seatable[][] = [];
  const unseated: Seatable[] = [];
  const options = (m: Seatable) => left.filter((o) => o !== m && spreadOk([m], o) && pairScore(m, o) >= 6).length;
  while (left.length >= TABLE_MIN) {
    left.sort((a, b) => options(a) - options(b) || (a.age ?? 0) - (b.age ?? 0) || a.userId.localeCompare(b.userId));
    const seed = left[0];
    const table = [seed];
    let rest = left.slice(1);
    while (table.length < TABLE_SIZE) {
      const count = (g: string) => table.filter((m) => m.gender === g).length;
      let best: Seatable | null = null;
      let bestScore = -Infinity;
      for (const c of rest) {
        if (!spreadOk(table, c)) continue;
        if (mixed && (c.gender === "woman" || c.gender === "man")) {
          const other = c.gender === "woman" ? "man" : "woman";
          const otherLeft = rest.some((o) => o.gender === other && spreadOk(table, o));
          if (count(c.gender) >= 3 && otherLeft && count(c.gender) >= count(other)) continue;
          if (count(c.gender) >= 4) continue;
        }
        let score = table.reduce((s, m) => s + pairScore(m, c), 0) / table.length;
        if (mixed && (c.gender === "woman" || c.gender === "man")) {
          const other = c.gender === "woman" ? "man" : "woman";
          if (count(c.gender) < count(other)) score += 2;
        }
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (!best) break;
      table.push(best);
      rest = rest.filter((m) => m !== best);
    }
    if (table.length >= TABLE_MIN) {
      tables.push(table);
      left = rest;
    } else {
      unseated.push(seed);
      left = left.slice(1);
    }
  }
  return { tables, unseated: [...unseated, ...left] };
}

/** "A table of 6, aged 26 to 33, who love music and church." */
export function vibeFor(table: Seatable[]): string {
  const ages = table.map((m) => m.age).filter((a): a is number => a != null);
  const counts = new Map<string, number>();
  for (const m of table) for (const i of new Set(m.interests.map((x) => x.trim()))) counts.set(i, (counts.get(i) ?? 0) + 1);
  const common = Array.from(counts.entries()).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([i]) => i.toLowerCase());
  const areas = new Map<string, number>();
  for (const m of table) if (m.area) areas.set(m.area, (areas.get(m.area) ?? 0) + 1);
  const [topArea, inArea] = Array.from(areas.entries()).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  let s = `A table of ${table.length}`;
  if (ages.length) s += Math.min(...ages) === Math.max(...ages) ? `, all ${ages[0]}` : `, aged ${Math.min(...ages)} to ${Math.max(...ages)}`;
  if (common.length) s += `, who love ${common.join(" and ")}`;
  else if (topArea && inArea >= Math.ceil(table.length / 2)) s += `, mostly from around ${topArea}`;
  return s + ".";
}

// ── places ─────────────────────────────────────────────────────────────

const MEET_TYPES = ["mall", "cafe", "venue"];

type Exec = Pick<typeof db, "select">;

async function placeFor(ex: Exec, people: { lat: number | null; lng: number | null; area: string | null }[]): Promise<{ name: string; detail: string | null }> {
  const pts = people.filter((p) => p.lat != null && p.lng != null) as { lat: number; lng: number }[];
  const mid = pts.length ? { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length } : null;
  const rows = await ex.select().from(places).where(inArray(places.placeType, MEET_TYPES)).limit(300);
  const areas = new Set(people.map((p) => norm(p.area)).filter(Boolean));
  const scored = rows.map((p) => {
    const lat = p.lat != null ? Number(p.lat) : null;
    const lng = p.lng != null ? Number(p.lng) : null;
    const d = mid && lat != null && lng != null ? Math.hypot(lat - mid.lat, (lng - mid.lng) * Math.cos((mid.lat * Math.PI) / 180)) : null;
    return { p, d, local: areas.has(norm(p.suburb)) ? 1 : 0 };
  }).sort((a, b) => (a.d != null && b.d != null ? a.d - b.d : b.local - a.local || (a.d != null ? -1 : b.d != null ? 1 : 0)));
  const pick = scored[0]?.p;
  if (pick) return { name: pick.name, detail: pick.suburb === "CBD" ? `${pick.city} CBD` : `${pick.suburb}, ${pick.city}` };
  return { name: "Harare Gardens", detail: "Harare CBD" };
}

// ── forming a weekend ──────────────────────────────────────────────────

const ageOf = (p: { age: number | null; dateOfBirth: string | null }) => (p.dateOfBirth ? ageFromDob(p.dateOfBirth) : null) ?? p.age ?? null;
const areaOf = (p: { locationName: string | null; location: string | null }) => (p.locationName || p.location || "").split(",")[0].trim() || null;
const cityOf = (p: { location: string | null }) => {
  const parts = (p.location || "").split(",").map((x) => x.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : null;
};

/**
 * Seat everyone still waiting for this weekend. Safe to run again: only
 * "waiting" sign-ups are touched, under a lock for the weekend.
 */
export async function formWeekend(weekend: string): Promise<{ tables: number; seated: number; unseated: number }> {
  const t = weekendTimes(weekend);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"sunday-table:" + weekend}))`);
    const waiting = await tx.select().from(tableSignups).where(and(eq(tableSignups.weekend, weekend), eq(tableSignups.status, "waiting")));
    if (!waiting.length) return { tables: 0, seated: 0, unseated: 0 };
    const ids = waiting.map((w) => w.userId);
    const [ps, tw] = await Promise.all([
      tx.select({
        userId: profiles.userId, gender: profiles.gender, age: profiles.age, dateOfBirth: profiles.dateOfBirth,
        location: profiles.location, locationName: profiles.locationName, lat: profiles.locationLat, lng: profiles.locationLng,
        details: profiles.details, moderationStatus: profiles.moderationStatus,
      }).from(profiles).where(inArray(profiles.userId, ids)),
      tx.select({ userId: twinProfilesStructured.userId, interests: twinProfilesStructured.interests }).from(twinProfilesStructured).where(inArray(twinProfilesStructured.userId, ids)),
    ]);
    const interests = new Map(tw.map((r) => [r.userId, (r.interests ?? []).filter(Boolean)]));
    const byId = new Map(ps.map((p) => [p.userId, p]));
    const people = new Map<string, Seatable & { lat: number | null; lng: number | null }>();
    for (const w of waiting) {
      const p = byId.get(w.userId);
      if (!p || p.moderationStatus !== "active") continue;
      const d = (p.details ?? {}) as ProfileDetails;
      people.set(w.userId, {
        userId: w.userId, gender: p.gender, age: ageOf(p as any), area: areaOf(p), city: cityOf(p),
        interests: interests.get(w.userId) ?? [], faith: (d as any).faith ?? null, languages: ((d as any).languages ?? []) as string[],
        lat: p.lat != null ? Number(p.lat) : null, lng: p.lng != null ? Number(p.lng) : null,
      });
    }
    const pools: Record<TableMix, Seatable[]> = { mixed: [], women: [], men: [] };
    for (const w of waiting) {
      const m = people.get(w.userId);
      if (m) pools[(TABLE_MIX_VALUES.includes(w.mix) ? w.mix : "mixed") as TableMix].push(m);
    }
    let tables = 0, seated = 0;
    const seatedIds = new Set<string>();
    for (const mix of ["mixed", "women", "men"] as TableMix[]) {
      const out = seat(pools[mix], mix === "mixed");
      for (const table of out.tables) {
        const full = table.map((m) => people.get(m.userId)!);
        const place = await placeFor(tx, full);
        const ages = table.map((m) => m.age).filter((a): a is number => a != null);
        const areas = table.map((m) => m.area).filter(Boolean) as string[];
        const [row] = await tx.insert(sundayTables).values({
          weekend, startsAt: t.startsAt, mix, vibe: vibeFor(table),
          ageMin: ages.length ? Math.min(...ages) : null, ageMax: ages.length ? Math.max(...ages) : null,
          area: areas.sort((a, b) => areas.filter((x) => x === b).length - areas.filter((x) => x === a).length)[0] ?? null,
          placeName: place.name, placeDetail: place.detail,
        }).returning({ id: sundayTables.id });
        await tx.update(tableSignups).set({ status: "seated", tableId: row.id })
          .where(and(eq(tableSignups.weekend, weekend), inArray(tableSignups.userId, table.map((m) => m.userId))));
        for (const m of table) seatedIds.add(m.userId);
        tables++;
        seated += table.length;
      }
    }
    const notSeated = waiting.filter((w) => !seatedIds.has(w.userId)).map((w) => w.userId);
    if (notSeated.length) {
      await tx.update(tableSignups).set({ status: "unseated" })
        .where(and(eq(tableSignups.weekend, weekend), inArray(tableSignups.userId, notSeated)));
    }
    return { tables, seated, unseated: notSeated.length };
  });
}

// ── what a member sees ─────────────────────────────────────────────────

async function membersOf(tableId: number): Promise<string[]> {
  return (await db.select({ userId: tableSignups.userId }).from(tableSignups).where(eq(tableSignups.tableId, tableId))).map((r) => r.userId);
}

export async function tableView(table: SundayTable, viewerId: string, now = new Date()): Promise<TableView> {
  const t = weekendTimes(table.weekend);
  // A table's own start time wins (it's the one tests and changes move).
  const startsAt = table.startsAt;
  const shift = startsAt.getTime() - t.startsAt.getTime();
  const at = (d: Date) => new Date(d.getTime() + shift);
  const placeAt = at(t.placeAt), namesAt = at(t.namesAt), picksOpen = at(t.picksOpen), picksClose = at(t.picksClose);
  const ids = await membersOf(table.id);
  const showNames = now >= namesAt;
  let people: TableView["people"] = null;
  let canLove: string[] = [];
  const ps = await db.select({
    userId: profiles.userId, displayName: profiles.displayName, age: profiles.age, dateOfBirth: profiles.dateOfBirth,
    isPublic: profiles.isPublic, coverPhotoUrl: profiles.coverPhotoUrl, lookingFor: profiles.lookingFor,
    gender: profiles.gender, seekingGenders: profiles.seekingGenders,
  }).from(profiles).where(inArray(profiles.userId, ids));
  const me = ps.find((p) => p.userId === viewerId);
  if (showNames) {
    const photos = await storage.resolveProfilePhotos(ps.map((p) => ({ userId: p.userId, isPublic: p.isPublic, coverPhotoUrl: p.coverPhotoUrl ?? null, profileImageUrl: null })));
    people = ps.filter((p) => p.userId !== viewerId).map((p) => ({
      userId: p.userId,
      name: (p.displayName || "Someone").split(/\s+/)[0],
      age: ageOf(p as any),
      photoUrl: photos.get(p.userId) ?? p.coverPhotoUrl ?? null,
    }));
    // "More than friends" only between two people here for Love who'd each date the other.
    const seeks = (a: typeof ps[number], b: typeof ps[number]) =>
      (a.seekingGenders ?? []).includes("everyone") || genderMatchesSeeking(b.gender, a.seekingGenders ?? []);
    if (me && wantsLove(me.lookingFor)) {
      canLove = ps.filter((p) => p.userId !== viewerId && wantsLove(p.lookingFor) && seeks(me, p) && seeks(p, me)).map((p) => p.userId);
    }
  }
  const mine = await db.select({ toId: tablePicks.toId, kind: tablePicks.kind }).from(tablePicks)
    .where(and(eq(tablePicks.tableId, table.id), eq(tablePicks.fromId, viewerId)));
  return {
    id: table.id,
    weekend: table.weekend,
    startsAt: startsAt.toISOString(),
    size: ids.length,
    ageMin: table.ageMin,
    ageMax: table.ageMax,
    vibe: table.vibe,
    place: now >= placeAt ? { name: table.placeName, detail: table.placeDetail } : null,
    placeAt: placeAt.toISOString(),
    chatGroupId: now >= placeAt ? table.chatGroupId : null,
    people,
    namesAt: namesAt.toISOString(),
    picks: {
      open: now >= picksOpen && now < picksClose,
      opensAt: picksOpen.toISOString(),
      closesAt: picksClose.toISOString(),
      canLove,
      mine: mine.map((m) => ({ toId: m.toId, kind: m.kind as TablePickKind })),
    },
  };
}

/** Free: one table a month. Spark and up: every week. */
async function allowance(userId: string, weekend: string): Promise<TablesMe["allowance"]> {
  if ((await getEffectiveTier(userId)) !== "free") return { ok: true };
  const month = weekend.slice(0, 7);
  const [other] = await db.select({ id: tableSignups.id }).from(tableSignups).where(and(
    eq(tableSignups.userId, userId), ne(tableSignups.weekend, weekend),
    sql`${tableSignups.weekend} like ${month + "-%"}`, inArray(tableSignups.status, ["waiting", "seated"]),
  )).limit(1);
  return other ? { ok: false, reason: "On Free you get one table a month. Spark and up: every week." } : { ok: true };
}

export async function tablesMe(userId: string, now = new Date()): Promise<TablesMe> {
  const weekend = signupWeekend(now);
  const t = weekendTimes(weekend);
  const me = await storage.getProfile(userId);
  const mineRows = await db.select().from(tableSignups).where(eq(tableSignups.userId, userId));
  const signup = mineRows.find((r) => r.weekend === weekend) ?? null;
  // The table to show: the nearest one that hasn't finished its picks.
  const seatedRows = mineRows.filter((r) => r.status === "seated" && r.tableId != null);
  const tables = seatedRows.length
    ? await db.select().from(sundayTables).where(inArray(sundayTables.id, seatedRows.map((r) => r.tableId!)))
    : [];
  const views = await Promise.all(tables.map((tb) => tableView(tb, userId, now)));
  const upcoming = views.filter((v) => now < new Date(v.picks.opensAt)).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null;
  const recent = views.filter((v) => v.picks.open).sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0] ?? null;
  // A sign-up for a weekend already being formed or held (Friday to Sunday).
  const current = mineRows.find((r) => r.weekend !== weekend && r.status !== "seated" && weekendTimes(r.weekend).picksOpen > now) ?? null;
  const shown = signup ?? current;
  return {
    weekend,
    weekendLabel: weekendLabel(weekend),
    signupCloses: t.signupCloses.toISOString(),
    signup: shown ? { weekend: shown.weekend, weekendLabel: weekendLabel(shown.weekend), status: shown.status as any, mix: shown.mix as TableMix } : null,
    allowance: await allowance(userId, weekend),
    friendsOn: wantsFriends(me?.lookingFor),
    table: upcoming,
    recent,
  };
}

// ── see again ──────────────────────────────────────────────────────────

/**
 * A private pick. If they picked you too, it becomes one chat: a dating
 * match when you both picked "love", a friendship otherwise. Never twice.
 */
export async function pick(tableId: number, fromId: string, toId: string, kind: TablePickKind | null, now = new Date()) {
  const [table] = await db.select().from(sundayTables).where(eq(sundayTables.id, tableId));
  if (!table) return { error: 404, message: "No such table." };
  const ids = await membersOf(tableId);
  if (!ids.includes(fromId) || !ids.includes(toId) || fromId === toId) return { error: 403, message: "You can only pick people from your table." };
  const view = await tableView(table, fromId, now);
  if (!view.picks.open) return { error: 409, message: "Picks open after lunch and close a week later." };
  if (kind === "love" && !view.picks.canLove.includes(toId)) return { error: 403, message: "Love is only for two people who are both here for it." };

  if (!kind) {
    await db.delete(tablePicks).where(and(eq(tablePicks.tableId, tableId), eq(tablePicks.fromId, fromId), eq(tablePicks.toId, toId)));
    return { status: "removed" as const };
  }
  await db.insert(tablePicks).values({ tableId, fromId, toId, kind })
    .onConflictDoUpdate({ target: [tablePicks.tableId, tablePicks.fromId, tablePicks.toId], set: { kind } });
  const [back] = await db.select().from(tablePicks).where(and(eq(tablePicks.tableId, tableId), eq(tablePicks.fromId, toId), eq(tablePicks.toId, fromId)));
  if (!back) return { status: "picked" as const };

  const both: TablePickKind = kind === "love" && back.kind === "love" ? "love" : "friends";
  const note = `You both met at a Sunday Table at ${table.placeName}`;
  const made = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${[fromId, toId].sort().join(":")}))`);
    const [existing] = await tx.select({ id: matches.id, status: matches.status }).from(matches).where(
      or(and(eq(matches.user1Id, fromId), eq(matches.user2Id, toId)), and(eq(matches.user1Id, toId), eq(matches.user2Id, fromId))),
    );
    if (existing?.status === "matched") return { id: existing.id, fresh: false };
    if (existing) {
      // A pending like between them: this is the yes it was waiting for.
      await tx.update(matches).set({ status: "matched", kind: both, originNote: note }).where(eq(matches.id, existing.id));
      return { id: existing.id, fresh: true };
    }
    const [m] = await tx.insert(matches).values({ user1Id: toId, user2Id: fromId, status: "matched", kind: both, originNote: note }).returning({ id: matches.id });
    return { id: m.id, fresh: true };
  });
  if (made.fresh) {
    const names = await db.select({ userId: profiles.userId, name: profiles.displayName }).from(profiles).where(inArray(profiles.userId, [fromId, toId]));
    const first = (id: string) => (names.find((n) => n.userId === id)?.name || "Someone").split(/\s+/)[0];
    for (const [to, other] of [[fromId, toId], [toId, fromId]] as const) {
      notify(to, "tables", {
        type: both === "love" ? "match" : "friend",
        title: both === "love" ? `You and ${first(other)} both said more than friends` : `You and ${first(other)} want to meet again`,
        body: both === "love" ? "From Sunday's table. It's a match: say hi." : "From Sunday's table. You're friends now: plan the next one.",
        url: `/chat/${made.id}`,
        tag: `table-${tableId}`,
      }).catch(() => {});
    }
  }
  return { status: "mutual" as const, kind: both, matchId: made.id };
}

// ── the weekly rhythm ──────────────────────────────────────────────────

async function ensureChat(table: SundayTable): Promise<number> {
  if (table.chatGroupId) return table.chatGroupId;
  const ids = await membersOf(table.id);
  const group = await storage.createGroupFull({
    name: `Sunday Table · ${table.placeName}`,
    description: `${table.vibe} Lunch on Sunday at 13:00. Everyone pays for their own food.`,
    type: "table",
    ownerId: ids[0],
    privacyMode: "invite-only",
    isEventChat: true,
  });
  for (const userId of ids) {
    const p = await storage.getProfile(userId);
    await storage.joinGroup(group.id, userId, p?.groupNickname || (p?.displayName || "Guest").split(/\s+/)[0]);
  }
  // Only the six who were seated: nobody adds people in, by hand or by link.
  await db.update(groups).set({ canMembersAddOthers: false, maxMembers: ids.length }).where(eq(groups.id, group.id));
  await db.update(sundayTables).set({ chatGroupId: group.id }).where(eq(sundayTables.id, table.id));
  return group.id;
}

const tableTime = (d: Date) => d.toLocaleString("en-GB", { weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Harare" });

/** Hourly: form Friday's tables, reveal Saturday's places, ask after lunch. */
export async function runTableSweep(now = new Date()): Promise<{ formed: number; places: number; asks: number }> {
  let formed = 0, placesSent = 0, asks = 0;
  // Form any weekend whose Friday has come and whose lunch hasn't.
  const pending = await db.selectDistinct({ weekend: tableSignups.weekend }).from(tableSignups).where(eq(tableSignups.status, "waiting"));
  for (const { weekend } of pending) {
    const t = weekendTimes(weekend);
    if (now < t.formsAt || now >= t.startsAt) continue;
    const out = await formWeekend(weekend);
    formed += out.tables;
    const rows = await db.select({ userId: tableSignups.userId, status: tableSignups.status, tableId: tableSignups.tableId }).from(tableSignups).where(eq(tableSignups.weekend, weekend));
    const vibes = new Map((await db.select({ id: sundayTables.id, vibe: sundayTables.vibe }).from(sundayTables).where(eq(sundayTables.weekend, weekend))).map((r) => [r.id, r.vibe]));
    for (const r of rows) {
      if (r.status === "seated" && r.tableId) {
        notify(r.userId, "tables", {
          type: "table", title: "Your Sunday Table is set", body: `${vibes.get(r.tableId) ?? ""} The place comes on Saturday morning.`.trim(),
          url: "/tables", tag: `table-${weekend}`,
        }, { dedupeKey: `table-set-${weekend}` }).catch(() => {});
      } else if (r.status === "unseated") {
        notify(r.userId, "tables", {
          type: "table", title: "No table for you this Sunday", body: "Not enough people near you and your age this week. Sign up again for next Sunday.",
          url: "/tables", tag: `table-${weekend}`,
        }, { dedupeKey: `table-none-${weekend}` }).catch(() => {});
      }
    }
  }

  const live = await db.select().from(sundayTables).where(sql`${sundayTables.startsAt} > now() - interval '2 days' and ${sundayTables.startsAt} < now() + interval '3 days'`);
  for (const table of live) {
    const t = weekendTimes(table.weekend);
    const shift = table.startsAt.getTime() - t.startsAt.getTime();
    if (!table.placeSentAt && now.getTime() >= t.placeAt.getTime() + shift && now < table.startsAt) {
      const [claimed] = await db.update(sundayTables).set({ placeSentAt: now })
        .where(and(eq(sundayTables.id, table.id), sql`${sundayTables.placeSentAt} is null`)).returning({ id: sundayTables.id });
      if (claimed) {
        await ensureChat(table);
        for (const userId of await membersOf(table.id)) {
          notify(userId, "tables", {
            type: "table", title: `Sunday Table: ${table.placeName}`, body: `${tableTime(table.startsAt)}. Your table's chat is open: say hello.`,
            url: "/tables", tag: `table-${table.weekend}`,
          }).catch(() => {});
        }
        placesSent++;
      }
    }
    if (!table.picksSentAt && now.getTime() >= t.picksOpen.getTime() + shift) {
      const [claimed] = await db.update(sundayTables).set({ picksSentAt: now })
        .where(and(eq(sundayTables.id, table.id), sql`${sundayTables.picksSentAt} is null`)).returning({ id: sundayTables.id });
      if (claimed) {
        for (const userId of await membersOf(table.id)) {
          notify(userId, "tables", {
            type: "table", title: "Who would you see again?", body: "Pick privately. If they pick you too, we'll connect you.",
            url: "/tables", tag: `table-${table.weekend}`,
          }).catch(() => {});
        }
        asks++;
      }
    }
  }
  return { formed, places: placesSent, asks };
}

let timer: NodeJS.Timeout | null = null;
export function startTableSweeps(): void {
  if (timer) return;
  const tick = () => runTableSweep().catch((e) => console.error("[tables] sweep failed:", e));
  setTimeout(tick, 3 * 60_000);
  timer = setInterval(tick, 30 * 60_000);
}

// ── routes ─────────────────────────────────────────────────────────────

export function registerTableRoutes(app: Express, getUserId: (req: Request) => string | null | undefined) {
  app.get("/api/tables/me", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      res.json(await tablesMe(userId));
    } catch (e) {
      console.error("[tables] me failed:", e);
      res.status(500).json({ message: "Couldn't load your table" });
    }
  });

  app.post("/api/tables/signup", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const mix = String(req.body?.mix ?? "mixed");
    if (!TABLE_MIX_VALUES.includes(mix)) return res.status(400).json({ message: "Pick mixed, women only or men only." });
    const me = await storage.getProfile(userId);
    if (!me?.onboardingCompleted) return res.status(403).json({ message: "Finish your profile first." });
    if (!wantsFriends(me.lookingFor)) return res.status(403).json({ message: "The Sunday Table is part of Friends. Turn Friends on in Settings." });
    if (mix === "women" && me.gender !== "woman") return res.status(400).json({ message: "Women-only tables are for women." });
    if (mix === "men" && me.gender !== "man") return res.status(400).json({ message: "Men-only tables are for men." });
    const weekend = signupWeekend();
    const a = await allowance(userId, weekend);
    if (!a.ok) return res.status(403).json({ message: a.reason, upgrade: true });
    await db.insert(tableSignups).values({ userId, weekend, mix, status: "waiting" })
      .onConflictDoUpdate({ target: [tableSignups.userId, tableSignups.weekend], set: { mix, status: "waiting", tableId: null }, where: sql`${tableSignups.status} <> 'seated'` });
    res.status(201).json(await tablesMe(userId));
  });

  app.delete("/api/tables/signup", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const weekend = signupWeekend();
    await db.delete(tableSignups).where(and(eq(tableSignups.userId, userId), eq(tableSignups.weekend, weekend), eq(tableSignups.status, "waiting")));
    res.json(await tablesMe(userId));
  });

  app.post("/api/tables/:id/pick", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    const kind = req.body?.kind == null ? null : String(req.body.kind);
    if (kind !== null && kind !== "friends" && kind !== "love") return res.status(400).json({ message: "Friends or love." });
    try {
      const out = await pick(Number(req.params.id), userId, String(req.body?.toId ?? ""), kind as TablePickKind | null);
      if ("error" in out) return res.status(out.error!).json({ message: out.message });
      res.json(out);
    } catch (e) {
      console.error("[tables] pick failed:", e);
      res.status(500).json({ message: "Couldn't save that" });
    }
  });
}
