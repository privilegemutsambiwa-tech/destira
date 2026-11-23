// Events, the rest of Part J (docs/destira-3-upgrade-prompt.md): host
// ratings (people who were there rate the event, never each other) and
// venue partners (places that give Destira members something).

/** Ratings stay open this long after the event ends. */
export const RATING_OPEN_MS = 14 * 24 * 3600e3;
/** A host's stars show publicly only from this many ratings. */
export const RATINGS_SHOWN_FROM = 3;
export const RATING_NOTE_MAX = 280;
export const PARTNER_OFFER_MAX = 80;

export interface HostSummary {
  userId: string;
  name: string;
  photoUrl: string | null;
  /** Past, published events they hosted. */
  hosted: number;
  /** Null until RATINGS_SHOWN_FROM ratings. */
  rating: { avg: number; count: number } | null;
}

export interface RatingState {
  /** You were there, it's over, and it's within RATING_OPEN_MS. */
  canRate: boolean;
  mine: { stars: number; note: string | null } | null;
  /** The host's own view: every rating, and the notes without names. */
  forHost: { avg: number | null; count: number; notes: { stars: number; note: string; at: string }[] } | null;
}

export interface EventAbout {
  host: HostSummary;
  /** "10% off for Destira members", when the event is at a partner venue. */
  partnerOffer: string | null;
  rating: RatingState;
}

export interface HostPage {
  host: HostSummary;
  upcoming: { id: number; title: string; startsAt: string; where: string }[];
}

export interface AdminPlace {
  id: number;
  name: string;
  suburb: string;
  city: string;
  placeType: string;
  partnerOffer: string | null;
  partnerSince: string | null;
}
