// Carries a group invite across the auth round-trip. A WhatsApp-forwarded
// invite link is the single most likely place to lose someone: tap the
// link, hit the signed-out gate, sign up, land on Discover instead of the
// group they came for. localStorage (not sessionStorage) on purpose — it
// has to survive a real navigation away to /signup and back, and possibly a
// detour through /onboarding first.
const KEY = "vf_pending_invite";

/** Called by the join page itself, before it ever shows the signed-out
 *  gate — so the invite is stashed even if the visitor wanders off into
 *  onboarding before finishing signup. */
export function stashPendingInvite(rawToken: string) {
  try {
    localStorage.setItem(KEY, rawToken);
  } catch {
    /* private mode — the invite just won't survive; nothing else to do */
  }
}

/** Reads and clears in one step — a pending invite is consumed exactly
 *  once, by whichever redirect checkpoint sees it first. */
export function consumePendingInvite(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    if (v) localStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}

/** Same idea as a group invite, for a shared event link a signed-out visitor
 *  opened (`/events/:id`) — the destination is stashed as `event:<id>` in the
 *  SAME slot, so `consumePendingInvite`'s "one redirect checkpoint sees it"
 *  guarantee still holds, without every checkpoint needing to know the
 *  string could mean two different things. */
export function stashPendingEvent(eventId: string | number) {
  stashPendingInvite(`event:${eventId}`);
}

/** Turns a consumed pending-invite value into the route to land on —
 *  every checkpoint that used to hardcode `/join/${pendingInvite}` should
 *  call this instead, so a group token and an `event:<id>` value each land
 *  in the right place. */
export function resolvePendingInviteRoute(rawValue: string): string {
  const eventMatch = rawValue.match(/^event:(\d+)$/);
  if (eventMatch) return `/events/${eventMatch[1]}`;
  return `/join/${rawValue}`;
}
