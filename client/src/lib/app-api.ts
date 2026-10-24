// Inside the Android/iOS app the screens are packaged with the app (served
// from https://localhost on the phone), so "/api/..." would point at the
// phone itself. This routes every API request to the Destira server instead,
// signs it with the member's session token, and keeps the token the server
// hands back after sign-in (server/app-client.ts is the other half).
//
// Installed once, before anything renders. In a browser it does nothing: the
// website keeps using its own cookie exactly as before.
import { isNativeApp } from "./native";
import { clearOfflineCache } from "./offline-cache";
import { clearOutbox } from "./outbox";
import { setAppLockEnabled } from "./app-lock";

/** Where the app's data comes from. Overridden for emulator testing with
 *  VITE_APP_API_BASE=http://10.0.2.2:5001 at build time. */
export const API_BASE: string = (import.meta.env.VITE_APP_API_BASE as string | undefined)?.replace(/\/$/, "") || "https://www.destira.date";

const TOKEN_KEY = "destira.session";

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function writeToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: the session lasts until the app closes */
  }
}

/** The public web address of the platform, for links people share. In the
 *  app, window.location.origin is the phone's own https://localhost. */
export function publicOrigin(): string {
  return isNativeApp() ? "https://destira.date" : window.location.origin;
}

const USER_KEY = "destira.user";

/** The signed-in member as last confirmed by the server, so the app opens
 *  signed in without a connection. Only kept while there's a token. */
export function savedUser<T>(): T | null {
  if (!readToken()) return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function rememberUser(user: unknown) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Signs out of the app: tells the server, then forgets the token. */
export async function appSignOut(): Promise<void> {
  try {
    await fetch("/api/logout", { redirect: "manual" });
  } catch {
    /* offline: the token is forgotten anyway */
  }
  writeToken(null);
  rememberUser(null);
  setAppLockEnabled(false);
  // The next person to use this phone mustn't see this member's data.
  await clearOfflineCache();
}

export function hasAppSession(): boolean {
  return !!readToken();
}

export function installAppApi() {
  if (!isNativeApp()) return;
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const relative = raw.startsWith("/api/") || raw === "/api";
    const ours = relative || raw.startsWith(`${API_BASE}/api/`);
    if (!ours) return original(input, init);

    const url = relative ? `${API_BASE}${raw}` : raw;
    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("X-Destira-Client", "app");
    const token = readToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const res = await original(url, {
      method: init.method ?? (input instanceof Request ? input.method : undefined),
      body: init.body ?? (input instanceof Request ? await input.clone().blob() : undefined),
      signal: init.signal,
      redirect: init.redirect,
      headers,
      // The token is the credential here; cookies don't cross into the app.
      credentials: "omit",
    });

    const fresh = res.headers.get("X-Destira-Session");
    if (fresh) writeToken(fresh);
    // A token the server no longer knows (signed out elsewhere, account
    // deleted, session expired): forget it so the app shows sign-in.
    if (res.status === 401 && token && url.endsWith("/api/auth/user")) {
      writeToken(null);
      rememberUser(null);
      clearOutbox();
      void clearOfflineCache();
    }
    return res;
  };
}
