// "Why you might click" (docs/destira-upgrade-prompt.md §5.3): the honest
// half of the resonance read. Every line here is a fact both people put on
// their own profiles, or something the app saw them do. No scores, no
// invented compatibility, nothing the twin made up. If nothing is true, the
// list is empty and the card simply doesn't show the section.
import { and, gte, inArray } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { profiles, userActivityDaily } from "@shared/schema";
import { sharedDetailLines, type ProfileDetails } from "@shared/profile-details";

const DAY_MS = 24 * 60 * 60 * 1000;
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function joinNatural(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const INTENT_LINE: Record<string, string> = {
  relationship: "You're both looking for something real",
  see: "You're both seeing where things go",
  "friends-first": "You both want to start as friends",
};

export type ClickReason = { kind: "interests" | "city" | "intent" | "details" | "active" | "new"; text: string };

/** Adds `reasons` (at most three, strongest first) to each candidate. */
export async function withClickReasons<T extends { userId: string; location?: string | null; interests?: string[]; createdAt?: Date | string | null }>(
  viewerId: string,
  candidates: T[],
): Promise<(T & { reasons: ClickReason[] })[]> {
  if (candidates.length === 0) return [];
  const ids = candidates.map((c) => c.userId);
  const weekAgo = new Date(Date.now() - 7 * DAY_MS).toISOString().slice(0, 10);
  const [me, myInterestsMap, intentRows, activeRows] = await Promise.all([
    storage.getProfile(viewerId),
    storage.getInterestsForUsers([viewerId]),
    db.select({ id: profiles.userId, datingIntent: profiles.datingIntent, details: profiles.details }).from(profiles).where(inArray(profiles.userId, [viewerId, ...ids])),
    db.selectDistinct({ userId: userActivityDaily.userId })
      .from(userActivityDaily)
      .where(and(inArray(userActivityDaily.userId, ids), gte(userActivityDaily.date, weekAgo))),
  ]);
  const myInterests = new Set((myInterestsMap.get(viewerId) ?? []).map(norm));
  const myCity = norm(me?.location);
  const intents = new Map(intentRows.map((r) => [r.id, r.datingIntent]));
  const myIntent = intents.get(viewerId) ?? null;
  const details = new Map(intentRows.map((r) => [r.id, r.details as ProfileDetails | null]));
  const myDetails = details.get(viewerId) ?? null;
  const active = new Set(activeRows.map((r) => r.userId));

  return candidates.map((c) => {
    const reasons: ClickReason[] = [];
    const shared = (c.interests ?? []).filter((i) => myInterests.has(norm(i))).slice(0, 3);
    if (shared.length) reasons.push({ kind: "interests", text: `You both like ${joinNatural(shared)}` });
    const theirIntent = intents.get(c.userId);
    if (myIntent && theirIntent === myIntent && INTENT_LINE[myIntent]) {
      reasons.push({ kind: "intent", text: INTENT_LINE[myIntent] });
    }
    // Faith, children, marriage plans, languages: only when both filled in
    // the same thing (shared/profile-details.ts).
    for (const line of sharedDetailLines(myDetails, details.get(c.userId) ?? null).slice(0, 2)) {
      reasons.push({ kind: "details", text: line });
    }
    if (myCity && norm(c.location) === myCity) reasons.push({ kind: "city", text: `You're both in ${c.location}` });
    if (active.has(c.userId)) reasons.push({ kind: "active", text: "Active this week" });
    else if (c.createdAt && Date.now() - new Date(c.createdAt).getTime() < 7 * DAY_MS) {
      reasons.push({ kind: "new", text: "New on Destira" });
    }
    return { ...c, reasons: reasons.slice(0, 3) };
  });
}
