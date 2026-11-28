// Search pages (docs/destira-3-upgrade-prompt.md Part H6): "Dating in Harare"
// and friends, plus robots.txt and sitemap.xml. A city page lists upcoming
// public events there (the same signed-out teasers an event link shows),
// never member data. Its title, description, structured data and a plain
// HTML copy of the content are written into the page on the server, so a
// search engine reads it without running the app.
import type { Express, Request } from "express";
import { getUpcomingPublicEvents, type PublicEventTeaser } from "./event-share";
import { escapeHtml, publicOrigin } from "./group-invite";
import { getSignedUrl, keyFromUploadUrl } from "./storage/objectStorage";
import { CITY_PAGES, HOW_IT_WORKS, cityBySlug, cityDescription, cityPath, cityTitle, type CityPage } from "@shared/city-pages";

const CITY_PATH = /^\/dating-in\/([a-z-]+)\/?(?:[?#].*)?$/;
const HARARE_OFFSET_MS = 2 * 3_600_000;

export interface CityEvent {
  id: number;
  title: string;
  startsAt: string;
  suburb: string | null;
  city: string | null;
  coverImageUrl: string | null;
  goingCount: number;
  isFull: boolean;
  costLine: string;
  isOfficial: boolean;
}

async function present(t: PublicEventTeaser): Promise<CityEvent> {
  // /uploads/* is members-only: a signed-out visitor needs a signed link.
  const key = keyFromUploadUrl(t.coverImageUrl);
  const coverImageUrl = key ? await getSignedUrl(key, 24 * 60 * 60).catch(() => null) : t.coverImageUrl;
  return {
    id: t.id, title: t.title, startsAt: t.startsAt, suburb: t.suburb, city: t.city, coverImageUrl,
    goingCount: t.goingCount, isFull: t.isFull, costLine: t.costLine, isOfficial: t.isOfficial,
  };
}

const cache = new Map<string, { at: number; events: CityEvent[] }>();
export async function cityEvents(c: CityPage): Promise<CityEvent[]> {
  const hit = cache.get(c.slug);
  if (hit && Date.now() - hit.at < 60_000) return hit.events;
  const events = await Promise.all((await getUpcomingPublicEvents(12, c.name)).map(present));
  cache.set(c.slug, { at: Date.now(), events });
  return events;
}

function whenLine(iso: string): string {
  const local = new Date(new Date(iso).getTime() + HARARE_OFFSET_MS);
  const day = local.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const time = local.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
  return `${day}, ${time}`;
}

/** The page's tags and a plain-HTML copy of its content, for `/dating-in/:slug`.
 *  Null when the URL isn't a city page. */
export async function withCityMeta(url: string, req: Request, page: string): Promise<string | null> {
  const m = CITY_PATH.exec(url);
  if (!m) return null;
  const c = cityBySlug(m[1]);
  if (!c) return null;
  try {
    const origin = publicOrigin(req);
    const canonical = `${origin}${cityPath(c)}`;
    const title = cityTitle(c);
    const description = cityDescription(c);
    const events = await cityEvents(c);
    const tags = [
      `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
      `<meta name="description" content="${escapeHtml(description)}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="Destira" />`,
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
      `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
      `<meta property="og:image" content="${escapeHtml(`${origin}/brand/og-default.png`)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
    ].join("\n    ");
    const ld = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `Upcoming Destira events in ${c.name}`,
      itemListElement: events.map((e, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${origin}/events/${e.id}`,
        name: e.title,
      })),
    };
    const ldTag = `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
    // What the app renders, as plain HTML; replaced by the app once it loads.
    const body = [
      `<main style="max-width:720px;margin:0 auto;padding:24px 16px;font-family:sans-serif">`,
      `<h1>Dating in ${escapeHtml(c.name)}</h1>`,
      `<p>${escapeHtml(c.blurb)}</p>`,
      `<h2>Upcoming events in ${escapeHtml(c.name)}</h2>`,
      events.length
        ? `<ul>${events.map((e) => `<li><a href="/events/${e.id}">${escapeHtml(e.title)}</a>, ${escapeHtml(whenLine(e.startsAt))}${e.suburb ? `, ${escapeHtml(e.suburb)}` : ""}</li>`).join("")}</ul>`
        : `<p>New events are posted every week.</p>`,
      `<h2>How Destira works</h2>`,
      `<ul>${HOW_IT_WORKS.map((h) => `<li><strong>${escapeHtml(h.title)}.</strong> ${escapeHtml(h.body)}</li>`).join("")}</ul>`,
      `<p><a href="/signup">Join Destira, free</a></p>`,
      `</main>`,
    ].join("");
    return page
      .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
      .replace(/\s*<meta[^>]*data-og-default[^>]*>/g, "")
      .replace("</head>", `    ${tags}\n    ${ldTag}\n  </head>`)
      .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  } catch (e) {
    console.error("City page render error:", e);
    return page;
  }
}

export function registerCityPageRoutes(app: Express) {
  app.get("/api/public/city/:slug", async (req, res) => {
    const c = cityBySlug(req.params.slug);
    if (!c) return res.status(404).json({ message: "We're not in that city yet" });
    try {
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json({ city: c, events: await cityEvents(c) });
    } catch (e) {
      console.error("City page error:", e);
      res.json({ city: c, events: [] });
    }
  });

  // Search engines: the public pages only. The app behind sign-in is private.
  app.get("/robots.txt", (req, res) => {
    const origin = publicOrigin(req);
    res.type("text/plain").setHeader("Cache-Control", "public, max-age=3600");
    res.send([
      "User-agent: *",
      "Allow: /",
      "Disallow: /api/",
      "Disallow: /admin",
      "Disallow: /chat/",
      "Disallow: /call/",
      "Disallow: /u/",
      "Disallow: /settings",
      "Disallow: /join/",
      "Disallow: /date-check/",
      "Disallow: /uploads/",
      "",
      `Sitemap: ${origin}/sitemap.xml`,
      "",
    ].join("\n"));
  });

  app.get("/sitemap.xml", async (req, res) => {
    const origin = publicOrigin(req);
    const urls: { loc: string; changefreq: string; lastmod?: string }[] = [
      { loc: `${origin}/`, changefreq: "weekly" },
      ...CITY_PAGES.map((c) => ({ loc: `${origin}${cityPath(c)}`, changefreq: "daily" })),
      { loc: `${origin}/privacy`, changefreq: "monthly" },
    ];
    try {
      for (const t of await getUpcomingPublicEvents(200)) urls.push({ loc: `${origin}/events/${t.id}`, changefreq: "daily" });
    } catch (e) {
      console.error("Sitemap events error:", e);
    }
    res.type("application/xml").setHeader("Cache-Control", "public, max-age=3600");
    res.send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map((u) => `  <url><loc>${escapeHtml(u.loc)}</loc><changefreq>${u.changefreq}</changefreq></url>`).join("\n") +
      `\n</urlset>\n`,
    );
  });
}
