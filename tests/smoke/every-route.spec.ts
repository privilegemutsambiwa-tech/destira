// Every screen, both themes (Part M): no crash, no unnamed control, AA
// contrast in light and dark, and the page doesn't jump while it loads
// (layout shift under 0.1, the "good" line for CLS). Signed-out screens, then
// every signed-in one as a throwaway member with a match (deleted at the end).
// The K6 suite (a11y.spec.ts) goes deeper on the main screens: keyboard and
// text at 200%.
import { test, expect, request, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { layoutShift, lowContrast, unnamedControls, watchLayoutShift, type Finding } from "./a11y-audit";

const stamp = Date.now();
const PASSWORD = "Smoke-test-123!";
const MAX_SHIFT = 0.1;

test.describe.configure({ mode: "serial" });

let ctx: BrowserContext;
let page: Page;
let other: APIRequestContext;
const ids: Record<string, string> = {};
let crashes: string[] = [];

async function member(api: APIRequestContext, name: string, gender: string, seeking: string) {
  const su = await api.post("/api/auth/signup", { data: { email: `routes-${name.toLowerCase()}-${stamp}@local.test`, password: PASSWORD, name } });
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
  await watchLayoutShift(page);
  page.on("pageerror", (e) => crashes.push(`uncaught: ${e.message.split("\n")[0]}`));
});

test.afterAll(async () => {
  for (const c of [ctx?.request, other]) await c?.delete("/api/account", { data: { confirmation: "DELETE" } }).catch(() => {});
  await other?.dispose();
  await ctx?.close();
});

async function settle(p: Page) {
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.waitForTimeout(900);
}

/** One screen in one theme: loads fresh so the layout shift covers the whole load. */
async function check(path: string, scheme: "light" | "dark"): Promise<Finding[]> {
  const found: Finding[] = [];
  await page.emulateMedia({ colorScheme: scheme });
  await page.evaluate((s) => localStorage.setItem("destira-theme", s), scheme).catch(() => {});
  crashes = [];
  await page.goto(path);
  await settle(page);
  if (await page.getByText("Something broke on our side").count()) crashes.push("the error screen showed");
  for (const c of crashes) found.push({ check: `crash (${scheme})`, what: c, detail: page.url() });
  found.push(...(await lowContrast(page)).map((f) => ({ ...f, check: `contrast (${scheme})` })));
  if (scheme === "light") {
    found.push(...(await unnamedControls(page)));
    const shift = await layoutShift(page);
    if (shift.total >= MAX_SHIFT) {
      found.push({
        check: "layout shift",
        what: `the page jumped ${shift.total.toFixed(3)} while loading (limit ${MAX_SHIFT})`,
        detail: shift.worst.map((w) => `${w.value.toFixed(3)} at ${w.at} ms: ${w.src.join(", ")}`).join(" | "),
      });
    }
  }
  return found;
}

async function audit(path: string) {
  // Visit once so localStorage exists for this origin, then each theme.
  if (!page.url().startsWith("http")) await page.goto("/");
  const found = [...(await check(path, "light")), ...(await check(path, "dark"))];
  // Collected rather than failed here, so one bad screen doesn't hide the
  // rest: the last test fails with the whole list.
  if (found.length) results.push({ path, found });
}

const results: { path: string; found: Finding[] }[] = [];

const SIGNED_OUT = ["/", "/login", "/signup", "/forgot-password", "/reset-password", "/privacy", "/delete-account", "/redeem"];
for (const path of SIGNED_OUT) test(`signed out: ${path}`, () => audit(path));

test("sign in a member with a match", async ({ baseURL }) => {
  const me = await member(ctx.request, "Rufaro", "man", "women");
  other = await request.newContext({ baseURL });
  const them = await member(other, "Nyasha", "woman", "men");
  await ctx.request.post("/api/matches", { data: { targetId: them } });
  const back = await (await other.post("/api/matches", { data: { targetId: me } })).json();
  expect(back.mutual).toBe(true);
  ids.match = String(back.id);
  ids.them = them;
  await other.post(`/api/messages/${back.id}`, { data: { content: "Hello from the every-screen check" } });
  // Ids for the screens that need one, from whatever the local data has.
  const groups = await (await ctx.request.get("/api/groups")).json().catch(() => []);
  if (Array.isArray(groups) && groups[0]) ids.group = String(groups[0].id);
  const events = await (await ctx.request.get("/api/events")).json().catch(() => []);
  const ev = Array.isArray(events) ? events[0] : null;
  if (ev) {
    ids.event = String(ev.id);
    if (ev.hostId ?? ev.hostUserId ?? ev.createdBy) ids.host = String(ev.hostId ?? ev.hostUserId ?? ev.createdBy);
  }
});

const SIGNED_IN = [
  "/essentials", "/onboarding", "/meet-your-twin", "/invite",
  "/profile", "/u/:them", "/photos", "/profile/details", "/profile/preview",
  "/matches", "/discover", "/chats", "/chat/:match", "/interviews",
  "/lounge", "/lounge/group/:group", "/lounge/group/:group/info", "/lounge/group/:group/games",
  "/events", "/events/:event", "/events/host", "/hosts/:host", "/settings/events", "/settings/filters",
  "/wingman", "/introductions", "/vouches", "/plans-board", "/circles", "/tables", "/friends",
  "/notifications", "/twin-chat", "/twin-disclosure",
  "/plans", "/crown", "/billing", "/upgrade", "/settings",
];
for (const path of SIGNED_IN) {
  test(`signed in: ${path}`, async () => {
    const missing = path.match(/:(\w+)/g)?.map((k) => k.slice(1)).filter((k) => !ids[k]) ?? [];
    test.skip(missing.length > 0, `no local ${missing.join(", ")} to open`);
    await audit(path.replace(/:(\w+)/g, (_, k) => ids[k]));
  });
}

test("every screen clean", () => {
  const report = results.map((r) => `${r.path}: ${r.found.length}` + r.found.map((f) => `\n  [${f.check}] ${f.what}\n      ${f.detail}`).join("")).join("\n");
  expect(results.length, `${results.length} screens with findings\n${report}`).toBe(0);
});
