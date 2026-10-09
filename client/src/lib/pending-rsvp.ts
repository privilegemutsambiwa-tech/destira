// "Save my seat" tapped by a signed-out visitor on a shared event link. The
// seat is saved for them the moment they're signed in and land back on the
// event — even if signup detours through Essentials first. Kept separately
// from pending-invite.ts's slot (which is consumed by the first redirect
// checkpoint) because this one must survive until the RSVP actually happens.
const KEY = "vf_pending_rsvp";
const TTL_MS = 2 * 24 * 60 * 60 * 1000;

export function stashPendingRsvp(eventId: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ eventId, at: Date.now() }));
  } catch {
    /* private mode: they'll just tap "Save a seat" themselves */
  }
}

export function peekPendingRsvp(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { eventId?: number; at?: number };
    if (!v.eventId || !v.at || Date.now() - v.at > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return v.eventId;
  } catch {
    return null;
  }
}

export function clearPendingRsvp() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
