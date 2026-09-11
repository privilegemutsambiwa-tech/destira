// Thin fetch wrapper for /api/admin/*. Deliberately not the member
// queryClient/apiRequest (client/src/lib/queryClient.ts) — different auth
// (admin session cookie), different error shape (stepUpRequired), and it must
// stay obviously separate code so it's never accidentally reused on a member
// screen.
export class AdminApiError extends Error {
  status: number;
  stepUpRequired?: boolean;
  constructor(status: number, message: string, stepUpRequired?: boolean) {
    super(message);
    this.status = status;
    this.stepUpRequired = stepUpRequired;
  }
}

export async function adminFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(path, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    throw new AdminApiError(res.status, body?.message || res.statusText, body?.stepUpRequired);
  }
  return body;
}

export const adminGet = (path: string) => adminFetch(path);
export const adminPost = (path: string, data?: unknown) =>
  adminFetch(path, { method: "POST", body: data ? JSON.stringify(data) : undefined });
export const adminPatch = (path: string, data?: unknown) =>
  adminFetch(path, { method: "PATCH", body: data ? JSON.stringify(data) : undefined });
