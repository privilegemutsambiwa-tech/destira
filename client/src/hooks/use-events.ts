import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export type SeatModel = "open" | "capped" | "curated";
export type AttendeeStatus = "going" | "waitlisted" | "requested" | "declined" | "cancelled";

export interface EventResonance {
  goingCount: number;
  highReadCount: number;
  notableAttendees: { id: string; name: string; avatarUrl: string | null; score: number }[];
}

export interface EventItem {
  id: number;
  groupId: number | null;
  hostUserId: string;
  title: string;
  description: string | null;
  venueName: string | null;
  suburb: string | null;
  city: string | null;
  startsAt: string;
  endsAt: string | null;
  seatModel: SeatModel;
  seatCount: number | null;
  emberFirstPick: boolean;
  coverImageUrl: string | null;
  status: string;
  resonance: EventResonance;
  myStatus: AttendeeStatus | null;
  // Only known right after this session's own attend call returns it — the
  // list/detail GET endpoints don't compute per-viewer waitlist position, so
  // this is undefined on a fresh page load even while myStatus is
  // 'waitlisted'. See use-events.ts's useAttendEvent onSuccess.
  myWaitlistPosition?: number;
  // v2 — present on /feed and /search rows
  kind?: string | null;
  vibes?: string[] | null;
  placeType?: string | null;
  distanceKm?: number;
  fitScore?: number;
  cancelReason?: string | null;
}

interface FeedResponse {
  events: EventItem[];
  moreThanShown: boolean;
}

