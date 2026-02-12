import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertProfile } from "@shared/schema";

// Helper for safe parsing
function parseWithLogging<T>(schema: any, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[Zod] ${label} validation failed:`, result.error.format());
    throw result.error;
  }
  return result.data;
}

export function useProfile(userId?: string) {
  const key = userId ? [api.profiles.get.path, userId] : [api.profiles.me.path];
  const url = userId 
    ? buildUrl(api.profiles.get.path, { userId }) 
    : api.profiles.me.path;

  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch profile");
      return parseWithLogging(
        userId ? api.profiles.get.responses[200] : api.profiles.me.responses[200],
        await res.json(),
        "profile.get"
      );
    },
    enabled: userId !== undefined || url === api.profiles.me.path, // Wait for ID if it's not 'me'
  });
}

export function useCreateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertProfile) => {
      const validated = api.profiles.create.input.parse(data);
      const res = await fetch(api.profiles.create.path, {
        method: api.profiles.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.profiles.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create profile");
      }
      return api.profiles.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.profiles.me.path] });
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: Partial<InsertProfile> }) => {
      const validated = api.profiles.update.input.parse(data);
      const url = buildUrl(api.profiles.update.path, { userId });
      const res = await fetch(url, {
        method: api.profiles.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to update profile");
      return api.profiles.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.profiles.me.path] });
    },
  });
}

export function useGenerateTwin() {
    return useMutation({
        mutationFn: async (answers: any) => {
            const res = await fetch(api.profiles.generateTwin.path, {
                method: api.profiles.generateTwin.method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ answers }),
                credentials: "include",
            });
            if (!res.ok) throw new Error("Failed to generate Twin");
            return api.profiles.generateTwin.responses[200].parse(await res.json());
        }
    });
}
