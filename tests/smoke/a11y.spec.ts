// Accessibility on the main screens (Part K6): every control has a name,
// text meets AA contrast, Tab moves through the page visibly and never gets
// stuck, and the page still works with text at 200%. Signed-out screens,
// then the signed-in ones as a throwaway member (deleted at the end).
import { test, expect, request, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { focusWalk, lowContrast, textAt200, unnamedControls, type Finding } from "./a11y-audit";

const stamp = Date.now();
const PASSWORD = "Smoke-test-123!";

test.describe.configure({ mode: "serial" });

let ctx: BrowserContext;
let page: Page;
let other: APIRequestContext;
let matchId = 0;

async function member(api: APIRequestContext, name: string, gender: string, seeking: string) {
  const su = await api.post("/api/auth/signup", { data: { email: `a11y-${name.toLowerCase()}-${stamp}@local.test`, password: PASSWORD, name } });
  expect(su.ok(), await su.text()).toBe(true);
  const p = await api.post("/api/profiles", {
    data: { displayName: name, dateOfBirth: "1995-03-02", onboardingCompleted: true, isPublic: true, gender, seekingGenders: [seeking], location: "Harare", datingIntent: "relationship" },
  });
  expect(p.ok(), await p.text()).toBe(true);
  return (await su.json()).id as string;
}

test.beforeAll(async ({ browser, baseURL }) => {
  if (!/localhost|127\.0\.0\.1/.test(baseURL!) && !process.env.SMOKE_ALLOW_REMOTE) throw new Error("Local servers only: this makes members.");
  ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page = await ctx.newPage();
});

test.afterAll(async () => {
  for (const c of [ctx?.request, other]) await c?.delete("/api/account", { data: { confirmation: "DELETE" } }).catch(() => {});
  await other?.dispose();
  await ctx?.close();
});

async function settle(p: Page) {
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.waitForTimeout(800);
}

/** Runs every check on one screen and returns what it found. */
async function audit(path: string): Promise<Finding[]> {
  const found: Finding[] = [];
  // Both themes for contrast; names, focus and text size don't depend on it.
  // The app picks its theme from its own setting (light unless chosen), so
  // set that as Settings would, as well as the system preference.
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(path);
    await page.evaluate((s) => localStorage.setItem("destira-theme", s), scheme);
    await page.goto(path);
    await settle(page);
    found.push(...(await lowContrast(page)).map((f) => ({ ...f, check: `contrast (${scheme})` })));
    if (scheme === "light") found.push(...(await unnamedControls(page)), ...(await focusWalk(page)).findings);
  }
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => localStorage.setItem("destira-theme", "light"));
  await page.goto(path);
  await settle(page);
  found.push(...(await textAt200(page)));
  return found;
}

/** Fails with every finding listed, so the report says what to fix. */
function expectClean(path: string, found: Finding[]) {
  const report = found.map((f) => `[${f.check}] ${f.what}\n    ${f.detail}`).join("\n");
  expect(found.length, `${path}: ${found.length} accessibility findings\n${report}`).toBe(0);
}

for (const path of ["/", "/login", "/signup", "/forgot-password"]) {
  test(`signed out: ${path}`, async () => {
    expectClean(path, await audit(path));
  });
}

test("sign in a member with a match", async ({ baseURL }) => {
  const me = await member(ctx.request, "Tanaka", "man", "women");
  other = await request.newContext({ baseURL });
  const them = await member(other, "Chipo", "woman", "men");
  await ctx.request.post("/api/matches", { data: { targetId: them } });
  const back = await (await other.post("/api/matches", { data: { targetId: me } })).json();
  expect(back.mutual).toBe(true);
  matchId = back.id;
  await other.post(`/api/messages/${matchId}`, { data: { content: "Hello from an a11y check" } });
});

for (const path of ["/discover", "/matches", "/chat/:match", "/settings", "/events", "/lounge", "/profile", "/notifications", "/plans"]) {
  test(`signed in: ${path}`, async () => {
    const p = path.replace(":match", String(matchId));
    expectClean(p, await audit(p));
  });
}

test("a new message from them is read out; the history isn't", async () => {
  await page.goto(`/chat/${matchId}`);
  await settle(page);
  const live = page.locator('[role="status"][aria-live="polite"]').filter({ hasText: /Chipo:/ });
  // The message already in the chat (sent before it opened) is history.
  await expect(live).toHaveCount(0);
  await other.post(`/api/messages/${matchId}`, { data: { content: "Are you free on Saturday?" } });
  await expect(live).toContainText("Chipo: Are you free on Saturday?", { timeout: 30_000 });
});

test("settings rows work from the keyboard, and toasts are announced", async () => {
  await page.goto("/settings");
  await settle(page);
  // A settings row is reached with Tab and opened with Enter.
  await page.locator('[data-testid="row-change-email"]:visible').focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("input-new-email")).toBeVisible();
  // Submitting it empty shows a toast; a screen reader must hear it.
  await page.getByTestId("button-send-email-verify").click();
  const spoken = page.locator('[aria-live="assertive"], [aria-live="polite"]').filter({ hasText: "Please enter a valid email address" });
  await expect(spoken.first()).toBeAttached();
});
