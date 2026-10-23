// Generates every Destira icon and share image from one drawing of the mark:
// the two rings (ember in front, mint behind, tilted 15°) on a cream tile,
// with the lens where they overlap in ink. Re-run after any change to the mark:
//
//   node scripts/generate-brand-assets.mjs
//   npx @capacitor/assets@3 generate --android --iconBackgroundColor "#F7F1EA" --iconBackgroundColorDark "#F7F1EA" --splashBackgroundColor "#FBF8F5" --splashBackgroundColorDark "#0C0910"
//   (run on demand, not installed: it pulls in old packages with known vulnerabilities)
//
// Writes client/public/brand/*, client/public/favicon.ico, assets/* (the
// sources capacitor-assets turns into Android icons and launch screens) and
// the Android notification icon (res/drawable-*/ic_stat_destira.png).
import sharp from "sharp";
import opentype from "opentype.js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const BRAND = "client/public/brand";
const ASSETS = "assets";
mkdirSync(ASSETS, { recursive: true });

const C = {
  ember: "#FF6B4A",
  emberText: "#B34B34", // ember as text on cream (5:1)
  mint: "#8FE3C7",
  cream: "#F7F1EA", // the tile: a shade deeper than the page so it holds on white
  page: "#FBF8F5",
  ink: "#1A1418",
  night: "#0C0910",
  lensDark: "#F5F0EA",
  muted: "#6B5F68",
};

// Ring geometry from the brand spec: centres 0.941 r apart, tilted -15°.
function rings({ cx, cy, r, stroke, lens, id }) {
  const sep = 0.941 * r;
  const ex = cx - sep / 2; // ember (front, left)
  const mx = cx + sep / 2; // mint (behind, right)
  return `<defs><clipPath id="${id}"><circle cx="${mx}" cy="${cy}" r="${r}"/></clipPath></defs>
  <g transform="rotate(-15 ${cx} ${cy})">
    <circle cx="${mx}" cy="${cy}" r="${r}" fill="none" stroke="${C.mint}" stroke-width="${stroke}"/>
    <circle cx="${ex}" cy="${cy}" r="${r}" fill="none" stroke="${C.ember}" stroke-width="${stroke}"/>
    <g clip-path="url(#${id})"><circle cx="${ex}" cy="${cy}" r="${r}" fill="${lens}"/></g>
  </g>`;
}

/** The icon on a 64 grid. small = thicker rings that survive 16–32px. */
function iconSvg({ rx = 14, small = false, scale = 1, background = true, lens = C.ink } = {}) {
  const r = 14.6 * scale;
  const stroke = (small ? 6.2 : 4.8) * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Destira">
  ${background ? `<rect width="64" height="64" rx="${rx}" fill="${C.cream}"/>` : ""}
  ${rings({ cx: 32, cy: 32, r, stroke, lens, id: "L" })}
</svg>`;
}

const png = (svg, size) => sharp(Buffer.from(svg), { density: Math.max(72, (size / 64) * 72 * 4) }).resize(size, size).png().toBuffer();
const save = async (path, svg, size) => writeFileSync(path, await png(svg, size));

// ── web icons ──────────────────────────────────────────────────────────
writeFileSync(`${BRAND}/favicon.svg`, iconSvg({ small: true }));
writeFileSync(`${BRAND}/destira-icon-square.svg`, iconSvg({ rx: 0 }));
writeFileSync(`${BRAND}/destira-icon.svg`, iconSvg());
for (const s of [16, 32]) await save(`${BRAND}/destira-favicon-${s}.png`, iconSvg({ small: true }), s);
for (const s of [48, 96]) await save(`${BRAND}/destira-favicon-${s}.png`, iconSvg(), s);
await save(`${BRAND}/destira-icon-180.png`, iconSvg({ rx: 0 }), 180); // iOS rounds it itself
for (const s of [192, 512]) await save(`${BRAND}/destira-icon-${s}.png`, iconSvg(), s);
// Maskable: full-bleed tile, mark inside the 80% safe circle.
for (const s of [192, 512]) await save(`${BRAND}/destira-maskable-${s}.png`, iconSvg({ rx: 0, scale: 0.78 }), s);

// favicon.ico (16/32/48) — Google and older browsers ask for /favicon.ico.
{
  const imgs = [
    await png(iconSvg({ small: true }), 16),
    await png(iconSvg({ small: true }), 32),
    await png(iconSvg(), 48),
  ];
  const sizes = [16, 32, 48];
  const header = Buffer.alloc(6 + 16 * imgs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(imgs.length, 4);
  let offset = header.length;
  imgs.forEach((buf, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(sizes[i], e);
    header.writeUInt8(sizes[i], e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(buf.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  writeFileSync("client/public/favicon.ico", Buffer.concat([header, ...imgs]));
}

// ── Android (capacitor-assets sources) ─────────────────────────────────
await save(`${ASSETS}/icon-only.png`, iconSvg({ rx: 0 }), 1024);
// Adaptive icon: the system crops to a circle/squircle inside 66%.
await save(`${ASSETS}/icon-foreground.png`, iconSvg({ background: false, scale: 0.7 }), 1024);
writeFileSync(`${ASSETS}/icon-background.png`, await sharp({ create: { width: 1024, height: 1024, channels: 4, background: C.cream } }).png().toBuffer());
for (const [name, bg, lens] of [["splash.png", C.page, C.ink], ["splash-dark.png", C.night, C.lensDark]]) {
  const mark = await png(iconSvg({ background: false, lens }), 720);
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: bg } })
    .composite([{ input: mark, gravity: "center" }]).png().toFile(`${ASSETS}/${name}`);
}

// Android status-bar notification icon: white on transparent, the overlap
// cut out so the two rings still read at 24dp.
{
  const statusIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <g transform="rotate(-15 32 32)" fill="none" stroke="#FFFFFF" stroke-width="6">
    <circle cx="38.87" cy="32" r="16.5"/><circle cx="25.13" cy="32" r="16.5"/>
  </g></svg>`;
  const res = "android/app/src/main/res";
  for (const [dir, px] of [["mdpi", 24], ["hdpi", 36], ["xhdpi", 48], ["xxhdpi", 72], ["xxxhdpi", 96]]) {
    mkdirSync(`${res}/drawable-${dir}`, { recursive: true });
    await save(`${res}/drawable-${dir}/ic_stat_destira.png`, statusIcon, px);
  }
}

