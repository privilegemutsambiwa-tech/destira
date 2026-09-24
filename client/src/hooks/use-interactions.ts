import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useIncomingLikes() {
  return useQuery({
    queryKey: ["/api/likes/incoming"],
    queryFn: async () => {
      const res = await fetch("/api/likes/incoming", { credentials: "include" });
      if (!res.ok) return { likes: [], totalCount: 0 };
      return res.json();
    },
  });
}

export function useOutgoingLikes() {
  return useQuery({
    queryKey: ["/api/likes/outgoing"],
    queryFn: async () => {
      const res = await fetch("/api/likes/outgoing", { credentials: "include" });
      if (!res.ok) return { asks: [], totalCount: 0 };
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
      queryClient.invalidateQueries({ queryKey: ["/api/likes/outgoing"] });
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

// Free, uncounted, and permanent — a passed profile never comes back into
// Discover for this viewer. No cache invalidation needed: Discover removes
// the card from its own local state the instant the tap lands, well before
// this request resolves.
export function useDiscoverPass() {
  return useMutation({
    mutationFn: async (targetId: string) => {
      await fetch("/api/discover/pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId }),
        credentials: "include",
      });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/likes/incoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/likes/outgoing"] });
    },
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

// Free tier gets `count` with an empty list; Spark+ gets the list too — never
// a boolean "blurred" flag on individual rows, the list itself is just empty.
export function useStoryViewers(storyId: number | null) {
  return useQuery({
    queryKey: ["/api/stories", storyId, "viewers"],
    enabled: storyId !== null,
    queryFn: async () => {
      const res = await fetch(`/api/stories/${storyId}/viewers`, { credentials: "include" });
      if (!res.ok) return { count: 0, viewers: [], seeStoryEngagers: false };
      return res.json();
    },
  });
}

export function useStoryLikers(storyId: number | null) {
  return useQuery({
    queryKey: ["/api/stories", storyId, "likes"],
    enabled: storyId !== null,
    queryFn: async () => {
      const res = await fetch(`/api/stories/${storyId}/likes`, { credentials: "include" });
      if (!res.ok) return { count: 0, likers: [], seeStoryEngagers: false };
      return res.json();
    },
  });
}

export function useMarkStoryRepliesRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/stories/mine/replies/read", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to mark story replies read");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/chat/threads", "story_replies"] }),
  });
}

// Thrown by useStartInterview on a gated 403 so callers can tell "you need
// to upgrade" apart from a genuine failure instead of pattern-matching a
// generic error message.
export class UpgradeRequiredError extends Error {
  requiredTier?: string;
  constructor(message: string, requiredTier?: string) {
    super(message);
    this.name = "UpgradeRequiredError";
    this.requiredTier = requiredTier;
  }
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
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (res.status === 403 && body?.upgradeRequired) {
          throw new UpgradeRequiredError(body.message || "Upgrade required", body.requiredTier);
        }
        throw new Error(body?.message || "Failed to start interview");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/interviews"] }),
  });
}

export interface TwinTalkSummary {
  exists: boolean;
  lines?: { who: "viewer" | "target"; text: string }[];
  total?: number;
}

/** Real recap of an actual interview the caller had with `otherUserId`'s
 *  twin — { exists: false } when no real interview has happened yet, so the
 *  caller can hide the section rather than show anything invented. */
