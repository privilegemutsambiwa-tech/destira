// Richer profile details (docs/destira-3-upgrade-prompt.md Part C): the things
// people here choose on (faith, children, marriage plans), plus a few
// everyday facts. Every field is optional and has "prefer not to say".
// Stored as one jsonb column, profiles.details, shaped by DETAILS_SCHEMA.
import { z } from "zod";

type Opt<V extends string> = { value: V; label: string };
const opts = <V extends string>(o: Opt<V>[]) => o;

export const FAITH_OPTIONS = opts([
  { value: "apostolic", label: "Apostolic" },
  { value: "pentecostal", label: "Pentecostal" },
  { value: "catholic", label: "Catholic" },
  { value: "methodist", label: "Methodist" },
  { value: "sda", label: "SDA" },
  { value: "anglican", label: "Anglican" },
  { value: "christian", label: "Christian, another church" },
  { value: "muslim", label: "Muslim" },
  { value: "traditional", label: "Traditional" },
  { value: "spiritual", label: "Spiritual" },
  { value: "none", label: "No religion" },
  { value: "prefer_not", label: "Prefer not to say" },
]);
/** The Christian ones: "you're both Christian" when the churches differ. */
export const CHRISTIAN = new Set(["apostolic", "pentecostal", "catholic", "methodist", "sda", "anglican", "christian"]);

export const FAITH_IMPORTANCE_OPTIONS = opts([
  { value: "very", label: "Very important to me" },
  { value: "somewhat", label: "Somewhat" },
  { value: "not", label: "Not important" },
]);

export const HAS_CHILDREN_OPTIONS = opts([
  { value: "none", label: "No children" },
  { value: "yes", label: "Have children" },
  { value: "live_with_me", label: "Have children, they live with me" },
  { value: "prefer_not", label: "Prefer not to say" },
]);

export const WANTS_CHILDREN_OPTIONS = opts([
  { value: "yes", label: "Want children" },
  { value: "no", label: "Don't want children" },
  { value: "open", label: "Open to children" },
  { value: "not_sure", label: "Not sure yet" },
  { value: "prefer_not", label: "Prefer not to say" },
]);

export const MARRIAGE_OPTIONS = opts([
  { value: "1y", label: "Marry within a year" },
  { value: "2_3y", label: "Marry in 2 to 3 years" },
  { value: "someday", label: "Marry someday" },
  { value: "not_looking", label: "Not looking to marry" },
  { value: "prefer_not", label: "Prefer not to say" },
]);

export const LANGUAGE_OPTIONS = opts([
  { value: "english", label: "English" },
  { value: "shona", label: "Shona" },
  { value: "ndebele", label: "Ndebele" },
  { value: "tonga", label: "Tonga" },
  { value: "venda", label: "Venda" },
  { value: "kalanga", label: "Kalanga" },
  { value: "nambya", label: "Nambya" },
  { value: "chewa", label: "Chewa" },
  { value: "french", label: "French" },
  { value: "portuguese", label: "Portuguese" },
]);

export const EDUCATION_OPTIONS = opts([
  { value: "secondary", label: "Secondary school" },
  { value: "certificate", label: "Certificate or diploma" },
  { value: "degree", label: "Degree" },
  { value: "postgrad", label: "Postgraduate" },
  { value: "prefer_not", label: "Prefer not to say" },
]);

export const DRINKING_OPTIONS = opts([
  { value: "never", label: "Doesn't drink" },
  { value: "socially", label: "Drinks socially" },
  { value: "often", label: "Drinks often" },
  { value: "prefer_not", label: "Prefer not to say" },
]);

export const SMOKING_OPTIONS = opts([
  { value: "never", label: "Doesn't smoke" },
  { value: "sometimes", label: "Smokes sometimes" },
  { value: "yes", label: "Smokes" },
  { value: "prefer_not", label: "Prefer not to say" },
]);

export const BASE_OPTIONS = opts([
  { value: "zimbabwe", label: "In Zimbabwe" },
  { value: "diaspora", label: "Abroad (diaspora)" },
]);

export const MOVING_BACK_OPTIONS = opts([
  { value: "yes", label: "Moving back" },
  { value: "maybe", label: "Maybe moving back" },
  { value: "no", label: "Not moving back" },
]);

