// Settings: rows that sit on the main list and carry their own state.

import { LOOKING_FOR_OPTIONS, type LookingFor } from "@shared/friends";
import { useLocation } from "wouter";
import { ChevronRight, Plus } from "lucide-react";
import { useTheme, type ThemePreference } from "@/hooks/use-theme";
import { useQuery } from "@tanstack/react-query";
import { ELEVATED, BORDER, MUTED, FAINT, TEXT, EMBER, MONO_EYEBROW } from "./ui";

// Love, Friends or Both (Part O): three buttons at the top of Discovery.
export function LookingForRow({ value, onChange }: { value: LookingFor; onChange: (v: LookingFor) => void }) {
  return (
    <div className="px-1 pt-1 pb-3 border-b border-vf-line mb-1" data-testid="row-looking-for">
      <div className="text-[15px] text-vf-text">Here for</div>
      <div className="text-[12.5px] text-vf-faint mt-0.5">Friends is its own space, never romantic.</div>
      <div className="grid grid-cols-3 gap-2 mt-3" role="radiogroup" aria-label="Here for">
        {LOOKING_FOR_OPTIONS.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              role="radio"
              aria-checked={on}
              onClick={() => !on && onChange(o.value)}
              className={`h-10 rounded-full text-[14px] border transition-colors ${on ? "bg-vf-ember text-vf-ink border-vf-ember font-medium" : "border-vf-line text-vf-muted hover:text-vf-text"}`}
              data-testid={`looking-for-${o.value}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function InviteRow() {
  const [, setLocation] = useLocation();
  const { data } = useQuery<{ friends: unknown[]; daysEarned: number }>({
    queryKey: ["/api/referrals/me"],
  });
  const joined = data?.friends.length ?? 0;
  const weeks = data ? Math.floor(data.daysEarned / 7) : 0;

  return (
    <button
      onClick={() => setLocation("/invite")}
      className="group w-full flex items-center gap-3 text-left"
      style={{ padding: "14px 16px" }}
      data-testid="row-referral"
    >
      <Plus className="w-5 h-5 shrink-0" style={{ color: MUTED }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: TEXT }}>Invite a friend, you both get a free week</p>
        <p style={{ ...MONO_EYEBROW, color: FAINT, marginTop: "3px" }}>
          {joined} joined · {weeks} {weeks === 1 ? "week" : "weeks"} earned
        </p>
      </div>
      <ChevronRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" style={{ color: MUTED }} />
    </button>
  );
}

// A set-once preference, not a frequent action — lives here in Settings,
// not the top nav. Ember for the active state (this isn't twin-related, so
// it doesn't borrow mint) via CSS Color 4 hsl(var(...) / alpha) rather than
// a literal rgba, so the tint stays correct if the ember token itself ever
// moves.
export function AppearanceRow() {
  const { preference, setPreference } = useTheme();
  const options: { value: ThemePreference; label: string }[] = [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];
  return (
    <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}` }} data-testid="row-appearance">
      <p style={{ ...MONO_EYEBROW, color: FAINT, marginBottom: "10px" }}>Appearance</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.value === preference;
          return (
            <button
              key={o.value}
              onClick={() => setPreference(o.value)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg btn-press transition-colors duration-150"
              style={{
                background: active ? "hsl(var(--vf-ember) / 0.14)" : ELEVATED,
                border: `1px solid ${active ? "hsl(var(--vf-ember) / 0.4)" : BORDER}`,
                color: active ? EMBER : TEXT,
              }}
              data-testid={`row-appearance-${o.value}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
