// Choosing between a few things (docs/destira-upgrade-prompt.md §4.7):
// SegmentedControl for filters and periods, UnderlineTabs for the sections
// of a page. The selection slides between options instead of jumping.
import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { spring } from "@/lib/motion";

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /** A small figure after the label, such as an unread count. */
  count?: number;
  testId?: string;
}

interface ChoiceProps<T extends string> {
  options: ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Read by screen readers as the group's name. */
  label: string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  fullWidth = false,
}: ChoiceProps<T> & { fullWidth?: boolean }) {
  const id = useId();
  const reduce = useReducedMotion();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex max-w-full overflow-x-auto scrollbar-hide rounded-full bg-[var(--vf-elevated)] p-1",
        fullWidth && "flex w-full",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={o.testId}
            onClick={() => {
              if (active) return;
              haptic.tick();
              onChange(o.value);
            }}
            className={cn(
              "relative h-9 px-4 rounded-full text-[14px] whitespace-nowrap transition-colors duration-150",
              fullWidth && "flex-1",
              active ? "text-vf-text font-medium" : "text-vf-muted hover:text-vf-text",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={reduce ? { duration: 0 } : spring}
                className="absolute inset-0 rounded-full bg-vf-surface vf-e1 border border-vf-line"
                aria-hidden="true"
              />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              {o.label}
              {o.count != null && o.count > 0 && <span className="vf-figure text-[12px] text-vf-ember">{o.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function UnderlineTabs<T extends string>({ options, value, onChange, label, className }: ChoiceProps<T>) {
  const id = useId();
  const reduce = useReducedMotion();
  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-6 border-b border-vf-line overflow-x-auto scrollbar-hide", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={o.testId}
            onClick={() => {
              if (active) return;
              haptic.tick();
              onChange(o.value);
            }}
            className={cn(
              "relative h-11 text-[15px] whitespace-nowrap transition-colors duration-150",
              active ? "text-vf-text font-medium" : "text-vf-muted hover:text-vf-text",
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              {o.label}
              {o.count != null && o.count > 0 && <span className="vf-figure text-[12px] text-vf-faint">{o.count}</span>}
            </span>
            {active && (
              <motion.span
                layoutId={`tab-${id}`}
                transition={reduce ? { duration: 0 } : spring}
                className="absolute left-0 right-0 -bottom-px h-[2px] rounded-full bg-vf-ember"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
