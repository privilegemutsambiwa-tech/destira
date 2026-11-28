// Search pages (Part H6): "Dating in Harare" works signed out, lists the
// city's real upcoming public events, carries its own title and canonical
// link in the HTML a crawler reads, and robots.txt / sitemap.xml point
// search engines at the public pages only.
import { test, expect } from "@playwright/test";

test("a city page shows its real upcoming events, signed out", async ({ page, request }) => {
  const api = await (await request.get("/api/public/city/harare")).json();
  await page.goto("/dating-in/harare");
  await expect(page.getByTestId("text-city-title")).toHaveText("Dating in Harare");
  await expect(page).toHaveTitle("Dating in Harare | Destira");
  if (api.events.length) {
    for (const e of api.events) await expect(page.getByTestId(`landing-event-${e.id}`)).toBeVisible();
    // Every event listed is in Harare.
    expect(api.events.every((e: any) => /harare/i.test(e.city ?? ""))).toBe(true);
  } else {
    await expect(page.getByTestId("city-no-events")).toBeVisible();
  }
  await expect(page.getByTestId("button-city-email")).toBeVisible();
  await page.getByTestId("button-city-email").click();
  await expect(page).toHaveURL(/\/signup/);
});

test("the HTML a search engine reads has the page in it", async ({ request }) => {
  const html = await (await request.get("/dating-in/bulawayo")).text();
  expect(html).toContain("<title>Dating in Bulawayo | Destira</title>");
  expect(html).toMatch(/<link rel="canonical" href="[^"]+\/dating-in\/bulawayo"/);
  expect(html).toContain("<h1>Dating in Bulawayo</h1>");
  expect(html).toContain('"@type":"ItemList"');
  // The site-wide default tags are replaced, not duplicated.
  expect(html).not.toMatch(/<meta[^>]*data-og-default/);
});

test("an unknown city says so", async ({ page, request }) => {
  expect((await request.get("/api/public/city/atlantis")).status()).toBe(404);
  await page.goto("/dating-in/atlantis");
  await expect(page.getByTestId("city-unknown")).toBeVisible();
});

test("robots.txt and the sitemap list public pages only", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /api/");
  expect(robots).toContain("Disallow: /chat/");
  expect(robots).toMatch(/Sitemap: .+\/sitemap\.xml/);
  const res = await request.get("/sitemap.xml");
  expect(res.headers()["content-type"]).toContain("xml");
  const xml = await res.text();
  expect(xml).toContain("/dating-in/harare</loc>");
  expect(xml).toContain("/dating-in/bulawayo</loc>");
  expect(xml).not.toMatch(/\/(u|chat|api)\//);
});
