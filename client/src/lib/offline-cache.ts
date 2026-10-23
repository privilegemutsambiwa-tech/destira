// The app's offline memory: everything the screens have loaded from the
// server (profile, matches, chats, events, interviews, ...) is the React
// Query cache, saved to the phone's IndexedDB after each change and restored
// at launch. So the app opens straight onto the last-known screens, with or
// without a connection, and refreshes them once it's online.
//
// App only. The website keeps its plain in-memory cache.
import { get, set, del } from "idb-keyval";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import type { Query } from "@tanstack/react-query";

const KEY = "destira.queryCache";

/** Saved data older than this is dropped rather than shown. */
export const OFFLINE_MAX_AGE = 14 * 24 * 60 * 60 * 1000;

/** Bump to discard every phone's saved data after a change in data shapes. */
export const OFFLINE_BUSTER = "1";

let timer: number | undefined;

export const offlinePersister: Persister = {
  // Writes are batched: a busy screen changes the cache many times a second.
  persistClient: async (client: PersistedClient) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      set(KEY, client).catch(() => {
        /* storage full or unavailable: the app still works online */
      });
    }, 800);
  },
  restoreClient: async () => {
    try {
      return await get<PersistedClient>(KEY);
    } catch {
      return undefined;
    }
  },
  removeClient: async () => {
    window.clearTimeout(timer);
    await del(KEY).catch(() => {});
  },
};

/** What's worth keeping: successful reads of member data. Admin screens and
 *  one-off lookups (search as you type) aren't. */
export function shouldKeepOffline(query: Query): boolean {
  if (query.state.status !== "success") return false;
  const first = String(query.queryKey[0] ?? "");
  return !first.startsWith("/api/admin") && !first.includes("search") && !first.startsWith("/api/geo");
}

/** Forget everything saved on this phone (sign-out, account deletion). */
export async function clearOfflineCache(): Promise<void> {
  await offlinePersister.removeClient();
}
