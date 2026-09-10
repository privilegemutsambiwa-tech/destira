import { useQuery } from "@tanstack/react-query";
import type { Feature } from "@shared/entitlements";

export interface GateState {
  ok: boolean;
  tier: string;
  limit: number | null;
  used?: number;
  resetAt?: string;
  requiredTier?: string;
  message?: string;
  /** contextual copy, composed server-side from the same map (shared/entitlements gateCopy) */
  action?: string;
  line?: string;
  requiredTierName?: string;
  requiredPrice?: string;
}

// Whether the current user can use a gated feature right now. Cheap, cached,
// and the same result the server enforces.
export function useGate(feature: Feature) {
  return useQuery<GateState>({
    queryKey: ["/api/gate", feature],
    queryFn: async () => {
      const res = await fetch(`/api/gate/${feature}`, { credentials: "include" });
      if (!res.ok) return { ok: true, tier: "free", limit: null }; // fail open on the client; the server still enforces
      return res.json();
    },
    staleTime: 60_000,
  });
}

export function resetLabel(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const h = d.getHours();
  if (h === 0) return "at midnight";
  return `at ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}
