// WhatsApp Status cards: a 1080×1920 image drawn on a canvas in the browser,
// handed to the phone's share sheet (where WhatsApp → "My status" is one of
// the targets) with the link as the caption. Links inside a Status image
// aren't tappable, so the link always travels in the caption text too.
//
// Desktop / browsers that can't share files: the image downloads and the
// caption is copied, so it can still be posted by hand.

import { isNativeApp, nativeShareImage } from "./native";
import { publicOrigin } from "./app-api";

export interface StatusCard {
  eyebrow: string; // small caps line above the title, e.g. "I'm going"
  title: string; // big serif line
  lines: string[]; // up to three short supporting lines
  footer: string; // e.g. "Find me on Destira · code 7KQ2M9XP"
  imageUrl?: string | null; // optional photo for the top of the card
  date?: { dow: string; day: string; month: string } | null; // calendar tile, top right
  badge?: string | null; // live urgency line, e.g. "6 women's seats left"
}


const W = 1080;
const H = 1920;
const INK = "#0C0910";
const TEXT = "#F5F0EA";
const MUTED = "#A79FB4";
const EMBER = "#FF6B4A";
const MINT = "#8FE3C7";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // Needed so drawing it doesn't taint the canvas; a host without CORS
    // headers just fails here and the card is drawn without the photo.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
    setTimeout(() => resolve(null), 6000);
  });
}

async function fontsReady() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('120px "Instrument Serif"'),
        document.fonts.load('44px "DM Sans"'),
        document.fonts.load('30px "DM Mono"'),
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* fall back to whatever's available */
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

