// Server-side rendering for group invite links (/join/:token): the OG/share
// preview crawlers read, the share-card image they display, and the shared
// token-resolution logic the join page's own preview API reuses — one path,
// not two, so the two surfaces can't drift apart on what a given invite
// actually grants.
import { readFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import satori from "satori";
import sharp from "sharp";
import crypto from "crypto";
import type { Request } from "express";
import { storage } from "./storage";
import type { Group } from "@shared/schema";

// __dirname doesn't exist in native ESM (dev, via tsx) — only in the
// esbuild-bundled CJS the production build produces (dist/index.cjs). This
// works in both: import.meta.url is always available in ESM source, and
// esbuild rewrites it correctly when bundling to CJS.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.resolve(__dirname, "assets", "fonts");
const CACHE_DIR = path.join(process.cwd(), "uploads", "share-cards");
const CARD_W = 1200;
const CARD_H = 630;

export function publicOrigin(req: Request): string {
  return process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get("host")}`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Trim to ~150 chars at a word boundary — never mid-word. */
export function trimToWord(s: string, max = 150): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

let fontCache: { name: string; data: Buffer; weight: 400 | 500; style: "normal" }[] | null = null;
function loadFonts() {
  if (fontCache) return fontCache;
  fontCache = [
    { name: "Instrument Serif", data: readFileSync(path.join(FONTS_DIR, "InstrumentSerif-Regular.ttf")), weight: 400, style: "normal" },
    { name: "DM Mono", data: readFileSync(path.join(FONTS_DIR, "DMMono-Regular.ttf")), weight: 400, style: "normal" },
    { name: "DM Mono", data: readFileSync(path.join(FONTS_DIR, "DMMono-Medium.ttf")), weight: 500, style: "normal" },
  ];
  return fontCache;
}

/** The three photo fields in ascending "hero quality" order — bannerUrl is
 *  the wide shot GroupInfo already uses as its hero, groupPhotoUrl next,
 *  iconUrl (a small avatar) as the last resort. */
export function groupHeroPhotoUrl(group: Pick<Group, "bannerUrl" | "groupPhotoUrl" | "iconUrl">): string | null {
  return group.bannerUrl || group.groupPhotoUrl || group.iconUrl || null;
}

/** Local /uploads or /photos URL → a data: URI Satori can use directly.
 *  Satori doesn't fetch remote URLs itself, so any group photo we composite
 *  into the card has to be read straight off disk and inlined. Returns null
 *  for anything not a same-origin local path. */
function photoDataUri(url: string): string | null {
  try {
    let abs: string;
    if (url.startsWith("/uploads/")) {
      abs = path.join(process.cwd(), url);
    } else if (url.startsWith("/photos/")) {
      abs = path.join(process.cwd(), "client", "public", url);
    } else {
      return null; // not a local path we can read synchronously
    }
    if (!existsSync(abs)) return null;
    const buf = readFileSync(abs);
    const ext = path.extname(abs).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

interface InviteResolution {
  valid: boolean;
  reason?: "invalid" | "expired";
  group?: Group;
  memberCount?: number;
  isFull?: boolean;
  approvalRequired?: boolean;
}

/** The one place invite-token validity + group/member data is resolved.
 *  Both the OG-tag route and the join page's own preview API call this, so
 *  what a crawler is told and what the page shows can't drift apart. */
export async function resolveInvite(token: string): Promise<InviteResolution> {
  const link = await storage.getInviteLink(token);
  if (!link) return { valid: false, reason: "invalid" };
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return { valid: false, reason: "expired" };
  }
  const group = await storage.getGroup(link.groupId);
  if (!group) return { valid: false, reason: "invalid" };
  const members = await storage.getGroupMembers(link.groupId);
  const memberCount = members.length;
  const isFull = typeof group.maxMembers === "number" && memberCount >= group.maxMembers;
  return {
    valid: true,
    group,
    memberCount,
    isFull,
    approvalRequired: group.privacyMode === "request-to-join",
  };
}

/** 1200×630 share card: group photo, name in Instrument Serif, member count
 *  in mono, small Destira mark in the corner. Satori lays it out (a small
 *  flexbox-subset SVG renderer, no browser), sharp rasterizes to PNG — both
 *  already either installed or trivial to add, no headless Chrome needed. */
async function renderCardSvg(group: Group, memberCount: number): Promise<string> {
  const photoUrl = groupHeroPhotoUrl(group);
  const photoDataUrl = photoUrl ? photoDataUri(photoUrl) : null;

  const tree = {
    type: "div",
    props: {
      style: {
        width: CARD_W,
        height: CARD_H,
        display: "flex",
        position: "relative",
        background: "#0C0910",
        fontFamily: "DM Mono",
      },
      children: [
        photoDataUrl
          ? {
              type: "img",
              props: {
                src: photoDataUrl,
                style: { position: "absolute", inset: 0, width: CARD_W, height: CARD_H, objectFit: "cover" },
              },
            }
          : {
              type: "div",
              props: {
                style: {
                  position: "absolute",
                  inset: 0,
                  width: CARD_W,
                  height: CARD_H,
                  display: "flex",
                  background: "linear-gradient(160deg, #2A1810, #0C0910)",
                },
              },
            },
        // scrim for text legibility over the photo
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              inset: 0,
              width: CARD_W,
              height: CARD_H,
              display: "flex",
              background: "linear-gradient(to top, rgba(12,9,16,.92) 0%, rgba(12,9,16,.25) 55%, rgba(12,9,16,.05) 100%)",
            },
          },
        },
        // Destira mark, top-right corner — small ember tile with the lens
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              top: 40,
              right: 40,
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#FF6B4A",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            },
            children: [
              {
                type: "div",
                props: {
                  style: { width: 22, height: 22, borderRadius: "50%", background: "#FFF6EE", display: "flex" },
                },
              },
            ],
          },
        },
        // name + member count
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              left: 56,
              right: 56,
              bottom: 48,
              display: "flex",
              flexDirection: "column",
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    fontFamily: "DM Mono",
                    fontSize: 20,
                    letterSpacing: 3,
                    textTransform: "uppercase",
                    color: "#8FE3C7",
                    display: "flex",
                    marginBottom: 14,
                  },
                  children: `${memberCount} member${memberCount === 1 ? "" : "s"} · Destira`,
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    fontFamily: "Instrument Serif",
                    fontWeight: 400,
                    fontSize: 76,
                    lineHeight: 1.05,
                    color: "#F5F0EA",
                    display: "flex",
                  },
                  children: group.name,
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

function cacheKeyFor(group: Group): string {
  const basis = `${group.id}:${groupHeroPhotoUrl(group) ?? ""}:${group.name}:${group.description ?? ""}`;
  return crypto.createHash("sha1").update(basis).digest("hex").slice(0, 16);
}

/** Cache path for a group's share card, keyed by id + a content hash so it
 *  regenerates when the photo/name/description change but not on every
 *  member join/leave (member count isn't in the hash — mild staleness there
 *  is fine, a re-render on every join would not be). */
export function shareCardPath(groupId: number, hash: string): string {
  return path.join(CACHE_DIR, `group-${groupId}-${hash}.jpg`);
}

export function shareCardHashFor(group: Group): string {
  return cacheKeyFor(group);
}

/** Generates (or returns the cached) JPEG buffer for a group's share card.
 *  Returns null if generation fails so the caller can fall back to the raw
 *  group photo, and null-with-no-photo falls back further to the branded
 *  default — a broken og:image is worse than no image. */
export async function getOrRenderShareCard(group: Group, memberCount: number): Promise<Buffer | null> {
  const hash = cacheKeyFor(group);
  const filePath = shareCardPath(group.id, hash);
  if (existsSync(filePath)) {
    try {
      return readFileSync(filePath);
    } catch {
      /* fall through to regenerate */
    }
  }
  try {
    const svg = await renderCardSvg(group, memberCount);
    // JPEG, not PNG — this is a photo-heavy card, not a graphic needing
    // transparency, and it cuts the file crawlers fetch by ~10x.
    const jpg = await sharp(Buffer.from(svg)).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    await sharp(jpg).toFile(filePath);
    return jpg;
  } catch (e) {
    console.error("[group-invite] share card generation failed:", e);
    return null;
  }
}

/** Per-group OG meta values. Invite-only groups get a generic card with no
 *  group detail in the crawler-facing preview — the invite link itself is
 *  still the real access grant once someone actually taps through; this is
 *  only about what a forwarded-but-unopened link shows to anyone in the
 *  chat, including people with no account. */
export function ogMetaFor(
  req: Request,
  resolution: InviteResolution,
  token: string,
): { title: string; description: string; imageUrl: string; imageIsGenerated: boolean; url: string } {
  const origin = publicOrigin(req);
  const url = `${origin}/join/${token}`;

  if (!resolution.valid || !resolution.group) {
    return {
      title: "Destira",
      description: "A place to actually meet people — your AI twin does the first awkward part.",
      imageUrl: `${origin}/brand/og-default.png`,
      imageIsGenerated: false,
      url,
    };
  }

  const { group, memberCount = 0 } = resolution;

  if (group.privacyMode === "invite-only") {
    return {
      title: "Join a group on Destira",
      description: "You've been invited to a group on Destira.",
      imageUrl: `${origin}/brand/og-default.png`,
      imageIsGenerated: false,
      url,
    };
  }

  const desc = group.description
    ? `${trimToWord(group.description, 150)} — ${memberCount} member${memberCount === 1 ? "" : "s"}`
    : `A Destira group — ${memberCount} member${memberCount === 1 ? "" : "s"}`;

  const hash = shareCardHashFor(group);
  return {
    title: `${group.name} · Destira`,
    description: desc,
    imageUrl: `${origin}/api/groups/${group.id}/share-card/${hash}.jpg`,
    imageIsGenerated: true,
    url,
  };
}

/** Injects per-invite meta tags into the built index.html and returns the
 *  full HTML string. Same shell real users get — this doesn't fork into a
 *  separate rendering stack, it just enriches the one <head> every route
 *  already serves. */
export function renderInviteHtml(indexHtmlTemplate: string, meta: ReturnType<typeof ogMetaFor>): string {
  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    `<meta property="og:image" content="${escapeHtml(meta.imageUrl)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(meta.imageUrl)}" />`,
  ].join("\n    ");

  return indexHtmlTemplate
    .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(meta.title)}</title>`)
    .replace("</head>", `    ${tags}\n  </head>`);
}
