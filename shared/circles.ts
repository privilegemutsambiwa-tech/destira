// Friend circles (docs/destira-3-upgrade-prompt.md Part O3): where friendships
// live after a Sunday Table, an event, or an invitation. Small on purpose.

export const CIRCLE_MAX = 8;
/** How many circles one member can be in. */
export const CIRCLES_PER_MEMBER = 10;
export const CIRCLE_NAME_MAX = 40;
export const PLAN_TITLE_MAX = 80;
export const PLAN_PLACE_MAX = 80;

export interface CirclePerson {
  userId: string;
  name: string;
  photoUrl: string | null;
}

export interface CircleSummary {
  id: number;
  groupId: number;
  name: string;
  members: CirclePerson[];
  nextPlan: { title: string; startsAt: string } | null;
}

export interface CircleInviteView {
  id: number;
  circleId: number;
  circleName: string;
  from: CirclePerson;
  members: number;
}

export interface CirclePlanView {
  id: number;
  title: string;
  startsAt: string;
  place: string | null;
  author: CirclePerson;
  ins: CirclePerson[];
  mine: boolean;
  imIn: boolean;
}

export interface CircleDetail {
  id: number;
  groupId: number;
  name: string;
  source: string;
  members: CirclePerson[];
  pending: CirclePerson[];
  plans: CirclePlanView[];
  album: { id: number; url: string; at: string; by: string }[];
  spaceLeft: number;
}

export interface CirclesMe {
  circles: CircleSummary[];
  invites: CircleInviteView[];
}
