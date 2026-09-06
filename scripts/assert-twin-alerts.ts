// Guards the "never nag" rules for twin event alerts:
//
//   npm run check:twin-alerts
//
// evaluateGates() is the whole dedupe decision as a pure function; each gate is
// asserted in isolation here. Also checks the scorer used is the resonance-free
// feed scorer (by identity) and that the 4 templates are distinct.
import {
  evaluateGates,
  templateIndex,
  renderTemplate,
  localHourFor,
  type GateState,
} from "../server/services/twin-event-alerts";
import { scoreEventForUser } from "../server/events-fit";
import * as feedScorer from "../server/events-feed";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "  ok  " : " FAIL "} ${name}`);
  if (!cond) failures += 1;
};

const OPEN: GateState = {
  everSentForEvent: false,
  msSinceLastAlert: null,
  alertsInLast7d: 0,
  localHour: 12,
};

// ── a clean state sends ──
check("clean state -> send", evaluateGates(OPEN).send === true);

// ── gate a: one per (user, event) ever ──
check(
  "already alerted for this event -> blocked",
  evaluateGates({ ...OPEN, everSentForEvent: true }).blockedBy === "already-sent-for-event",
);

// ── gate b: <=1 per 24h ──
check(
  "alerted 23h ago -> blocked",
  evaluateGates({ ...OPEN, msSinceLastAlert: 23 * 3600_000 }).blockedBy === "within-24h",
);
check(
  "alerted 25h ago -> not blocked by 24h rule",
  evaluateGates({ ...OPEN, msSinceLastAlert: 25 * 3600_000 }).send === true,
);

// ── gate c: <=3 per rolling 7 days ──
check("2 alerts in 7d -> send", evaluateGates({ ...OPEN, alertsInLast7d: 2 }).send === true);
check(
  "3 alerts in 7d -> blocked",
  evaluateGates({ ...OPEN, alertsInLast7d: 3 }).blockedBy === "weekly-cap",
);

// ── gate d: quiet hours 21:00–08:00 local ──
check("20:00 local -> send", evaluateGates({ ...OPEN, localHour: 20 }).send === true);
check("21:00 local -> blocked", evaluateGates({ ...OPEN, localHour: 21 }).blockedBy === "quiet-hours");
check("03:00 local -> blocked", evaluateGates({ ...OPEN, localHour: 3 }).blockedBy === "quiet-hours");
check("08:00 local -> send", evaluateGates({ ...OPEN, localHour: 8 }).send === true);

// gates apply in priority order: event-level beats everything
check(
  "everSent wins over a fresh window",
  evaluateGates({ everSentForEvent: true, msSinceLastAlert: null, alertsInLast7d: 0, localHour: 12 })
    .blockedBy === "already-sent-for-event",
);

// ── localHourFor: UTC + 2 wrap ──
check("localHourFor 23:00 UTC -> 01 local", localHourFor(new Date("2026-03-01T23:00:00Z")) === 1);
check("localHourFor 07:00 UTC -> 09 local", localHourFor(new Date("2026-03-01T07:00:00Z")) === 9);

// ── template selection is deterministic and in range ──
check("templateIndex deterministic", templateIndex("user-abc", 7) === templateIndex("user-abc", 7));
check(
  "templateIndex in [0,3]",
  [0, 1, 2, 3, 4, 5].every((n) => {
    const i = templateIndex("u" + n, n * 3 + 1);
    return i >= 0 && i <= 3;
  }),
);

// ── 4 distinct templates, none empty ──
const evt = {
  title: "Board games and cheap wine",
  suburb: "Avondale",
  city: "Harare",
  kind: "games",
  startsAt: new Date(Date.now() + 3 * 86_400_000),
};
const rendered = [0, 1, 2, 3].map((v) => renderTemplate(v, evt));
check("4 templates all non-empty", rendered.every((s) => s.trim().length > 20));
check("4 templates all distinct", new Set(rendered).size === 4);
check("template mentions the title", rendered.every((s) => s.includes("Board games and cheap wine")));

// ── the scorer is the feed's resonance-free one ──
check("uses scoreEventForUser from events-fit", feedScorer.scoreEventForUser === scoreEventForUser);
check("scoreEventForUser arity is 3 (event, prefs, ctx) — no attendee arg", scoreEventForUser.length === 3);

console.log(failures === 0 ? "\nall twin-alert checks passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
