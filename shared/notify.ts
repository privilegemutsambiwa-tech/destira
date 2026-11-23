// Coming back every day, without nagging (docs/destira-3-upgrade-prompt.md
// Part I). Every push belongs to one category, every category has a switch
// in Settings, and the non-exempt ones share a small daily budget and stay
// quiet overnight in the member's own time zone.

export const PUSH_CATEGORIES = [
  "matches", "messages", "unread", "events", "event_reminders", "event_likes",
  "tables", "circles", "board", "stories", "interviews", "twin", "plan", "account",
] as const;
export type NotificationCategory = (typeof PUSH_CATEGORIES)[number];

/** Settings copy, in the order the switches appear. */
export const PUSH_CATEGORY_INFO: Record<NotificationCategory, { label: string; hint: string }> = {
  matches: { label: "Matches and likes", hint: "A new match, or someone liked you" },
  messages: { label: "Messages", hint: "When someone you matched writes to you" },
  unread: { label: "Unread message reminder", hint: "Once, if a message has waited 2 hours" },
  events: { label: "Event updates", hint: "An event you're going to moves, needs a lead or is called off" },
  event_reminders: { label: "Event reminders", hint: "The day before, and 2 hours before" },
  event_likes: { label: "Someone you liked is going", hint: "When they join an event you're going to" },
  tables: { label: "Sunday Table", hint: "Your table, the place on Saturday, and who wants to meet again" },
  circles: { label: "Friend circles", hint: "Circle invitations and new plans" },
  board: { label: "Plans board", hint: "Someone wants in on your plan, or you're in on theirs" },
  stories: { label: "Story replies", hint: "Someone replied to your story" },
  interviews: { label: "Twin interviews", hint: "Someone is interviewing your twin" },
  twin: { label: "Twin alerts", hint: "Your twin spotted someone or an event for you" },
  plan: { label: "Your plan", hint: "Before your plan or trial ends" },
  account: { label: "Your account", hint: "Verification results and Crown news" },
};

/** Person-to-person, in the moment: never budgeted, never held overnight. */
export const EXEMPT_CATEGORIES: ReadonlySet<NotificationCategory> = new Set(["matches", "messages"]);

export const PUSH_DAILY_BUDGET = 4;
export const QUIET_START_HOUR = 21;
export const QUIET_END_HOUR = 8;
/** A second non-exempt push this soon after the last one waits, and goes out folded into one. */
export const BURST_WINDOW_MS = 15 * 60_000;

export const DEFAULT_TZ = "Africa/Harare";

function validTz(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

/** The member's local hour (0-23) and day (YYYY-MM-DD). */
export function localClock(tz: string | null | undefined, at: Date = new Date()): { hour: number; day: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: validTz(tz), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { hour: Number(get("hour")) % 24, day: `${get("year")}-${get("month")}-${get("day")}` };
}

export function isQuietHour(hour: number): boolean {
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/**
 * Where a notification opens when it has no stored link (older rows): the
 * same screens push already uses.
 */
export function fallbackUrl(type: string): string {
  if (type === "match" || type === "like") return "/matches";
  if (type.startsWith("event")) return "/events";
  if (type === "plan") return "/plans";
  if (type === "verification") return "/profile";
  if (type === "crown") return "/crown";
  if (type.startsWith("group") || type.startsWith("chat_request")) return "/chats";
  if (type === "referral_reward") return "/invite";
  if (type === "table") return "/tables";
  if (type === "circle") return "/circles";
  if (type === "board") return "/plans-board";
  if (type === "friend") return "/chats?filter=friends";
  if (type === "disclosure") return "/twin-disclosure";
  return "/";
}
