import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
    },
  });
}
