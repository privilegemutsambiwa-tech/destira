// Video dates end to end (server/video-calls.ts, pages/VideoCall.tsx): a
// paying member (not one on a free trial) calls their match from the chat, the other phone rings by
// itself, they answer, both see each other through LiveKit, and hanging up
// ends it on both. Fake camera and microphone (playwright.config.ts).
// Needs LIVEKIT_* in .env.dev; skipped without them.
import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";

const stamp = Date.now();
const PASSWORD = "Smoke-test-123!";

async function member(browser: Browser, baseURL: string, name: string, gender: string, seeking: string) {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.grantPermissions(["camera", "microphone"]);
  const api = ctx.request;
  const su = await api.post("/api/auth/signup", { data: { email: `video-${name.toLowerCase()}-${stamp}@local.test`, password: PASSWORD, name } });
  expect(su.ok(), await su.text()).toBe(true);
  const p = await api.post("/api/profiles", {
    data: { displayName: name, dateOfBirth: "1995-03-02", onboardingCompleted: true, isPublic: true, gender, seekingGenders: [seeking], location: "Harare", datingIntent: "relationship" },
  });
  expect(p.ok(), await p.text()).toBe(true);
  return { ctx, api, page: await ctx.newPage(), id: (await su.json()).id as string };
}

/** Frames showing in both pictures: their camera and your own. */
async function seesThem(page: Page) {
  await expect
    .poll(() => page.evaluate(() => [...document.querySelectorAll("video")].filter((v) => v.videoWidth > 0).length), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(2);
}

test("a match video call rings, connects both ways and hangs up on both", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  if (!/localhost|127\.0\.0\.1/.test(baseURL!)) throw new Error("Local servers only: this makes members and pays on the mock gateway.");
  const caller = await member(browser, baseURL!, "Kuda", "man", "woman");
  const callee = await member(browser, baseURL!, "Chipo", "woman", "man");
  const cleanup = async () => {
    for (const m of [caller, callee]) await m.api.delete("/api/account", { data: { confirmation: "DELETE" } }).catch(() => {});
    await caller.ctx.close();
    await callee.ctx.close();
  };
  try {
    const config = await (await caller.api.get("/api/calls/config")).json();
    test.skip(!config.enabled, "LiveKit isn't configured in .env.dev");

    // A match (starting a call needs a plan; answering doesn't).
    await caller.api.post("/api/matches", { data: { targetId: callee.id } });
    const m = await (await callee.api.post("/api/matches", { data: { targetId: caller.id } })).json();
    const matchId = m.id as number;
    // New members start on a free trial, which doesn't open video dates:
    // starting one is for members who've paid.
    expect((await (await caller.api.get("/api/calls/config")).json()).canStart).toBe(false);
    expect((await caller.api.post("/api/calls", { data: { matchId } })).status()).toBe(403);
    await caller.page.goto(`/chat/${matchId}`);
    await caller.page.getByTestId("button-video-call").click();
    const sheet = caller.page.getByTestId("refusal-video_call");
    await expect(sheet).toContainText("paid plan");
    await expect(sheet.getByTestId("refusal-cta-video_call")).toContainText("Spark");
    await caller.page.keyboard.press("Escape");
    await sheet.getByRole("button", { name: /not now|close|maybe later/i }).first().click().catch(() => {});
    const j = await (await caller.api.post("/api/payments/initiate", { data: { tier: "spark", period: "weekly", method: "ecocash", phone: "0771234567" } })).json();
    const payId = j.paymentId ?? j.id ?? j.payment?.id;
    await expect.poll(async () => (await (await caller.api.get(`/api/payments/${payId}`)).json()).status, { timeout: 60_000, intervals: [1000] }).toBe("paid");
    expect((await (await caller.api.get("/api/calls/config")).json()).canStart).toBe(true);

    // The callee is somewhere else in the app; the caller rings from the chat.
    await callee.page.goto("/matches");
    await caller.page.goto(`/chat/${matchId}`);
    await caller.page.getByTestId("button-video-call").click();
    await expect(caller.page).toHaveURL(/\/call\/\d+/);
    await expect(caller.page.getByTestId("button-cancel-call")).toBeVisible();

    // The other phone opens the call by itself, and answers.
    await expect(callee.page).toHaveURL(/\/call\/\d+/, { timeout: 15_000 });
    await callee.page.getByTestId("button-answer-call").click();

    for (const p of [caller.page, callee.page]) {
      await expect(p.getByTestId("video-call-live")).toBeVisible({ timeout: 30_000 });
      await expect(p.getByTestId("text-call-clock")).not.toContainText("Connecting", { timeout: 30_000 });
      await seesThem(p);
    }

    // Hanging up ends it on both phones.
    await caller.page.getByTestId("button-end-call").click();
    await expect(caller.page.getByTestId("text-call-over")).toBeVisible();
    await expect(callee.page.getByTestId("text-call-over")).toBeVisible({ timeout: 20_000 });
    const callId = Number(caller.page.url().match(/\/call\/(\d+)/)![1]);
    const record = await (await caller.api.get(`/api/calls/${callId}`)).json();
    expect(record.status).toBe("ended");
    expect(record.endedBy).toBe("me");
  } finally {
    await cleanup();
  }
});

test("only your match can be called", async ({ browser, baseURL }) => {
  const a = await member(browser, baseURL!, "Tendai", "man", "woman");
  const b = await member(browser, baseURL!, "Rumbi", "woman", "man");
  try {
    test.skip(!(await (await a.api.get("/api/calls/config")).json()).enabled, "LiveKit isn't configured in .env.dev");
    // A like that isn't returned yet is not a match.
    const like = await (await a.api.post("/api/matches", { data: { targetId: b.id } })).json();
    expect((await a.api.post("/api/calls", { data: { matchId: like.id } })).status()).toBe(400);
    // Someone else's match is not yours to call.
    const c = await member(browser, baseURL!, "Farai", "man", "woman");
    try {
      expect((await c.api.post("/api/calls", { data: { matchId: like.id } })).status()).toBe(404);
    } finally {
      await c.api.delete("/api/account", { data: { confirmation: "DELETE" } }).catch(() => {});
      await c.ctx.close();
    }
  } finally {
    for (const x of [a, b]) await x.api.delete("/api/account", { data: { confirmation: "DELETE" } }).catch(() => {});
    await a.ctx.close();
    await b.ctx.close();
  }
});
