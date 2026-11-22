// Destira Crown on every screen (shared/crown.ts). One list of who wears the
// crown (/api/crown/members, ids only), cached for a minute and refreshed on
// focus, so a revoked crown disappears on the next refresh everywhere.
//
//   <CrownBadge userId={...} />   the crown mark; tap it for what it means
//   <CrownRing userId={...}>      a thin gold-to-ember ring around a photo
import { useQuery } from "@tanstack/react-query";
import { Crown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";

export const CROWN_GRADIENT = "linear-gradient(135deg, #F3D27A 0%, #E9B949 40%, #FF6B4A 100%)";
const CROWN_GOLD = "#E9B949";

export function useCrownIds(): Set<string> {
  const { user } = useAuth();
  const { data } = useQuery<{ ids: string[] }>({
    queryKey: ["/api/crown/members"],
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  return new Set(data?.ids ?? []);
}

export function useIsCrown(userId: string | null | undefined): boolean {
  const ids = useCrownIds();
  return !!userId && ids.has(userId);
}

export function CrownBadge({
  userId,
  size = 22,
  onPhoto = false,
}: {
  userId: string | null | undefined;
  size?: number;
  /** Sitting on a photo: a dark glass disc so it reads on any image. */
  onPhoto?: boolean;
}) {
  if (!useIsCrown(userId)) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="Crown member: what this means"
          data-testid="badge-crown"
          className="inline-flex items-center justify-center rounded-full shrink-0 pointer-events-auto"
          style={{
            width: size,
            height: size,
            background: onPhoto ? "rgba(12,9,16,0.55)" : "transparent",
            backdropFilter: onPhoto ? "blur(6px)" : undefined,
            border: `1px solid ${onPhoto ? "rgba(233,185,73,0.6)" : "rgba(233,185,73,0.45)"}`,
          }}
        >
          <Crown style={{ width: size * 0.58, height: size * 0.58, color: CROWN_GOLD }} strokeWidth={2.4} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-64 text-[13px] leading-[1.5]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 font-semibold mb-1">
          <Crown className="w-4 h-4" style={{ color: CROWN_GOLD }} /> Crown member
        </div>
        A member checked and approved by the Destira team. Crown never changes who you see or who can reach you.
      </PopoverContent>
    </Popover>
  );
}

/** A thin gold-to-ember ring around an avatar when the person is Crown;
 *  renders the child untouched otherwise. */
export function CrownRing({ userId, children, width = 2, rounded = "9999px" }: { userId: string | null | undefined; children: React.ReactNode; width?: number; rounded?: string }) {
  if (!useIsCrown(userId)) return <>{children}</>;
  return (
    <span className="inline-block shrink-0" style={{ padding: width, borderRadius: rounded, background: CROWN_GRADIENT }} data-testid="ring-crown">
      {children}
    </span>
  );
}
