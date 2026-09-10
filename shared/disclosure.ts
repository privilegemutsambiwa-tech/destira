// What a user's AI Twin may say about them when a stranger interviews it.
//
// Every category defaults to "closed". The user opts IN to disclosure, never
// out. Enforcement is layered (server/routes.ts): facts in a closed category are
// filtered out before the model sees them; the model is then told the forbidden
// list explicitly; then the outgoing reply is scrubbed. This file is only the
// vocabulary shared by client and server.

export const DISCLOSURE_STATES = ["open", "acknowledge", "closed"] as const;
export type DisclosureState = (typeof DISCLOSURE_STATES)[number];

export interface DisclosureCategory {
  key: string;
  label: string;
  /** One plain sentence: what "open" lets the twin say. */
  openMeans: string;
}

export const DISCLOSURE_CATEGORIES: DisclosureCategory[] = [
  { key: "relationship_history", label: "Relationship history", openMeans: "that they've had serious relationships, roughly how recent, and what they learned." },
  { key: "children", label: "Children — whether and when", openMeans: "their stance on wanting children and a rough timeline." },
  { key: "religion", label: "Religion and practice", openMeans: "their faith and how observant they are." },
  { key: "politics", label: "Politics", openMeans: "where they sit politically and how strongly they hold it." },
  { key: "sexuality", label: "Sexuality and preferences", openMeans: "their orientation and what they're open about." },
  { key: "health", label: "Health, mental health, disability, neurodivergence", openMeans: "conditions they live with, in general terms." },
  { key: "money", label: "Money — income, job title, employer", openMeans: "what they do, roughly what they earn, and how stable things are." },
  { key: "family", label: "Family and living situation", openMeans: "their family relationships and who they live with." },
  { key: "substances", label: "Substance use", openMeans: "whether they drink, smoke, or use anything else, and how much." },
  { key: "body", label: "Body, weight, appearance specifics", openMeans: "specifics about their body beyond what a photo shows." },
  { key: "precise_location", label: "Where they live, work, or study", openMeans: "their suburb, campus, or building — beyond the city." },
  { key: "trauma", label: "Past trauma and hard experiences", openMeans: "abuse, loss, addiction recovery, or anything they've come through." },
];

export const DISCLOSURE_CATEGORY_KEYS = DISCLOSURE_CATEGORIES.map((c) => c.key);
export type DisclosureCategoryKey = (typeof DISCLOSURE_CATEGORY_KEYS)[number];

export type DisclosureSettings = Record<string, DisclosureState>;

/** Everything closed. The starting point and the fallback for any missing key. */
export const DEFAULT_DISCLOSURE: DisclosureSettings = Object.fromEntries(
  DISCLOSURE_CATEGORY_KEYS.map((k) => [k, "closed" as DisclosureState]),
);

export function normalizeDisclosure(raw: unknown): DisclosureSettings {
  const out: DisclosureSettings = { ...DEFAULT_DISCLOSURE };
  if (raw && typeof raw === "object") {
    for (const k of DISCLOSURE_CATEGORY_KEYS) {
      const v = (raw as Record<string, unknown>)[k];
      if (v === "open" || v === "acknowledge" || v === "closed") out[k] = v;
    }
  }
  return out;
}

// Never disclosable, regardless of any setting. Shown on the screen as
// permanently off. Enforced by the output scrubber, not by a toggle.
export const NEVER_DISCLOSED: string[] = [
  "Exact street address or house number",
  "Phone number, email, or social handles",
  "Live location or GPS coordinates",
  "Financial account, card, or wallet numbers",
  "ID, passport, or national-ID numbers",
  "Anything identifying another person who hasn't agreed to it",
];

export const DIRECTIVE_MAX = 2000;

// The line an interviewer sees when they hit a boundary. In the twin's voice,
// never names the topic, conversation carries on.
export const DISCLOSURE_REFUSAL = "That's hers to tell you.";
export function disclosureRefusal(firstName?: string | null): string {
  const name = (firstName || "").trim();
  return name ? `That's ${name}'s to tell you.` : DISCLOSURE_REFUSAL;
}
