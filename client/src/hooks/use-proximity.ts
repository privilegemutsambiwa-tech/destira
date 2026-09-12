import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface ProximityAlert {
  id: string;
  kind: "proximity";
  createdAt: string | null;
  seenAt: string | null;
  place: { label: string; type: string };
  distanceBucket: string;
  distanceLabel: string;
  freshness: string;
  read: { kind: "preference_match"; line: string };
  locked?: { reason: "tier"; requiredTier: string; line: string };
  subject?: { userId: string; firstName: string; portraitUrl: string | null; profileUrl: string };
  actions: string[];
}

export interface ProximityAlertsResponse {
  alerts: ProximityAlert[];
  canSeeIdentity: boolean;
  upsell: { kind: string; line: string; href: string } | null;
}

const KEY = ["/api/proximity/alerts"];

export function useProximityAlerts(enabled = true) {
  return useQuery<ProximityAlertsResponse>({
    queryKey: KEY,
    queryFn: async () => {
      const res = await fetch("/api/proximity/alerts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load proximity alerts");
      return res.json();
    },
    enabled,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function useMarkAlertSeen() {
  return useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/proximity/alerts/${id}/seen`),
  });
}

export function useDismissAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/proximity/alerts/${id}/dismiss`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDismissProximityUpsell() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest("POST", "/api/reminders/proximity_upsell/dismiss"),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
