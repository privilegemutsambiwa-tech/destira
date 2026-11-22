// The bell and the "new since you last looked" markers (Part I).
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface ActivityItem {
  id: number;
  type: string;
  title: string;
  body: string;
  url: string;
  read: boolean;
  createdAt: string;
}
export type Surface = "discover" | "lounge" | "events";

const json = async <T,>(url: string, fallback: T): Promise<T> => {
  const res = await fetch(url, { credentials: "include" });
  return res.ok ? res.json() : fallback;
};

export function useActivity() {
  return useQuery<ActivityItem[]>({
    queryKey: ["/api/activity"],
    queryFn: () => json("/api/activity", []),
    staleTime: 0,
    refetchInterval: 60_000,
  });
}

export function useActivityUnread(enabled = true) {
  return useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    queryFn: () => json("/api/notifications/unread-count", { count: 0 }),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useNewSince(enabled = true) {
  return useQuery<Record<Surface, boolean>>({
    queryKey: ["/api/activity/new"],
    queryFn: () => json("/api/activity/new", { discover: false, lounge: false, events: false }),
    enabled,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Opening a surface clears its marker (and sets the mark on a first visit). */
export function useMarkSeen(surface: Surface) {
  const qc = useQueryClient();
  useEffect(() => {
    qc.setQueryData<Record<Surface, boolean>>(["/api/activity/new"], (old) => (old ? { ...old, [surface]: false } : old));
    fetch(`/api/activity/seen/${surface}`, { method: "POST", credentials: "include" }).catch(() => {});
  }, [surface, qc]);
}

export function useOpenActivityItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/notifications/${id}/read`, { method: "PUT", credentials: "include" });
    },
    onMutate: (id) => {
      qc.setQueryData<ActivityItem[]>(["/api/activity"], (old) => old?.map((n) => (n.id === id ? { ...n, read: true } : n)));
      qc.setQueryData<{ count: number }>(["/api/notifications/unread-count"], (old) => (old ? { count: Math.max(0, old.count - 1) } : old));
    },
  });
}

export function useReadAllActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await fetch("/api/activity/read-all", { method: "POST", credentials: "include" });
    },
    onMutate: () => {
      qc.setQueryData<ActivityItem[]>(["/api/activity"], (old) => old?.map((n) => ({ ...n, read: true })));
      qc.setQueryData(["/api/notifications/unread-count"], { count: 0 });
    },
  });
}