export function useEvents() {
  return useQuery<EventItem[]>({
    queryKey: ["/api/events"],
    queryFn: async () => {
      const res = await fetch("/api/events", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

// The default Events view — filtered by the caller's saved event_preferences,
// sorted by fit, capped at 30.
export function useEventsFeed() {
  return useQuery<FeedResponse>({
    queryKey: ["/api/events/feed"],
    queryFn: async () => {
      const res = await fetch("/api/events/feed", { credentials: "include" });
      if (!res.ok) return { events: [], moreThanShown: false };
      return res.json();
    },
  });
}

export interface EventSearchParams {
  q?: string;
  kind?: string[];
  placeType?: string[];
  distanceKm?: number;
  when?: "any" | "week" | "weekend" | "month";
  sober?: boolean;
  stepFree?: boolean;
}

export function searchParamsToQuery(p: EventSearchParams): string {
  const qs = new URLSearchParams();
  if (p.q) qs.set("q", p.q);
  (p.kind ?? []).forEach((k) => qs.append("kind", k));
  (p.placeType ?? []).forEach((k) => qs.append("placeType", k));
  if (p.distanceKm) qs.set("distanceKm", String(p.distanceKm));
  if (p.when && p.when !== "any") qs.set("when", p.when);
  if (p.sober) qs.set("sober", "true");
  if (p.stepFree) qs.set("stepFree", "true");
  return qs.toString();
}

// Explicit search — ignores preferences, sorts by date. Keeps the previous
// results on screen while a new query loads (no empty flash mid-type).
export function useEventSearch(params: EventSearchParams, enabled: boolean) {
  const query = searchParamsToQuery(params);
  return useQuery<FeedResponse>({
    queryKey: ["events-search", query],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/events/search?${query}`, { credentials: "include", signal });
      if (!res.ok) return { events: [], moreThanShown: false };
      return res.json();
    },
  });
}

export interface HostEventInput {
  title: string;
  description?: string;
  kind: string;
  vibes: string[];
  placeType: string;
  venueName?: string;
  suburb: string;
  city: string;
  startsAt: string; // ISO
  endsAt?: string | null;
  seatModel: SeatModel;
  seatCount?: number | null;
  isSober: boolean;
  accessibility: string[];
  visibility: "public" | "group" | "invite";
  groupId?: number | null;
}

export interface MyEvent extends EventItem {
  goingCount: number;
  cancelReason: string | null;
  createdByUserId: string | null;
}

// Everything the current user hosts or created — any status, soonest first.
export function useMyEvents() {
  return useQuery<MyEvent[]>({
    queryKey: ["/api/events/mine"],
    queryFn: async () => {
      const res = await fetch("/api/events/mine", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

export function useHostEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: HostEventInput) => {
      const res = await fetch("/api/events", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || "Could not create the event");
      return body as MyEvent & { status: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/feed"] });
      queryClient.invalidateQueries({ queryKey: ["events-search"] });
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ eventId, patch }: { eventId: number; patch: Record<string, unknown> }) => {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || "Could not save changes");
      return body as MyEvent;
    },
    onError: (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" }),
    onSettled: (_d, _e, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", vars.eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/feed"] });
      queryClient.invalidateQueries({ queryKey: ["events-search"] });
    },
  });
}

export function useCancelEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ eventId, reason }: { eventId: number; reason: string }) => {
      const res = await fetch(`/api/events/${eventId}/cancel`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || "Could not cancel");
      return body;
    },
    onError: (err: Error) => toast({ title: "Couldn't cancel", description: err.message, variant: "destructive" }),
    onSettled: (_d, _e, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events", vars.eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/feed"] });
      queryClient.invalidateQueries({ queryKey: ["events-search"] });
    },
  });
}

export function useEvent(id: number | undefined) {
  return useQuery<EventItem | null>({
    queryKey: ["/api/events", id],
    queryFn: async () => {
      const res = await fetch(`/api/events/${id}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: id != null && !Number.isNaN(id),
  });
}

interface AttendVars {
  eventId: number;
  seatModel: SeatModel;
}

// Optimism is only safe where the outcome isn't in doubt: an 'open' event's
// join always lands on 'going', and a cancel always lands on 'cancelled'
// (the seat-model-dependent part is who else gets promoted, not the actor's
// own status). Capped/curated joins have a genuinely uncertain outcome
// (going vs. waitlisted vs. requested), so those just show a pending state
// via isPending and wait for the real response rather than guess and flicker.
export function useAttendEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ eventId }: AttendVars) => {
      const res = await fetch(`/api/events/${eventId}/attend`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to join event");
      return res.json() as Promise<{ status: AttendeeStatus; waitlistPosition?: number }>;
    },
    onMutate: async ({ eventId, seatModel }: AttendVars) => {
      await queryClient.cancelQueries({ queryKey: ["/api/events"] });
      await queryClient.cancelQueries({ queryKey: ["/api/events", eventId] });
      const prevList = queryClient.getQueryData<EventItem[]>(["/api/events"]);
      const prevDetail = queryClient.getQueryData<EventItem | null>(["/api/events", eventId]);
      if (seatModel === "open") {
        queryClient.setQueryData<EventItem[] | undefined>(["/api/events"], (old) =>
          old?.map((e) => (e.id === eventId ? { ...e, myStatus: "going" } : e))
        );
        queryClient.setQueryData<EventItem | null | undefined>(["/api/events", eventId], (old) =>
          old ? { ...old, myStatus: "going" } : old
        );
      }
      return { prevList, prevDetail };
    },
    onSuccess: (result, { eventId }) => {
      const patch = { myStatus: result.status, myWaitlistPosition: result.waitlistPosition };
      queryClient.setQueryData<EventItem[] | undefined>(["/api/events"], (old) =>
        old?.map((e) => (e.id === eventId ? { ...e, ...patch } : e))
      );
      queryClient.setQueryData<EventItem | null | undefined>(["/api/events", eventId], (old) =>
        old ? { ...old, ...patch } : old
      );
    },
    onError: (_err, { eventId }, ctx) => {
      if (ctx) {
        queryClient.setQueryData(["/api/events"], ctx.prevList);
        queryClient.setQueryData(["/api/events", eventId], ctx.prevDetail);
      }
      toast({ title: "Couldn't join", description: "Something went wrong. Try again.", variant: "destructive" });
    },
    onSettled: (_data, _err, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/feed"] });
      queryClient.invalidateQueries({ queryKey: ["events-search"] });
    },
  });
}

export function useCancelAttendance() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (eventId: number) => {
      const res = await fetch(`/api/events/${eventId}/attend`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to cancel");
      return res.json() as Promise<{ status: AttendeeStatus; promotedUserId?: string }>;
    },
    onMutate: async (eventId: number) => {
      await queryClient.cancelQueries({ queryKey: ["/api/events"] });
      await queryClient.cancelQueries({ queryKey: ["/api/events", eventId] });
      const prevList = queryClient.getQueryData<EventItem[]>(["/api/events"]);
      const prevDetail = queryClient.getQueryData<EventItem | null>(["/api/events", eventId]);
      queryClient.setQueryData<EventItem[] | undefined>(["/api/events"], (old) =>
        old?.map((e) => (e.id === eventId ? { ...e, myStatus: "cancelled" } : e))
      );
      queryClient.setQueryData<EventItem | null | undefined>(["/api/events", eventId], (old) =>
        old ? { ...old, myStatus: "cancelled" } : old
      );
      return { prevList, prevDetail };
    },
    onError: (_err, eventId, ctx) => {
      if (ctx) {
        queryClient.setQueryData(["/api/events"], ctx.prevList);
        queryClient.setQueryData(["/api/events", eventId], ctx.prevDetail);
      }
      toast({ title: "Couldn't update", description: "Something went wrong. Try again.", variant: "destructive" });
    },
    onSettled: (_data, _err, eventId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/feed"] });
      queryClient.invalidateQueries({ queryKey: ["events-search"] });
    },
  });
}
