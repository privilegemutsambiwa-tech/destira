// Rate limits (server/rate-limits.ts), through a real Express app: signed-in
// limits count per member (two people on one mobile network don't share a
// count), sign-up counts per phone, reading never counts, and a refusal is a
// 429 with words the app can show.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { LIMITS, registerMemberRateLimits, registerSignInRateLimits } from "../../server/rate-limits";

let server: Server;
let base = "";

beforeAll(async () => {
  const app = express();
  app.set("trust proxy", true);
  registerSignInRateLimits(app);
  // Stand-in for the session: x-test-user says who is signed in.
  app.use((req: any, _res, next) => {
    const u = req.get("x-test-user");
    if (u) req.user = { claims: { sub: u } };
    next();
  });
  registerMemberRateLimits(app);
  // x-test-fail makes the request fail, as a typo would.
  app.all(/.*/, (req, res) => (req.get("x-test-fail") ? res.status(400).json({ message: "Enter a valid email address" }) : res.json({ ok: true })));
  server = await new Promise<Server>((r) => {
    const s = app.listen(0, () => r(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const hit = (path: string, init: { method?: string; user?: string; device?: string; ip?: string; fail?: boolean } = {}) =>
  fetch(base + path, {
    method: init.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": init.ip ?? "10.0.0.1",
      ...(init.user ? { "x-test-user": init.user } : {}),
      ...(init.device ? { "x-destira-device": init.device } : {}),
      ...(init.fail ? { "x-test-fail": "1" } : {}),
    },
    body: (init.method ?? "POST") === "GET" ? undefined : "{}",
  });

async function hitN(n: number, path: string, init: Parameters<typeof hit>[1] = {}) {
  const statuses: number[] = [];
  for (let i = 0; i < n; i++) statuses.push((await hit(path, init)).status);
  return statuses;
}

describe("signed in: per member", () => {
  it("likes stop at the minute limit, with a message to show", async () => {
    const s = await hitN(LIMITS.likes.limit, "/api/matches", { user: "liker" });
    expect(s.every((x) => x === 200)).toBe(true);
    const r = await hit("/api/matches", { user: "liker" });
    expect(r.status).toBe(429);
    expect((await r.json()).message).toMatch(/liking very fast/);
  });

  it("someone else on the same network isn't caught by it", async () => {
    expect((await hit("/api/matches", { user: "neighbour" })).status).toBe(200);
  });

  it("super likes and likes share one count", async () => {
    await hitN(LIMITS.likes.limit - 1, "/api/matches", { user: "mixer" });
    expect((await hit("/api/discover/super-like", { user: "mixer" })).status).toBe(200);
    expect((await hit("/api/discover/super-like", { user: "mixer" })).status).toBe(429);
  });

  it("reports of members and of events share one hourly count", async () => {
    await hitN(LIMITS.reports.limit - 1, "/api/users/abc/report", { user: "reporter" });
    expect((await hit("/api/events/7/report", { user: "reporter" })).status).toBe(200);
    expect((await hit("/api/events/8/report", { user: "reporter" })).status).toBe(429);
  });

  it("the AI has a per-minute limit across its endpoints", async () => {
    const paths = ["/api/twin/chat", "/api/twin/coach/reply", "/api/ai/profile/generate-about-me", "/api/chat/3/suggest"];
    for (let i = 0; i < LIMITS.ai.limit; i++) expect((await hit(paths[i % paths.length], { user: "asker" })).status).toBe(200);
    const r = await hit("/api/twin/writer/draft", { user: "asker" });
    expect(r.status).toBe(429);
  });

  it("reading never counts", async () => {
    const s = await hitN(LIMITS.messages.limit + 5, "/api/messages/12", { user: "reader", method: "GET" });
    expect(s.every((x) => x === 200)).toBe(true);
  });

  it("paths that aren't limited aren't", async () => {
    const s = await hitN(80, "/api/profiles", { user: "editor" });
    expect(s.every((x) => x === 200)).toBe(true);
  });
});

describe("before sign-in", () => {
  it("sign-up: a few per phone, and another phone on the same network still can", async () => {
    const s = await hitN(LIMITS.signupPerDevice.limit, "/api/auth/signup", { device: "phone-aaaaaaaaaaaaaaaa", ip: "10.9.9.9" });
    expect(s.every((x) => x === 200)).toBe(true);
    const r = await hit("/api/auth/signup", { device: "phone-aaaaaaaaaaaaaaaa", ip: "10.9.9.9" });
    expect(r.status).toBe(429);
    expect((await r.json()).message).toMatch(/accounts from this phone/);
    expect((await hit("/api/auth/signup", { device: "phone-bbbbbbbbbbbbbbbb", ip: "10.9.9.9" })).status).toBe(200);
  });

  it("sign-up: typos don't use up a try", async () => {
    const s = await hitN(10, "/api/auth/signup", { device: "phone-dddddddddddddddd", ip: "10.6.6.6", fail: true });
    expect(s.every((x) => x === 400)).toBe(true);
    expect((await hit("/api/auth/signup", { device: "phone-dddddddddddddddd", ip: "10.6.6.6" })).status).toBe(200);
  });

  it("checking who's signed in never counts against the network", async () => {
    const s = await hitN(LIMITS.authFlood.limit + 10, "/api/auth/user", { method: "GET", ip: "10.8.8.8" });
    expect(s.every((x) => x === 200)).toBe(true);
  });

  it("password reset tries are limited per phone", async () => {
    await hitN(LIMITS.resetPerAddress.limit, "/api/auth/forgot-password", { device: "phone-cccccccccccccccc", ip: "10.7.7.7" });
    expect((await hit("/api/auth/reset-password", { device: "phone-cccccccccccccccc", ip: "10.7.7.7" })).status).toBe(429);
  });
});
