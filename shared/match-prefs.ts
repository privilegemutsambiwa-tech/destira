// Who a member wants to see (docs/destira-3-upgrade-prompt.md Part D1-D2).
// Age, distance and "who you see" already live on the profile; these are
// the rest. Basic ones are free; faith, children and marriage are
// "advanced filters" (Spark and up). Any of those three can be a
// dealbreaker ("must"): then it's a hard filter, and people who haven't
// said are hidden too. Otherwise it's a preference that only moves people
// up the deck.
import { z } from "zod";
import { FAITH_OPTIONS, MARRIAGE_OPTIONS, WANTS_CHILDREN_OPTIONS } from "./profile-details";

const said = <T extends { value: string }>(o: T[]) => o.filter((x) => x.value !== "prefer_not").map((x) => x.value) as [string, ...string[]];

const pref = (values: [string, ...string[]]) =>
  z
    .object({
      values: z.array(z.enum(values)).min(1).max(values.length),
      must: z.boolean(),
    })
    .nullable();

export const MATCH_PREFS_SCHEMA = z
  .object({
    verifiedOnly: z.boolean().nullable(),
    hasPhotos: z.boolean().nullable(),
    faith: pref(said(FAITH_OPTIONS)),
    wantsChildren: pref(said(WANTS_CHILDREN_OPTIONS)),
    marriage: pref(said(MARRIAGE_OPTIONS)),
  })
  .partial()
  .strict();

export type MatchPref = { values: string[]; must: boolean };
export type MatchPrefs = {
  verifiedOnly?: boolean;
  hasPhotos?: boolean;
  faith?: MatchPref;
  wantsChildren?: MatchPref;
  marriage?: MatchPref;
};

/** The ones that need the advanced_filters feature. */
export const ADVANCED_PREF_KEYS = ["faith", "wantsChildren", "marriage"] as const;
export type AdvancedPrefKey = (typeof ADVANCED_PREF_KEYS)[number];

export const PREF_FIELD_LABEL: Record<AdvancedPrefKey, string> = {
  faith: "Faith",
  wantsChildren: "Children",
  marriage: "Marriage",
};

export const PREF_OPTIONS: Record<AdvancedPrefKey, { value: string; label: string }[]> = {
  faith: FAITH_OPTIONS.filter((o) => o.value !== "prefer_not"),
  wantsChildren: WANTS_CHILDREN_OPTIONS.filter((o) => o.value !== "prefer_not"),
  marriage: MARRIAGE_OPTIONS.filter((o) => o.value !== "prefer_not"),
};

/** Save: fields sent replace, null clears, others stay. */
export function mergePrefs(current: unknown, patch: z.infer<typeof MATCH_PREFS_SCHEMA>): MatchPrefs {
  const out: Record<string, unknown> = { ...((current && typeof current === "object" ? current : {}) as object) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === false) delete out[k];
    else out[k] = v;
  }
  return out as MatchPrefs;
}

/** Drop what the member's plan doesn't cover (after a downgrade, say). */
export function effectivePrefs(prefs: MatchPrefs | null | undefined, advanced: boolean): MatchPrefs {
  const p = { ...(prefs ?? {}) };
  if (!advanced) for (const k of ADVANCED_PREF_KEYS) delete p[k];
  return p;
}

/** One line for the Settings row. */
export function filtersSummary(prefs: MatchPrefs | null | undefined): string {
  const p = prefs ?? {};
  const parts: string[] = [];
  if (p.verifiedOnly) parts.push("Verified");
  if (p.hasPhotos) parts.push("With photos");
  for (const k of ADVANCED_PREF_KEYS) if (p[k]) parts.push(PREF_FIELD_LABEL[k] + (p[k]!.must ? " (must)" : ""));
  return parts.length ? parts.join(", ") : "None set";
}
