import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useIncomingLikes() {
  return useQuery({
    queryKey: ["/api/likes/incoming"],
    queryFn: async () => {
      const res = await fetch("/api/likes/incoming", { credentials: "include" });
      if (!res.ok) return { likes: [], totalCount: 0, isBlurred: true, tier: "free" };
      return res.json();
    },
  });
}

export function useLikeBack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (matchId: number) => {
      const res = await fetch(`/api/likes/${matchId}/like-back`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to like back");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/likes/incoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
    },
  });
}

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

export function useSoftDeleteChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (matchId: number) => {
      const res = await fetch(`/api/matches/${matchId}/soft-delete`, {
        method: "PUT",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete chat");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/matches"] }),
  });
}

export function useUnmatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (matchId: number) => {
      const res = await fetch(`/api/matches/${matchId}/unmatch`, {
        method: "PUT",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to unmatch");
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

export function useChatThreads(filter?: string) {
  return useQuery({
    queryKey: ["/api/chat/threads", filter],
    queryFn: async () => {
      const url = filter && filter !== "all" ? `/api/chat/threads?filter=${filter}` : "/api/chat/threads";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
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

export function useGroups(search?: string, filter?: string) {
  return useQuery({
    queryKey: ["/api/lounge/groups", search, filter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filter && filter !== "all") params.set("filter", filter);
      const url = `/api/lounge/groups?${params.toString()}`;
      const res = await fetch(url, { credentials: "include" });
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

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; description: string; type?: string; privacyMode?: string; categoryTags?: string[] }) => {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create group");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/groups"] }),
  });
}

export function useUpdateGroup(groupId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/groups/${groupId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update group");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
    },
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: number) => {
      const res = await fetch(`/api/groups/${groupId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete group");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/groups"] }),
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

export function useLeaveGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: number) => {
      const res = await fetch(`/api/groups/${groupId}/leave`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to leave group");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/groups"] }),
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
    mutationFn: async (data: string | { content: string; contentType?: string; mediaUrl?: string; replyToMessageId?: number }) => {
      const body = typeof data === "string" ? { content: data } : data;
      const res = await fetch(`/api/groups/${groupId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "messages"] }),
  });
}

export function useDeleteGroupMessage(groupId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: number) => {
      const res = await fetch(`/api/groups/${groupId}/messages/${messageId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete message");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "messages"] }),
  });
}

export function useRemoveGroupMember(groupId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const res = await fetch(`/api/groups/${groupId}/members/${targetUserId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove member");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] }),
  });
}

export function useUpdateMemberRole(groupId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ targetUserId, role }: { targetUserId: string; role: string }) => {
      const res = await fetch(`/api/groups/${groupId}/members/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, role }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update role");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] }),
  });
}

export function useCreateInviteLink(groupId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/invite-link`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create invite link");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "invite-links"] }),
  });
}

export function useGroupInviteLinks(groupId: number) {
  return useQuery({
    queryKey: ["/api/groups", groupId, "invite-links"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/invite-links`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

export function useJoinRequests(groupId: number) {
  return useQuery({
    queryKey: ["/api/groups", groupId, "join-requests"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/join-requests`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

export function useProcessJoinRequest(groupId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, status }: { requestId: number; status: string }) => {
      const res = await fetch(`/api/groups/${groupId}/join-requests/${requestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to process request");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "join-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
    },
  });
}

export function useTwinChat() {
  return useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch("/api/twin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to chat with twin");
      return res.json();
    },
  });
}

export function useTwinMemory() {
  return useQuery({
    queryKey: ["/api/twin/memory"],
    queryFn: async () => {
      const res = await fetch("/api/twin/memory", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30000,
  });
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ["/api/notifications/unread-count"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/unread-count", { credentials: "include" });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    refetchInterval: 30000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: "PUT",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to mark read");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });
}

export function useSubscription() {
  return useQuery({
    queryKey: ["/api/subscription"],
    queryFn: async () => {
      const res = await fetch("/api/subscription", { credentials: "include" });
      if (!res.ok) return { tier: "free", status: "active" };
      return res.json();
    },
  });
}

export function useEntitlements() {
  return useQuery({
    queryKey: ["/api/entitlements"],
    queryFn: async () => {
      const res = await fetch("/api/entitlements", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

export function useGenerateSummary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/profiles/generate-summary", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to generate summary");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] }),
  });
}

export function useEnrichedGroupMessages(groupId: number) {
  return useQuery({
    queryKey: ["/api/groups", groupId, "messages-enriched"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/messages-enriched`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 5000,
  });
}

export function useCreatePoll(groupId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { question: string; options: string[]; allowMultiple: boolean }) => {
      const res = await fetch(`/api/groups/${groupId}/polls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create poll");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "messages-enriched"] }),
  });
}

export function usePollByMessage(messageId: number) {
  return useQuery({
    queryKey: ["/api/messages", messageId, "poll"],
    queryFn: async () => {
      const res = await fetch(`/api/messages/${messageId}/poll`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });
}

export function useVotePoll(groupId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pollId, optionId, messageId }: { pollId: number; optionId: number; messageId: number }) => {
      const res = await fetch(`/api/polls/${pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to vote");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages", variables.messageId, "poll"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "messages-enriched"] });
    },
  });
}

export function useAddReaction(groupId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, reaction }: { messageId: number; reaction: string }) => {
      const res = await fetch(`/api/messages/${messageId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reaction }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to add reaction");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "messages-enriched"] }),
  });
}

export function useRemoveReaction(groupId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, reaction }: { messageId: number; reaction: string }) => {
      const res = await fetch(`/api/messages/${messageId}/reactions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reaction }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove reaction");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "messages-enriched"] }),
  });
}

export function useDeleteOwnMessage(groupId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: number) => {
      const res = await fetch(`/api/messages/${messageId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete message");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "messages-enriched"] }),
  });
}

export function useGroupMedia(groupId: number) {
  return useQuery({
    queryKey: ["/api/groups", groupId, "media"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/media`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

export function useGroupMembers(groupId: number) {
  return useQuery({
    queryKey: ["/api/groups", groupId, "members"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/members`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

export function useProfileCompletion() {
  return useQuery({
    queryKey: ["/api/profiles/me/completion"],
    queryFn: async () => {
      const res = await fetch("/api/profiles/me/completion", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });
}

export function useStarMessage(groupId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId }: { messageId: number }) => {
      const res = await fetch(`/api/messages/${messageId}/star`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to star");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "starred"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "messages-enriched"] });
    },
  });
}

export function useUnstarMessage(groupId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId }: { messageId: number }) => {
      const res = await fetch(`/api/messages/${messageId}/star`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to unstar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "starred"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "messages-enriched"] });
    },
  });
}

export function useStarredMessages(groupId: number) {
  return useQuery({
    queryKey: ["/api/groups", groupId, "starred"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/starred`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

export function useUpdateGroupSettings(groupId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: Record<string, any>) => {
      const res = await fetch(`/api/groups/${groupId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update settings");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] }),
  });
}