// ── link preview card (og:image), 1200×630 ─────────────────────────────
const font = (p) => opentype.parse(readFileSync(p).buffer.slice(0));
const serif = font("node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff");
const serifItalic = font("node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff");
const mono = font("node_modules/@fontsource/dm-mono/files/dm-mono-latin-500-normal.woff");
const text = (f, s, x, y, size, fill, letterSpacing = 0) =>
  `<path d="${f.getPath(s, x, y, size, { letterSpacing }).toPathData(2)}" fill="${fill}"/>`;

const W = 1200, H = 630, left = 80;
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${C.page}"/>
  ${rings({ cx: 985, cy: 325, r: 205, stroke: 34, lens: C.ink, id: "OG" })}
  <g transform="translate(${left} 66) scale(0.95)">${iconSvg({ background: false }).replace(/<\/?svg[^>]*>/g, "").replace(/id="L"/, 'id="OGS"').replace("url(#L)", "url(#OGS)")}</g>
  ${text(serif, "destira", left + 70, 112, 50, C.ink)}
  ${text(serif, "Come and find", left, 318, 104, C.ink, -0.015)}
  ${text(serifItalic, "your person.", left, 420, 104, C.emberText, -0.015)}
  ${text(mono, "RESONANCE OVER PHOTOGRAPHS", left, 500, 21, C.muted, 0.16)}
  ${text(mono, "DESTIRA.DATE", left, 566, 21, C.emberText, 0.16)}
</svg>`;
await sharp(Buffer.from(og)).png().toFile(`${BRAND}/og-default.png`);

// Google Play feature graphic, 1024×500: the same card, refit.
mkdirSync("docs/play-store", { recursive: true });
const fg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <rect width="1024" height="500" fill="${C.page}"/>
  ${rings({ cx: 830, cy: 250, r: 170, stroke: 30, lens: C.ink, id: "FG" })}
  <g transform="translate(64 52) scale(0.85)">${iconSvg({ background: false }).replace(/<\/?svg[^>]*>/g, "").replace(/id="L"/, 'id="FGS"').replace("url(#L)", "url(#FGS)")}</g>
  ${text(serif, "destira", 126, 92, 44, C.ink)}
  ${text(serif, "Come and find", 64, 262, 84, C.ink, -0.015)}
  ${text(serifItalic, "your person.", 64, 346, 84, C.emberText, -0.015)}
  ${text(mono, "YOUR AI TWIN MEETS THEIRS FIRST", 64, 420, 19, C.muted, 0.16)}
</svg>`;
await sharp(Buffer.from(fg)).png().toFile("docs/play-store/feature-graphic.png");

console.log("brand assets written");