export async function renderStatusCard(card: StatusCard): Promise<Blob> {
  await fontsReady();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  const img = card.imageUrl ? await loadImage(card.imageUrl) : null;
  let textTop = 760;
  if (img) {
    const photoH = 1060;
    drawCover(ctx, img, 0, 0, W, photoH);
    const fade = ctx.createLinearGradient(0, photoH * 0.45, 0, photoH);
    fade.addColorStop(0, "rgba(12,9,16,0)");
    fade.addColorStop(1, INK);
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, W, photoH);
    textTop = 960;
  } else {
    // No photo: two soft rings, the brand mark's shape, as the backdrop.
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(255,107,74,0.55)";
    ctx.beginPath();
    ctx.arc(430, 420, 250, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(143,227,199,0.55)";
    ctx.beginPath();
    ctx.arc(650, 420, 250, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Wordmark, top left.
  ctx.lineWidth = 5;
  ctx.strokeStyle = EMBER;
  ctx.beginPath();
  ctx.arc(110, 120, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = MINT;
  ctx.beginPath();
  ctx.arc(140, 120, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = TEXT;
  ctx.font = '64px "Instrument Serif", Georgia, serif';
  ctx.textBaseline = "middle";
  ctx.fillText("destira", 196, 118);

  const left = 90;
  const maxW = W - left * 2;
  ctx.textBaseline = "alphabetic";

  // Calendar tile, top right: the date is the first thing people check.
  if (card.date) {
    const tw = 190, th = 214, tx = W - 90 - tw, ty = 64;
    ctx.fillStyle = TEXT;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, 28);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = "#B34B34";
    ctx.font = '500 34px "DM Mono", ui-monospace, monospace';
    ctx.fillText(card.date.dow.toUpperCase(), tx + tw / 2, ty + 56);
    ctx.fillStyle = INK;
    ctx.font = '120px "Instrument Serif", Georgia, serif';
    ctx.fillText(card.date.day, tx + tw / 2, ty + 160);
    ctx.fillStyle = "#6B5F68";
    ctx.font = '500 28px "DM Mono", ui-monospace, monospace';
    ctx.fillText(card.date.month.toUpperCase(), tx + tw / 2, ty + 196);
    ctx.textAlign = "left";
  }

  // Live badge above the eyebrow: a reason to tap now, not later.
  if (card.badge) {
    ctx.font = '600 38px "DM Sans", system-ui, sans-serif';
    const bw = ctx.measureText(card.badge).width + 96;
    const by = textTop - 132;
    ctx.fillStyle = "rgba(245,240,234,0.14)";
    ctx.beginPath();
    ctx.roundRect(left, by, bw, 72, 36);
    ctx.fill();
    ctx.strokeStyle = "rgba(245,240,234,0.45)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = MINT;
    ctx.beginPath();
    ctx.arc(left + 36, by + 36, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = TEXT;
    ctx.textBaseline = "middle";
    ctx.fillText(card.badge, left + 62, by + 38);
    ctx.textBaseline = "alphabetic";
  }

  ctx.fillStyle = EMBER;
  ctx.font = '500 32px "DM Mono", ui-monospace, monospace';
  ctx.fillText(card.eyebrow.toUpperCase(), left, textTop);

  // Title: as big as fits in three lines (a long event name steps down a
  // size instead of crowding the details below it).
  ctx.fillStyle = TEXT;
  let titleSize = 124;
  let titleLines: string[] = [];
  for (const size of [124, 108, 94]) {
    titleSize = size;
    ctx.font = `${size}px "Instrument Serif", Georgia, serif`;
    titleLines = wrap(ctx, card.title, maxW, 3);
    if (!titleLines.at(-1)?.endsWith("…")) break;
  }
  let y = textTop + 30 + titleSize;
  for (const l of titleLines) {
    ctx.fillText(l, left, y);
    y += titleSize;
  }

  // Details stop above the footer row, whatever the title took.
  const fy = H - 230;
  ctx.fillStyle = MUTED;
  ctx.font = '44px "DM Sans", system-ui, sans-serif';
  y += 30;
  for (const l of card.lines.slice(0, 3)) {
    for (const piece of wrap(ctx, l, maxW, 2)) {
      if (y > fy - 50) break;
      ctx.fillText(piece, left, y);
      y += 62;
    }
  }

  // Footer pill, with where to go beside it: a link inside a Status image
  // can't be tapped, so the address is spelled out.
  ctx.font = '500 38px "DM Sans", system-ui, sans-serif';
  const fw = Math.min(maxW - 280, ctx.measureText(card.footer).width + 80);
  ctx.fillStyle = EMBER;
  ctx.beginPath();
  ctx.roundRect(left, fy, fw, 100, 50);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.fillText(card.footer, left + 40, fy + 52, fw - 80);
  ctx.fillStyle = MUTED;
  ctx.font = '32px "DM Mono", ui-monospace, monospace';
  ctx.textAlign = "right";
  ctx.fillText(new URL(publicOrigin()).host, W - left, fy + 52);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't draw the card"))), "image/png"),
  );
}

export type ShareOutcome = "shared" | "downloaded" | "cancelled";

/** Render, then share as a file (phones) or download + copy the caption. */
export async function shareStatusCard(card: StatusCard, caption: string, filename: string): Promise<ShareOutcome> {
  return shareStatusBlob(await renderStatusCard(card), caption, filename);
}

/** Share an already-drawn card (so a preview and the share use one image). */
export async function shareStatusBlob(blob: Blob, caption: string, filename: string): Promise<ShareOutcome> {
  // The store app: the browser's file sharing doesn't exist in an app's web
  // view, so the card goes out through the phone's own share sheet.
  if (isNativeApp()) return nativeShareImage(blob, filename, caption);
  const file = new File([blob], filename, { type: "image/png" });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: caption });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      // fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  try {
    await navigator.clipboard.writeText(caption);
  } catch {
    /* clipboard blocked — the toast still tells them what to do */
  }
  return "downloaded";
}

/** Fire-and-forget log for the console's Growth page. */
export function logShare(kind: "event" | "invite", format: "status_card" | "link" | "destira_story", targetId?: string | number | null) {
  fetch("/api/growth/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ kind, format, targetId: targetId ?? null }),
  }).catch(() => {});
}
