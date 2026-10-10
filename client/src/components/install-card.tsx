// "Add Destira to your home screen" — only where the browser can actually do
// it in one tap (Chrome, Edge, Samsung Internet fire beforeinstallprompt).
// iPhone has no such API; the iOS path lives in <PushNudge />, where it's tied
// to the one thing installing actually unlocks there (notifications).
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { canPromptInstall, isStandalone, onInstallAvailabilityChange, promptInstall, snooze, snoozedUntil } from "@/lib/engagement-prompts";

const SNOOZE_KEY = "vf_install_snooze_until";

export function InstallCard() {
  const [available, setAvailable] = useState(() => canPromptInstall());
  const [hidden, setHidden] = useState(() => snoozedUntil(SNOOZE_KEY) || isStandalone());

  useEffect(() => onInstallAvailabilityChange(() => setAvailable(canPromptInstall())), []);

  if (!available || hidden) return null;

  return (
    <div className="mb-5 rounded-[20px] border border-vf-line bg-vf-surface2 px-5 py-4 flex items-center gap-3.5" data-testid="install-card">
      <span className="w-10 h-10 rounded-[12px] bg-vf-ember/10 text-vf-ember flex items-center justify-center shrink-0">
        <Download className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] text-vf-text">Add Destira to your home screen</div>
        <div className="text-[12.5px] text-vf-muted">Opens like an app, in one tap. No app store, nothing to download.</div>
      </div>
      <button
        onClick={async () => {
          const accepted = await promptInstall();
          if (!accepted) snooze(SNOOZE_KEY, 14);
          setHidden(true);
        }}
        className="h-9 px-4 rounded-full bg-vf-ember text-vf-ink font-semibold text-[13px] btn-press shrink-0"
        data-testid="install-card-add"
      >
        Add
      </button>
      <button
        onClick={() => {
          snooze(SNOOZE_KEY, 14);
          setHidden(true);
        }}
        className="text-vf-faint hover:text-vf-text shrink-0"
        aria-label="Not now"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
