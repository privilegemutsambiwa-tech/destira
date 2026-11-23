import { useQuery } from "@tanstack/react-query";
import type { VouchPublic } from "@shared/vouches";

/** The vouches someone chose to show on their profile (at most 3). */
export function useVouchesFor(userId: string) {
  return useQuery<VouchPublic[]>({ queryKey: [`/api/vouches/for/${userId}`], enabled: !!userId });
}