export function useTwinTalkSummary(otherUserId?: string) {
  return useQuery<TwinTalkSummary>({
    queryKey: ["/api/interviews/twin-talk", otherUserId],
    enabled: !!otherUserId,
    queryFn: async () => {
      const res = await fetch(`/api/interviews/twin-talk/${otherUserId}`, { credentials: "include" });
      if (!res.ok) return { exists: false };
      return res.json();
    },
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

export function useDiscoverProfiles(filter?: string, userLat?: number | null, userLng?: number | null) {
  const params = new URLSearchParams();
  if (filter && filter !== "all") params.set("filter", filter);
  if (userLat !== null && userLat !== undefined) params.set("lat", String(userLat));
  if (userLng !== null && userLng !== undefined) params.set("lng", String(userLng));
  const qs = params.toString();
  const url = qs ? `/api/profiles/discover?${qs}` : "/api/profiles/discover";
  return useQuery({
    queryKey: ["/api/profiles/discover", filter ?? "all", userLat ?? null, userLng ?? null],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
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
    refetchIntervalInBackground: false,
  });
}

// Marks a direct-message thread read. onMutate zeroes the unread badge in
// the chat list cache immediately, since waiting on the network round trip
// is exactly the "still shows unread after I read it" lag being fixed here.
export function useMarkThreadRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (matchId: number) => {
      const res = await fetch(`/api/matches/${matchId}/read`, {
        method: "PUT",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to mark as read");
      return res.json();
    },
    onMutate: async (matchId: number) => {
      await queryClient.cancelQueries({ queryKey: ["/api/chat/threads"] });
      const previous = queryClient.getQueriesData({ queryKey: ["/api/chat/threads"] });
      queryClient.setQueriesData({ queryKey: ["/api/chat/threads"] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((t: any) =>
          t.type === "match" && t.matchId === matchId ? { ...t, unreadCount: 0 } : t
        );
      });
      return { previous };
    },
    onError: (_err, _matchId, context) => {
      context?.previous?.forEach(([key, data]: [readonly unknown[], unknown]) => {
        queryClient.setQueryData(key, data);
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/threads"] });
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages", matchId] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/threads"] });
    },
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
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Failed to create group");
      }
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
    refetchIntervalInBackground: false,
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
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.message || "Failed to send message");
      }
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

// The group's single active invite link (or null if none has been generated
// yet) — the endpoint revokes any prior link whenever a new one is created,
// so there's never more than one live token per group.
export function useGroupInviteLink(groupId: number) {
  return useQuery({
    queryKey: ["/api/groups", groupId, "invite-links"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/invite-links`, { credentials: "include" });
      if (!res.ok) return null;
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

export type TwinMemoryFact = { id: number; userId: string; factText: string; source?: string | null; createdAt?: string | null; expiresAt?: string | null };
export type TwinMemoryData = { messages: { id: number; role: string; message: string }[]; facts: TwinMemoryFact[]; summary: { summaryText: string } | null };

export function useTwinMemory() {
  return useQuery<TwinMemoryData>({
    queryKey: ["/api/twin/memory"],
    queryFn: async () => {
      const res = await fetch("/api/twin/memory", { credentials: "include" });
      if (!res.ok) return { messages: [], facts: [], summary: null };
      const data = await res.json();
      if (Array.isArray(data)) return { messages: data, facts: [], summary: null };
      return data;
    },
  });
}

export function useTwinStructuredProfile() {
  return useQuery({
    queryKey: ["/api/twin/structured-profile"],
    queryFn: async () => {
      const res = await fetch("/api/twin/structured-profile", { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
  });
}

export function useUpdateTwinTrainingOptOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (useForTraining: boolean) => {
      const res = await fetch("/api/twin/training-opt-out", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ useForTraining }),
      });
      if (!res.ok) throw new Error("Failed to update training preference");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] }),
  });
}

export function useTwinToneProfile() {
  return useQuery({
    queryKey: ["/api/twin/tone-profile"],
    queryFn: async () => {
      const res = await fetch("/api/twin/tone-profile", { credentials: "include" });
      if (!res.ok) return { tone_style: "supportive", verbosity_level: "balanced", emoji_usage: "minimal", formality_level: "neutral" };
      return res.json();
    },
  });
}

export function useUpdateTwinToneProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (toneProfile: { tone_style: string; verbosity_level: string; emoji_usage: string; formality_level: string }) => {
      const res = await fetch("/api/twin/tone-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toneProfile),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update tone profile");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/twin/tone-profile"] });
    },
  });
}

export function useExtractTwinProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/twin/extract-profile", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to extract profile");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/twin/structured-profile"] });
    },
  });
}

export function useGenerateAboutMe() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ai/profile/generate-about-me", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to generate About Me");
      return res.json();
    },
  });
}

export function useGenerateAISummary() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ai/profile/generate-summary", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to generate summary");
      return res.json();
    },
  });
}

export function useNextQuestion() {
  return useQuery({
    queryKey: ["/api/questions/next"],
    queryFn: async () => {
      const res = await fetch("/api/questions/next", { credentials: "include" });
      if (!res.ok) return { question: null, allAnswered: false };
      return res.json();
    },
  });
}

export function useAnswerQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ questionId, answer, isPrivate }: { questionId: number; answer: string; isPrivate?: boolean }) => {
      const res = await fetch(`/api/questions/${questionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer, isPrivate }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to submit answer");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questions/next"] });
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
    },
  });
}

export function useSkipQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (questionId: number) => {
      const res = await fetch(`/api/questions/${questionId}/skip`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to skip question");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questions/next"] });
    },
  });
}

export function useQuestionsProgress() {
  return useQuery({
    queryKey: ["/api/questions"],
    queryFn: async () => {
      const res = await fetch("/api/questions", { credentials: "include" });
      if (!res.ok) return { questions: [], answeredIds: [], totalAnswered: 0, total: 0 };
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
    refetchIntervalInBackground: false,
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

export function useToggleMute(groupId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/mute`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to toggle mute");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "members"] }),
  });
}

export function useAddGroupMember(groupId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const res = await fetch(`/api/groups/${groupId}/members/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to add member");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "members"] }),
  });
}

export function useSearchGroupMessages(groupId: number, query: string) {
  return useQuery({
    queryKey: ["/api/groups", groupId, "messages", "search", query],
    queryFn: async () => {
      if (!query.trim()) return [];
      const res = await fetch(`/api/groups/${groupId}/messages/search?q=${encodeURIComponent(query)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: query.trim().length > 0,
  });
}

export function useSearchUsers(query: string) {
  return useQuery({
    queryKey: ["/api/users/search", query],
    queryFn: async () => {
      if (query.trim().length < 2) return [];
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: query.trim().length >= 2,
  });
}

export function useCreateChatRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ targetId, groupId }: { targetId: string; groupId: number }) => {
      const res = await fetch("/api/chat-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, groupId }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to send chat request");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/chat-requests"] }),
  });
}

export function useChatRequests() {
  return useQuery<any[]>({
    queryKey: ["/api/chat-requests"],
    queryFn: async () => {
      const res = await fetch("/api/chat-requests", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

export function useRespondChatRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "accept" | "decline" }) => {
      const res = await fetch(`/api/chat-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to respond to chat request");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/likes/incoming"] });
    },
  });
}

export function useCheckNickname(nickname: string) {
  return useQuery({
    queryKey: ["/api/profiles/check-nickname", nickname],
    queryFn: async () => {
      if (nickname.length < 3) return { available: false };
      const res = await fetch(`/api/profiles/check-nickname?nickname=${encodeURIComponent(nickname)}`, { credentials: "include" });
      if (!res.ok) return { available: false };
      return res.json();
    },
    enabled: nickname.length >= 3,
  });
}

export function useFeedStories() {
  return useQuery<any[]>({
    queryKey: ["/api/stories/feed"],
  });
}

export function useCreateStory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/stories", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create story");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/stories/feed"] }),
  });
}
