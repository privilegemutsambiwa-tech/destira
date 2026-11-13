// Buttons and icon buttons (docs/destira-upgrade-prompt.md §4.7). One family:
// every screen picks a variant and a size, never its own colours or padding.
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "twin" | "destructive" | "premium";
export type ButtonSize = "lg" | "md" | "sm";

const VARIANTS: Record<ButtonVariant, string> = {
  // Ember: the human action. text-vf-ink is near-black on dark, near-white on light.
  primary: "bg-vf-ember text-vf-ink hover:bg-[var(--vf-ember-soft)] font-semibold",
  secondary: "border border-vf-line text-vf-text hover:bg-[var(--vf-elevated)] font-medium",
  quiet: "text-vf-text hover:bg-[var(--vf-elevated)] font-medium",
  // Mint: only for things the twin does.
  twin: "bg-vf-mint/10 text-vf-mint border border-vf-mint/25 hover:bg-vf-mint/15 font-medium",
  destructive: "border border-[color:var(--vf-danger)] text-[color:var(--vf-danger)] hover:bg-[var(--vf-elevated)] font-medium",
  // Gold: premium only.
  premium: "border border-vf-gold/55 text-vf-gold hover:bg-vf-gold/10 font-medium",
};

const SIZES: Record<ButtonSize, string> = {
  lg: "h-[52px] px-6 text-[16px] gap-2",
  md: "h-11 px-5 text-[15px] gap-2",
  sm: "h-9 px-4 text-[14px] gap-1.5",
};

export interface VfButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and keeps the button's width, so nothing jumps. */
  loading?: boolean;
  fullWidth?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export const VfButton = forwardRef<HTMLButtonElement, VfButtonProps>(function VfButton(
  { variant = "primary", size = "md", loading = false, fullWidth = false, leading, trailing, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "vf-press relative inline-flex items-center justify-center rounded-full whitespace-nowrap transition-colors duration-150",
        "disabled:opacity-45 disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      <span className={cn("inline-flex items-center justify-center gap-[inherit]", loading && "invisible")}>
        {leading}
        {children}
        {trailing}
      </span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <Loader2 className="w-[1.1em] h-[1.1em] animate-spin" />
        </span>
      )}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon alone says nothing to a screen reader. */
  label: string;
  variant?: "quiet" | "secondary" | "primary" | "twin";
  /** Visual size; the touch target is never smaller than 44 px. */
  size?: 36 | 44 | 52;
}

const ICON_VARIANTS = {
  quiet: "text-vf-muted hover:text-vf-text hover:bg-[var(--vf-elevated)]",
  secondary: "border border-vf-line text-vf-text hover:bg-[var(--vf-elevated)]",
  primary: "bg-vf-ember text-vf-ink hover:bg-[var(--vf-ember-soft)]",
  twin: "bg-vf-mint/10 text-vf-mint border border-vf-mint/25 hover:bg-vf-mint/15",
} as const;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = "quiet", size = 44, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "vf-press relative inline-flex items-center justify-center rounded-full shrink-0 transition-colors duration-150",
        "disabled:opacity-45 disabled:cursor-not-allowed",
        // A 36 px button still gets a 44 px target via an invisible halo.
        size === 36 && "w-9 h-9 before:absolute before:-inset-1 before:content-['']",
        size === 44 && "w-11 h-11",
        size === 52 && "w-[52px] h-[52px]",
        ICON_VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
