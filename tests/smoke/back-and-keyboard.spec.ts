// Android polish (Part M4): the back button closes the sheet or dialog on top
// before it leaves the screen (lib/back-button.ts), and the tab bar steps
// aside while the keyboard is up (lib/keyboard-overlay.ts). Back is called
// the way the app's listener calls it; the keyboard is a shorter viewport.
import { test, expect } from "@playwright/test";

const stamp = Date.now();

test("back closes the overlay on top; tab bar hides while typing", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const api = ctx.request;
  expect((await api.post("/api/auth/signup", { data: { email: `kb-${stamp}@local.test`, password: "Smoke-test-123!", name: "Emfour" } })).ok()).toBe(true);
  await api.post("/api/profiles", { data: { displayName: "Emfour", dateOfBirth: "1995-03-02", onboardingCompleted: true, isPublic: true, gender: "woman", seekingGenders: ["man"], location: "Harare", datingIntent: "relationship" } });
  // The app's own module, served by the dev server (a path the browser loads, not one tsc resolves).
  const back = () => page.evaluate(async (src) => (await import(src)).closeTopOverlay() as boolean, "/src/lib/back-button.ts");

  // A Radix dialog: Lounge's "new room".
  await page.goto("/lounge");
  await page.getByTestId("button-create-group").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await back()).toBe(true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await back()).toBe(false); // nothing open: back is left to the router
  expect(page.url()).toContain("/lounge");

  // Typing: focus a field, then the keyboard takes 40% of the screen.
  const field = page.getByRole("searchbox").or(page.locator('input[type="search"], input[type="text"]')).first();
  await field.focus();
  await page.setViewportSize({ width: 390, height: 500 });
  await expect(page.locator("html")).toHaveClass(/vf-kb-open/);
  await expect(page.locator(".vf-tabbar")).toBeHidden();
  await field.blur();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("html")).not.toHaveClass(/vf-kb-open/);
  await expect(page.locator(".vf-tabbar")).toBeVisible();

  await api.delete("/api/account", { data: { confirmation: "DELETE" } }).catch(() => {});
  await ctx.close();
});
