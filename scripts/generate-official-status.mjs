// Starter content for the official Destira status (console → Destira status).
// Portrait 1080×1920 posts in the brand's look, plus an animated intro video
// when ffmpeg-static is installed. Writes files + a manifest.json to OUT:
//
//   node scripts/generate-official-status.mjs <out dir> [event covers dir]
//
// Text stays in the top two-thirds: the story viewer's buttons sit over the
// bottom of the frame.
import sharp from "sharp";
import opentype from "opentype.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { spawn } from "child_process";

const OUT = process.argv[2];
const COVERS = process.argv[3];
if (!OUT) throw new Error("usage: node scripts/generate-official-status.mjs <out dir> [covers dir]");
mkdirSync(OUT, { recursive: true });

const W = 1080, H = 1920, L = 96;
const C = { ink: "#0C0910", plum: "#1E1325", cream: "#F5F0EA", page: "#FBF8F5", ember: "#FF6B4A", emberText: "#B34B34", mint: "#8FE3C7", muted: "#A79FB4", mutedLight: "#6B5F68", inkText: "#1A1418" };

const font = (p) => opentype.parse(readFileSync(p).buffer.slice(0));
const serif = font("node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff");
const serifItalic = font("node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff");
const mono = font("node_modules/@fontsource/dm-mono/files/dm-mono-latin-500-normal.woff");
const sans = font("node_modules/@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff");
const sansBold = font("node_modules/@fontsource/dm-sans/files/dm-sans-latin-600-normal.woff");

const path = (f, s, x, y, size, fill, ls = 0, opacity = 1) =>
  `<path d="${f.getPath(s, x, y, size, { letterSpacing: ls }).toPathData(2)}" fill="${fill}" opacity="${opacity}"/>`;
