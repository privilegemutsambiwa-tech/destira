// First messages that aren't "hi" (docs/destira-3-upgrade-prompt.md Part E):
// the facts an opener can be built on, from the other person's real profile
// (their prompt answers, an event they're going to, a detail the two share),
// and openers written from those facts alone when the AI can't help.
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "./db";
import { eventAttendees, events, type Profile } from "@shared/schema";
import { sharedDetailLines, type ProfileDetails } from "@shared/profile-details";

export interface OpenerFacts {
  promptAnswers: { q: string; a: string }[];
  goingTo: { title: string; when: string }[];
  shared: string[];
  sharedInterests: string[];
}

const weekday = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", timeZone: "Africa/Harare" });

export async function openerFacts(me: Profile | undefined, them: Profile | undefined, myInterests: string[], theirInterests: string[]): Promise<OpenerFacts> {
  const prompts = Array.isArray(them?.prompts) ? (them!.prompts as { q?: string; a?: string }[]) : [];
  const going = them
    ? await db.select({ title: events.title, startsAt: events.startsAt })
        .from(eventAttendees).innerJoin(events, eq(events.id, eventAttendees.eventId))
        .where(and(eq(eventAttendees.userId, them.userId), eq(eventAttendees.status, "going"), eq(events.status, "published"), eq(events.visibility, "public"), gt(events.startsAt, new Date())))
        .orderBy(asc(events.startsAt)).limit(2)
    : [];
  const mine = new Set(myInterests.map((i) => i.toLowerCase()));
  return {
    promptAnswers: prompts.filter((p) => p?.q && p?.a && p.a.trim().length > 2).map((p) => ({ q: String(p.q), a: String(p.a) })).slice(0, 3),
    goingTo: going.map((g) => ({ title: g.title, when: weekday(g.startsAt) })),
    shared: sharedDetailLines(me?.details as ProfileDetails | null, them?.details as ProfileDetails | null).slice(0, 2),
    sharedInterests: theirInterests.filter((i) => mine.has(i.toLowerCase())).slice(0, 3),
  };
}

/** Shortened on a word boundary, never mid-word. */
const short = (s: string, n: number) => {
  const t = s.trim().replace(/[.!?]+$/, "");
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const at = cut.lastIndexOf(" ");
  return (at > n * 0.5 ? cut.slice(0, at) : cut).replace(/[,;:\s]+$/, "") + "…";
};

/** Three openers from the facts alone, most specific first. */
export function fallbackOpeners(f: OpenerFacts, theirName: string, theirCity?: string | null): string[] {
  const out: string[] = [];
  const p = f.promptAnswers[0];
  if (p) out.push(`I loved your answer to “${short(p.q, 45)}”. Tell me more about “${short(p.a, 45)}”?`);
  const e = f.goingTo[0];
  if (e) out.push(`I saw you're going to ${short(e.title, 60)} on ${e.when}. Have you been to one before?`);
  const s = f.shared[0];
  if (s) out.push(`${s.replace(/^You're both/, "We're both").replace(/^You both/, "We both")}, apparently. What else should I know about you?`);
  const i = f.sharedInterests[0];
  if (i && out.length < 3) out.push(`Another ${i.toLowerCase()} person! How did you get into it?`);
  const p2 = f.promptAnswers[1];
  if (p2 && out.length < 3) out.push(`“${short(p2.a, 60)}”. Okay, I need to hear more about that.`);
  const first = theirName.trim().split(/\s+/)[0] || theirName;
  if (out.length < 3) out.push(`Hi ${first}! What's been the best part of your week so far?`);
  if (out.length < 3) out.push(theirCity ? `Hi ${first}, what's your favourite spot in ${theirCity} for a weekend afternoon?` : `Hi ${first}, what does a good Saturday look like for you?`);
  if (out.length < 3) out.push(`Your profile made me smile, ${first}. What are you looking forward to this month?`);
  return out.slice(0, 3);
}
