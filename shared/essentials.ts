// The matching essentials collected right after signup, before the ten
// soul-mapping questions. One decision per screen; everything except date of
// birth and gender is skippable with a sensible default.

export const GENDER_OPTIONS = [
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
  { value: "non-binary", label: "Non-binary" },
  { value: "self-describe", label: "Self-describe" },
  { value: "prefer-not", label: "Prefer not to say" },
] as const;

// Who they want to meet — multi-select.
export const SEEKING_OPTIONS = [
  { value: "women", label: "Women" },
  { value: "men", label: "Men" },
  { value: "non-binary", label: "Non-binary people" },
  { value: "everyone", label: "Everyone" },
] as const;

export const DATING_INTENT_OPTIONS = [
  { value: "relationship", label: "A relationship", note: "Looking for something that lasts." },
  { value: "see", label: "Seeing what happens", note: "Open, no fixed expectation." },
  { value: "friends-first", label: "Friends first", note: "Get to know people, no rush." },
  { value: "unsure", label: "Not sure yet", note: "Still working it out." },
] as const;

export type GenderValue = (typeof GENDER_OPTIONS)[number]["value"];
export type SeekingValue = (typeof SEEKING_OPTIONS)[number]["value"];
export type DatingIntentValue = (typeof DATING_INTENT_OPTIONS)[number]["value"];

export const GENDER_VALUES = GENDER_OPTIONS.map((o) => o.value) as readonly string[];
export const SEEKING_VALUES = SEEKING_OPTIONS.map((o) => o.value) as readonly string[];
export const DATING_INTENT_VALUES = DATING_INTENT_OPTIONS.map((o) => o.value) as readonly string[];

export const MIN_AGE = 18;
export const MAX_AGE = 100;

/** Whole years from an ISO date string (yyyy-mm-dd) to today. */
export function ageFromDob(dob: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  const [, y, mo, d] = m;
  const b = new Date(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const mm = now.getMonth() - b.getMonth();
  if (mm < 0 || (mm === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

/** Default age range from the user's own age: a little younger, a bit older,
 *  clamped to [18, 100]. */
export function defaultAgeRange(age: number): { min: number; max: number } {
  return {
    min: Math.max(MIN_AGE, age - 5),
    max: Math.min(MAX_AGE, age + 7),
  };
}
