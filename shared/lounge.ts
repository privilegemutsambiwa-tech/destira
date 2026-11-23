// Lounge discovery and mentions (docs/destira-3-upgrade-prompt.md Part J).
// Topics a room can be about, how "@Name" handles are made, and what the
// discover endpoint returns. Shared so the server and the composer agree.

export const LOUNGE_TOPICS = [
  { key: "faith", label: "Faith", words: ["faith", "church", "christian", "muslim", "prayer", "bible", "gospel", "worship"] },
  { key: "fitness", label: "Fitness", words: ["fitness", "gym", "running", "run club", "workout", "hiking", "yoga", "football", "soccer"] },
  { key: "food", label: "Food", words: ["food", "braai", "cooking", "foodie", "restaurant", "baking", "coffee"] },
  { key: "music", label: "Music", words: ["music", "amapiano", "gospel music", "jazz", "dj", "concert", "sungura", "hip hop"] },
  { key: "business", label: "Business", words: ["business", "entrepreneur", "startup", "career", "money", "investing", "hustle"] },
  { key: "diaspora", label: "Diaspora", words: ["diaspora", "abroad", "uk", "south africa", "joburg", "johannesburg", "london", "usa", "canada", "australia"] },
] as const;
export type LoungeTopic = (typeof LOUNGE_TOPICS)[number]["key"];
export const LOUNGE_TOPIC_KEYS: readonly string[] = LOUNGE_TOPICS.map((t) => t.key);

/** A room's topics: the ones its owner picked (tags), or what its name and description plainly say. */
export function roomTopics(room: { categoryTags?: string[] | null; name?: string | null; description?: string | null }): LoungeTopic[] {
  const tags = (room.categoryTags ?? []).map((t) => t.toLowerCase());
  const picked = LOUNGE_TOPICS.filter((t) => tags.includes(t.key)).map((t) => t.key);
  if (picked.length) return picked;
  const text = ` ${(room.name ?? "")} ${(room.description ?? "")} `.toLowerCase();
  return LOUNGE_TOPICS.filter((t) => t.words.some((w) => new RegExp(`[^a-z]${w}[^a-z]`).test(text))).map((t) => t.key);
}

/** Same characters the chat renders in ember: "@Farai", "@CuriousPhoenix". */
export const MENTION_RE = /@([\p{L}\p{N}_.-]+)/gu;
/** A member's handle is their room name without spaces. */
export const mentionHandle = (nickname: string | null | undefined) => (nickname || "").replace(/\s+/g, "");
export function mentionedHandles(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of (text || "").matchAll(MENTION_RE)) out.add(m[1].replace(/[.-]+$/, "").toLowerCase());
  return out;
}
/** At most this many people are told about one message. */
export const MENTION_NOTIFY_MAX = 8;

export const TRENDING_DAYS = 7;
/** A room needs at least this many messages in the week to be "trending". */
export const TRENDING_MIN = 5;

export interface LoungeMatchRoom {
  groupId: number;
  people: { userId: string; name: string }[];
}
export interface LoungeTrending {
  groupId: number;
  messages: number;
}
export interface LoungeDiscover {
  trending: LoungeTrending[];
  matchRooms: LoungeMatchRoom[];
  /** groupId → topics, for every room in the list. */
  topics: Record<number, LoungeTopic[]>;
  /** The viewer's own area, first word of their location ("Borrowdale"), if any. */
  myArea: string | null;
}
