// WhatsApp Status cards: a 1080×1920 image drawn on a canvas in the browser,
// handed to the phone's share sheet (where WhatsApp → "My status" is one of
// the targets) with the link as the caption. Links inside a Status image
// aren't tappable, so the link always travels in the caption text too.
//
// Desktop / browsers that can't share files: the image downloads and the
// caption is copied, so it can still be posted by hand.

export interface StatusCard {
  eyebrow: string; // small caps line above the title, e.g. "I'm going"
  title: string; // big serif line
  lines: string[]; // up to three short supporting lines
  footer: string; // e.g. "Find me on Destira · code 7KQ2M9XP"
  imageUrl?: string | null; // optional photo for the top of the card
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

  ctx.fillStyle = EMBER;
  ctx.font = '500 32px "DM Mono", ui-monospace, monospace';
  ctx.fillText(card.eyebrow.toUpperCase(), left, textTop);

  ctx.fillStyle = TEXT;
  ctx.font = '124px "Instrument Serif", Georgia, serif';
  const titleLines = wrap(ctx, card.title, maxW, 4);
  let y = textTop + 140;
  for (const l of titleLines) {
    ctx.fillText(l, left, y);
    y += 124;
  }

  ctx.fillStyle = MUTED;
  ctx.font = '44px "DM Sans", system-ui, sans-serif';
  y += 30;
  for (const l of card.lines.slice(0, 3)) {
    for (const piece of wrap(ctx, l, maxW, 2)) {
      ctx.fillText(piece, left, y);
      y += 62;
    }
  }

  // Where to go, as text — a link inside a Status image can't be tapped.
  const fy = H - 230;
  ctx.fillStyle = MUTED;
  ctx.font = '34px "DM Mono", ui-monospace, monospace';
  ctx.fillText(window.location.host, left, fy - 40);

  // Footer pill.
  ctx.font = '500 38px "DM Sans", system-ui, sans-serif';
  const fw = Math.min(maxW, ctx.measureText(card.footer).width + 80);
  ctx.fillStyle = EMBER;
  ctx.beginPath();
  ctx.roundRect(left, fy, fw, 100, 50);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.fillText(card.footer, left + 40, fy + 52, maxW - 80);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't draw the card"))), "image/png"),
  );
}

export type ShareOutcome = "shared" | "downloaded" | "cancelled";

/** Render, then share as a file (phones) or download + copy the caption. */
export async function shareStatusCard(card: StatusCard, caption: string, filename: string): Promise<ShareOutcome> {
  const blob = await renderStatusCard(card);
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
export function logShare(kind: "event" | "invite", format: "status_card" | "link", targetId?: string | number | null) {
  fetch("/api/growth/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ kind, format, targetId: targetId ?? null }),
  }).catch(() => {});
}
