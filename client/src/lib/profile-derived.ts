// Derived / placeholder reads for the /u/:userId profile view.
//
// Four of these stand in for data the backend doesn't serve yet (see
// docs/redesign-handoff.md §4). Each is a single function so it becomes real
// with one swap: point it at a query instead of the deterministic stub.
//   - resonanceRead:  real when the profile carries numeric traits; a stable
//                     derived read otherwise (no invented pairwise score).
//   - twinTranscript: MOCK — nothing persists twin↔twin exchanges yet.
//   - vouches:        MOCK — the `vouches` table does not exist yet. Returns []
//                     so the block simply doesn't render.
//   - overlap:        REAL only — shared groups + genuinely matching preference
//                     fields. Never an invented chip.

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export interface ResonanceRead {
  score: number;
  axes: { label: string; value: number }[];
  summary: string;
}

const FALLBACK_AXES = ["Values", "Pace", "Openness", "Independence"];
const SUMMARIES = [
  "Close on values, but you two move through life at very different speeds.",
  "Easy to talk to, harder to pin down — she keeps her cards close.",
  "A lot of overlap in how you spend a weekend. Less in what you want long-term.",
  "Warm and open. The read is thinner than usual because her profile is still light.",
  "You'd get on. Whether it goes anywhere is a different question.",
];

/** Real when the profile has numeric personality traits; a stable derived read
 *  keyed off the userId otherwise. Always surfaces at least one axis below 65 —
 *  the honesty is the point (handoff §3.3). */
export function resonanceRead(profile: any): ResonanceRead {
  const pp = profile?.personalityProfile;
  const numeric =
    pp && typeof pp === "object"
      ? Object.entries(pp as Record<string, unknown>).filter(
          (e): e is [string, number] => typeof e[1] === "number",
        )
      : [];

  let axes: { label: string; value: number }[];
  if (numeric.length >= 2) {
    axes = numeric.slice(0, 4).map(([label, value]) => ({
      label: label.charAt(0).toUpperCase() + label.slice(1),
      value: Math.max(0, Math.min(100, Math.round(value))),
    }));
  } else {
    const seed = hash(profile?.userId ?? profile?.id ?? "x");
    axes = FALLBACK_AXES.map((label, i) => ({
      label,
      value: 46 + ((seed >> (i * 4)) % 46), // 46–91
    }));
  }
  // guarantee one honest weak spot
  if (axes.every((a) => a.value >= 65) && axes.length > 0) {
    const seed = hash(profile?.userId ?? "x");
    axes[seed % axes.length] = { ...axes[seed % axes.length], value: 48 + (seed % 14) };
  }

  const score = Math.round(axes.reduce((s, a) => s + a.value, 0) / axes.length);
  const summary = SUMMARIES[hash((profile?.userId ?? "x") + "s") % SUMMARIES.length];
  return { score, axes, summary };
}

export interface TwinTranscript {
  lines: { who: "hers" | "yours"; text: string }[];
  total: number;
}

const TRANSCRIPTS: TwinTranscript[] = [
  {
    lines: [
      { who: "hers", text: "She won't do the 2am text thing. If you're out, you're out, and you tell her the next morning." },
      { who: "yours", text: "That's fine by him — he's the same. He'd rather one real conversation a week than constant pinging." },
      { who: "hers", text: "What she can't stand is being managed. Don't tell her how to feel about something." },
      { who: "yours", text: "He hears that. He tends to problem-solve out loud and has been told it lands as dismissive." },
      { who: "hers", text: "Then they'd have to be honest about that early, not six months in." },
    ],
    total: 14,
  },
  {
    lines: [
      { who: "hers", text: "She's moved cities twice for other people and won't do it a third time. That's not up for discussion." },
      { who: "yours", text: "He's not asking anyone to move. He likes where he is and wants someone who feels the same about their own place." },
      { who: "hers", text: "Good. Long-distance for a while she could do; open-ended, she couldn't." },
      { who: "yours", text: "He'd want a plan too. Not a ring, just a direction." },
    ],
    total: 11,
  },
  {
    lines: [
      { who: "hers", text: "Kids are a maybe, not a no — but not for a few years, and not as a fix for anything." },
      { who: "yours", text: "Same page. He wants to actually know someone first. The rest can wait." },
      { who: "hers", text: "She's wary of people who say that and mean 'never'." },
      { who: "yours", text: "Fair. He means it as 'not yet' and would say so plainly if that changed." },
    ],
    total: 16,
  },
];

/** MOCK. Two lines of a twin↔twin exchange, keyed to the profile so it's
 *  stable. Swap for a real query once exchanges are persisted (handoff §4.3). */
export function twinTranscript(userId: string): TwinTranscript {
  return TRANSCRIPTS[hash(userId + "t") % TRANSCRIPTS.length];
}

export interface Vouch {
  authorFirstName: string;
  body: string;
}

/** MOCK. The `vouches` table doesn't exist yet — returns [] so the block does
 *  not render. Swap this for a real query when it does (handoff §4.1). */
export function vouches(_userId: string): Vouch[] {
  return [];
}

/** REAL signals only: shared group names + genuinely matching preference
 *  fields. Returns [] when there's nothing true to show. */
export function overlap(
  mine: any,
  theirs: any,
  sharedGroups: { name: string }[],
): string[] {
  const chips: string[] = [];
  for (const g of sharedGroups) chips.push(g.name);

  if (
    mine?.ageMinPreference != null &&
    theirs?.age != null &&
    theirs.age >= mine.ageMinPreference &&
    theirs.age <= (mine.ageMaxPreference ?? 200)
  ) {
    chips.push("In your age range");
  }

  const km = distanceKm(mine, theirs);
  if (km != null && mine?.maxDistanceKm != null && km <= mine.maxDistanceKm) {
    chips.push(`${Math.round(km)} km apart`);
  }

  return Array.from(new Set(chips));
}

/** The server computes this (see storage.getProfileWithUser) so raw GPS
 *  coordinates never have to be sent to the client at all. null when the
 *  other person has distance hidden, or the server couldn't place either
 *  side. `mine` is unused but kept in the signature for call-site stability. */
export function distanceKm(_mine: any, theirs: any): number | null {
  return typeof theirs?.distanceKm === "number" ? theirs.distanceKm : null;
}
