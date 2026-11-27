// Discover: a peek at who's next, never a way to get to them. Tapping one
// only says to decide on the person in front first.

import { useToast } from "@/hooks/use-toast";
import { haptic } from "@/lib/haptics";
import { avatarColor } from "@/lib/avatar-color";

export function NextUp({ upcoming, currentName }: { upcoming: any[]; currentName: string | null | undefined }) {
  const { toast } = useToast();
  return (
      <section className="mb-10" data-testid="next-up">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <div className="vf-label text-vf-faint">Next up</div>
          <div className="text-[12px] text-vf-faint" data-testid="text-next-up-hint">
            Like or pass {(currentName || "").split(/\s+/)[0] || "this person"} to meet them
          </div>
        </div>
        <div className="flex gap-3">
          {upcoming.map((p: any) => {
            const handleTap = () => {
              haptic.pass();
              toast({
                title: `Like or pass ${(currentName || "").split(/\s+/)[0] || "this person"} first`,
                description: "Everyone gets a yes or a no before the next person comes forward.",
              });
            };
            return (
              <button
                key={p.userId}
                type="button"
                onClick={handleTap}
                className="relative w-[104px] h-[138px] rounded-[16px] overflow-hidden border border-vf-line bg-vf-surface2 shrink-0 text-left"
                aria-label={`${p.displayName || "This person"} is next`}
                data-testid={`card-upcoming-${p.userId}`}
              >
                {p.coverPhotoUrl ? (
                  <img src={p.coverPhotoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ background: avatarColor(p.userId) }}>
                    <span className="font-display text-white/90 text-4xl">{p.displayName?.[0] || "?"}</span>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-vf-scrim to-transparent pointer-events-none" />
                <div className="absolute left-2.5 right-2.5 bottom-2 font-display text-[16px] leading-none truncate" style={{ color: "#F5F0EA" }}>
                  {(p.displayName || "").split(/\s+/)[0]}{p.age ? `, ${p.age}` : ""}
                </div>
              </button>
            );
          })}
        </div>
      </section>
  );
}