const vals = <V extends string>(o: Opt<V>[]) => o.map((x) => x.value) as [V, ...V[]];
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s.replace(/\s+/g, " "));

// Each field can also be sent as null, which clears it.
export const DETAILS_SCHEMA = z
  .object({
    faith: z.enum(vals(FAITH_OPTIONS)).nullable(),
    faithImportance: z.enum(vals(FAITH_IMPORTANCE_OPTIONS)).nullable(),
    hasChildren: z.enum(vals(HAS_CHILDREN_OPTIONS)).nullable(),
    wantsChildren: z.enum(vals(WANTS_CHILDREN_OPTIONS)).nullable(),
    marriage: z.enum(vals(MARRIAGE_OPTIONS)).nullable(),
    languages: z.array(z.enum(vals(LANGUAGE_OPTIONS))).max(6).nullable(),
    education: z.enum(vals(EDUCATION_OPTIONS)).nullable(),
    job: text(60).nullable(),
    heightCm: z.number().int().min(130).max(230).nullable(),
    drinking: z.enum(vals(DRINKING_OPTIONS)).nullable(),
    smoking: z.enum(vals(SMOKING_OPTIONS)).nullable(),
    base: z.enum(vals(BASE_OPTIONS)).nullable(),
    country: text(40).nullable(),
    movingBack: z.enum(vals(MOVING_BACK_OPTIONS)).nullable(),
  })
  .partial()
  .strict();

export type ProfileDetails = {
  [K in keyof z.infer<typeof DETAILS_SCHEMA>]?: Exclude<z.infer<typeof DETAILS_SCHEMA>[K], null>;
};

/** A save merges into what's there: fields not sent stay, null clears. */
export function mergeDetails(current: unknown, patch: z.infer<typeof DETAILS_SCHEMA>): ProfileDetails {
  const out: Record<string, unknown> = { ...((current && typeof current === "object" ? current : {}) as object) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || (Array.isArray(v) && v.length === 0) || v === "") delete out[k];
    else out[k] = v;
  }
  // Abroad-only fields go when someone says they're in Zimbabwe.
  if (out.base !== "diaspora") {
    delete out.country;
    delete out.movingBack;
  }
  return out as ProfileDetails;
}

const label = <V extends string>(o: Opt<V>[], v: string | undefined) => o.find((x) => x.value === v)?.label ?? null;
const said = (v: string | undefined) => !!v && v !== "prefer_not";

/** The chips on a card and a profile, always in this order. "Prefer not to
 *  say" is never shown. */
export function detailChips(d: ProfileDetails | null | undefined): string[] {
  if (!d) return [];
  const chips: (string | null)[] = [];
  if (said(d.faith)) chips.push(d.faith === "none" ? "No religion" : label(FAITH_OPTIONS, d.faith));
  if (said(d.wantsChildren)) chips.push(label(WANTS_CHILDREN_OPTIONS, d.wantsChildren));
  if (said(d.hasChildren)) chips.push(label(HAS_CHILDREN_OPTIONS, d.hasChildren));
  if (said(d.marriage)) chips.push(label(MARRIAGE_OPTIONS, d.marriage));
  if (d.languages?.length) chips.push(d.languages.map((l) => label(LANGUAGE_OPTIONS, l)).filter(Boolean).join(", "));
  if (d.heightCm) chips.push(`${d.heightCm} cm`);
  if (said(d.education)) chips.push(label(EDUCATION_OPTIONS, d.education));
  if (d.job) chips.push(d.job);
  if (said(d.drinking)) chips.push(label(DRINKING_OPTIONS, d.drinking));
  if (said(d.smoking)) chips.push(label(SMOKING_OPTIONS, d.smoking));
  if (d.base === "diaspora") {
    chips.push(d.country ? `Lives in ${d.country}` : "Lives abroad");
    if (d.movingBack && d.movingBack !== "no") chips.push(label(MOVING_BACK_OPTIONS, d.movingBack));
  }
  return chips.filter((c): c is string => !!c);
}

/** Faith, children and marriage plans: the three asked for in Essentials and
 *  counted in profile strength. Answered includes "prefer not to say". */
export function basicsAnswered(d: ProfileDetails | null | undefined): number {
  if (!d) return 0;
  return [d.faith, d.wantsChildren ?? d.hasChildren, d.marriage].filter(Boolean).length;
}

