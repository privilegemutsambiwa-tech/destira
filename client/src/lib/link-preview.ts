// Recognizes links the app itself generates (group invites, referral
// invites) inside a chat message so they can render as a proper preview
// card instead of raw URL text. Scoped deliberately to same-origin /
// destira.date links — an arbitrary external URL is left as plain text.

export type ParsedDestiraLink =
  | { type: "group_invite"; token: string }
  | { type: "referral"; code: string }
  | { type: "other"; path: string };

function isDestiraHost(hostname: string): boolean {
  return hostname === window.location.hostname || /(^|\.)destira\.date$/i.test(hostname);
}

/** Only matches when the ENTIRE trimmed string is one URL — a message that's
 *  a link plus other prose is left as plain text rather than guessing where
 *  the link ends. */
export function parseDestiraLink(content: string): ParsedDestiraLink | null {
  const trimmed = content.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  // Two links pasted back to back with no separator between them ("it
  // happens") is still a syntactically valid single URL as far as `new
  // URL()` is concerned — the embedded second "://" is the tell. Bail out
  // to plain text entirely rather than resolve to a corrupted path that
  // would 404 if tapped; the specific-token regexes below are a second
  // layer of the same defense, not a substitute for this one.
  if (trimmed.indexOf("://") !== trimmed.lastIndexOf("://")) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (!isDestiraHost(url.hostname)) return null;

  // Strict shape — "<groupId>-<32 hex chars>", anchored to the end of the
  // path. A real invite link never looks like anything else; anchoring with
  // $ matters because a message that's two links pasted back to back with
  // no separator (it happens) is still a syntactically valid single URL —
  // without the anchor this would greedily capture the second URL as part
  // of the "token" and hand a broken, unroutable string to the join page.
  const joinMatch = url.pathname.match(/^\/join\/(\d+-[0-9a-f]{32})$/);
  if (joinMatch) return { type: "group_invite", token: joinMatch[1] };

  // Same reasoning — a referral code is always exactly 8 uppercase
  // alphanumeric characters (server/referrals.ts), so anything else
  // (including a second URL glued onto this one) is rejected rather than
  // passed through.
  const ref = url.searchParams.get("ref");
  if ((url.pathname === "/" || url.pathname === "") && ref && /^[A-Z0-9]{8}$/.test(ref)) {
    return { type: "referral", code: ref };
  }

  return { type: "other", path: url.pathname + url.search };
}
