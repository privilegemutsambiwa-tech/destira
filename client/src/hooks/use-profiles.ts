import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type InsertProfile } from "@shared/schema";

export function useProfile(userId?: string) {
  const url = userId ? `/api/profiles/${userId}` : "/api/profiles/me";
  const key = userId ? ["/api/profiles", userId] : ["/api/profiles/me"];

  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    },
  });
}

export function useCreateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create profile");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: Partial<InsertProfile> }) => {
      const res = await fetch(`/api/profiles/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update profile");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
    },
  });
}

export function useGenerateTwin() {
  return useMutation({
    mutationFn: async (answers: any) => {
      const res = await fetch("/api/profiles/generate-twin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to generate Twin");
      return res.json();
    }
  });
}
