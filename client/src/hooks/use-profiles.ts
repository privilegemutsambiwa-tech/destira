import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type InsertProfile } from "@shared/schema";

// Records the viewer's IANA timezone once, so limit-reset copy ("resets at
// midnight") is honest to their actual clock. No-op once set.
export function useCaptureTimezone() {
  const { data: profile } = useProfile();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !profile || (profile as any).timezone) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;
    done.current = true;
    fetch("/api/profile/timezone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ timezone: tz }),
    }).catch(() => {});
  }, [profile]);
}

export function useProfile(userId?: string, opts?: { enabled?: boolean }) {
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
    enabled: opts?.enabled,
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
    // `useProfile(userId)` (e.g. the /profile/preview view of your own
    // profile) reads from ["/api/profiles", userId], a DIFFERENT cache entry
    // than ["/api/profiles/me"] — invalidating only the latter left preview
    // edits looking like they hadn't saved. Update the specific-id cache
    // directly for an instant reflect, then invalidate everything a save
    // could affect (own profile, that same by-id view, and Discover cards).
    onSuccess: (updated, variables) => {
      queryClient.setQueryData(["/api/profiles", variables.userId], (old: any) => (old ? { ...old, ...updated } : updated));
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles", variables.userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/discover"] });
    },
  });
}

export interface ProfilePrompt { q: string; a: string }

export function useUpdatePrompts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (prompts: ProfilePrompt[]) => {
      const res = await fetch("/api/profile/prompts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompts }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save prompts");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] }),
  });
}

export function useProfileWeek() {
  return useQuery<{ twinTalks: number; readsOver80: number; meetsSet: number }>({
    queryKey: ["/api/profile/week"],
    queryFn: async () => {
      const res = await fetch("/api/profile/week", { credentials: "include" });
      if (!res.ok) return { twinTalks: 0, readsOver80: 0, meetsSet: 0 };
      return res.json();
    },
  });
}

/** Another user's photos. `[]` when their profile is private (server-enforced). */
export function usePhotos(userId?: string) {
  return useQuery<any[]>({
    queryKey: ["/api/photos", userId],
    enabled: !!userId,
    queryFn: async () => {
      const res = await fetch(`/api/photos/${userId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

/** Another user's public soul-mapping text answers (for /u/:userId). Each
 *  answer carries the `questionId` it's actually joined to server-side —
 *  editing code must key off that, never off array position. */
export function usePublicAnswers(userId?: string) {
  return useQuery<Array<{ questionId: number; question: string; answer: string }>>({
    queryKey: ["/api/profiles", userId, "answers"],
    enabled: !!userId,
    queryFn: async () => {
      const res = await fetch(`/api/profiles/${userId}/answers`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

/** The groups another user is in, each flagged with whether you're also in it. */
export function useProfileGroups(userId?: string) {
  return useQuery<Array<{ id: number; name: string; iconUrl: string | null; viewerIsMember: boolean }>>({
    queryKey: ["/api/profiles", userId, "groups"],
    enabled: !!userId,
    queryFn: async () => {
      const res = await fetch(`/api/profiles/${userId}/groups`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
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
