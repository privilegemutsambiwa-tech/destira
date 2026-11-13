// The motion system (docs/destira-upgrade-prompt.md §4.5), defined once.
// Screens use these names instead of picking their own numbers, so every
// movement in the app shares one rhythm. Only transform and opacity animate.
import { useReducedMotion, type Transition, type Variants } from "framer-motion";

/** Seconds, for framer-motion. */
export const duration = {
  /** Presses, toggles. */
  press: 0.12,
  /** Small things entering or leaving. */
  small: 0.22,
  /** Sheets and page transitions. */
  page: 0.32,
  /** Ceremony moments only: a match, the 19:00 release. */
  ceremony: 0.75,
} as const;

export const ease = {
  standard: [0.2, 0.8, 0.2, 1] as [number, number, number, number],
  exit: [0.4, 0, 1, 1] as [number, number, number, number],
};

/** For anything the finger moves: cards, sheets, drag handles. */
export const spring: Transition = { type: "spring", stiffness: 380, damping: 32 };

export const transition = {
  small: { duration: duration.small, ease: ease.standard } as Transition,
  page: { duration: duration.page, ease: ease.standard } as Transition,
  exit: { duration: duration.small, ease: ease.exit } as Transition,
};

/** Fades only: what everything becomes when the member asks for less motion. */
const calmFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: duration.press } },
  exit: { opacity: 0, transition: { duration: duration.press } },
};

/** Pushing forward into a screen: in from 24 px to the right; back reverses. */
export const pageVariants: Variants = {
  initial: (dir: 1 | -1 = 1) => ({ opacity: 0, x: 24 * dir }),
  animate: { opacity: 1, x: 0, transition: transition.page },
  exit: (dir: 1 | -1 = 1) => ({ opacity: 0, x: -12 * dir, transition: transition.exit }),
};

/** Tabs are places, not a stack: they only cross-fade. */
export const tabVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: transition.small },
  exit: { opacity: 0, transition: { duration: duration.press } },
};

/** A small thing arriving: rises 8 px and fades in. */
export const riseVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: transition.small },
  exit: { opacity: 0, y: 4, transition: transition.exit },
};

/** Lists: 30 ms apart, and only the first 8 items wait their turn. */
export function staggerDelay(index: number): number {
  return Math.min(index, 8) * 0.03;
}

/** The variants to actually use: the calm fade when reduced motion is on. */
export function useMotion<T extends Variants>(variants: T): Variants {
  const reduce = useReducedMotion();
  return reduce ? calmFade : variants;
}
