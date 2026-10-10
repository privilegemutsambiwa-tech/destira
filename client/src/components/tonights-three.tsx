// "Tonight's three": three people picked for this member, released at 19:00
// Harare time every day (server/daily-picks.ts). Before the first release it
// only shows when the next set arrives, so there's a reason to come back.
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { withFrom } from "@/lib/from-route";
import { avatarColor } from "@/lib/avatar-color";

interface DailyPick {
  userId: string;
  displayName: string;
  age: number | null;
  location: string | null;
  photoUrl: string | null;
  reasons: string[];
  status: "open" | "liked" | "passed";
}
interface DailyPicksView {
  pickDate: string;
  nextReleaseAt: string;
  picks: DailyPick[];
}

function releaseLabel(iso: string): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const today = new Date();
  return at.toDateString() === today.toDateString() ? `tonight at ${time}` : `tomorrow at ${time}`;
}

export function TonightsThree() {
  const [, setLocation] = useLocation();
  const { data } = useQuery<DailyPicksView>({
    queryKey: ["/api/daily-picks"],
    queryFn: async () => {
      const res = await fetch("/api/daily-picks", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load picks");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  if (!data) return null;

  if (data.picks.length === 0) {
    return (
      <div className="mb-5 rounded-[20px] border border-vf-line bg-vf-surface2 px-5 py-4" data-testid="tonights-three-upcoming">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-mint">Tonight's three</div>
        <p className="text-[14px] text-vf-text mt-1">
          Three people picked for you, every evening. Your first set arrives {releaseLabel(data.nextReleaseAt)}.
        </p>
      </div>
    );
  }

  const openCount = data.picks.filter((p) => p.status === "open").length;

  return (
    <div className="mb-5 rounded-[20px] border border-vf-line bg-vf-surface2 p-5" data-testid="tonights-three">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-mint">Tonight's three</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-vf-faint">
          Next {releaseLabel(data.nextReleaseAt)}
        </div>
      </div>
      <h3 className="font-serif text-[22px] leading-tight text-vf-text mt-1">
        {openCount === 0 ? "You've seen all three" : "Picked for you tonight"}
      </h3>

      <div className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-3 max-w-[480px]">
        {data.picks.map((p) => (
          <button
            key={p.userId}
            onClick={() => setLocation(withFrom(`/u/${p.userId}`, "/discover"))}
            className={`text-left group ${p.status === "passed" ? "opacity-45" : ""}`}
            data-testid={`tonights-three-pick-${p.userId}`}
          >
            <div className="relative aspect-[3/4] rounded-[14px] overflow-hidden border border-vf-line bg-vf-surface">
              {p.photoUrl ? (
                <img src={p.photoUrl} alt={p.displayName} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
              ) : (
                <div className="w-full h-full flex items-center justify-center" style={{ background: avatarColor(p.userId) }}>
                  <span className="font-serif text-[34px] text-white/85">{p.displayName[0]?.toUpperCase() ?? "?"}</span>
                </div>
              )}
              {p.status === "liked" && (
                <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-vf-ink/80 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-vf-mint">
                  <Check className="w-3 h-3" /> Liked
                </span>
              )}
            </div>
            <div className="mt-2 text-[13.5px] text-vf-text truncate">
              {p.displayName}{p.age ? `, ${p.age}` : ""}
            </div>
            <div className="text-[11.5px] leading-[1.35] text-vf-muted line-clamp-2">
              {p.reasons[0] ?? p.location ?? "Picked for you"}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
