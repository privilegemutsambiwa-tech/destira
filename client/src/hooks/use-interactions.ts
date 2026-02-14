import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { buildUrl } from "@shared/routes";

export function useMatches() {
  return useQuery({
    queryKey: ["/api/matches"],
    queryFn: async () => {
      const res = await fetch("/api/matches", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch matches");
      return res.json();
    },
  });
}

export function useCreateMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (targetId: string) => {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to request match");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/matches"] }),
  });
}

export function useRespondToMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ matchId, action }: { matchId: number; action: "accept" | "reject" }) => {
      const res = await fetch(`/api/matches/${matchId}/respond`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to respond to match");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/matches"] }),
  });
}

export function useInterviews() {
  return useQuery({
    queryKey: ["/api/interviews"],
    queryFn: async () => {
      const res = await fetch("/api/interviews", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch interviews");
      return res.json();
    },
  });
}

export function useStartInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (targetId: string) => {
      const res = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to start interview");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/interviews"] }),
  });
}

export function useInterviewChat(interviewId: number) {
  return useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch(`/api/interviews/${interviewId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
  });
}

export function useDiscoverProfiles() {
  return useQuery({
    queryKey: ["/api/profiles/discover"],
    queryFn: async () => {
      const res = await fetch("/api/profiles/discover", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch profiles");
      return res.json();
    },
  });
}

export function useDirectMessages(matchId: number) {
  return useQuery({
    queryKey: ["/api/messages", matchId],
    queryFn: async () => {
      const res = await fetch(`/api/messages/${matchId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 5000,
  });
}

export function useSendDirectMessage(matchId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/messages/${matchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/messages", matchId] }),
  });
}

export function useGroups() {
  return useQuery({
    queryKey: ["/api/groups"],
    queryFn: async () => {
      const res = await fetch("/api/groups", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch groups");
      return res.json();
    },
  });
}

export function useGroup(id: number) {
  return useQuery({
    queryKey: ["/api/groups", id],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch group");
      return res.json();
    },
  });
}

export function useJoinGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: number) => {
      const res = await fetch(`/api/groups/${groupId}/join`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to join group");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
    },
  });
}

export function useGroupMessages(groupId: number) {
  return useQuery({
    queryKey: ["/api/groups", groupId, "messages"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/messages`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 5000,
  });
}

export function useSendGroupMessage(groupId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/groups/${groupId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "messages"] }),
  });
}
