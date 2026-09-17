// Events v2 taxonomy — fixed, closed lists. Hosts pick from these; a
// free-text `kind` would destroy filtering within a month.
//
// Split out of shared/schema.ts on purpose: schema.ts's pgTable() calls are
// real runtime code (Drizzle table objects, not just types), so ANY
// value-level import from schema.ts — even just for these plain string
// arrays — pulls the whole module, admin tables included, into whatever
// bundle imports it. Client pages that need these lists (HostEvent.tsx,
// Events.tsx, EventPreferences.tsx) were shipping the full admin schema
// (adminUsers' totpSecret column, adminAuditLog, adminRecoveryCodes,
// adminInvites — table and column names) to every visitor's browser as a
// result. This file has zero drizzle/pg imports, so it can't do that;
// schema.ts re-exports from here for server code that still wants these
// from "@shared/schema".
export const EVENT_KINDS = [
  "music", "food", "outdoors", "sport", "film", "books", "art", "faith",
  "games", "making", "learning", "dancing", "volunteering", "nightlife", "wellness",
] as const;
export const EVENT_VIBES = ["quiet", "loud", "active", "seated", "outdoors", "late", "early"] as const;
export const EVENT_PLACE_TYPES = ["home", "bar", "restaurant", "outdoors", "venue", "studio", "sports"] as const;
export const EVENT_TIME_WINDOWS = ["morning", "afternoon", "evening", "late"] as const;
export const EVENT_ACCESS_NEEDS = ["step-free", "seated", "quiet-space"] as const;
export const EVENT_VISIBILITY = ["public", "group", "invite"] as const;
