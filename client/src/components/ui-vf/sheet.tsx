// The v2 sheet (docs/destira-upgrade-prompt.md §4.6): a bottom sheet on a
// phone, a centred panel from 640px up. One shape for every "tell me more"
// in the app (why you might click, your twin today, your first day), so
// they all open, read and close the same way.
import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VfSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  /** Mint eyebrow for anything the twin says or did. */
  tone?: "default" | "twin" | "premium";
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}

const EYEBROW_TONE = {
  default: "text-vf-faint",
  twin: "text-vf-mint",
  premium: "text-vf-gold",
} as const;

export function VfSheet({ open, onOpenChange, title, eyebrow, tone = "default", description, children, footer, className, ...rest }: VfSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed z-[71] flex flex-col bg-vf-surface text-vf-text border border-vf-line vf-e3 outline-none",
            // Phone: from the bottom, clear of the system bar.
            "inset-x-0 bottom-0 max-h-[88vh] rounded-t-[24px] pb-[env(safe-area-inset-bottom,0px)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom data-[state=open]:duration-300 data-[state=closed]:duration-200",
            // 640px and up: a centred panel.
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[min(480px,calc(100vw-48px))] sm:max-h-[80vh] sm:rounded-[24px] sm:pb-0",
            "sm:data-[state=open]:slide-in-from-bottom-4 sm:data-[state=closed]:slide-out-to-bottom-4 sm:data-[state=open]:fade-in-0 sm:data-[state=closed]:fade-out-0",
            className,
          )}
          data-testid={rest["data-testid"]}
          // No description means nothing to point at (and no Radix warning).
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          <div className="sm:hidden mx-auto mt-2.5 h-1 w-10 rounded-full bg-vf-line shrink-0" aria-hidden="true" />
          <div className="flex items-start gap-3 px-6 pt-5 sm:pt-6 pb-3 shrink-0">
            <div className="flex-1 min-w-0">
              {eyebrow && <div className={cn("vf-label mb-1.5", EYEBROW_TONE[tone])}>{eyebrow}</div>}
              <Dialog.Title className="vf-h2 text-vf-text">{title}</Dialog.Title>
              {description && <Dialog.Description className="vf-small text-vf-muted mt-1.5">{description}</Dialog.Description>}
            </div>
            <Dialog.Close
              className="shrink-0 -mr-2 -mt-1 w-11 h-11 rounded-full flex items-center justify-center text-vf-muted hover:text-vf-text hover:bg-vf-surface2 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>
          <div className="px-6 pb-6 overflow-y-auto overscroll-contain min-h-0">{children}</div>
          {footer && <div className="px-6 pb-6 pt-1 shrink-0">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