function wrap(f, text, size, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (f.getAdvanceWidth(next, size) <= maxW || !line) line = next;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

// The brand mark: ember in front, mint behind, the overlap filled.
const rings = (cx, cy, r, stroke, lens, id) => {
  const sep = 0.941 * r, ex = cx - sep / 2, mx = cx + sep / 2;
  return `<defs><clipPath id="${id}"><circle cx="${mx}" cy="${cy}" r="${r}"/></clipPath></defs>
  <g transform="rotate(-15 ${cx} ${cy})">
    <circle cx="${mx}" cy="${cy}" r="${r}" fill="none" stroke="${C.mint}" stroke-width="${stroke}"/>
    <circle cx="${ex}" cy="${cy}" r="${r}" fill="none" stroke="${C.ember}" stroke-width="${stroke}"/>
    <g clip-path="url(#${id})"><circle cx="${ex}" cy="${cy}" r="${r}" fill="${lens}"/></g>
  </g>`;
};

function post({ theme = "ink", eyebrow, title, italic, body = [], steps = [], backdrop = "" }) {
  const dark = theme !== "cream";
  const bg = theme === "plum"
    ? `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.plum}"/><stop offset="1" stop-color="${C.ink}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#bg)"/>`
    : `<rect width="${W}" height="${H}" fill="${dark ? C.ink : C.page}"/>`;
  const text = dark ? C.cream : C.inkText;
  const sub = dark ? C.muted : C.mutedLight;
  const accent = dark ? C.ember : C.emberText;
  let y = 560;
  let svg = bg + backdrop;
  // Wordmark, top left.
  svg += rings(L + 34, 150, 30, 6, dark ? C.cream : C.inkText, "wm");
  svg += path(serif, "destira", L + 92, 168, 58, text);
  svg += path(mono, "OFFICIAL", W - L - mono.getAdvanceWidth("OFFICIAL", 26, { letterSpacing: 0.16 }), 162, 26, accent, 0.16);
  svg += path(mono, eyebrow.toUpperCase(), L, y, 30, accent, 0.16);
  y += 40;
  // Headlines are given as their exact lines: an automatic wrap at this
  // size strands single words ("you", "at") on a line of their own.
  for (const l of [].concat(title)) { y += 118; svg += path(serif, l, L, y, 118, text, -0.015); }
  for (const l of [].concat(italic ?? [])) { y += 118; svg += path(serifItalic, l, L, y, 118, accent, -0.015); }
  y += 30;
  for (const [i, s] of steps.entries()) {
    y += 92;
    svg += `<circle cx="${L + 26}" cy="${y - 14}" r="26" fill="none" stroke="${accent}" stroke-width="3"/>`;
    svg += path(mono, String(i + 1), L + 17, y - 2, 30, accent);
    for (const [j, l] of wrap(sans, s, 44, W - 2 * L - 90).entries()) svg += path(sans, l, L + 82, y + j * 56, 44, text);
  }
  for (const p of body) {
    y += 70;
    for (const l of wrap(sans, p, 44, W - 2 * L)) { svg += path(sans, l, L, y, 44, sub); y += 60; }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${svg}</svg>`;
}

const glow = (cx, cy, r, color, o) => `<defs><radialGradient id="gl${cx}"><stop offset="0" stop-color="${color}" stop-opacity="${o}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#gl${cx})"/>`;
const bigRings = (lens) => `<g opacity="0.95">${rings(840, 1560, 300, 34, lens, "br")}</g>`;

const posts = [
  {
    slug: "how-it-works", caption: "New here? This is how Destira works.", ctaLabel: "Open Discover", ctaUrl: "/discover",
    svg: post({ theme: "ink", eyebrow: "How Destira works", title: ["Your twin meets"], italic: ["theirs first."], steps: ["Answer a few questions about you", "Your AI twin learns how you talk", "Ask anyone's twin before you say hi"], backdrop: glow(900, 300, 520, C.ember, 0.18) + bigRings(C.cream) }),
  },
  {
    slug: "tonights-three", caption: "Your three picks land at 19:00.", ctaLabel: "Open Discover", ctaUrl: "/discover",
    svg: post({ theme: "plum", eyebrow: "Every evening", title: ["Tonight's three"], italic: ["arrive at 19:00."], body: ["Three people picked for you, each with a reason you'd get on. New ones every evening."], backdrop: glow(200, 1500, 600, C.mint, 0.12) }),
  },
  {
    slug: "ask-the-twin", caption: "A good first move.", ctaLabel: "Find someone to ask", ctaUrl: "/discover",
    svg: post({ theme: "cream", eyebrow: "A good first move", title: ["Ask the twin"], italic: ["before you say hi."], body: ["How do they spend a Sunday? What would they never compromise on? Their twin answers what they allow."], backdrop: bigRings(C.inkText) }),
  },
  {
    slug: "invite", caption: "Bring your people.", ctaLabel: "Invite a friend", ctaUrl: "/invite",
    svg: post({ theme: "ink", eyebrow: "Bring your people", title: ["Invite a friend."], italic: ["You both get", "a free week."], body: ["When they finish setting up their twin, the week is yours."], backdrop: glow(150, 250, 500, C.mint, 0.14) + bigRings(C.cream) }),
  },
  {
    slug: "safety", caption: "Meeting someone new? Keep it easy and safe.",
    svg: post({ theme: "plum", eyebrow: "Meeting someone new", title: ["First dates:", "a public place,"], italic: ["and tell a friend."], body: ["Keep chatting on Destira until you're ready to share your number.", "Anything feel off? Report it from their profile."] }),
  },
  {
    slug: "lounge", caption: "Rooms for the things you love.", ctaLabel: "Open the Lounge", ctaUrl: "/lounge",
    svg: post({ theme: "cream", eyebrow: "The Lounge", title: ["Find your people,"], italic: ["not just your person."], body: ["Rooms for hikers, cooks, readers and your campus. Join any of them, no match needed."], backdrop: glow(900, 1500, 600, C.ember, 0.12) }),
  },
  {
    slug: "twin-privacy", caption: "You choose what your twin talks about.", ctaLabel: "Choose what it may say", ctaUrl: "/twin-disclosure",
    svg: post({ theme: "plum", eyebrow: "Your twin, your rules", title: ["Choose what your"], italic: ["twin may say."], body: ["Keep family, faith, money or your past private. Your twin won't go there with anyone."], backdrop: bigRings(C.cream) }),
  },
  {
    slug: "read-every-word", caption: "Your twin's conversations show up for you too.", ctaLabel: "See your interviews", ctaUrl: "/interviews",
    svg: post({ theme: "ink", eyebrow: "Nothing behind your back", title: ["See what your twin"], italic: ["says about you."], body: ["When someone interviews your twin, the conversation shows up in your interviews."], backdrop: glow(880, 1450, 560, C.mint, 0.14) }),
  },
  {
    slug: "host-an-event", caption: "Start the thing you wish existed.", ctaLabel: "Host an event", ctaUrl: "/events/host",
    svg: post({ theme: "cream", eyebrow: "Make the plan", title: ["Host your own"], italic: ["event."], body: ["A braai, a book swap, a sunrise walk. Set the seats, and members near you can save one."], backdrop: glow(880, 1500, 600, C.ember, 0.14) }),
  },
  {
    slug: "photos", caption: "A quick profile tip.", ctaLabel: "Update my photos", ctaUrl: "/profile",
    svg: post({ theme: "ink", eyebrow: "Profile tip", title: ["Photos that look"], italic: ["like you, today."], steps: ["One clear face, no sunglasses", "One doing something you love", "One with natural light"], backdrop: glow(150, 300, 520, C.ember, 0.16) }),
  },
  {
    slug: "openers", caption: "A better first message.", ctaLabel: "Find someone", ctaUrl: "/discover",
    svg: post({ theme: "plum", eyebrow: "First message", title: ["Skip \"hey\"."], italic: ["Open with something", "they said."], body: ["Their answers and their twin's read give you a real place to start."] }),
  },
  {
    slug: "post-to-status", caption: "Going somewhere? Bring someone.", ctaLabel: "See events", ctaUrl: "/events",
    svg: post({ theme: "cream", eyebrow: "Bring a friend along", title: ["Post an event"], italic: ["to your Status."], body: ["Every event has a Post to Status button: on your Destira story, or straight to WhatsApp."], backdrop: bigRings(C.inkText) }),
  },
  {
    slug: "this-weekend", caption: "Plans for the weekend.", ctaLabel: "See what's on", ctaUrl: "/events",
    svg: post({ theme: "ink", eyebrow: "This weekend", title: ["Out of the chat,"], italic: ["into the day."], body: ["Hikes, picnics, long lunches and runs near you, many of them free to join."], backdrop: glow(900, 320, 520, C.mint, 0.14) + bigRings(C.cream) }),
  },
  {
    slug: "resonance", caption: "What Destira is about.", ctaLabel: "Open Discover", ctaUrl: "/discover",
    svg: post({ theme: "plum", eyebrow: "What we believe", title: ["Resonance"], italic: ["over photographs."], body: ["How you think, what you value and how you spend a Sunday say more than any picture."], backdrop: bigRings(C.cream) }),
  },
  {
    slug: "respect", caption: "Respect is part of the deal here.",
    svg: post({ theme: "cream", eyebrow: "On Destira", title: ["No is a"], italic: ["full sentence."], body: ["Not interested? A pass is enough. Unwanted messages can be reported from any chat or profile."] }),
  },
  {
    slug: "your-city", caption: "Destira is growing city by city.", ctaLabel: "See events near you", ctaUrl: "/events",
    svg: post({ theme: "ink", eyebrow: "Now in your city", title: ["Harare."], italic: ["Masvingo.", "Bulawayo."], body: ["Members, events and rooms where you are, with more cities on the way."], backdrop: glow(860, 1450, 600, C.ember, 0.16) }),
  },
];

// Event posts: the event's own cover on top, the details below.
const EVENTS = [
  { id: 107, slug: "domboshava", when: "SAT 24 OCT · 06:00 · HARARE", title: ["Sunrise at Domboshava,"], italic: ["then breakfast", "on the rock."] },
  { id: 108, slug: "fivek", when: "SUN 25 OCT · 06:30 · MASVINGO", title: "Sunday 5K:", italic: "walk it or run it." },
  { id: 109, slug: "mutirikwi", when: "SAT 31 OCT · 11:00 · MASVINGO", title: "Lake Mutirikwi", italic: "braai day." },
  { id: 110, slug: "gardens", when: "SUN 1 NOV · 14:00 · HARARE", title: "Phones-down picnic", italic: "at Harare Gardens." },
];
async function eventPost(e) {
  const cover = await sharp(`${COVERS}/cover2-${e.slug}.jpg`).resize(W, 860, { fit: "cover" }).jpeg().toBuffer();
  let svg = `<rect y="860" width="${W}" height="${H - 860}" fill="${C.ink}"/>`;
  svg += `<defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="${C.ink}" stop-opacity="0"/><stop offset="1" stop-color="${C.ink}"/></linearGradient></defs><rect width="${W}" height="860" fill="url(#f)"/>`;
  svg += rings(L + 34, 150, 30, 6, C.cream, "wm") + path(serif, "destira", L + 92, 168, 58, C.cream);
  svg += path(mono, "OFFICIAL EVENT", L, 940, 30, C.ember, 0.16);
  svg += path(mono, e.when, L, 990, 28, C.muted, 0.12);
  let y = 1000;
  const lines = (x, f) => (Array.isArray(x) ? x : wrap(f, x, 112, W - 2 * L));
  for (const l of lines(e.title, serif)) { y += 112; svg += path(serif, l, L, y, 112, C.cream, -0.015); }
  for (const l of lines(e.italic, serifItalic)) { y += 112; svg += path(serifItalic, l, L, y, 112, C.ember, -0.015); }
  y += 90;
  svg += `<rect x="${L}" y="${y - 52}" width="${sansBold.getAdvanceWidth("Free · half the seats for women", 38) + 80}" height="76" rx="38" fill="rgba(245,240,234,0.12)" stroke="rgba(245,240,234,0.4)" stroke-width="2"/>`;
  svg += `<circle cx="${L + 34}" cy="${y - 14}" r="9" fill="${C.mint}"/>`;
  svg += path(sansBold, "Free · half the seats for women", L + 58, y, 38, C.cream);
  const over = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg}</svg>`;
  return sharp({ create: { width: W, height: H, channels: 4, background: C.ink } })
    .composite([{ input: cover, top: 0, left: 0 }, { input: Buffer.from(over), top: 0, left: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

const manifest = [];
for (const p of posts) {
  const file = `status-${p.slug}.jpg`;
  await sharp(Buffer.from(p.svg)).jpeg({ quality: 88 }).toFile(`${OUT}/${file}`);
  manifest.push({ file, mediaType: "image", caption: p.caption, ctaLabel: p.ctaLabel ?? null, ctaUrl: p.ctaUrl ?? null, eventId: null });
}
if (COVERS) {
  for (const e of EVENTS) {
    const file = `status-event-${e.slug}.jpg`;
    writeFileSync(`${OUT}/${file}`, await eventPost(e));
    manifest.push({ file, mediaType: "image", caption: "Official event: tap to save a seat.", ctaLabel: null, ctaUrl: null, eventId: e.id });
  }
}

// Videos: frames drawn as SVG, piped to ffmpeg-static (H.264, phone-friendly).
let ffmpegPath = null;
try { ffmpegPath = (await import("ffmpeg-static")).default; } catch { /* not installed */ }
const ease = (t) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
const centred = (f, str, y, size, fill, o) => path(f, str, W / 2 - f.getAdvanceWidth(str, size) / 2, y, size, fill, 0, o);

async function renderVideo(file, seconds, frame) {
  const FPS = 30;
  const ff = spawn(ffmpegPath, ["-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "23", "-movflags", "+faststart", `${OUT}/${file}`], { stdio: ["pipe", "ignore", "ignore"] });
  for (let f = 0; f < FPS * seconds; f++) {
    const png = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${frame(f / FPS)}</svg>`)).png().toBuffer();
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((resolve, reject) => ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))));
}

// The two rings drawing themselves and meeting, as a frame fragment.
function ringsScene(t, CY, R) {
  const CX = W / 2, CIRC = 2 * Math.PI * R;
  const draw = ease(t / 1.6), meet = ease((t - 1.4) / 1.2), lensO = ease((t - 2.4) / 0.6);
  const sep = 0.941 * R + (1 - meet) * 260;
  const ex = CX - sep / 2, mx = CX + sep / 2;
  const dash = (v) => `stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC * (1 - v)}"`;
  return `${glow(540, CY, 700, C.ember, 0.10 * lensO)}<defs><clipPath id="v"><circle cx="${mx}" cy="${CY}" r="${R}"/></clipPath></defs><g transform="rotate(-15 ${CX} ${CY})">
    <circle cx="${mx}" cy="${CY}" r="${R}" fill="none" stroke="${C.mint}" stroke-width="${R / 9}" stroke-linecap="round" ${dash(draw)} transform="rotate(-90 ${mx} ${CY})"/>
    <circle cx="${ex}" cy="${CY}" r="${R}" fill="none" stroke="${C.ember}" stroke-width="${R / 9}" stroke-linecap="round" ${dash(draw)} transform="rotate(-90 ${ex} ${CY})"/>
    <g clip-path="url(#v)" opacity="${lensO}"><circle cx="${ex}" cy="${CY}" r="${R}" fill="${C.cream}"/></g></g>`;
}

if (ffmpegPath && existsSync(ffmpegPath)) {
  // 1. Welcome: the rings meet, then the line lands.
  await renderVideo("status-intro.mp4", 8, (t) => {
    const textO = ease((t - 3.0) / 0.9), subO = ease((t - 4.0) / 0.9);
    return `<rect width="${W}" height="${H}" fill="${C.ink}"/>${ringsScene(t, 760, 230)}`
      + centred(serif, "Come and find", 1250, 120, C.cream, textO)
      + centred(serifItalic, "your person.", 1380, 120, C.ember, textO)
      + centred(sans, "Your AI twin meets theirs first.", 1480, 44, C.muted, subO)
      + centred(serif, "destira", 1640, 64, C.cream, subO);
  });
  manifest.unshift({ file: "status-intro.mp4", mediaType: "video", durationSec: 8, caption: "Welcome to Destira.", ctaLabel: "Open Discover", ctaUrl: "/discover", eventId: null });

  // 2. How it works: small rings meet at the top, then three steps build up.
  const STEPS = [
    ["Answer a few questions", "about your weekends, values and how you love"],
    ["Your AI twin learns you", "and keeps private what you choose"],
    ["Twins meet first", "you only talk to people worth talking to"],
  ];
  await renderVideo("status-how-it-works.mp4", 10, (t) => {
    let svg = `<rect width="${W}" height="${H}" fill="${C.ink}"/>${ringsScene(t * 1.4, 420, 120)}`;
    svg += path(mono, "HOW DESTIRA WORKS", L, 690, 30, C.ember, 0.16, ease((t - 1.6) / 0.6));
    STEPS.forEach(([head, sub], i) => {
      const o = ease((t - 2.2 - i * 1.6) / 0.7);
      const y = 820 + i * 230 + (1 - o) * 30;
      svg += `<g opacity="${o}"><circle cx="${L + 38}" cy="${y - 20}" r="38" fill="none" stroke="${C.ember}" stroke-width="4"/></g>`;
      svg += path(serif, String(i + 1), L + 26, y - 2, 52, C.ember, 0, o);
      svg += path(serif, head, L + 110, y, 66, C.cream, -0.01, o);
      for (const [j, l] of wrap(sans, sub, 40, W - 2 * L - 110).entries()) svg += path(sans, l, L + 110, y + 56 + j * 50, 40, C.muted, 0, o);
    });
    svg += centred(serifItalic, "Come and find your person.", 1640, 64, C.ember, ease((t - 7.4) / 0.8));
    return svg;
  });
  manifest.unshift({ file: "status-how-it-works.mp4", mediaType: "video", durationSec: 10, caption: "How Destira works, in ten seconds.", ctaLabel: "Open Discover", ctaUrl: "/discover", eventId: null });
} else {
  console.log("ffmpeg-static not installed: skipping the videos");
}

writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`wrote ${manifest.length} posts to ${OUT}`);
