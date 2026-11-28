// Public city pages for search (docs/destira-3-upgrade-prompt.md Part H6):
// "Dating in Harare" and so on, listing upcoming public events there. No
// member data ever appears on them.

export interface CityPage {
  slug: string;
  name: string;
  /** One honest line about meeting people there. */
  blurb: string;
}

export const CITY_PAGES: CityPage[] = [
  { slug: "harare", name: "Harare", blurb: "From Borrowdale to the Avenues, meet people who want the same thing you do, then meet them for real at small events around the city." },
  { slug: "bulawayo", name: "Bulawayo", blurb: "Meet people in the City of Kings who want the same thing you do, and see them in person at small events around town." },
];

export function cityBySlug(slug: string | undefined | null): CityPage | null {
  return CITY_PAGES.find((c) => c.slug === (slug || "").toLowerCase()) ?? null;
}

export const cityPath = (c: CityPage) => `/dating-in/${c.slug}`;
export const cityTitle = (c: CityPage) => `Dating in ${c.name} | Destira`;
export const cityDescription = (c: CityPage) =>
  `Dating in ${c.name}: meet people who want a real relationship. Your AI twin says hello first, and upcoming Destira events in ${c.name} let you meet in person.`;

/** How Destira works, the same on every city page. */
export const HOW_IT_WORKS = [
  { title: "Your twin says hello first", body: "Answer a few questions and your AI twin learns how you talk. It chats with theirs before you do, so you start with something to say." },
  { title: "Real reasons, not a swipe", body: "Every person comes with why you might click: shared answers, the same plans, the same kind of weekend." },
  { title: "Meet at small events", body: "Dinners, game nights and walks hosted by Destira and its members, many with seats balanced between women and men." },
  { title: "Safe from the first message", body: "Verified photos, a scam scanner on every chat, Share my date, and a check-in during the date if you want one." },
];
