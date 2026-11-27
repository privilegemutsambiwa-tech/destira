// The console's error log (server/admin/error-log.ts): the same error is one
// group however often it happens, a resolved error that comes back reopens,
// a new error that spikes sends one alert, and a muted one never does.
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../server/db";
import { emailLog, errorGroupHours, errorGroups } from "@shared/schema";
import { _resetErrorLogForTests, fingerprintOf, flushErrors, logError, normalizeMessage, redact, type LoggedError } from "../../server/admin/error-log";

const boom = (over: Partial<LoggedError> = {}): LoggedError => ({
  kind: "server", method: "GET", route: "/api/things/:id", status: 500, message: "Failed to load thing 42", cause: "TypeError: x is undefined", ...over,
});
const groups = () => db.select().from(errorGroups);
const spikeMails = async () => (await db.select().from(emailLog)).filter((r) => r.type === "new_error_spike");

beforeEach(async () => {
  _resetErrorLogForTests();
  await db.delete(errorGroups);
  await db.delete(emailLog);
});

describe("grouping", () => {
  it("numbers and ids don't make a new error", () => {
    expect(normalizeMessage("Failed to load thing 42")).toBe(normalizeMessage("Failed to load thing 7"));
    expect(fingerprintOf(boom())).toBe(fingerprintOf(boom({ message: "Failed to load thing 9001" })));
    expect(fingerprintOf(boom())).not.toBe(fingerprintOf(boom({ route: "/api/other" })));
    expect(fingerprintOf(boom())).not.toBe(fingerprintOf(boom({ status: 503 })));
  });

  it("a storm of one error is one row, counted, with its hours", async () => {
    for (let i = 0; i < 3; i++) logError(boom({ message: `Failed to load thing ${i}` }));
    logError(boom({ route: "/api/other" }));
    await flushErrors();
    const rows = await groups();
    expect(rows).toHaveLength(2);
    const things = rows.find((r) => r.route === "/api/things/:id")!;
    expect(things.count).toBe(3);
    expect(things.message).toBe("Failed to load thing 2"); // the latest
    const [h] = await db.select().from(errorGroupHours).where(eq(errorGroupHours.groupId, things.id));
    expect(h.count).toBe(3);

    logError(boom());
    await flushErrors();
    const [again] = await db.select().from(errorGroups).where(eq(errorGroups.id, things.id));
    expect(again.count).toBe(4);
  });

  it("a screen crash keeps its stack and where it came from", async () => {
    logError({ kind: "client", method: "PAGE", route: "/discover", status: 0, message: "x is not a function", cause: null, stack: "at Deck (deck.tsx:12)", source: "app 2026.11.27" });
    await flushErrors();
    const [g] = await groups();
    expect(g).toMatchObject({ kind: "client", stack: "at Deck (deck.tsx:12)", source: "app 2026.11.27", state: "open" });
  });
});

describe("resolving", () => {
  it("a resolved error that happens again reopens", async () => {
    logError(boom());
    await flushErrors();
    const [g] = await groups();
    await db.update(errorGroups).set({ state: "resolved", resolvedAt: new Date() }).where(eq(errorGroups.id, g.id));
    logError(boom());
    await flushErrors();
    const [after] = await groups();
    expect(after.state).toBe("open");
    expect(after.resolvedAt).toBeNull();
  });

  it("a muted error stays muted", async () => {
    logError(boom());
    await flushErrors();
    const [g] = await groups();
    await db.update(errorGroups).set({ state: "muted" }).where(eq(errorGroups.id, g.id));
    logError(boom());
    await flushErrors();
    expect((await groups())[0].state).toBe("muted");
  });
});

describe("new error spiking", () => {
  it("five of a new error in 15 minutes sends one alert, and only one", async () => {
    for (let i = 0; i < 4; i++) logError(boom());
    await flushErrors();
    expect(await spikeMails()).toHaveLength(0);
    logError(boom());
    await flushErrors();
    expect(await spikeMails()).toHaveLength(1); // skipped (no mail key in tests), but attempted
    expect((await groups())[0].lastAlertAt).not.toBeNull();
    for (let i = 0; i < 5; i++) logError(boom());
    await flushErrors();
    expect(await spikeMails()).toHaveLength(1);
  });

  it("an old error that was never resolved doesn't mail", async () => {
    logError(boom());
    await flushErrors();
    await db.update(errorGroups).set({ firstSeenAt: new Date(Date.now() - 3 * 86400_000) });
    for (let i = 0; i < 6; i++) logError(boom());
    await flushErrors();
    expect(await spikeMails()).toHaveLength(0);
  });

  it("a muted error never mails", async () => {
    logError(boom());
    await flushErrors();
    await db.update(errorGroups).set({ state: "muted" });
    for (let i = 0; i < 6; i++) logError(boom());
    await flushErrors();
    expect(await spikeMails()).toHaveLength(0);
  });
});

describe("redaction", () => {
  it("no emails or phone numbers leave the console", () => {
    expect(redact('duplicate key (email)=(rudo@example.com) phone +263 77 123 4567')).toBe("duplicate key (email)=([email]) phone [number]");
  });
});
