// Destira Friends (docs/destira-3-upgrade-prompt.md Part O): what a member
// is here for, and the words the Friends side uses. Friends is its own
// space, never romantic: its own deck, "Wave" instead of like, its own
// section in Chats, any gender.

export const LOOKING_FOR_OPTIONS = [
  { value: "love", label: "Love", note: "Dating, and someone to build something with." },
  { value: "friends", label: "Friends", note: "New people to hang out with. Never romantic." },
  { value: "both", label: "Both", note: "Dating, and friends on the side. Kept separate." },
] as const;
export type LookingFor = (typeof LOOKING_FOR_OPTIONS)[number]["value"];
export const LOOKING_FOR_VALUES = LOOKING_FOR_OPTIONS.map((o) => o.value) as readonly string[];

/** A missing value is Love: everyone who joined before Friends existed. */
export function lookingForOf(v: string | null | undefined): LookingFor {
  return v === "friends" || v === "both" ? v : "love";
}
export const wantsLove = (v: string | null | undefined) => lookingForOf(v) !== "friends";
export const wantsFriends = (v: string | null | undefined) => lookingForOf(v) !== "love";

/** A chat (a `matches` row) is either a love match or a friendship. */
export type MatchKind = "love" | "friends";

export interface FriendCard {
  userId: string;
  name: string;
  age: number | null;
  area: string | null;
  photoUrl: string | null;
  bio: string | null;
  interests: string[];
  shared: string[];
  isVerified: boolean;
  wavedAtYou: boolean;
}
