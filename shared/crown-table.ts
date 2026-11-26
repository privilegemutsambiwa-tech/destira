// Crown Table (docs/destira-3-upgrade-prompt.md Part P5). Shared by client
// and server.
//
//   - A private monthly dinner the team sets up at a partner venue. Crown
//     members take a seat; each may bring one guest from their matches, who
//     says yes or no. Who's coming is shown only to people with a seat.
//     Everyone pays the venue for their own food: nobody pays for anyone.
//   - A reserved seat at every official event: a Crown member is never
//     waitlisted at one (gender rules still apply).
//   - A reserved seat at the Sunday Table: a Crown member who signed up is
//     never left without a table when any table forms for their mix.

export const CROWN_DINNER_SEATS_MIN = 4;
export const CROWN_DINNER_SEATS_MAX = 40;
/** Seats and guests can change until this long before the dinner. */
export const CROWN_DINNER_CHANGE_CUTOFF_H = 6;

export type CrownDinnerPerson = { userId: string; name: string; crown: boolean };

export type CrownDinnerView = {
  id: number;
  title: string;
  venueName: string;
  venueDetail: string | null;
  partnerOffer: string | null;
  startsAt: string;
  note: string | null;
  status: "scheduled" | "cancelled";
  cancelReason: string | null;
  seats: number;
  seatsLeft: number;
  /** "host": you're Crown; "guest": a Crown member asked you. */
  role: "crown" | "guest";
  mine: "going" | "invited" | "declined" | "cancelled" | null;
  /** Crown only: your guest, if you asked someone. */
  guest: { userId: string; name: string; status: "going" | "invited" | "declined" | "cancelled" } | null;
  /** Guest only: who asked you. */
  invitedBy: string | null;
  /** Only once you have a seat. */
  coming: CrownDinnerPerson[];
  canChange: boolean;
};

export type CrownTableMe = {
  crown: boolean;
  dinners: CrownDinnerView[];
  /** Crown only: matches you could bring. */
  guestOptions: { userId: string; name: string }[];
};
