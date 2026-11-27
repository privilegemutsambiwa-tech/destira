// In-page accessibility checks for the smoke suite (Part K6). Each runs
// inside the browser via page.evaluate and returns plain findings, so a test
// can print them and assert on what matters. No library: these are the
// handful of checks the spec asks for, written out so they're easy to read.
import type { Page } from "@playwright/test";

export type Finding = { check: string; what: string; detail: string };

/** Controls a screen reader would announce with no name. */
export async function unnamedControls(page: Page): Promise<Finding[]> {
  return page.evaluate(() => {
    const out: { check: string; what: string; detail: string }[] = [];
    const sel = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="switch"], [role="link"], [role="tab"], [role="checkbox"], [role="menuitem"], [role="slider"]';
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const nameOf = (el: HTMLElement): string => {
      const by = el.getAttribute("aria-labelledby");
      if (by) return by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
      const al = el.getAttribute("aria-label");
      if (al?.trim()) return al.trim();
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        const lab = (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest("label");
        if (lab?.textContent?.trim()) return lab.textContent.trim();
        if (el instanceof HTMLInputElement && ["submit", "button"].includes(el.type) && el.value) return el.value;
        return (el.getAttribute("title") || "").trim(); // a placeholder alone isn't a name
      }
      const lab = el.closest("label");
      if (lab && lab !== el && lab.textContent?.trim()) return lab.textContent.trim();
      // Text content, counting images' alt and labelled descendants.
      let t = "";
      const walk = (n: Node) => {
        if (n.nodeType === 3) t += n.textContent;
        else if (n instanceof HTMLElement || n instanceof SVGElement) {
          if (n.getAttribute("aria-hidden") === "true") return;
          const l = n.getAttribute("aria-label");
          if (l && n !== el) { t += " " + l; return; }
          if (n instanceof HTMLImageElement) t += " " + (n.alt || "");
          n.childNodes.forEach(walk);
        }
      };
      el.childNodes.forEach(walk);
      return (t.trim() || el.getAttribute("title") || "").trim();
    };
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      if (!visible(el) || el.closest('[aria-hidden="true"]')) continue;
      if (!nameOf(el)) {
        const tid = el.getAttribute("data-testid");
        out.push({ check: "name", what: `<${el.tagName.toLowerCase()}${tid ? ` data-testid="${tid}"` : ""}>`, detail: el.outerHTML.slice(0, 160) });
      }
    }
    return out;
  });
}

/** Text below WCAG AA contrast against what's actually behind it. Text over
 *  photos or gradients is skipped (it can't be measured this way). */
