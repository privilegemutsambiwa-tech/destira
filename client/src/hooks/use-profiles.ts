import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type InsertProfile } from "@shared/schema";
import { useGroups, useTwinStructuredProfile } from "@/hooks/use-interactions";

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
  return useQuery<Array<{ id: number; name: string; iconUrl: string | null; viewerIsMember: boolean; categoryTags: string[] | null }>>({
    queryKey: ["/api/profiles", userId, "groups"],
    enabled: !!userId,
    queryFn: async () => {
      const res = await fetch(`/api/profiles/${userId}/groups`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

function tagsOverlap(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  if (!a?.length || !b?.length) return false;
  const bLower = b.map((t) => t.toLowerCase());
  return a.some((t) => {
    const lower = t.toLowerCase();
    return bLower.some((other) => other === lower || other.includes(lower) || lower.includes(other));
  });
}

export type SuggestedLounge = { id: number; name: string; reason: "mutual" | "their-interest" | "suggested" };

const MAX_SUGGESTED_LOUNGES = 3;

/** A lower-pressure first step than a cold 1:1 thread — never a replacement
 *  for the 1:1 chat, just an option alongside it. As the platform grows a
 *  suitor may well be in several groups worth suggesting, not just one, so
 *  this returns up to three, ranked:
 *   1. Every Lounge this pair already shares (the strongest signal).
 *   2. Lounges the OTHER person is already in that overlap the viewer's own
 *      AI-Twin interests (twinProfilesStructured.interests vs. the group's
 *      categoryTags) — "your suitor is in a room you'd probably like too",
 *      not just a same-city guess.
 *   3. One curated official Lounge near the viewer, only if the above found
 *      nothing at all.
 *  Shared by DirectChat's ongoing strip and the match-celebration moment,
 *  so "meet in a group first" reads the same wherever it shows up. */
export function useSuggestedLounges(otherUserId?: string): { lounges: SuggestedLounge[] } {
  const { data: myProfile } = useProfile();
  const { data: myStructured } = useTwinStructuredProfile();
  const { data: theirGroups } = useProfileGroups(otherUserId);
  const { data: officialLounges } = useGroups(undefined, "official");

  const mutual = (theirGroups || []).filter((g) => g.viewerIsMember);
  const myInterests: string[] = Array.isArray((myStructured as any)?.interests) ? (myStructured as any).interests : [];
  const seen = new Set(mutual.map((g) => g.id));
  const interestMatches = (theirGroups || []).filter((g) => !seen.has(g.id) && tagsOverlap(myInterests, g.categoryTags));
  interestMatches.forEach((g) => seen.add(g.id));

  const lounges: SuggestedLounge[] = [
    ...mutual.map((g) => ({ id: g.id, name: g.name, reason: "mutual" as const })),
    ...interestMatches.map((g) => ({ id: g.id, name: g.name, reason: "their-interest" as const })),
  ];

  if (lounges.length === 0) {
    const myCity = (myProfile as any)?.locationName || (myProfile as any)?.location || null;
    const fallback = (officialLounges || []).find((g: any) => myCity && g.locationLabel === myCity) || (officialLounges || [])[0];
    if (fallback) lounges.push({ id: fallback.id, name: fallback.name, reason: "suggested" });
  }

  return { lounges: lounges.slice(0, MAX_SUGGESTED_LOUNGES) };
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
