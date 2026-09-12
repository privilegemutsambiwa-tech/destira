# Destira redesign — integration handoff

Target repo: the existing Destira app (React + TypeScript, wouter, Tailwind + shadcn/ui,
Express/Drizzle backend). The redesign lives in `redesign-reference.html` in this folder —
open it in a browser to see it rendered (it's a Claude Design Canvas prototype: static
values only, not app code to copy in).

**Nothing in the backend changes.** This is a presentation-layer reskin plus three new
concepts that are already implied by your data model.

> **Repo reality check (2026-08-30):** this doc was originally written for a page/nav
> structure (`Twin.tsx`, "Groups", "Events", "Messages", "You") that doesn't match this
> repo. Actual pages: `Discover.tsx`, `TwinChat.tsx`, `Lounge.tsx` (+ `GroupChat`/`GroupInfo`/
> `GroupSettings`/`JoinGroup`), `DirectChat.tsx` + `Matches.tsx`, `Profile.tsx`. There is no
> Events feature. Decision on file: **reskin in place, keep current routes/names, no Events
> page.** Treat every "Groups"/"Twin"/"Messages"/"You" reference below as the equivalent
> real page. §4's schema deltas (vouches, resonance sub-axes, transcript visibility) ship as
> **UI-first with derived/mocked data** — no migrations yet.

---

## 0. The one-paragraph brief

> We are reskinning Destira. The design direction: an editorial, warm-dark dating app
> organised around one idea — *your AI twin does the first date's worth of talking before
> you do*. Not a swipe app. One candidate "read" per day, shown as a resonance score with
> honest sub-axes (including unflattering ones), plus an excerpt of the actual conversation
> between the two users' twins. Mint (`#8FE3C7`) ALWAYS and ONLY means "AI twin layer".
> Ember (`#FF6B4A`) is the human/action accent. Gold (`#E9C46A`) is premium only.
> Instrument Serif for headlines, DM Sans for body, DM Mono for labels and metrics.
> No emoji. No gradient-slop backgrounds. No stat padding.

---

## 1. Design tokens — done (2026-08-30)

`tailwind.config.ts` → `theme.extend.colors.vf`:

```ts
vf: {
  ink:      '#0C0910',  // page ground
  surface:  '#14101C',  // primary card
  surface2: '#161220',  // secondary card
  line:     'rgba(255,255,255,.09)',
  text:     '#F5F0EA',
  muted:    '#A79FB4',
  faint:    '#7E7690',
  ember:    '#FF6B4A',  // human action
  emberSoft:'#FF7A57',
  mint:     '#8FE3C7',  // AI twin — never used for anything else
  gold:     '#E9C46A',  // premium only
  warn:     '#FFC46B',
}
```

`theme.extend.fontFamily.serif/sans/mono` now point at Instrument Serif / DM Sans / DM Mono
(global — this replaces the app-wide Inter body font, not just new components). Legacy
`font-display`/`font-body` aliases were left pointing at Inter (only consumer: a heading in
`Onboarding.tsx` — that page is last in the per-screen order anyway, §3.6).

`client/src/index.css` — Inter `@import` swapped for the three new fonts; `--font-sans`
(what `body`/headings actually render with) updated to DM Sans; `--font-serif`/`--font-mono`
added. `vf-rise` / `vf-breathe` / `vf-pulse` / `vf-sweep` keyframes added.

**Not yet done:** hunting down every hardcoded hex / remaining Inter reference in
`client/src` component files — that's part of each screen's own pass (§3), not the token
pass. A first-pass grep turned up the existing dark-theme CSS vars (`#0F0F14` etc. in
`index.css`) and scattered inline hex in shadcn-derived components; expect more as each
screen is rewritten.

---

## 2. Typography rules (the thing that makes it look designed)

| Role | Style |
|---|---|
| Page headline | `font-serif font-normal text-[clamp(30px,4vw,54px)] leading-[1.05] tracking-[-0.02em]` |
| Card title | `font-serif font-normal text-2xl` |
| Body | `font-sans text-[15px] leading-relaxed text-vf-muted` |
| Eyebrow / label | `font-mono text-[10.5px] uppercase tracking-[0.16em]` |
| Metric / number | `font-serif text-[32px] leading-none` |

Never bold a serif headline. Numbers are serif, never sans. Every label above a data block
is mono-uppercase-tracked. That three-way contrast is the whole identity.

---

## 3. Component-by-component mapping

Work in this order. Each step is one commit and independently shippable.

### 3.1 `components/layout-shell.tsx` — left rail
Replace the current nav with a 216px sticky left rail: wordmark + pulsing mint dot, nav
items as `flex justify-between` buttons (active = `bg-white/8`, inactive text `#8B8399`),
mono numeric badges in ember. Bottom of rail: "Twin readiness" card (mono eyebrow, serif
percentage, 4px mint progress bar, one line of copy).

On `<lg` collapse the rail to a bottom tab bar — keep hit targets ≥44px.