export async function lowContrast(page: Page): Promise<Finding[]> {
  return page.evaluate(() => {
    const out: { check: string; what: string; detail: string }[] = [];
    const parse = (c: string): [number, number, number, number] | null => {
      let m = c.match(/rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\)/);
      if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : +m[4]];
      m = c.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
      if (m) return [+m[1] * 255, +m[2] * 255, +m[3] * 255, m[4] === undefined ? 1 : +m[4]];
      return null;
    };
    const over = (top: number[], under: number[]) => {
      const a = top[3];
      return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
    };
    const lum = (c: number[]) => {
      const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    // What's behind an element: stack the backgrounds up to the first opaque one.
    const backdrop = (el: Element): number[] | null => {
      const layers: number[][] = [];
      for (let n: Element | null = el; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.backgroundImage && s.backgroundImage !== "none") return null;
        const c = parse(s.backgroundColor);
        if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
      }
      let base = [255, 255, 255, 1];
      const bodyBg = parse(getComputedStyle(document.body).backgroundColor);
      if (bodyBg && bodyBg[3] >= 1) base = bodyBg;
      for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
      return base;
    };
    const overMedia = (el: Element, r: DOMRect) => {
      let n: Element | null = el;
      for (let up = 0; n && up < 8; up++, n = n.parentElement) {
        // Photos as elements, or painted as a background (covers, gradients).
        for (const m of Array.from(n.querySelectorAll("img, video, canvas, picture, [style*='background'], [class*='bg-gradient'], [class*='bg-[url']"))) {
          if (!/^(IMG|VIDEO|CANVAS|PICTURE)$/.test(m.tagName) && getComputedStyle(m).backgroundImage === "none") continue;
          if (m.contains(el)) continue; // an ancestor's background is handled by backdrop()
          const q = m.getBoundingClientRect();
          if (q.width > 0 && q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top) return true;
        }
      }
      return false;
    };
    const seen = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const text = (t.textContent || "").trim();
      const el = t.parentElement;
      if (!text || !el || el.closest('[aria-hidden="true"], .sr-only, script, style, noscript')) continue;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || s.visibility === "hidden") continue;
      // Disabled controls are exempt; so is anything faded on purpose.
      if (el.closest("[disabled], [aria-disabled='true']")) continue;
      let op = 1;
      for (let n: Element | null = el; n; n = n.parentElement) op *= +getComputedStyle(n).opacity;
      if (op < 0.99) continue;
      // Over a photo or video: can't be measured from styles, skip it.
      if (overMedia(el, r)) continue;
      // A one-letter initial stands in for a missing photo; it isn't text to read.
      if (text.length === 1) continue;
      const fg = parse(s.color);
      const bg = backdrop(el);
      if (!fg || !bg) continue;
      const c = over(fg, bg);
      const size = parseFloat(s.fontSize);
      const large = size >= 24 || (size >= 18.66 && +s.fontWeight >= 700);
      const need = large ? 3 : 4.5;
      const got = ratio(c, bg);
      if (got < need) {
        const key = `${s.color}|${bg.join(",")}|${size}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const tid = el.closest("[data-testid]")?.getAttribute("data-testid");
        out.push({ check: "contrast", what: `"${text.slice(0, 40)}"${tid ? ` in ${tid}` : ""}`, detail: `${got.toFixed(2)}:1, needs ${need}:1 (${size}px, ${s.color} on rgb(${bg.slice(0, 3).map(Math.round).join(",")}))` });
      }
    }
    return out;
  });
}

/** Tabs through the page: focus must never land on something invisible,
 *  never be trapped, and each stop must show a focus ring. */
export async function focusWalk(page: Page, stops = 40): Promise<{ order: string[]; findings: Finding[] }> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  const order: string[] = [];
  const findings: Finding[] = [];
  const positive = await page.evaluate(() => Array.from(document.querySelectorAll("[tabindex]")).filter((e) => +e.getAttribute("tabindex")! > 0).map((e) => e.outerHTML.slice(0, 120)));
  for (const p of positive) findings.push({ check: "focus", what: "positive tabindex (jumps the reading order)", detail: p });
  let lastSig = "";
  let repeats = 0;
  for (let i = 0; i < stops; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      const tid = el.getAttribute("data-testid");
      const label = (el.getAttribute("aria-label") || el.innerText || (el as HTMLInputElement).placeholder || "").trim().replace(/\s+/g, " ").slice(0, 30);
      const ring = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
      return {
        sig: `${el.tagName.toLowerCase()}${tid ? `#${tid}` : ""} "${label}"`,
        invisible: r.width < 1 || r.height < 1 || s.visibility === "hidden" || +s.opacity === 0,
        ring: !!ring,
        html: el.outerHTML.slice(0, 140),
      };
    });
    if (!info) break; // walked off the end of the page
    order.push(info.sig);
    if (info.invisible) findings.push({ check: "focus", what: `focus on something you can't see: ${info.sig}`, detail: info.html });
    else if (!info.ring) findings.push({ check: "focus", what: `no visible focus ring: ${info.sig}`, detail: info.html });
    repeats = info.sig === lastSig ? repeats + 1 : 0;
    if (repeats >= 3) { findings.push({ check: "focus", what: `focus stuck on ${info.sig}`, detail: info.html }); break; }
    lastSig = info.sig;
  }
  return { order, findings };
}

