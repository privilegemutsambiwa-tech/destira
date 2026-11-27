// Empty screens point somewhere (Part M): a brand-new member with no likes
// and no chats sees three people from their own Discover deck, and a Lounge
// search that finds nothing offers the busy rooms instead. The people shown
// must be real ones from the deck, so the test compares with it.
import { test, expect, type BrowserContext, type Page } from "@playwright/test";

const stamp = Date.now();

test.describe.configure({ mode: "serial" });

let ctx: BrowserContext;
let page: Page;
let deck: string[] = [];

test.beforeAll(async ({ browser, baseURL }) => {
  if (!/localhost|127\.0\.0\.1/.test(baseURL!) && !process.env.SMOKE_ALLOW_REMOTE) throw new Error("Local servers only: this makes a member.");
  ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page = await ctx.newPage();
  const su = await ctx.request.post("/api/auth/signup", { data: { email: `empty-${stamp}@local.test`, password: "Smoke-test-123!", name: "Tariro" } });
  expect(su.ok(), await su.text()).toBe(true);
  const p = await ctx.request.post("/api/profiles", {
    data: { displayName: "Tariro", dateOfBirth: "1996-05-11", onboardingCompleted: true, isPublic: true, gender: "woman", seekingGenders: ["men"], location: "Harare", datingIntent: "relationship" },
  });
  expect(p.ok(), await p.text()).toBe(true);
  const d = await (await ctx.request.get("/api/profiles/discover")).json();
  deck = (d.profiles ?? []).map((x: any) => x.userId);
});

test.afterAll(async () => {
  await ctx?.request.delete("/api/account", { data: { confirmation: "DELETE" } }).catch(() => {});
  await ctx?.close();
});

async function suggestedPeople(path: string) {
  await page.goto(path);
  const block = page.getByTestId("suggest-people");
  if (!deck.length) {
    await page.waitForLoadState("networkidle");
    await expect(block).toHaveCount(0);
    return [];
  }
  await expect(block).toBeVisible();
  const rows = block.locator('[data-testid^="suggest-person-"]');
  await expect(rows.first()).toBeVisible();
  const ids = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace("suggest-person-", "")));
  expect(ids.length).toBeLessThanOrEqual(3);
  for (const id of ids) expect(deck, "only people from their own deck").toContain(id);
  return ids;
}

test("no likes yet: three people who fit, and they open", async () => {
  const ids = await suggestedPeople("/matches");
  test.skip(!ids.length, "the local deck is empty");
  await page.getByTestId(`suggest-person-${ids[0]}`).click();
  await expect(page).toHaveURL(new RegExp(`/u/${ids[0]}`));
});

test("no chats yet: the same people", async () => {
  await suggestedPeople("/chats");
});

test("a Lounge search that finds nothing offers busy rooms", async () => {
  const groups = await (await ctx.request.get("/api/groups")).json();
  await page.goto("/lounge");
  await page.getByTestId("input-search-groups").fill(`zz-nothing-${stamp}`);
  await expect(page.getByTestId("text-no-groups")).toBeVisible();
  const rooms = page.getByTestId("suggest-rooms");
  if (!groups.length) return await expect(rooms).toHaveCount(0);
  await expect(rooms).toBeVisible();
  const first = rooms.locator('[data-testid^="suggest-room-"]').first();
  const id = (await first.getAttribute("data-testid"))!.replace("suggest-room-", "");
  await first.click();
  await expect(page).toHaveURL(new RegExp(`/lounge/group/${id}`));
});
