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
  const r = await request.get("/robots.txt");
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toContain("text/plain");
  const robots = await r.text();
  for (const p of ["/api/", "/chat/", "/u/", "/admin", "/matches", "/discover", "/settings", "/profile", "/uploads/"]) {
    expect(robots).toContain(`Disallow: ${p}`);
  }
  // Public pages stay crawlable.
  expect(robots).not.toMatch(/^Disallow: \/(events|dating-in|privacy|signup)\/?$/m);
  expect(robots).toMatch(/^Sitemap: https?:\/\/[^/\s]+\/sitemap\.xml$/m);

  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/xml");
  const xml = await res.text();
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (m) => m[1]);
  expect(locs.length).toBe((xml.match(/<url>/g) || []).length);
  // Absolute, on one site, no duplicates.
  const origin = new URL(locs[0]).origin;
  for (const l of locs) expect(new URL(l).origin).toBe(origin);
  expect(new Set(locs).size).toBe(locs.length);
  for (const p of ["/", "/signup", "/dating-in/harare", "/dating-in/bulawayo", "/privacy", "/delete-account"]) {
    expect(locs).toContain(`${origin}${p}`);
  }
  // Every upcoming public event is listed; nothing private is.
  const city = await (await request.get("/api/public/city/harare")).json();
  for (const e of city.events) expect(locs).toContain(`${origin}/events/${e.id}`);
  for (const l of locs) {
    const path = new URL(l).pathname;
    expect(path === "/" || /^\/(signup|privacy|delete-account|dating-in\/[a-z-]+|events\/\d+)$/.test(path), path).toBe(true);
  }
  // Each listed page actually opens.
  for (const l of locs.slice(0, 12)) expect((await request.get(new URL(l).pathname)).status()).toBe(200);
});
