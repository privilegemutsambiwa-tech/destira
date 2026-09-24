// Shared "return to where you actually were" convention — a handful of
// screens (Interviews chat, now Plans/PlansPay) can be opened from many
// different places (Discover, Chat, Likes, Lounge, a profile, a paywall
// refusal sheet), so the caller passes its own current route as `?from=`
// and the opened screen honors it instead of hardcoding one destination.

/** Reads and validates a `from` query param, falling back to `fallback`
 *  when it's missing or not a same-origin path. */
export function getFromRoute(search: string, fallback: string): string {
  const from = new URLSearchParams(search).get("from");
  return from && from.startsWith("/") && !from.startsWith("//") ? from : fallback;
}

/** Appends `from=<currentPath>` to `path`, so the screen it points to can
 *  use getFromRoute to come back here. `currentPath` should be the full
 *  current path + query the caller wants to return to (usually
 *  `window.location.pathname` for a dynamic route like /u/:userId). */
export function withFrom(path: string, currentPath: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}from=${encodeURIComponent(currentPath)}`;
}
