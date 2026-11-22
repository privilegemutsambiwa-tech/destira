// Profile details as compact chips, in the fixed order from
// shared/profile-details.ts. "Prefer not to say" never shows.
import { detailChips, type ProfileDetails } from "@shared/profile-details";

export function DetailChips({
  details,
  onPhoto = false,
  max,
  className = "",
}: {
  details: ProfileDetails | null | undefined;
  /** White-on-photo styling for the Discover card. */
  onPhoto?: boolean;
  max?: number;
  className?: string;
}) {
  const chips = detailChips(details);
  if (!chips.length) return null;
  const shown = max ? chips.slice(0, max) : chips;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`} data-testid="detail-chips">
      {shown.map((c) => (
        <span
          key={c}
          className={
            onPhoto
              ? "px-2.5 py-1 rounded-full text-[12.5px] text-[#F5F0EA] border border-white/20"
              : "px-3 py-1.5 rounded-full text-[13px] text-vf-text border border-vf-line bg-vf-surface"
          }
          style={onPhoto ? { background: "rgba(26,20,24,0.45)", backdropFilter: "blur(6px)" } : undefined}
        >
          {c}
        </span>
      ))}
    </div>
  );
}
