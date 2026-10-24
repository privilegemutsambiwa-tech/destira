import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";
import { apiRequest } from "@/lib/queryClient";
import { isNativeApp } from "@/lib/native";
import { appSignOut, rememberUser, savedUser } from "@/lib/app-api";
import { clearOutbox } from "@/lib/outbox";

async function fetchUser(): Promise<User | null> {
  let response: Response;
  try {
    response = await fetch("/api/auth/user", {
      credentials: "include",
    });
  } catch (err) {
    // No connection: the app opens as the member who was signed in, on
    // whatever is saved, instead of falling back to the welcome page.
    const saved = isNativeApp() ? savedUser<User>() : null;
    if (saved) return saved;
    throw err;
  }

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  const user = (await response.json()) as User;
  if (isNativeApp()) rememberUser(user);
  return user;
}

async function logout(): Promise<void> {
  clearOutbox();
  // The app's screens are packaged on the phone, so there's no server page to
  // navigate to: sign out in the background, then start over at home.
  if (isNativeApp()) {
    await appSignOut();
    window.location.href = "/";
    return;
  }
  window.location.href = "/api/logout";
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return (await res.json()) as User;
    },
    onSuccess: (user) => {
      if (isNativeApp()) {
        // Start clean: nothing saved on this phone belongs to the new session.
        queryClient.clear();
        rememberUser(user);
      }
      queryClient.setQueryData(["/api/auth/user"], user);
    },
  });

  const signupMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; name?: string }) => {
      const res = await apiRequest("POST", "/api/auth/signup", data);
      return (await res.json()) as User;
    },
    onSuccess: (user) => {
      if (isNativeApp()) {
        // Start clean: nothing saved on this phone belongs to the new session.
        queryClient.clear();
        rememberUser(user);
      }
      queryClient.setQueryData(["/api/auth/user"], user);
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error as Error | null,
    signup: signupMutation.mutateAsync,
    isSigningUp: signupMutation.isPending,
    signupError: signupMutation.error as Error | null,
  };
}
