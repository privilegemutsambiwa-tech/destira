import { useState } from "react";
import { useLocation } from "wouter";
import { Smartphone, Monitor } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import ProfileView from "./ProfileView";

const BAR_HEIGHT = 52;

/** /profile/preview — the real /u/:userId component, mounted on your own id
 *  with an editing layer on top (see ProfileView's `preview` prop). This bar
 *  is the only chrome around it: no left rail / bottom tabs, so it's never
 *  mistaken for the app itself, and it stays fixed so it's never mistaken
 *  for profile content either. */
export default function ProfilePreview() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [device, setDevice] = useState<"phone" | "desktop">("phone");

  if (!user?.id) return null;

  return (
    <div className="min-h-dvh bg-vf-ink">
      <div
        className="fixed top-0 inset-x-0 z-[100] flex items-center justify-between gap-3 px-4 sm:px-6 border-b border-vf-line bg-vf-surface/95 backdrop-blur"
        style={{
          height: `calc(${BAR_HEIGHT}px + env(safe-area-inset-top, 0px))`,
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
        data-testid="bar-profile-preview"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-text shrink-0">
            How others see you
          </span>
          <span className="hidden sm:inline font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint truncate">
            Someone new · not matched · Free
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center rounded-full border border-vf-line p-0.5">
            <button
              onClick={() => setDevice("phone")}
              aria-pressed={device === "phone"}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-[12px] font-mono uppercase tracking-[0.1em] transition-colors ${
                device === "phone" ? "bg-vf-ember text-vf-ink" : "text-vf-muted hover:text-vf-text"
              }`}
              data-testid="button-preview-device-phone"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Phone</span>
            </button>
            <button
              onClick={() => setDevice("desktop")}
              aria-pressed={device === "desktop"}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-[12px] font-mono uppercase tracking-[0.1em] transition-colors ${
                device === "desktop" ? "bg-vf-ember text-vf-ink" : "text-vf-muted hover:text-vf-text"
              }`}
              data-testid="button-preview-device-desktop"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Desktop</span>
            </button>
          </div>
          <button
            onClick={() => setLocation("/profile")}
            className="inline-flex items-center rounded-full bg-vf-ember text-vf-ink font-bold px-4 h-9 text-[13px] btn-press hover:bg-[var(--vf-ember-soft)] transition-colors"
            data-testid="button-preview-done"
          >
            Done
          </button>
        </div>
      </div>

      {/* Offset the content, never overlay it. */}
      <div style={{ paddingTop: `calc(${BAR_HEIGHT}px + env(safe-area-inset-top, 0px))` }}>
        {device === "phone" ? (
          <div className="flex justify-center py-6 px-4">
            {/* A real narrow viewport, not just a narrow column — Tailwind's
                lg: breakpoints are media queries against the actual browser
                width, so squeezing ProfileView into a div wouldn't switch it
                to its mobile layout. This iframe genuinely has its own. */}
            <iframe
              src="/profile/preview/frame"
              title="How your profile looks on a phone"
              className="rounded-[36px] border-[6px] border-vf-line bg-vf-ink shadow-2xl"
              style={{ width: 390, height: "calc(100dvh - 140px)", colorScheme: "normal" }}
              data-testid="frame-preview-phone"
            />
          </div>
        ) : (
          <ProfileView userId={user.id} preview />
        )}
      </div>
    </div>
  );
}
