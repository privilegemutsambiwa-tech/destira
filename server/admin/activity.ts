// The one generic "was this user around today" signal the app didn't have.
// DAU/WAU/MAU, retention and activation timing all read from
// user_activity_daily; this is the only writer.
import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { userActivityDaily } from "@shared/schema";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// In-memory "already recorded today" cache so a chatty session doesn't write
// on every request — only the first request of the day per user touches the
// DB. Cleared whenever the date rolls over. Losing this on a restart just
// means one extra harmless insert per active user, not a correctness issue
// (the DB insert is itself idempotent via the unique index).
let cacheDate = todayISO();
let seenToday = new Set<string>();

export function trackActivity() {
  return (req: Request, _res: Response, next: NextFunction) => {
    next(); // never block the request on this
    try {
      if (!(req as any).isAuthenticated?.()) return;
      const userId = (req as any).user?.claims?.sub;
      if (!userId) return;

      const today = todayISO();
      if (today !== cacheDate) {
        cacheDate = today;
        seenToday = new Set();
      }
      if (seenToday.has(userId)) return;
      seenToday.add(userId);

      db.insert(userActivityDaily)
        .values({ userId, date: today })
        .onConflictDoNothing()
        .catch((e) => console.error("[activity] write failed:", e));
    } catch {
      /* never let telemetry break a request */
    }
  };
}
