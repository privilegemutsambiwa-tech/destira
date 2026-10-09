// Public, signed-out view of an event: the teaser a friend sees when they tap
// a shared /events/:id link, the WhatsApp/OG preview tags crawlers read, and
// the 1200×630 share card image. Same approach as group invites
// (server/group-invite.ts), reusing its fonts, card size and meta injection.
//
// What a signed-out visitor may see is deliberately narrow: what, when, the
// suburb/city, the cover, how many are going. Never attendee identities,
// never a street address, never contact details.
import { existsSync, readFileSync, mkdirSync } from "fs";
import path from "path";
import crypto from "crypto";
import satori from "satori";
import sharp from "sharp";
import type { Request } from "express";
import { and, eq, count } from "drizzle-orm";
import { db } from "./db";
import { events, eventAttendees, groups, profiles, type Event } from "@shared/schema";
import { CACHE_DIR, CARD_W, CARD_H, loadFonts, photoDataUri, publicOrigin, trimToWord, escapeHtml } from "./group-invite";

const HARARE_UTC_OFFSET_H = 2;

export interface PublicEventTeaser {
  id: number;
  title: string;
  description: string | null;
  kind: string | null;
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  suburb: string | null;
  city: string | null;
  coverImageUrl: string | null;
  goingCount: number;
  isFull: boolean;
  status: string;
  isOfficial: boolean;
  sponsorName: string | null;
  hostLabel: string;
  costLine: string;
  hasLead: boolean;
}

/** Null when the event isn't something a stranger should be able to preview
 *  (draft, under review, invite/group-only, or its host was suspended). */
export async function getPublicEventTeaser(eventId: number): Promise<PublicEventTeaser | null> {
  if (!Number.isFinite(eventId)) return null;
  const [row] = await db
    .select({ event: events, hostStatus: profiles.moderationStatus })
    .from(events)
    .leftJoin(profiles, eq(profiles.userId, events.hostUserId))
    .where(eq(events.id, eventId));
  if (!row) return null;
  const e = row.event;
  if (e.visibility !== "public") return null;
  if (e.status !== "published" && e.status !== "cancelled") return null;
  if ((row.hostStatus ?? "active") !== "active") return null;

  const [[going], group] = await Promise.all([
    db.select({ n: count() }).from(eventAttendees).where(and(eq(eventAttendees.eventId, e.id), eq(eventAttendees.status, "going"))),
    e.groupId != null ? db.select({ name: groups.name }).from(groups).where(eq(groups.id, e.groupId)).then((r) => r[0]) : Promise.resolve(undefined),
  ]);
  const goingCount = Number(going?.n ?? 0);
  const isPrivateHome = e.locationTier === "private_residence";

  return {
    id: e.id,
    title: e.title,
    description: e.description ? trimToWord(e.description, 400) : null,
    kind: e.kind,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt ? e.endsAt.toISOString() : null,
    venueName: isPrivateHome ? null : e.venueName,
    suburb: e.suburb,
    city: e.city,
    coverImageUrl: e.coverImageUrl,
    goingCount,
    isFull: e.seatModel === "capped" && e.seatCount != null && goingCount >= e.seatCount,
    status: e.status,
    isOfficial: e.isOfficial,
    sponsorName: e.sponsorName,
    hostLabel: e.isOfficial ? "Destira Official" : group?.name ? `Hosted by ${group.name}` : "Hosted by a Destira member",
    costLine:
      e.costModel === "contribute" && e.contributionAmount != null
        ? `$${Number(e.contributionAmount)} contribution, settled in person`
        : e.costModel === "pay_own_way"
          ? "Pay your own way"
          : "Free to join",
    hasLead: !!e.leadUserId,
  };
}

function whenLine(iso: string): string {
  const local = new Date(new Date(iso).getTime() + HARARE_UTC_OFFSET_H * 3_600_000);
  const day = local.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const time = local.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
  return `${day} · ${time}`;
}

// ── share card ─────────────────────────────────────────────────────

function cardHash(t: PublicEventTeaser): string {
  // Going count is bucketed so the card refreshes as momentum builds without
  // re-rendering on every single RSVP.
  const bucket = t.goingCount < 10 ? t.goingCount : Math.floor(t.goingCount / 5) * 5;
  const basis = `${t.id}:${t.title}:${t.startsAt}:${t.coverImageUrl ?? ""}:${t.suburb ?? ""}:${bucket}:${t.status}`;
  return crypto.createHash("sha1").update(basis).digest("hex").slice(0, 16);
}

export function eventShareCardUrl(origin: string, t: PublicEventTeaser): string {
  return `${origin}/api/events/${t.id}/share-card/${cardHash(t)}.jpg`;
}

