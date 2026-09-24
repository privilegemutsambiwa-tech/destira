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

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (!isDestiraHost(url.hostname)) return null;

  const joinMatch = url.pathname.match(/^\/join\/(.+)$/);
  if (joinMatch) return { type: "group_invite", token: joinMatch[1] };

  const ref = url.searchParams.get("ref");
  if ((url.pathname === "/" || url.pathname === "") && ref) return { type: "referral", code: ref };

  return { type: "other", path: url.pathname + url.search };
}