### 3.2 NEW `components/resonance-dial.tsx` (replaces `compatibility-ring.tsx`)
Your current ring is an SVG stroke arc. The new dial is three stacked layers:
1. outer `radial-gradient` glow, `animation: vf-breathe 4.5s ease-in-out infinite`
2. `conic-gradient(ember 0turn, warn .55turn, mint .87turn, rgba(255,255,255,.08) .87turn)`
   — the stops are driven by the score
3. inner disc `bg-vf-surface` with the serif number

Props: `score: number`, `size?: number`. Keep the old file until nothing imports it.

### 3.3 NEW `components/resonance-axes.tsx`
Four rows, `grid-cols-[124px_1fr_34px]`: mono label, 5px track, mono value.
Bar colour by threshold — `≥80 mint`, `≥65 warn`, else `ember`.
**Product rule: always render at least one axis below 65.** The honesty is the feature; a
card where everything is green reads as fake and kills trust in the score. (Ship this with
derived/mocked axis data for now — no real sub-axis scoring algorithm yet, see §4.)

### 3.4 `pages/Discover.tsx` — the big one
Currently a card stack/grid. Becomes a single two-column hero card
(`grid-cols-[minmax(300px,1fr)_minmax(300px,1fr)]`, `rounded-[26px]`):

- **Left:** full-bleed photo, bottom gradient scrim, serif name + age, meta line, glass
  pills top-left (Verified / N vouches — mocked count, no `vouches` table yet).
- **Right:** resonance dial + one-sentence plain-language read → axes → **twin transcript
  excerpt** (mint-bordered box, two lines labelled `HERS` / `YOURS` in mono, "Read all N
  lines" gated behind premium) → actions: `Ask to meet her` (ember pill), `Her full
  profile` (ghost), `Pass` (text only).

Below: "Next in the queue" — 2 compact cards + 1 dashed gold Ember card. Copy line:
*"Unlocks tomorrow at 18:00 — one read at a time, on purpose."*

Rip out any infinite feed / swipe-stack behaviour. The scarcity is deliberate.

### 3.5 `pages/TwinChat.tsx` (rework, not new — repo already has this page)
Two columns. Left: chat with your own twin — twin bubbles are mint-tinted with mint border,
yours are solid ember; three-dot mint typing indicator. Right: two cards —
- **"What your twin tells people"**: memory chips. Active = mint border + mint tint.
  Suppressed = `line-through` + `— hidden` suffix. Clicking toggles.
- **"Boundaries"**: three labelled toggles (past relationships / earnings / wanting kids),
  each with a consequence line beneath (`"Saves a lot of wasted evenings"`).

This screen is your legal and trust surface. Every field the twin can disclose needs a
visible switch here or you will get support tickets about it.

### 3.6 Remaining screens
- **Lounge** (repo name for "Groups") — 3-up cards, cover image + `N high reads inside` in
  mono mint + join state. Plus a live-room banner strip.
- **Events** — skipped. Not a real feature in this app; revisit only if the product
  actually wants one.
- **Messages** (repo: `DirectChat.tsx` + `Matches.tsx`) — conversation list + thread. Two
  things to add: the centred system pill *"Your twins talked for 2 minutes before this…"*,
  and mint `twin suggests` icebreaker chips above the composer.
- **Profile view** — photo header with scrim, `in her words` pull-quote, two prompt blocks
  divided by top borders (not left-border accents), **friend vouches** with avatar +
  attributed quote (mocked until the `vouches` table exists), mint "Chat with her twin" CTA,
  overlap chips + score.
- **Own profile** — 3-up photo grid, prompt cards, one dashed "two prompts left" nudge,
  week stats in serif numerals, gold Ember card with the `vf-sweep` shimmer.
- **Onboarding** — 4 steps, mint segment bar, serif question, option rows that light ember
  when picked. Order matters: intent → twin voice → one true thing → pick a room.
  **No photo upload in the flow.** Footnote: *"No photos yet. Your twin goes first."*

---

## 4. Backend / schema deltas — deferred, UI-first for now

Only three, and all are additive. **Decision (2026-08-30): build the UI against
derived/mocked data first; do these as real Drizzle migrations only once the look is
approved.**

1. **`vouches`** table — `userId`, `authorId`, `body`, `createdAt`. Powers the vouch block
   and the `N vouches` pill.
2. **Resonance sub-axes** — your compatibility calc returns a single number today. It needs
   to return `{ score, axes: {label, value}[], summary: string }`. The summary is one
   sentence of plain language, and it must be allowed to be negative.
3. **Twin transcript excerpt** — persist twin–twin exchanges with a `visibility` flag so
   free users get 2 lines and Ember gets the full transcript.

---

## 5. What to check before you call it done

- One axis below 65 on every card, and the summary sentence is allowed to be unflattering.
- Mint appears nowhere that isn't the twin layer. Grep for `8FE3C7` and audit each hit.
- Body text is ≥4.5:1 on its background — the `#7E7690` faint tone is for 12–13px
  metadata only, never for anything you need read.
- Mobile: rail collapsed to tabs, no horizontal scroll, hit targets ≥44px.
- No emoji anywhere. No `Inter` left in the bundle (until Onboarding gets its pass).
