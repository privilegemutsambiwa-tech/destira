import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface OnboardingQuestion {
  id: number;
  text: string;
  category: string;
  answerType: "text" | "multiple_choice" | "rating" | string;
  options: string[] | null;
  answerText: string | null;
  selectedOptions: string[] | null;
  answered: boolean;
}

export interface TwinReadiness {
  answeredCount: number;
  totalCount: number;
  pct: number;
  twinReady: boolean;
  floor: number;
  nextQuestionId: number | null;
  onboardingCompleted: boolean;
  discoverStripDismissed?: boolean;
}

export function useOnboarding() {
  return useQuery<{ questions: OnboardingQuestion[]; readiness: TwinReadiness; nickname: string }>({
    queryKey: ["/api/onboarding"],
    queryFn: async () => {
      const res = await fetch("/api/onboarding", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load onboarding");
      return res.json();
    },
  });
}

function bumpReadiness(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
  qc.invalidateQueries({ queryKey: ["/api/twin/readiness"] });
  qc.invalidateQueries({ queryKey: ["/api/profiles/me"] });
}

export function useSaveOnboardingAnswer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      questionId: number;
      answerText?: string;
      selectedOptions?: string[];
      isPrivate?: boolean;
    }) => {
      const res = await fetch("/api/onboarding/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || "Couldn't save that answer");
      return body as TwinReadiness;
    },
    onSuccess: () => bumpReadiness(qc),
  });
}

export function useCompleteOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input?: { groupNickname?: string; isPublic?: boolean }) => {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input ?? {}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || "Couldn't finish");
      return body as TwinReadiness;
    },
    onSuccess: () => bumpReadiness(qc),
  });
}

export function useTwinReadiness() {
  return useQuery<TwinReadiness>({
    queryKey: ["/api/twin/readiness"],
    queryFn: async () => {
      const res = await fetch("/api/twin/readiness", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load readiness");
      return res.json();
    },
  });
}

export function useDismissReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (kind: string) => {
      await fetch(`/api/reminders/${kind}/dismiss`, { method: "POST", credentials: "include" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/twin/readiness"] }),
  });
}
