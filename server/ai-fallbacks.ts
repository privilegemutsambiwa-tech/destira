// Canned answers for every AI surface, used when the provider is down or
// DEEPSEEK_API_KEY isn't set (Twin Part F4). Built only from what the member
// actually filled in — never invented details — and always handed back as a
// draft the member edits, never published by itself.

type Structured = {
  topValues?: string[] | null;
  interests?: string[] | null;
  humorStyle?: string | null;
  communicationStyle?: string | null;
  desiredPartnerTraits?: string[] | null;
} | null | undefined;

type ProfileLike = {
  displayName?: string | null;
  bio?: string | null;
  aboutMe?: string | null;
} | null | undefined;

/** The sentence a draft ends on when there was nothing true to write. */
export const FILL_IN = "On a free weekend I'm usually… (finish this in your own words).";

const firstName = (p: ProfileLike) => (p?.displayName || "").trim().split(/\s+/)[0] || "";
const list = (xs: string[] | null | undefined, n = 3) => (xs ?? []).map((x) => String(x).trim()).filter(Boolean).slice(0, n);
function joinAnd(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
const lower = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);
function firstSentences(text: string | null | undefined, n: number): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const parts = t.match(/[^.!?]+[.!?]+/g) ?? [t];
  return parts.slice(0, n).join(" ").trim();
}

/** About-me draft from the member's own answers. Starts with a fill-in
 *  sentence when there's nothing to go on. */
export function cannedAboutMe(profile: ProfileLike, s: Structured): string {
  const name = firstName(profile);
  const values = list(s?.topValues);
  const interests = list(s?.interests);
  const partner = list(s?.desiredPartnerTraits, 2);
  const lines: string[] = [];
  const own = firstSentences(profile?.aboutMe || profile?.bio, 2);
  if (own) lines.push(own);
  else if (name) lines.push(`I'm ${name}.`);
  if (interests.length) lines.push(`You'll usually find me into ${joinAnd(interests.map(lower))}.`);
  if (values.length) lines.push(`What matters most to me: ${joinAnd(values.map(lower))}.`);
  if (s?.humorStyle) lines.push(`My humour is ${lower(s.humorStyle.replace(/\.$/, ""))}.`);
  if (partner.length) lines.push(`I'd love to meet someone ${joinAnd(partner.map(lower))}.`);
  if (lines.length <= 1) lines.push(FILL_IN);
  return lines.join(" ");
}

/** The short bio draft (300 characters max). */
export function cannedBio(profile: ProfileLike, s: Structured): string {
  const text = cannedAboutMe(profile, s);
  if (text.length <= 300) return text;
  const cut = text.slice(0, 300);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > 80 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "") + "…";
}

/** Two or three lines that sum someone up, from their structured profile. */
export function cannedAiSummary(profile: ProfileLike, s: Structured): string {
  const values = list(s?.topValues);
  const interests = list(s?.interests);
  const out: string[] = [];
  const who = firstName(profile) || "They";
  if (values.length) out.push(`${who} leads with ${joinAnd(values.map(lower))}.`);
  if (interests.length) out.push(`Into ${joinAnd(interests.map(lower))}.`);
  if (s?.communicationStyle) out.push(`Talks in a way that's ${lower(s.communicationStyle.replace(/\.$/, ""))}.`);
  return out.join(" ") || firstSentences(profile?.aboutMe || profile?.bio, 2);
}

export function cannedProfileSummaries(profile: ProfileLike, s: Structured): { aboutSummary: string; personalitySummary: string } {
  return { aboutSummary: cannedAboutMe(profile, s), personalitySummary: cannedAiSummary(profile, s) };
}

/** A starting answer to a profile prompt from their own interests and
 *  values. Null when there's nothing true to say yet. */
export function cannedPromptAnswer(q: string, s: Structured): string | null {
  const interests = list(s?.interests, 2).map(lower);
  const values = list(s?.topValues, 2).map(lower);
  switch (q) {
    case "Something I could talk about for an hour":
    case "I get unreasonably excited about":
      return interests.length ? `${interests[0][0].toUpperCase()}${interests[0].slice(1)}. Ask me about it and you'll see.` : null;
    case "A small thing I'd never compromise on":
      return values.length ? `${values[0][0].toUpperCase()}${values[0].slice(1)}. Small, but it says a lot.` : null;
    case "A quiet Sunday, done right":
      return interests.length ? `Slow morning, then ${joinAnd(interests)}.` : null;
    default:
      return null;
  }
}

/** Three replies to whatever they last said, when the AI can't write them. */
export function cannedReplies(lastTheirs: string | null | undefined): string[] {
  const t = (lastTheirs || "").trim();
  if (!t) return ["How's your week going so far?", "What's been the best part of your day?", "Okay, I have to ask: what are you up to this weekend?"];
  if (/\?\s*$/.test(t)) {
    return [
      "Good question. Let me think… honestly, it depends on the day. What about you?",
      "Ha, I'll answer that, but you go first 😄",
      "Ooh. Short answer or long answer?",
    ];
  }
  return ["Ha, I like that. Tell me more?", "Okay, now I'm curious. How did that happen?", "That sounds great. What got you into it?"];
}

/** Interview recap without the AI: what was really asked and answered, in
 *  short quotes. */
export function transcriptRecap(history: { role: string; content: string }[]): { who: "viewer" | "target"; text: string }[] {
  const clip = (s: string, n: number) => {
    const t = s.replace(/\s+/g, " ").trim();
    return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : t;
  };
  const out: { who: "viewer" | "target"; text: string }[] = [];
  for (const h of history) {
    if (out.length >= 4) break;
    if (h.role === "user") out.push({ who: "viewer", text: `Asked: "${clip(h.content, 110)}"` });
    else if (h.role === "assistant" && out.length && out[out.length - 1].who === "viewer") {
      out.push({ who: "target", text: `The twin said: "${clip(h.content, 110)}"` });
    }
  }
  return out;
}