/** Records layout shifts from the very start of the page (call before goto). */
export async function watchLayoutShift(page: Page) {
  await page.addInitScript(() => {
    (window as any).__shifts = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as any[]) {
          if (e.hadRecentInput) continue;
          const src = (e.sources || []).map((s: any) => {
            const n = s.node as Element | null;
            const name = n ? n.getAttribute?.("data-testid") || `${n.nodeName.toLowerCase()}${n.className ? "." + String(n.className).split(" ").slice(0, 2).join(".") : ""}` : "?";
            const a = s.previousRect, b = s.currentRect;
            return `${name} (y ${Math.round(a.y)}→${Math.round(b.y)}, h ${Math.round(a.height)}→${Math.round(b.height)})`;
          });
          (window as any).__shifts.push({ value: e.value, at: Math.round(e.startTime), src });
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}
  });
}

/** How much the page jumped while loading (CLS-style sum), and what moved most. */
export async function layoutShift(page: Page): Promise<{ total: number; worst: { value: number; at: number; src: string[] }[] }> {
  return page.evaluate(() => {
    const s: { value: number; at: number; src: string[] }[] = (window as any).__shifts || [];
    return { total: s.reduce((a, b) => a + b.value, 0), worst: [...s].sort((a, b) => b.value - a.value).slice(0, 3) };
  });
}

/** Doubles every text size, as a phone set to its largest text does, and
 *  reports a page that scrolls sideways or controls whose label gets cut off. */
export async function textAt200(page: Page): Promise<Finding[]> {
  return page.evaluate(async () => {
    const out: { check: string; what: string; detail: string }[] = [];
    const els = Array.from(document.querySelectorAll<HTMLElement>("body *"));
    const sizes = els.map((el) => { const s = getComputedStyle(el); return [parseFloat(s.fontSize), s.lineHeight] as const; });
    els.forEach((el, i) => {
      const [size, lh] = sizes[i];
      el.style.fontSize = `${size * 2}px`;
      if (lh.endsWith("px")) el.style.lineHeight = `${parseFloat(lh) * 2}px`;
    });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 2) {
      // Find the widest offenders.
      const wide = els.filter((el) => el.getBoundingClientRect().right > window.innerWidth + 2 && !el.closest("[class*='overflow-x'], [style*='overflow-x']"))
        .filter((el) => getComputedStyle(el).position !== "fixed")
        .slice(0, 3)
        .map((el) => el.getAttribute("data-testid") || el.tagName.toLowerCase() + "." + (el.className?.toString?.() || "").split(" ").slice(0, 3).join("."));
      if (wide.length) out.push({ check: "text200", what: `page scrolls sideways (${doc.scrollWidth}px wide in ${window.innerWidth}px)`, detail: wide.join(" | ") });
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("button, a[href], [role='button'], label"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || el.closest('[aria-hidden="true"]')) continue;
      const s = getComputedStyle(el);
      const clips = s.overflow !== "visible" || s.overflowX !== "visible";
      if (clips && (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 4) && s.textOverflow !== "ellipsis" && el.innerText.trim().length > 1) {
        // Which child sticks out, so the finding says where to look.
        const box = el.getBoundingClientRect();
        const culprit = Array.from(el.querySelectorAll<HTMLElement>("*")).find((c) => {
          const q = c.getBoundingClientRect();
          return q.width > 0 && (q.right > box.right + 2 || q.bottom > box.bottom + 4) && c.innerText?.trim();
        });
        const where = culprit ? ` — "${culprit.innerText.trim().slice(0, 30)}" (${culprit.getAttribute("data-testid") || culprit.className.toString().slice(0, 60)})` : "";
        out.push({ check: "text200", what: `label cut off: "${el.innerText.trim().replace(/\s+/g, " ").slice(0, 40)}"`, detail: `${el.getAttribute("data-testid") || el.outerHTML.slice(0, 80)} ${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight}${where}` });
      }
    }
    return out;
  });
}