async function renderEventCardSvg(t: PublicEventTeaser): Promise<string> {
  const photo = t.coverImageUrl ? photoDataUri(t.coverImageUrl) : null;
  const local = new Date(new Date(t.startsAt).getTime() + HARARE_UTC_OFFSET_H * 3_600_000);
  const dow = local.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }).toUpperCase();
  const dayNum = String(local.getUTCDate());
  const month = local.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }).toUpperCase();
  const where = [t.suburb, t.city].filter(Boolean).join(", ");
  const goingText = t.goingCount > 0 ? `${t.goingCount} going` : "Be the first to join";
  const label = t.isOfficial ? "DESTIRA OFFICIAL" : "EVENT ON DESTIRA";

  const tree = {
    type: "div",
    props: {
      style: { width: CARD_W, height: CARD_H, display: "flex", position: "relative", background: "#0C0910", fontFamily: "DM Mono" },
      children: [
        photo
          ? { type: "img", props: { src: photo, style: { position: "absolute", inset: 0, width: CARD_W, height: CARD_H, objectFit: "cover" } } }
          : { type: "div", props: { style: { position: "absolute", inset: 0, width: CARD_W, height: CARD_H, display: "flex", background: "linear-gradient(150deg, #3A1C12 0%, #1A0F14 55%, #0C0910 100%)" } } },
        { type: "div", props: { style: { position: "absolute", inset: 0, width: CARD_W, height: CARD_H, display: "flex", background: "linear-gradient(to top, rgba(12,9,16,.94) 0%, rgba(12,9,16,.45) 55%, rgba(12,9,16,.15) 100%)" } } },
        // date stub
        {
          type: "div",
          props: {
            style: { position: "absolute", top: 48, left: 56, width: 132, height: 148, borderRadius: 24, background: "#F5F0EA", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
            children: [
              { type: "div", props: { style: { fontFamily: "DM Mono", fontWeight: 500, fontSize: 22, letterSpacing: 3, color: "#B34B34", display: "flex" }, children: dow } },
              { type: "div", props: { style: { fontFamily: "Instrument Serif", fontSize: 72, lineHeight: 1, color: "#1A1418", display: "flex" }, children: dayNum } },
              { type: "div", props: { style: { fontFamily: "DM Mono", fontSize: 18, letterSpacing: 3, color: "#6B5F67", display: "flex" }, children: month } },
            ],
          },
        },
        // brand mark
        {
          type: "div",
          props: {
            style: { position: "absolute", top: 48, right: 56, width: 56, height: 56, borderRadius: 14, background: "#FF6B4A", display: "flex", alignItems: "center", justifyContent: "center" },
            children: [{ type: "div", props: { style: { width: 22, height: 22, borderRadius: "50%", background: "#FFF6EE", display: "flex" } } }],
          },
        },
        {
          type: "div",
          props: {
            style: { position: "absolute", left: 56, right: 56, bottom: 50, display: "flex", flexDirection: "column" },
            children: [
              { type: "div", props: { style: { fontSize: 20, letterSpacing: 3, color: "#FF8E73", display: "flex", marginBottom: 12 }, children: label } },
              { type: "div", props: { style: { fontFamily: "Instrument Serif", fontSize: t.title.length > 40 ? 60 : 74, lineHeight: 1.05, color: "#F5F0EA", display: "flex" }, children: trimToWord(t.title, 70) } },
              {
                type: "div",
                props: {
                  style: { fontSize: 24, color: "#D9D0DA", display: "flex", marginTop: 18 },
                  children: [whenLine(t.startsAt), where, goingText].filter(Boolean).join("  ·  "),
                },
              },
            ],
          },
        },
      ],
    },
  };
  return satori(tree as any, { width: CARD_W, height: CARD_H, fonts: loadFonts() });
}

export async function getOrRenderEventShareCard(t: PublicEventTeaser): Promise<Buffer | null> {
  const filePath = path.join(CACHE_DIR, `event-${t.id}-${cardHash(t)}.jpg`);
  if (existsSync(filePath)) {
    try {
      return readFileSync(filePath);
    } catch {
      /* regenerate */
    }
  }
  try {
    const svg = await renderEventCardSvg(t);
    const jpg = await sharp(Buffer.from(svg)).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    await sharp(jpg).toFile(filePath);
    return jpg;
  } catch (e) {
    console.error("[event-share] card generation failed:", e);
    return null;
  }
}

// ── OG meta for /events/:id ────────────────────────────────────────

const EVENT_PATH = /^\/events\/(\d+)(?:[/?#]|$)/;

export async function withEventMeta(url: string, req: Request, page: string): Promise<string | null> {
  const m = EVENT_PATH.exec(url);
  if (!m) return null;
  try {
    const t = await getPublicEventTeaser(Number(m[1]));
    if (!t) return page;
    const origin = publicOrigin(req);
    const where = [t.suburb, t.city].filter(Boolean).join(", ");
    const title = `${t.title} · ${whenLine(t.startsAt)}`;
    const description = [
      t.isOfficial ? "Destira Official event" : t.hostLabel,
      where,
      t.goingCount > 0 ? `${t.goingCount} going` : "Be the first to join",
      t.description ? trimToWord(t.description, 110) : null,
    ].filter(Boolean).join(" · ");
    const imageUrl = eventShareCardUrl(origin, t);
    const tags = [
      `<meta property="og:type" content="website" />`,
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
      `<meta property="og:url" content="${escapeHtml(`${origin}/events/${t.id}`)}" />`,
      `<meta property="og:image" content="${escapeHtml(imageUrl)}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
      `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`,
    ].join("\n    ");
    return page
      .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
      .replace("</head>", `    ${tags}\n  </head>`);
  } catch (e) {
    console.error("Event OG render error:", e);
    return page;
  }
}

export type { Event };
