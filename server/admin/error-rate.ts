// A live "is anything wrong right now" number for the overview screen. Kept
// in memory, not a DB table — this is explicitly a right-now figure (see the
// build report §5: live is fine for the overview, rollups for anything
// historical), and persisting every request would be write amplification for
// no benefit.
const WINDOW_MS = 15 * 60 * 1000;
const events: { at: number; failed: boolean }[] = [];

export function recordRequestOutcome(statusCode: number) {
  events.push({ at: Date.now(), failed: statusCode >= 500 });
  // Trim occasionally rather than every push.
  if (events.length > 5000) prune();
}

function prune() {
  const cutoff = Date.now() - WINDOW_MS;
  while (events.length && events[0].at < cutoff) events.shift();
}

export function currentErrorRate(): { pct: number | null; sampleSize: number; windowMinutes: number } {
  prune();
  if (events.length === 0) return { pct: null, sampleSize: 0, windowMinutes: WINDOW_MS / 60000 };
  const failed = events.filter((e) => e.failed).length;
  return { pct: Math.round((failed / events.length) * 1000) / 10, sampleSize: events.length, windowMinutes: WINDOW_MS / 60000 };
}

export function requestOutcomeMiddleware() {
  return (req: any, res: any, next: any) => {
    res.on("finish", () => {
      if (req.path?.startsWith("/api/")) recordRequestOutcome(res.statusCode);
    });
    next();
  };
}
