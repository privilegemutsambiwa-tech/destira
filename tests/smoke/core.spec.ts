// The core loop, in order: sign up, Essentials, like, match, message, pay
// (mock gateway), join a room, RSVP to an event. Sign-up, Essentials and the
// message go through the screens; the rest through the app's own API calls.
import { test, expect, request, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

const stamp = Date.now();
const PASSWORD = "Smoke-test-123!";
const tari = { email: `smoke-tari-${stamp}@local.test`, name: "Tari" };
const rudo = { email: `smoke-rudo-${stamp}@local.test`, name: "Rudo" };

test.describe.configure({ mode: "serial" });

// One browser session for Tari across the whole run.
let ctx: BrowserContext;
let page: Page;
let api: APIRequestContext; // Tari, signed in (shares the page's cookies)
let rudoApi: APIRequestContext;
let tariId = "";
let rudoId = "";
let matchId = 0;

test.beforeAll(async ({ browser, baseURL }) => {
  const up = await fetch(`${baseURL}/api/auth/user`).catch(() => null);
  if (!up) throw new Error(`No server at ${baseURL}. Start it with npm run dev:local.`);
  if (!/localhost|127\.0\.0\.1/.test(baseURL!) && !process.env.SMOKE_ALLOW_REMOTE) {
    throw new Error("The smoke suite makes members and payments: local servers only.");
  }
  ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  page = await ctx.newPage();
  rudoApi = await request.newContext({ baseURL });
  const su = await rudoApi.post("/api/auth/signup", { data: { email: rudo.email, password: PASSWORD, name: rudo.name } });
  expect(su.ok(), await su.text()).toBe(true);
  rudoId = (await su.json()).id;
  const p = await rudoApi.post("/api/profiles", {
    data: { displayName: rudo.name, dateOfBirth: "1996-04-12", onboardingCompleted: true, isPublic: true, gender: "woman", seekingGenders: ["men"], location: "Harare" },
  });
  expect(p.ok(), await p.text()).toBe(true);
});

test.afterAll(async () => {
  for (const c of [api, rudoApi]) {
    if (!c) continue;
    await c.delete("/api/account", { data: { confirmation: "DELETE" } }).catch(() => {});
  }
  await rudoApi?.dispose();
  await ctx?.close();
});

test("sign up and Essentials", async () => {
  await page.goto("/signup");
  await page.getByTestId("input-signup-email").fill(tari.email);
  await page.getByTestId("button-signup-next").click();
  await page.getByTestId("input-signup-password").fill(PASSWORD);
  await page.getByTestId("button-signup-create").click();
  await page.getByTestId("input-signup-name").fill(tari.name);
  await page.getByTestId("input-signup-dob").fill("1994-09-21");
  await page.getByTestId("select-signup-city").selectOption("Harare");
  await page.getByTestId("button-signup-next").click();

  await page.waitForURL(/\/essentials/);
  await page.getByTestId("essentials-gender-man").click();
  await page.getByTestId("essentials-mode-love").click();
  await page.getByTestId("essentials-seeking-women").click();
  await page.getByTestId("button-seeking-continue").click();
  await page.getByTestId("essentials-intent-relationship").click();
  await page.getByTestId("button-basics-skip").click();
  await page.getByTestId("button-age-continue").click();
  await page.getByTestId("button-area-skip").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/essentials"));

  api = ctx.request;
  const me = await (await api.get("/api/auth/user")).json();
  tariId = me.id;
  const profile = await (await api.get("/api/profiles/me")).json();
  expect(profile).toMatchObject({ gender: "man", datingIntent: "relationship" });
  expect(profile.seekingGenders).toContain("women");
  // Make the profile ready for Discover, as the rest of onboarding would.
  await api.post("/api/profiles", { data: { onboardingCompleted: true, isPublic: true } });
});

test("like, and a like back is a match", async () => {
  const first = await (await api.post("/api/matches", { data: { targetId: rudoId } })).json();
  expect(first.mutual).toBeFalsy();
  const incoming = await (await rudoApi.get("/api/likes/incoming")).json();
  expect(JSON.stringify(incoming)).toContain(tariId);
  const back = await (await rudoApi.post("/api/matches", { data: { targetId: tariId } })).json();
  expect(back.mutual).toBe(true);
  matchId = back.id;
});

test("message from the chat screen", async () => {
  await page.goto(`/chat/${matchId}`);
  const text = `Hi Rudo, smoke test ${stamp}`;
  await page.getByTestId("input-message").fill(text);
  await page.getByTestId("button-send").click();
  await expect(page.getByText(text)).toBeVisible();
  await expect
    .poll(async () => JSON.stringify(await (await rudoApi.get(`/api/messages/${matchId}`)).json()))
    .toContain(text);
});

test("pay for a plan on the mock gateway", async () => {
  const r = await api.post("/api/payments/initiate", { data: { tier: "spark", period: "weekly", method: "ecocash", phone: "0771234567" } });
  expect(r.ok(), await r.text()).toBe(true);
  const j = await r.json();
  const id = j.paymentId ?? j.id ?? j.payment?.id;
  await expect
    .poll(async () => (await (await api.get(`/api/payments/${id}`)).json()).status, { timeout: 60_000, intervals: [1000] })
    .toBe("paid");
  const profile = await (await api.get("/api/profiles/me")).json();
  expect(profile.subscriptionTier).toBe("spark");
});

test("join a room", async () => {
  const groups: any[] = await (await api.get("/api/groups")).json();
  const open = groups.filter((g) => !g.isMember && (g.privacyMode ?? "open") === "open");
  test.skip(open.length === 0, "no open room on this database to join");
  const r = await api.post(`/api/groups/${open[0].id}/join`);
  expect(r.ok(), await r.text()).toBe(true);
  const after: any[] = await (await api.get("/api/groups")).json();
  expect(after.find((g) => g.id === open[0].id)?.isMember).toBe(true);
});

test("RSVP to an event", async () => {
  const events: any[] = await (await api.get("/api/events")).json();
  const upcoming = events.filter((e) => new Date(e.startsAt).getTime() > Date.now() && e.status === "published");
  test.skip(upcoming.length === 0, "no upcoming event on this database");
  let going: any = null;
  for (const e of upcoming) {
    const r = await api.post(`/api/events/${e.id}/attend`);
    if (r.ok()) { going = { e, body: await r.json() }; break; }
    expect([402, 403, 409], `event ${e.id}: ${r.status()} ${await r.text()}`).toContain(r.status()); // ticketed, a policy, or full
  }
  expect(going, "an upcoming event someone can RSVP to").not.toBeNull();
  const off = await api.delete(`/api/events/${going.e.id}/attend`);
  expect(off.ok()).toBe(true);
});
