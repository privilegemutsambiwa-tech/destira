// One map of what each moment feels like under the finger
// (docs/destira-upgrade-prompt.md §4.6). Screens call the moment, never a raw
// vibration pattern, so the whole app stays consistent.
//
// Phone app only: the Haptics plugin has shipped in every APK since the
// first, so this works over the air. On the website it does nothing: a
// desktop can't vibrate, and phone browsers buzzing on every tap feels cheap.
// Members can turn it off (localStorage "destira.haptics" = "off").
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { isNativeApp } from "./native";

const KEY = "destira.haptics";

export function hapticsEnabled(): boolean {
  if (!isNativeApp()) return false;
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setHapticsEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable: stays on for this session */
  }
}

function run(fn: () => Promise<void>) {
  if (!hapticsEnabled()) return;
  fn().catch(() => {
    /* a device without a vibration motor */
  });
}

const impact = (style: ImpactStyle) => () => run(() => Haptics.impact({ style }));
const notify = (type: NotificationType) => () => run(() => Haptics.notification({ type }));

export const haptic = {
  /** Liking someone. */
  like: impact(ImpactStyle.Medium),
  /** Passing on someone. */
  pass: impact(ImpactStyle.Light),
  /** A message going out. */
  send: () => run(() => Haptics.selectionChanged()),
  /** A seat saved, a payment through. */
  success: notify(NotificationType.Success),
  /** A refusal or an error. */
  warning: notify(NotificationType.Warning),
  /** Crossing a threshold: pull to refresh, a segment change, a reorder step. */
  tick: () => run(() => Haptics.selectionChanged()),
  /** It's a match: the success buzz, then two soft ticks in time with the animation. */
  match: () => {
    notify(NotificationType.Success)();
    window.setTimeout(() => run(() => Haptics.impact({ style: ImpactStyle.Light })), 380);
    window.setTimeout(() => run(() => Haptics.impact({ style: ImpactStyle.Light })), 560);
  },
};
