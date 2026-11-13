// Location, asked at the moment it's needed (docs/destira-upgrade-prompt.md
// §8.2), not the moment someone arrives.
//
// LocationPermissionModal stays mounted in the shell, but it no longer asks
// anything: it only keeps foreground reporting running for members who
// already said yes (useGeolocation does the watching). The ask itself is
// LocationAskSheet, opened by whatever needs a location: "Within 20 km" on
// Discover today. It used to ask for notifications in the same breath too;
// those are asked after a first like now (lib/engagement-prompts).
import { useGeolocation } from "@/hooks/use-geolocation";
import { VfButton, VfSheet } from "@/components/ui-vf";

const STORAGE_KEY = "location_permission_asked";

export function hasLocationConsent(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "asked";
  } catch {
    return false;
  }
}

export function LocationPermissionModal() {
  useGeolocation();
  return null;
}

export function LocationAskSheet({
  open,
  onOpenChange,
  onEnabled,
  reason = "to show you people within 20 km",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnabled: () => void;
  reason?: string;
}) {
  const { enable } = useGeolocation();
  const later = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "declined");
    } catch {
      /* storage unavailable: it may ask again next time */
    }
    onOpenChange(false);
  };
  return (
    <VfSheet
      open={open}
      onOpenChange={onOpenChange}
      tone="twin"
      eyebrow="Your location"
      title="Use your location?"
      description={`Destira needs it ${reason}.`}
      data-testid="sheet-location"
      footer={
        <div className="flex flex-col gap-2">
          <VfButton
            fullWidth
            onClick={() => {
              enable();
              onOpenChange(false);
              onEnabled();
            }}
            data-testid="button-location-enable"
          >
            Use my location
          </VfButton>
          <VfButton variant="quiet" size="sm" fullWidth onClick={later} data-testid="button-location-later">
            Not now
          </VfButton>
        </div>
      }
    >
      <ul className="flex flex-col gap-2.5 vf-small text-vf-soft">
        <li>Only while the app is open.</li>
        <li>Others see a distance, or a named place like a campus or a mall. Never a map, a direction or a trail.</li>
        <li>You can hide your distance or go invisible any time in Settings.</li>
      </ul>
    </VfSheet>
  );
}
