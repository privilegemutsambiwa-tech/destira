import { useSyncExternalStore } from "react";
import { Browser } from "@capacitor/browser";
import { Download, RefreshCw } from "lucide-react";
import {
  clearOffer,
  getUpdateOffer,
  restartIntoUpdate,
  snoozeAppUpdate,
  subscribeUpdateOffer,
  type UpdateOffer,
} from "@/lib/app-update";

/** In the app: tells the member an update is ready (lib/app-update.ts). */
export function AppUpdatePrompt() {
  const offer = useSyncExternalStore(subscribeUpdateOffer, getUpdateOffer, () => null);
  if (!offer) return null;
  return <Prompt key={offer.kind === "app" ? `app-${offer.versionCode}` : offer.id} offer={offer} />;
}

function Prompt({ offer }: { offer: UpdateOffer }) {
  const close = () => {
    if (offer.kind === "app") snoozeAppUpdate(offer.versionCode);
    // Screens: already queued for the next launch.
    clearOffer();
  };
  const accept = () => {
    if (offer.kind === "app") {
      // Opens the download in the phone's browser; Android then offers to
      // install it over this app (same signing key, so nothing is lost).
      Browser.open({ url: offer.url }).catch(() => window.open(offer.url, "_blank"));
      snoozeAppUpdate(offer.versionCode);
      clearOffer();
    } else {
      restartIntoUpdate(offer.id);
    }
  };

  const app = offer.kind === "app";
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", paddingBottom: "max(1rem, calc(env(safe-area-inset-bottom) + 1rem))" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-update-title"
      data-testid="app-update-prompt"
    >
      <div className="w-full max-w-sm rounded-2xl p-6 bg-vf-surface2 border border-vf-line shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
        <div className="w-11 h-11 rounded-full bg-vf-ember/15 text-vf-ember flex items-center justify-center mb-4">
          {app ? <Download className="w-5 h-5" /> : <RefreshCw className="w-5 h-5" />}
        </div>
        <h3 id="app-update-title" className="font-serif text-[22px] leading-tight text-vf-text mb-2">
          {app ? `Destira ${offer.versionName} is here` : "An update is ready"}
        </h3>
        <p className="text-[13.5px] text-vf-muted mb-5 leading-relaxed">
          {app
            ? "Download the new version and install it over this one. Your account, chats and settings stay as they are."
            : "Restart Destira to get the latest fixes and improvements. It only takes a second."}
        </p>
        <button
          onClick={accept}
          className="w-full h-11 rounded-xl font-medium text-vf-ink bg-vf-ember mb-2.5 text-[14px]"
          data-testid="button-app-update"
        >
          {app ? "Download update" : "Restart now"}
        </button>
        <button
          onClick={close}
          className="w-full text-[13px] font-medium text-vf-faint hover:text-vf-text transition-colors"
          data-testid="button-app-update-later"
        >
          Later
        </button>
      </div>
    </div>
  );
}
