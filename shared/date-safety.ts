// Date safety kit (docs/destira-3-upgrade-prompt.md Part B6), free for
// everyone. Share my date (shared/date-plan.ts) tells someone who, where and
// when; this adds an optional "All good?" an hour into the date, with "I'm
// fine" or "Get help". Get help shows emergency numbers and writes to the
// member's trusted contact from their own phone. The contact's number is
// kept on the phone, never sent to Destira.
import { dateTimeLabel, planTitle, type DatePlanView } from "./date-plan";

/** The check-in comes this long after the agreed time. */
export const SAFETY_CHECK_AFTER_MS = 60 * 60 * 1000;
/** Past this, an unanswered check-in is no longer asked (the date is over). */
export const SAFETY_CHECK_WINDOW_MS = 4 * 60 * 60 * 1000;

export const SAFETY_ANSWERS = ["fine", "help"] as const;
export type SafetyAnswer = (typeof SAFETY_ANSWERS)[number];

/** Zimbabwe's emergency lines. 112 is for mobile phones. */
export const EMERGENCY_NUMBERS: { label: string; number: string }[] = [
  { label: "Police", number: "995" },
  { label: "Ambulance", number: "994" },
  { label: "All emergencies", number: "999" },
  { label: "From a mobile", number: "112" },
];

export interface SafetyCheckView {
  planId: number;
  /** Turned on by this member for this date. */
  on: boolean;
  /** When "All good?" is asked (ISO), if on. */
  checkAt: string | null;
  answer: SafetyAnswer | null;
  /** It's time to answer: on, asked, not answered, still within the window. */
  due: boolean;
}

/** When the check-in is asked for a date at `startsAt`. */
export function safetyCheckAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() + SAFETY_CHECK_AFTER_MS);
}

/** Whether a check asked at `checkAt` still wants an answer at `now`. */
export function safetyDue(checkAt: Date | null, answer: string | null, now = Date.now()): boolean {
  if (!checkAt || answer) return false;
  const t = checkAt.getTime();
  return now >= t && now < t + SAFETY_CHECK_WINDOW_MS;
}

/** What the trusted contact receives when the member taps Get help. */
export function helpMessageText(plan: Pick<DatePlanView, "kind" | "placeName" | "placeDetail" | "startsAt">, otherName: string): string {
  const where = [planTitle(plan), plan.placeDetail].filter(Boolean).join(", ");
  const when = plan.startsAt ? ` (${dateTimeLabel(plan.startsAt)})` : "";
  return `I need help. I'm on a date with ${otherName} from Destira: ${where}${when}. Please call me now. If I don't answer, call the police on 995.`;
}

/** Digits only, Zimbabwe numbers made international (077… → 26377…). */
export function normalizeContactNumber(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!/^\d{9,15}$/.test(digits)) return null;
  if (digits.startsWith("0")) return digits.length === 10 ? `263${digits.slice(1)}` : null;
  return digits;
}