const FAITH_NAME: Record<string, string> = {
  apostolic: "Apostolic",
  pentecostal: "Pentecostal",
  catholic: "Catholic",
  methodist: "Methodist",
  sda: "SDA",
  anglican: "Anglican",
  muslim: "Muslim",
  traditional: "traditional in faith",
  spiritual: "spiritual",
};

const LANG_NAME: Record<string, string> = Object.fromEntries(LANGUAGE_OPTIONS.map((l) => [l.value, l.label]));

/** "Why you might click" lines from details both people filled the same way.
 *  Nothing from a field either left empty or marked "prefer not to say". */
export function sharedDetailLines(a: ProfileDetails | null | undefined, b: ProfileDetails | null | undefined): string[] {
  if (!a || !b) return [];
  const out: string[] = [];
  if (said(a.faith) && said(b.faith) && a.faith !== "none") {
    if (a.faith === b.faith && FAITH_NAME[a.faith!]) out.push(`You're both ${FAITH_NAME[a.faith!]}`);
    else if (CHRISTIAN.has(a.faith!) && CHRISTIAN.has(b.faith!)) out.push("You're both Christian");
  }
  if (a.wantsChildren === "yes" && b.wantsChildren === "yes") out.push("You both want children");
  else if (a.wantsChildren === "no" && b.wantsChildren === "no") out.push("Neither of you wants children");
  if (said(a.marriage) && a.marriage === b.marriage) {
    const m: Record<string, string> = {
      "1y": "You both hope to marry within a year",
      "2_3y": "You both hope to marry in the next few years",
      someday: "You both want to marry someday",
    };
    if (m[a.marriage!]) out.push(m[a.marriage!]);
  }
  const shared = (a.languages ?? []).filter((l) => l !== "english" && (b.languages ?? []).includes(l));
  if (shared.length) out.push(`You both speak ${shared.map((l) => LANG_NAME[l]).join(" and ")}`);
  return out;
}

/** Plain facts for the twin, only what the member filled in, each with the
 *  "what your twin may discuss" categories it touches (shared/disclosure.ts),
 *  so a closed category keeps it out of the twin's prompt. */
export function detailFacts(d: ProfileDetails | null | undefined): { text: string; cats: string[] }[] {
  if (!d) return [];
  const f: { text: string; cats: string[] }[] = [];
  if (said(d.faith)) {
    const imp = d.faithImportance ? ` (${label(FAITH_IMPORTANCE_OPTIONS, d.faithImportance)?.toLowerCase()})` : "";
    f.push({ text: `Faith: ${d.faith === "none" ? "no religion" : label(FAITH_OPTIONS, d.faith)}${imp}`, cats: ["religion"] });
  }
  if (said(d.hasChildren)) f.push({ text: `Children: ${label(HAS_CHILDREN_OPTIONS, d.hasChildren)}`, cats: ["children", "family"] });
  if (said(d.wantsChildren)) f.push({ text: `Wants children: ${label(WANTS_CHILDREN_OPTIONS, d.wantsChildren)}`, cats: ["children"] });
  if (said(d.marriage)) f.push({ text: `Marriage: ${label(MARRIAGE_OPTIONS, d.marriage)}`, cats: [] });
  if (d.languages?.length) f.push({ text: `Languages: ${d.languages.map((l) => LANG_NAME[l]).join(", ")}`, cats: [] });
  if (said(d.education)) f.push({ text: `Education: ${label(EDUCATION_OPTIONS, d.education)}`, cats: [] });
  if (d.job) f.push({ text: `Work: ${d.job}`, cats: ["money"] });
  if (d.heightCm) f.push({ text: `Height: ${d.heightCm} cm`, cats: ["body"] });
  if (said(d.drinking)) f.push({ text: `Drinking: ${label(DRINKING_OPTIONS, d.drinking)}`, cats: ["substances"] });
  if (said(d.smoking)) f.push({ text: `Smoking: ${label(SMOKING_OPTIONS, d.smoking)}`, cats: ["substances"] });
  if (d.base === "diaspora") {
    f.push({ text: `Lives abroad${d.country ? ` in ${d.country}` : ""}${d.movingBack ? `; ${label(MOVING_BACK_OPTIONS, d.movingBack)?.toLowerCase()}` : ""}`, cats: [] });
  }
  return f;
}
