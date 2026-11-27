// Date safety kit (Part B6): on a confirmed date, "Check on me 1 hour in"
// is turned on from the date card, stays private to the member who turned
// it on, and the check page's Get help shows the emergency numbers and a way
// to message a trusted contact. (The hour-in push itself is covered by
// tests/db/date-safety.test.ts.)
import { test, expect, type Browser } from "@playwright/test";

const stamp = Date.now();
const PASSWORD = "Smoke-test-123!";

async function member(browser: Browser, baseURL: string, name: string, gender: string, seeking: string) {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const api = ctx.request;
  const su = await api.post("/api/auth/signup", { data: { email: `safety-${name.toLowerCase()}-${stamp}@local.test`, password: PASSWORD, name } });
  expect(su.ok(), await su.text()).toBe(true);
  const p = await api.post("/api/profiles", {
    data: { displayName: name, dateOfBirth: "1995-03-02", onboardingCompleted: true, isPublic: true, gender, seekingGenders: [seeking], location: "Harare", datingIntent: "relationship" },
  });
  expect(p.ok(), await p.text()).toBe(true);
  return { ctx, api, page: await ctx.newPage(), id: (await su.json()).id as string };
}

test("check on me: turned on from the date card, private, and Get help shows the numbers", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  if (!/localhost|127\.0\.0\.1/.test(baseURL!)) throw new Error("Local servers only: this makes members.");
  const a = await member(browser, baseURL!, "Nyasha", "woman", "man");
  const b = await member(browser, baseURL!, "Tafara", "man", "woman");
  const c = await member(browser, baseURL!, "Kudzai", "man", "woman");
  try {
    await a.api.post("/api/matches", { data: { targetId: b.id } });
    const m = await (await b.api.post("/api/matches", { data: { targetId: a.id } })).json();
    const matchId = m.id as number;

    // A coffee in two hours, confirmed by the other person.
    const when = new Date(Date.now() + 2 * 3_600_000);
    when.setUTCMinutes(0, 0, 0);
    const proposed = await a.api.post(`/api/dates/${matchId}`, { data: { kind: "coffee", placeName: "Sam Levy's Village", placeDetail: "Borrowdale", times: [when.toISOString()] } });
    expect(proposed.status(), await proposed.text()).toBe(201);
    const planId = (await proposed.json()).plan.id as number;
    const confirmed = await b.api.post(`/api/dates/plan/${planId}/confirm`, { data: { time: when.toISOString() } });
    expect(confirmed.ok(), await confirmed.text()).toBe(true);

    // Turned on from the card in the chat, with a trusted contact kept on the phone.
    await a.page.goto(`/chat/${matchId}`);
    const setup = a.page.getByTestId("safety-setup");
    await expect(setup).toBeVisible({ timeout: 20_000 });
    await setup.getByTestId("switch-safety-check").click();
    await expect(setup.getByTestId("input-trusted-contact")).toBeVisible();
    await setup.getByTestId("input-trusted-contact").fill("077 123 4567");
    await setup.getByTestId("input-trusted-contact").blur();
    expect(await a.page.evaluate(() => localStorage.getItem("destira.trusted-contact"))).toBe("077 123 4567");
    const mine = await (await a.api.get(`/api/dates/plan/${planId}/safety`)).json();
    expect(mine.on).toBe(true);
    expect(new Date(mine.checkAt).getTime()).toBe(when.getTime() + 3_600_000);

    // Private: the other person sees nothing on; a stranger can't see it at all.
    expect((await (await b.api.get(`/api/dates/plan/${planId}/safety`)).json()).on).toBe(false);
    expect((await c.api.get(`/api/dates/plan/${planId}/safety`)).status()).toBe(404);
    expect((await c.api.post(`/api/dates/plan/${planId}/safety/answer`, { data: { answer: "help" } })).status()).toBe(404);

    // The check page: Get help shows the numbers at once and records it.
    await a.page.goto(`/date-check/${planId}`);
    await expect(a.page.getByTestId("safety-ask")).toBeVisible({ timeout: 20_000 });
    await a.page.getByTestId("button-get-help").click();
    const help = a.page.getByTestId("safety-help");
    await expect(help).toBeVisible();
    await expect(help.getByTestId("call-995")).toHaveAttribute("href", "tel:995");
    await expect(help.getByTestId("call-994")).toHaveAttribute("href", "tel:994");
    await expect(help.getByTestId("button-tell-contact")).toContainText("trusted contact");
    await expect.poll(async () => (await (await a.api.get(`/api/dates/plan/${planId}/safety`)).json()).answer).toBe("help");

    // Safe again.
    await help.getByTestId("button-safe-now").click();
    await expect(a.page.getByTestId("safety-fine")).toBeVisible();
    await expect.poll(async () => (await (await a.api.get(`/api/dates/plan/${planId}/safety`)).json()).answer).toBe("fine");

    // Turning it off removes it.
    const off = await (await a.api.post(`/api/dates/plan/${planId}/safety`, { data: { on: false } })).json();
    expect(off.on).toBe(false);
  } finally {
    for (const x of [a, b, c]) await x.api.delete("/api/account", { data: { confirmation: "DELETE" } }).catch(() => {});
    for (const x of [a, b, c]) await x.ctx.close();
  }
});
