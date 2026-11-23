// Events, the in-person side (docs/destira-3-upgrade-prompt.md Part J):
// a door pass the host scans so "went" is real, and "Who did you click
// with?" afterwards, where a mutual pick becomes one chat.

/** The door opens this long before the start... */
export const DOOR_OPENS_BEFORE_MS = 3 * 3600e3;
/** ...and stays open this long after the end. */
export const DOOR_CLOSES_AFTER_MS = 6 * 3600e3;
/** With no end time, an event is taken to last this long. */
export const DEFAULT_EVENT_LENGTH_MS = 4 * 3600e3;
/** Picks stay open this long after the end. */
export const CLICKS_OPEN_MS = 7 * 24 * 3600e3;

export function eventEnd(e: { startsAt: Date | string; endsAt?: Date | string | null }): Date {
  return e.endsAt ? new Date(e.endsAt) : new Date(new Date(e.startsAt).getTime() + DEFAULT_EVENT_LENGTH_MS);
}

export function doorWindow(e: { startsAt: Date | string; endsAt?: Date | string | null }) {
  return {
    opensAt: new Date(new Date(e.startsAt).getTime() - DOOR_OPENS_BEFORE_MS),
    closesAt: new Date(eventEnd(e).getTime() + DOOR_CLOSES_AFTER_MS),
  };
}

export function clicksWindow(e: { startsAt: Date | string; endsAt?: Date | string | null }) {
  const opensAt = eventEnd(e);
  return { opensAt, closesAt: new Date(opensAt.getTime() + CLICKS_OPEN_MS) };
}

export interface DoorPass {
  /** Between doorWindow.opensAt and closesAt. */
  open: boolean;
  opensAt: string;
  checkedInAt: string | null;
  /** A QR (data: URL) of the link the host scans. Only while open and not yet in. */
  qr: string | null;
  /** The link the QR holds. */
  link: string | null;
  /** The same pass as 6 characters, for when the camera won't play along. */
  code: string | null;
}

export interface DoorPerson {
  attendeeId: number;
  userId: string;
  name: string;
  photoUrl: string | null;
  checkedInAt: string | null;
}

export interface DoorList {
  eventId: number;
  title: string;
  startsAt: string;
  open: boolean;
  opensAt: string;
  people: DoorPerson[];
  inCount: number;
}

export type CheckInResult =
  | { status: "checked_in"; person: DoorPerson }
  | { status: "already"; person: DoorPerson };

export type ClickKind = "love" | "friends";

export interface ClickPerson {
  userId: string;
  name: string;
  age: number | null;
  photoUrl: string | null;
  canLove: boolean;
  canFriends: boolean;
  myPick: ClickKind | null;
  /** Mutual: you're in a chat now. */
  matchId: number | null;
}

export interface EventClicks {
  /** before: not over yet · open · closed · not_there: you didn't check in (or weren't going) */
  state: "before" | "open" | "closed" | "not_there";
  opensAt: string;
  closesAt: string;
  title: string;
  people: ClickPerson[];
}
