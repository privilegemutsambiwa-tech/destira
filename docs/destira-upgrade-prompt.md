# Destira 2.0 — the upgrade prompt

> How to use this: hand this whole document to the engineer or AI agent doing the
> upgrade. It is written as their brief. Everything in it is grounded in the app as
> it exists on 2026-11-13 (commit `b229429`): the real routes, components, tokens and
> features. Work through it in the phases in section 12, one shippable phase at a time.

---

## 0. Your role and the mission

You are the lead product designer and principal front-end engineer for **Destira**, a
dating app built for Zimbabwe first and Africa next. You have taste at the level of the
best consumer products in the world, and the engineering discipline to ship it on a
three-year-old Android phone on a weak 3G connection without dropping a frame.

**The mission:** take Destira from "a good app" to "the most beautiful, calm and
trustworthy dating product people here have ever used". When someone opens it for the
first time, the reaction should be *"wow"*, and after a week it should feel like home.

The wow does **not** come from more things on screen. It comes from:

1. **Restraint.** One clear thing per screen. The person you might meet is the hero,
   never a banner about the app.
2. **Craft in the details.** Exact spacing, real typography, motion that feels
   physical, empty states that are written, not defaulted.
3. **A few signature moments** that nobody else has, built around Destira's one big
   idea: *your AI twin does the first date's worth of talking before you do.*
4. **Speed.** Every tap answers within 100 ms. Fast is a feature, and it is the first
   thing people feel.
5. **Belonging.** It should feel made here, for people here: their city, their
   evenings, their time zone, their data costs, their way of talking.

Do not copy any other dating app's look or signature interactions. Destira is not a
swipe app, and it must never look like one.

---

## 1. Ground truth: what Destira is today

### 1.1 The product

- **The twin.** Every member has an AI twin built from their answers. Twins talk to
  other members' twins first ("interviews"), then Destira tells the member who they'd
  get on with and why. Members can ask someone's twin questions before liking them,
  chat with their own twin (`/twin-chat`) and set what their twin may disclose.
- **Discover** (`/discover`): a deck of people with a **resonance** score (the dial,
  `resonance-dial.tsx`) and honest sub-axes (`resonance-axes.tsx`), stories, a
  "Next up" preview, filters (all / within 20 km / online), like, pass with undo,
  "Ask {name}'s twin", block, report, photo lightbox.
- **Tonight's three:** three people picked each evening, released at 19:00 Harare
  time, with a push notification.
- **Likes** (`/matches`): who's waiting on you and who you asked. Seeing *who* liked
  you is a paid feature.
- **Chat** (`/interviews`): twin chat entry, conversations, filters (matches, AI twin,
  story replies), direct chat (`/chat/:matchId`) with an offline outbox, reactions,
  replies, link previews, and video dates between matches (`/call/:id`, built but not
  released yet).
- **Lounge** (`/lounge`): interest and city groups, group chat, group info and
  settings, invite links (`/join/:token`), game rooms with live rounds.
- **Events** (`/events`): small real-world meetups. Destira Official events are
  run by an autopilot; members can save a seat; hosting is a Flame feature;
  public event pages (`PublicEvent.tsx`) and share cards.
- **Proximity:** with permission, the twin can say "someone worth knowing is at the
  same place" at named places only (campuses, malls, office parks), never a map.
- **Profile** (`/profile`), photos (`/photos`), "how others see you" preview, settings
  (2,166 lines, the biggest screen), app lock, push preferences, invites.
- **Plans:** Free, Spark, Flame, Ember. Prices in US dollars, weekly / monthly / six
  months. Gates are enforced by the server (`server/gate.ts`) and explained on the
  client by `usePaywall().guard()` and the refusal sheet.
- **First day:** Essentials (`/essentials`) → twin disclosure → Meet your twin
  (`/meet-your-twin`) → a "Your first day" checklist that rewards finishing with
  7 days of Flame.

### 1.2 The platform

- React + TypeScript, wouter, TanStack Query, Tailwind + shadcn/ui primitives,
  framer-motion (used in about 9 places), Express + Drizzle + Postgres.
- Android app via Capacitor 7 (`date.destira.app`). The web screens ship to phones
  **over the air** as a bundle; anything that needs a new Android permission or
  native code needs a new APK (currently 1.4, versionCode 5, not yet published).
- The website is the same React app at www.destira.date, with a public landing page.

### 1.3 The current design language (keep its soul)

From `docs/redesign-handoff.md` and `client/src/index.css`:

- Editorial and warm. **Instrument Serif** for headlines, **DM Sans** for body,
  **DM Mono** for labels and figures.
- Dark ground `#0C0910` with warm cream text `#F5F0EA`; a warm off-white light theme
  (`#FBF8F5`). Both themes are first-class.
- **Ember** `#FF6B4A` = human action. **Mint** `#8FE3C7` = the AI twin, and only the
  twin. **Gold** `#E9C46A` = premium only. These meanings are sacred: never break them.
- No emoji in UI chrome. No gradient-slop backgrounds. No stat padding. Honest copy.

The upgrade **evolves** this language. It is not a rebrand. The logo, the three
colour meanings and the type families stay.

---

## 2. What's holding it back today (audit)

These come from walking the real app at phone and laptop sizes. Fix every one.

1. **Discover buries the person.** On a phone, the first screen is a "Your first day"
   checklist, then Tonight's three, then two dismissible tip cards ("Your twin talks
   to people who are deciding about you…", "A complete profile gets more likes…"),
   then the stories row, and only on the **third screen of scrolling** does a person
   appear. A plans upsell card sits below the deck too. The product's main moment is
   underneath its own instructions.
2. **Interruptions on arrival.** The location permission sheet covers whichever
   screen you open first, before the member has seen anything worth sharing a
   location for.
3. **Tip-card sprawl.** Explanatory banners with an ✕ appear on Discover, Chat,
   Lounge, Events and Profile. Each one is reasonable; together they make the app
   feel like a manual.
4. **Names drift.** The tab says **Chat** but the route is `/interviews`. The tab says
   **Likes** but the page title is **Interest**. Discover says "one read ready" while
   the plans talk about likes. A member should never wonder whether two words mean
   the same thing.
5. **Default-looking pieces remain.** Pill-shaped search boxes, generic chips, empty
   states that are a grey icon in a circle plus a big button ("No conversations
   yet / Discover People"), letter tiles as Lounge group avatars, a blank placeholder
   square for a profile photo overlapping a blurred cover, a floating dark `+` button
   that collides with the tab bar.
6. **Desktop is a stretched phone.** On a 1440 px screen the left rail is fine, but
   content sits in one column with a large empty area to the right. Nothing uses the
   width: no side panels, no keyboard flow, no hover detail.
7. **Inconsistent rhythm.** Card radii, section spacing, label styles and button sizes
   vary from screen to screen (Events, Lounge and Profile each feel like a slightly
   different app).
8. **The landing page's second half is blank until scroll animations fire**, and the
   first screen leads with buttons before it has made anyone feel anything.
9. **Upsells are inline and frequent.** Plans prompts appear inside the deck and in
   cards. Premium should feel like an invitation, not a toll booth.
10. **The best ideas are invisible.** The twin interviewing people, resonance, the
    19:00 release, Official events: these are genuinely new, but the UI presents
    them as list rows and tips instead of moments.

---

## 3. The north star: "the evening"

Destira's whole rhythm already happens in the evening: tonight's three land at 19:00,
events happen after work, the twin talks while you're busy. Make that the soul of the
design.

**The idea:** Destira feels like walking into a warm room at dusk where a friend who
knows everyone has already done the introductions. Calm, low light, warm materials,
nobody shouting. You're welcome here.

### 3.1 Design principles (use these to settle every argument)

1. **The person is the hero.** Faces, names and words take the space. Chrome
   recedes. If a screen's first thing isn't a person or a decision, ask why.
2. **One thing at a time.** Each screen has a single primary action. Everything else
   is secondary in size, weight and colour.
3. **The twin is a presence, not a feature.** Mint is how you know your twin is
   in the room. It speaks in first person, briefly, and only when it has something.
4. **Quiet until it matters, then unforgettable.** Most of the app is calm. A match,
   the 19:00 release, a first reply, a seat confirmed: those get real ceremony.
5. **Honest, always.** No fake urgency, no fake counts, no dark patterns. Resonance
   shows the unflattering axes too. Prices say exactly what you get.
6. **Made here.** Harare time, local places, local photography, local rhythm,
   data-cost awareness. Never cultural kitsch.
7. **Fast is a feature.** Instant feedback, optimistic updates, skeletons that match
   the final layout, nothing that blocks on the network unless it must.
8. **Accessible by default.** WCAG 2.2 AA in both themes, 44 px touch targets,
   screen-reader labels, reduced motion respected.

### 3.2 The ambient "evening light" system (signature)

The page ground subtly follows the member's local time, so the app feels alive:

- **Day (06:00–16:59):** the current ground, neutral.
- **Golden hour (17:00–18:59):** the faintest warm ember wash at the top of the
  screen (2–4% opacity radial light), and the Discover header says how long until
  tonight's three ("Tonight's three in 1 h 12 min").
- **Evening (19:00–23:59):** a soft deep-violet wash, the mint twin orb gently
  brighter, Tonight's three is the first thing on Discover.
- **Late night (00:00–05:59):** dimmest ground, reduced contrast on decorative
  elements only (text contrast never drops below AA).

Rules: it is a background tint only, never changes a semantic colour, applies in both
themes, costs nothing (one CSS custom property updated each minute), and is off when
"reduce motion" or a "plain background" setting is on.

---

## 4. Design system v2

Build these as real, reusable pieces in `client/src/components/ui-vf/` (or rework the
shadcn ones in place). Every screen must use them; no one-off styling.

### 4.1 Colour

Keep every existing token and its meaning. Add:

- **Elevation scale** (both themes): `--vf-e0` ground, `--vf-e1` card, `--vf-e2`
  raised card / sheet, `--vf-e3` popover / dialog. In dark mode elevation is lighter
  surface plus a hairline top highlight (`inset 0 1px 0 rgba(255,255,255,.04)`); in
  light mode it's a soft two-layer shadow
  (`0 1px 2px rgba(28,20,24,.06), 0 8px 24px rgba(28,20,24,.06)`).
- **State tokens:** `--vf-success` (a warm green that is clearly not mint, for
  "seat confirmed", "sent"), `--vf-danger` (for destructive only), focus ring
  `--vf-focus` (ember at 60% with 2 px offset).
- **Scrims:** one photo scrim recipe for text on images (bottom 45% linear to
  `rgba(12,9,16,.82)`), used everywhere text sits on a photo.
- Check every pairing with a contrast script in CI; fail the build below AA.

### 4.2 Typography

One scale, used everywhere (mobile / desktop):

| Role | Font | Size / line height | Use |
|---|---|---|---|
| Display | Instrument Serif | 44/46 · 64/66 | Landing hero, match moment |
| H1 | Instrument Serif | 32/36 · 40/44 | Page titles |
| H2 | Instrument Serif | 24/28 · 28/32 | Section titles, names on cards |
| H3 | DM Sans 600 | 17/24 | Card titles |
| Body | DM Sans 400 | 16/24 | All reading text (never below 15 on mobile) |
| Small | DM Sans 400 | 14/20 | Secondary text |
| Label | DM Mono 500, +0.14em, caps | 11/14 | Eyebrows, metadata |
| Figure | DM Mono 500, tabular | 13–40 | Scores, prices, times, counts |

- Serif italic is the "voice" accent: one italic phrase per screen at most
  (e.g. *actually click with*).
- Names are always serif. Numbers are always mono and tabular.
- Self-host the three fonts (subset to Latin + Latin Extended, `font-display: swap`,
  preload the two weights used above the fold) instead of the Google Fonts `@import`,
  so first paint doesn't wait on a third-party request.

### 4.3 Space, shape, layout

- 4 px grid. Page gutters 16 px (phone), 24 px (tablet), 32 px (desktop).
  Section gap 32 px phone / 48 px desktop. Card padding 20 px.
- Radii: 10 (chips, inputs), 16 (cards), 24 (sheets, hero cards), full (avatars,
  icon buttons). Nothing else.
- Max reading width 640 px. Desktop app layout described in section 9.

### 4.4 Iconography and imagery

- Lucide at 1.5 px stroke, 20 px default, 24 px in the tab bar. One set only.
- Draw **five custom glyphs** in the same style: the twin (two overlapping rings, from
  the logo), resonance, Tonight's three, a seat (events), the Lounge. These replace
  generic icons in the tab bar and section headers.
- **Avatars everywhere get the same treatment:** photo with a 1 px inner ring; no
  photo → a warm generated gradient from `avatarColor` plus the serif initial (never
  a grey silhouette, never an empty square). Lounge groups get generated covers
  (abstract shapes in the group's colour, seeded by its id) instead of letter tiles.
- Photography for marketing and empty states: real, local, warm, evening-lit
  (Harare, Bulawayo, Victoria Falls, Domboshava rocks, Avondale cafés). No stock
  smiles. Commission or license; never generate faces of "members".

### 4.5 Motion system

Motion is how the app feels expensive. Define it once in `lib/motion.ts`:

- **Durations:** 120 ms (press, toggles), 220 ms (small enter/exit), 320 ms (sheets,
  page transitions), 600–900 ms (ceremony moments only).
- **Easing:** standard `cubic-bezier(.2,.8,.2,1)`; exit `cubic-bezier(.4,0,1,1)`;
  springs for anything the finger moves (stiffness 380, damping 32).
- **Press:** every tappable thing scales to .97 with a 120 ms ease and returns; no
  tap ever feels dead.
- **Page transitions:** push forward = new page slides in 24 px and fades from 0;
  back = reverse. Tabs = cross-fade only (no slide), so tabs feel like places, not
  a stack. Use the View Transitions API on web where supported, framer-motion
  fallback on the app.
- **Shared elements:** a person's photo on a Discover card morphs into the header of
  their full profile and back; a group cover morphs into the group chat header.
- **Lists:** stagger 30 ms per item, max 8 items, then everything else appears at once.
- **Skeletons:** a slow, low-contrast shimmer (1.6 s), shaped exactly like the content.
- **Reduced motion:** all of the above becomes 120 ms fades. Ceremony moments become a
  static composition. No exceptions.
- Animate only `transform` and `opacity`. Nothing that triggers layout.

### 4.6 Haptics and sound (app only)

Through the native plugin (Capacitor Haptics):

| Moment | Haptic |
|---|---|
| Like | medium impact |
| Pass | light impact |
| Match | success notification, then two soft ticks with the animation |
| Message sent | soft tick |
| Seat saved | success |
| Error / refused | warning |
| Pull to refresh threshold | selection tick |

Sound: off by default. One optional, very soft two-note "chime" for a match and for
the 19:00 release, toggle in Settings.

### 4.7 Core components to rebuild (one consistent family)

Button (primary ember, secondary outline, quiet text, destructive, premium gold
outline; sizes 52/44/36; loading state keeps its width), IconButton, Input and
Textarea (floating label, 52 px, helper and error text, character counter where
relevant), Search (a quiet field with a leading glyph, not a pill), Chip / segmented
control (one style), Tabs (an underline that slides between tabs), Sheet (bottom on
phone, centred dialog ≥768 px, drag handle, spring), Toast (one line, icon, optional
action like Undo, sits above the tab bar), Avatar and AvatarStack, Card, ListRow,
EmptyState (illustration slot + serif line + one sentence + one action), Skeleton,
Badge, Progress, **Note** (the single replacement for all tip banners, section 5.4),
TabBar (phone), Rail (desktop), PageHeader (large title that collapses into the top
bar on scroll).

Each component ships with: both themes, focus state, disabled state, pressed state,
reduced-motion state, and a story / screenshot in a component gallery page
(`/dev/gallery`, dev builds only).

---

## 5. Signature moments (the wow)

Build these with ceremony. Each one must still be fast, skippable after the first
time, and work offline where it makes sense.

### 5.1 The twin orb

A small living mint orb (two overlapping rings, softly breathing) that represents
the member's twin. It appears:

- in the top bar on Discover, glowing faintly when the twin has news (new reads,
  a finished interview); tap opens a sheet of "what your twin did today"
  ("Talked to 14 people. Three were worth your time.");
- in twin chat as the twin's avatar;
- in onboarding, being "born" as the member answers (it gains rings / detail as
  answers come in).

It is the one piece of the app that is allowed to be a little magical.

### 5.2 The 19:00 release

At 19:00 Harare time, opening Discover plays a short reveal (under 1.5 s, skippable):
the screen dims slightly, the twin orb pulses once, and three portrait cards deal in
from the orb, each landing with a soft haptic tick, the reason line typing in beneath
("You both left home young and talk about it easily"). After the first view it's a
static row. The push notification opens straight into this moment.

### 5.3 The resonance read

Opening a person shows the resonance dial filling to its score with the conic sweep
it already has, the number counting up in mono, and the sub-axes drawing in one by
one, including the honest low ones ("Different about money: 41"). Tap the dial for
a plain-language sheet: "Why 87?" with two lines quoted from the twins' actual
conversation.

### 5.4 One note at a time (replacing every tip banner)

Delete the scattered tip cards. Replace them with a single **Note** system: at most
one note per screen, shown at the bottom of the content (never above a person),
chosen by priority (safety > blocking setup > helpful tip), never shown again once
dismissed or acted on, and never more than three per day across the app. All current
tips (twin boundaries, profile completeness, Lounge intro, Events intro, Chat intro)
become notes in this queue.

### 5.5 The match

Both members' photos slide toward each other from the edges, the two rings of the
logo form between them and close into the lens (the logo's overlap glows cream),
the serif headline *"You two."* appears with the reason line, and a single action:
"Say something" with three suggested openers written from what the twins discussed
(tap one to drop it into the composer, editable). Under 2 s, haptics as in 4.6.

### 5.6 First reply

The first time a match replies, the conversation header briefly shows a warm ember
underline that draws across, and the chat list row gets a one-time glow. Small,
meaningful, never repeated.

### 5.7 Your seat

Saving a seat at an event produces a **ticket**: a card with the event name in
serif, date in mono, venue, a perforated edge, and "Seat 4 of 12". It lives in
Events → My seats, can be added to the calendar, and becomes a shareable image (the
existing share-card pipeline). On the day, the ticket shows on Discover's top
("Tonight: Board games at Avondale, 18:30").

### 5.8 App launch

Splash: the logo's two rings on the ground colour, drawing together into the lens in
600 ms, then a cross-fade into the last screen (with cached data already painted).
Never a spinner.

---

## 6. Words: voice, names and copy

### 6.1 Voice

Warm, direct, adult, a bit witty, never cute. Short sentences. Second person. The
twin speaks first person and sparingly. No exclamation marks in the UI except the
match moment. No "Oops!". Errors say what happened and what to do next.

### 6.2 One name per thing (rename everywhere: tabs, titles, buttons, push, emails)

| Thing | Name | Notes |
|---|---|---|
| The deck | **Discover** | |
| A person shown | a **read** is the twin's write-up; the action is **like** | Use "reads" only for the twin's summaries, not as a currency |
| Likes page | **Likes** (tabs: *Liked you*, *You liked*) | Retire "Interest" |
| Chat tab | **Chats** | Route can move to `/chats` with a redirect from `/interviews` |
| Twin-to-twin talk | **interview** | Only in twin contexts |
| Groups | **Lounge**, a group is a **room** | |
| Events | **Events**, attending = **a seat** | |
| Plans | **Free, Spark, Flame, Ember** | Gold only for Ember-level premium accents |

### 6.3 Local warmth (optional, opt-in, tasteful)

- A greeting line on Discover that follows the time of day, in English by default,
  with an option in Settings to show it in **Shona** or **Ndebele** ("Mangwanani",
  "Livukile", "Manheru"…; have native speakers write and check every string).
- Dates and times always in the member's time zone, 24-hour by default for Zimbabwe.
- Prices in US dollars with the local payment methods named on the pay screen.
- Place names as people say them ("Avondale", "Borrowdale Village", "Bulawayo CBD").

---

## 7. Screen by screen

For every screen: the **purpose**, what the **first screenful** must show, the
**layout**, the **details** that make it excellent, and its **desktop** version.
Keep every existing feature and API call unless a line here says otherwise.

### 7.1 Landing page (`/`, `Landing.tsx`): web first impression

- **Purpose:** in five seconds, make a stranger feel the idea and want in.
- **Hero (first screen, phone):** full-bleed evening photograph of two people
  laughing somewhere recognisably local, slow 1.03 Ken-Burns zoom. Over it, the
  headline in display serif: "Meet people you *actually click with.*" One sentence
  under it. Then the two sign-up buttons (Google, email) and a quiet "Log in".
  The Android download appears as a small line under the buttons on Android
  browsers only.
- **The demo section ("Watch your twin work"):** a scroll-driven, looping mini
  conversation between two twins in mint bubbles, typing in real time, ending in a
  resonance dial that fills to 87 with the reason line. This is the product
  explained without words. It must be real HTML/CSS (not a video), under 30 KB.
- **Three pillars,** each a large serif line and one photo: "Your twin talks first.",
  "Three people, every evening.", "The point is the meeting." (with a real
  Official event card).
- **Safety and honesty:** a calm section on verification, blocking, reporting,
  privacy (named places only, never a map), and "Nothing here buys you placement".
- **Plans preview:** four tiers in one honest row, with Free shown first and
  prominently.
- **Footer:** legal, contact, app download, social links, made in Harare.
- **Fix:** every section renders its content without waiting for an animation;
  animations only enhance already-visible content (no blank screens if JS is slow).
- **Desktop:** split hero (text left, a tall portrait phone mock right showing the
  real Discover screen with live-looking motion), sections alternate left/right on a
  12-column grid, generous whitespace, 1200 px max content width.
- **Performance:** LCP under 2.0 s on 4G / mid Android; hero image AVIF/WebP with a
  blurred 1 KB placeholder; no layout shift.

### 7.2 Sign up, log in, forgot / reset password, auth callback

- One shared, calm layout: logo top, serif title, form, one primary button.
- Sign up is one field per step on phone (email → password → done) with a slim
  progress line; password field shows strength as words ("Strong enough"), not a bar
  of colours; "Continue with Google" always first.
- Real-time inline validation after first blur, never on every keystroke.
- Auth callback shows the splash-style logo animation while it works, never a bare
  spinner.
- Forgot / reset: show what will happen ("We'll email a link to p…@gmail.com. It
  works for an hour.") and a clear success state with an "Open email app" button
  in the app.
- Desktop: the form sits in a 440 px card on the left half; the right half shows the
  landing's evening photo with a single rotating quote from the demo conversation.

### 7.3 Onboarding (`Essentials`, `TwinDisclosure`, `MeetYourTwin`, `Onboarding`)

- Treat it as **creating your twin**, not filling a form. The twin orb sits at the top
  and grows with each answer (more rings, more light).
- One question per screen, big serif question, large tappable answers (cards, not
  radio dots), progress shown as "4 of 9" in mono plus the orb's growth.
- Smart defaults (age range from age, already done) shown as "Set from your age;
  change it if you like".
- **Twin disclosure:** a single, beautiful, plain-language page: what your twin will
  say, what it never says, with three toggles. Illustrated with a split
  conversation: what's shared (mint) vs private (blurred).
- **Meet your twin:** the reveal. The twin introduces itself in first person in two
  short messages, answers one real question the way it would for someone else, then
  offers to try the other way round on one suggested person. End with a single
  button: "Show me who you found".
- Never ask for location, push or photos inside the flow. Ask for them later, at the
  moment they matter (see 8.2).
- Save progress after every step; resuming lands on the exact question.

### 7.4 Discover (`/discover`): the heart

**Purpose:** meet one person well, then decide. Nothing else above them.

**First screenful on phone, in this order:**

1. A slim top bar: date + time-of-day greeting (left, label style), twin orb (right).
2. If it's after 19:00 and tonight's three aren't done: **Tonight's three** as a
   compact horizontal row (three 88×116 portraits), tap to open. Otherwise skip it.
3. **The person card**, filling the rest of the viewport (minimum 70% of the height):
   - full-bleed photo with the scrim, name and age in H2 serif, place and distance
     in label mono ("Avondale · 3 km"), resonance dial (56 px) top-right;
   - swipe or tap left/right edges to page through photos, with thin segment
     indicators at the top;
   - one line from the twin in mint under the name ("Your twin: you'd argue
     happily about football and agree about family");
   - scroll down **within the card** to read: the twin's read (3 short paragraphs
     max), the resonance axes, prompts and answers, interests, stories ring, "Ask
     {name}'s twin" (mint), block and report under a "…" menu.
4. The **decision dock** floats at the bottom above the tab bar: pass (outline),
   ask the twin (mint), like (ember, largest). Undo appears as a toast after a pass.

**Moved out of the deck:**

- "Your first day" checklist → a compact progress chip in the top bar
  ("First day 2/5") that opens a sheet. Never a card above a person.
- All tips → the Note system (5.4), shown after the decision dock area, one at a time.
- Plans upsell → only when the member hits a limit, via the existing refusal sheet,
  or one quiet Note per day at most.
- The "Add" story button and stories row → a slim row **under** the top bar only
  when there are unseen stories; otherwise hidden.

**Details:**

- Card transitions: like = card lifts and flies up-right with a slight rotation (8°)
  and an ember glow at the edge; pass = slides left and fades; the next card is
  already decoded and rises from 96% scale. The next photo is preloaded.
- Drag gestures are allowed (like/pass by drag with resistance and a threshold), but
  buttons stay first-class. This is not a swipe app: no stamps, no "NOPE".
- "Next up" becomes a small peek of the next card's top edge behind the current one,
  not a separate section.
- Empty deck: a written, illustrated state that says why ("You've met everyone
  within 20 km who fits your settings") with exactly two actions: widen the
  distance, or see events this week.
- At the daily cap: a calm full-screen state with the reset time in mono, what the
  next plan gives, and a "Talk to your twin meanwhile" option. Never a dead end.
- Filters (All / Within 20 km / Online now) become a segmented control in the top
  bar's overflow sheet, with the current one shown as a label.

**Desktop (≥1024 px):** three-column "spread": left rail nav; centre the person card
at a fixed 480 px width, full height; right panel (360 px) shows the twin's read,
resonance breakdown and "Ask the twin" inline, so nothing needs scrolling.
Keyboard: `←` pass, `→` like, `T` ask the twin, `Space` next photo, `Z` undo,
`?` shortcut sheet.

### 7.5 Full profile (`/u/:userId`, `ProfileView.tsx`)

- Opens with a shared-element morph from wherever the photo was (Discover card,
  Tonight's three, a story, a Lounge member).
- Layout like a beautifully set magazine profile: tall lead photo, name in display
  serif, then alternating photo / text blocks (prompt answers as pull quotes in
  serif italic), the twin's read in a mint-edged block, resonance with axes,
  shared rooms and events ("You're both in Harare Board Gamers").
- Sticky bottom bar: like (or "Liked" state with withdraw), ask the twin, message
  when matched, video date when matched (when released).
- Desktop: two columns: photos left (scrollable gallery), profile right.

### 7.6 Tonight's three (`tonights-three.tsx`)

- Before 19:00: a countdown line on Discover ("Tonight's three in 2 h 05 min"), not a
  card.
- At release: the reveal (5.2). After deciding on all three: the row collapses into
  "You've seen all three. Next set tomorrow at 19:00" in one line.
- Each pick's reason line is the hero text, not the location.

### 7.7 Ask the twin (`/interviews/:id/chat`, `InterviewChat.tsx`)

- Clearly a conversation **with a twin**, not the person: mint header, "You're
  talking to Charity's twin. Charity sees a summary, not your messages" (or the
  real rule), twin avatar is the orb in the other person's colour.
- Suggested questions as chips above the composer, written from gaps in what you
  know ("Ask about weekends", "Ask what they're building").
- Streaming responses with a soft typing shimmer; each answer can be "saved to
  their read".
- End of the conversation: a single card "Ready to like {name}?" with like / not
  for me.

### 7.8 Chats (`/interviews` → `/chats`)

- Top: the twin chat entry as a slim row with the orb ("Your twin · 2 new
  thoughts"), not a large card.
- Conversation list: avatar, name in serif, last message, time in mono, unread as a
  small ember dot plus bold name. Pinned matches at the top. Waiting messages from
  the outbox show "Sending when you're back online".
- Filters become a segmented control: All · Matches · Twin · Story replies.
- Swipe a row for mute / archive; long-press for the same in a sheet.
- Empty state: a written invitation tied to the member's real situation ("No chats
  yet. Your twin has 3 reads waiting for you"), with the illustrated two rings.
- Desktop: classic two-pane: list (360 px) left, open conversation right, and a
  third collapsible pane for the person's profile.

### 7.9 Direct chat (`/chat/:matchId`)

- Header: avatar, name, "Matched 3 days ago · 87" in mono, video date button
  (when released), "…" menu (profile, mute, block, report, unmatch).
- Bubbles: yours ember-tinted (not solid ember) with ink text, theirs surface;
  grouped by sender with tight spacing, timestamps on tap; day separators in label
  style ("Today", "Thursday").
- Reactions: long-press opens a small tray with 6 reactions; appear as a tiny pill
  under the bubble.
- Replies: swipe right on a bubble to reply, quoted preview above the composer.
- Composer: grows to 5 lines, attach (photo), and a **"Help me reply"** mint button
  that opens three suggestions from the twin (editable, never auto-sent).
- First message: if empty, show three openers from what the twins discussed.
- Link previews, sending / sent / read states (single and double tick in mono
  style), offline outbox bubbles (already built) styled consistently.
- Keyboard handling on Android: composer stays above the keyboard with no jump;
  list keeps the latest message in view.

### 7.10 Video dates (`/call/:id`, `incoming-call.tsx`) (when released)

- Incoming call: full screen, their photo blurred as background, name in display
  serif, "Video date" label, accept (ember) / decline. Soft ring and vibration.
- In call: their video full screen, yours as a draggable rounded tile, controls in a
  frosted bar (mute, camera, flip, quality: Saver / Clear / Audio only with MB per
  minute shown, end). Time used today in mono when there's a limit.
- After the call: "How was it?" with three quick choices and a private note to your
  twin; never shared with the other person.

### 7.11 Likes (`/matches`)

- Tabs: *Liked you* · *You liked*, an underline that slides.
- **Liked you (paid):** a grid of portraits (2 columns phone, 4 desktop), each with
  resonance and a like-back button. **Free:** the same grid with portraits softly
  blurred and the count, one clear line about what Spark unlocks, and the honest
  workaround ("They'll also appear in your Discover").
- **You liked:** list with status ("Waiting", "Matched", "Expired"), withdraw in the
  "…" menu.
- Empty states written for each tab ("Nobody's waiting on you yet. Your twin is
  talking to people tonight").

### 7.12 Twin chat (`/twin-chat`)

- The most intimate screen: a calm, almost bare page, the orb large at the top,
  breathing while the twin "thinks".
- Modes as a segmented control: *Talk* · *Coach* · *Reflect* (if these map to the
  existing train / coach / reflect behaviour).
- Memory made visible: a "What I know about you" sheet listing what the twin has
  learned, each item editable or removable.
- Daily prompt from the twin at the top when there's no conversation ("Tell me about
  a weekend you'd repeat").

### 7.13 Lounge (`/lounge`, group chat, info, settings, join, game rooms)

- Lounge home: "Your rooms" (horizontal cards with generated covers, unread counts,
  live game indicator) then "Find a room" (search + chips: Official, Popular, New,
  Near you) and a grid of rooms (cover, name, one-line description, member avatar
  stack, Join).
- Room chat: header with cover morph, member count, live game banner when a round is
  on ("Trivia round live · 6 playing · Join"), messages as in 7.9 with names and
  avatars, mentions highlighted.
- Room info: cover hero, description, members grid, shared events, media, invite link
  with a share card, leave / report.
- Join link page (`/join/:token`): works logged out; shows the room's cover, who's in
  it (blurred avatars), and one button that signs up and joins in one flow.
- Game rooms: a proper game feel within the brand: big serif question, countdown
  ring in mono, answer tiles with press haptics, live scoreboard with avatars that
  animate positions, a results card shareable as an image.
- Desktop: rooms list left, chat centre, room info right.

### 7.14 Events (`/events`, detail, host, preferences, public page)

- Events home: header "The point is the meeting." in serif with one sentence; then
  **My seats** (tickets, 5.7) if any; then **This week** as large cards (cover photo,
  day in big serif numerals, title, venue, "6 going · 4 more to confirm", avatar
  stack, Save a seat); Destira Official marked with a small gold-free official badge
  (use ink/cream, not gold, since gold means premium).
- Search and Preferences move into a top-bar icon and a sheet.
- "Host an event" is a quiet secondary button with the Flame badge, not a full-width
  ember bar.
- Event detail: cover hero morph, title, date/time in mono, venue with a static map
  thumbnail (no live location of members), host, who's going (avatars; names for
  paid if that's the rule), what to expect, the event chat, add to calendar, share
  card, save a seat / give up seat.
- Host event: a 4-step composer (what, when, where, who) with a live preview of the
  card as you type and a host video recorder step that feels like a story camera.
- Public event page (`PublicEvent.tsx`): a beautiful shareable page for people
  without the app: cover, details, "Save a seat with Destira" that signs up and
  saves in one flow. Rich Open Graph image for WhatsApp shares.
- Desktop: event grid (3 columns) with a filter sidebar.

### 7.15 Profile (`/profile`), photos, preview

- Header: the member's lead photo large (no blurred cover with an overlapping empty
  square). No photo yet → a warm generated portrait background with a large serif
  initial and an "Add your first photo" button in the middle.
- Under it: name, age, city, "here with intent" style line, then **profile strength**
  as a ring with the one next step ("Add 2 photos: profiles with 3+ get twice the
  likes"), not a thin bar.
- Sections as rows: Edit profile, Photos, Prompts, Your twin (what it says, its
  boundaries), How others see you, Plan, Invite friends, Settings.
- Remove the floating dark `+` that collides with the tab bar; adding a story moves
  into the header avatar (a ring with a small `+`).
- Photo manager: a 3×2 grid, drag to reorder with haptics, set cover, focal-point
  picker, smart crop preview of how it appears on a card; uploads show progress and
  work offline-first (queued).
- "How others see you" (`/profile/preview`): exactly the Discover card and full
  profile as others see them, with a toggle "as a Free member / as a paid member".
- Desktop: profile left (sticky), editable sections right.

### 7.16 Settings (`/settings`, 2,166 lines)

- Split into a clean index with grouped rows (Account, Your twin, Privacy & safety,
  Notifications, Discovery, Plan & billing, App, Help, Legal) and sub-pages, each
  its own file. Search at the top ("Search settings").
- Every toggle explains itself in one line underneath. Destructive actions live at
  the bottom of their page, in danger colour, with a typed confirmation for
  account deletion.
- App lock, push test, location, data saver (low-res photos, no autoplay), theme
  (System / Light / Dark), language for greetings, sounds, haptics, reduced motion,
  plain background.
- Desktop: index left, page right.

### 7.17 Plans and pay (`/plans`, `/plans/pay`, return)

- Lead with the member's situation: "You've used 25 of 30 likes today" or "You're
  on Spark until 12 Dec".
- Period selector (Weekly · Monthly · 6 months) as one segmented control that fits
  on a 360 px screen (today it overflows).
- Plan cards: name in serif, price in large mono, "per month" in label style, 4–5
  benefits in plain words with checks, the recommended plan subtly raised (e2) with
  an ember outline, Ember with the only gold accent. Free shown honestly first.
- A comparison table below, collapsible, for people who want every detail.
- Pay screen: order summary, the local payment methods with logos, clear secure
  note, a single pay button with the exact amount. Return screen: a celebratory but
  quiet confirmation ("You're on Flame. Here's what just opened up") with three
  things to try now.

### 7.18 Invite (`/invite`)

- "Bring your people": your code in big mono with copy, a share card image
  generator (your photo optional, the brand, the code), WhatsApp first as the share
  target, and progress of who joined (first names only, with consent).

### 7.19 Legal, privacy, not found, errors

- Legal pages typeset like a good book: 640 px measure, serif headings, a sticky
  table of contents on desktop, "last updated" in mono, plain-language summary box
  at the top of each.
- 404: the two rings drifting apart, "This page wandered off", one button home.
- Error boundary: a calm screen with "Something broke on our side", retry, and a
  "Send report" that includes the error id.

### 7.20 Global overlays and small pieces

Rework each to the new system: `app-lock` (blurred brand ground, PIN pad with
haptics, biometrics), `offline-banner` (a slim top strip "Offline. Your messages
will send when you're back", not a block), `app-update-prompt` (a sheet with what's
new in 3 bullets and one button), `push-nudge` and `location-permission-modal` (see
8.2), `proximity-alerts` (a mint toast-card from the top with the twin glyph),
`first-day-card` (now the chip and sheet, 7.4), `install-card` (web only, once),
`trial-banner` (a slim line in the top bar, not a banner), `match-celebration`
(5.5), `story-viewer` (full-screen, segmented progress, tap zones, hold to pause,
reply composer, smooth cube or fade transition between people), `photo-lightbox`
(pinch zoom, swipe down to dismiss with the photo following the finger).

---

## 8. Behaviour that makes it feel premium

### 8.1 Speed and loading

- Every tap gives feedback within 100 ms (press state, haptic, optimistic update).
- Keep the optimistic patterns already built (chat sends, reactions, likes, passes,
  remembered decisions) and extend them to: saving a seat, joining a room, editing
  profile fields, toggling settings.
- Skeletons match the final layout exactly; no spinner in the main content area
  anywhere in the app.
- Cache-first everywhere (already persisted to IndexedDB on the app): show the last
  known screen instantly, refresh in the background, cross-fade changes.
- Images: responsive `srcset` (w800 / w1600 already exist), blurred placeholder
  colour from the image's dominant colour, decode before showing, preload the next
  Discover card.

### 8.2 Permissions at the right moment

- **Location:** asked the first time the member taps "Within 20 km", or opens an
  event near them, with a pre-sheet that shows what they get. Never on arrival.
- **Push:** asked after the first like or the first message sent ("Want to know
  when Tendai replies?"). Already partly done via `requestPushNudge`; make all
  prompts follow this rule.
- **Camera / mic:** only when starting the first video date or recording a host
  video.
- **Photos:** on "Add photo", with the system picker.

### 8.3 Notifications

- Rich Android notifications: person's photo as the large icon (when the plan allows
  identity), brand accent colour, actions ("Reply", "View"). Grouped by type.
- The 19:00 release notification opens the reveal.
- Quiet hours setting (default 22:00–07:00 except messages from matches).

### 8.4 Offline and data

- A visible but calm offline state everywhere; queued actions show "waiting to send".
- **Data saver mode** (auto-on when the connection is slow or Android data saver is
  on): smaller photos, no story autoplay, no video previews, and a figure in Settings
  showing roughly how much data the app used this week.

### 8.5 Safety, always visible but never scary

- Report and block reachable within two taps of any person, everywhere.
- Before a first event or first video date: a short "Meeting safely" sheet the first
  time only.
- Verified badge (if/when verification ships) styled as a small cream check, never
  gold.

---

## 9. Web and desktop specifics

- **Breakpoints:** 0–599 phone, 600–1023 tablet (rail collapses to icons), 1024+
  desktop, 1440+ wide (side panels widen, content stays centred).
- **App shell on desktop:** left rail (logo, nav with labels, twin orb with status,
  your avatar + plan at the bottom), centre content, and a contextual right panel
  where useful (Discover read, chat profile, room info, event details).
- **Keyboard:** full keyboard navigation, visible focus rings, `Cmd/Ctrl+K` command
  palette (go to any screen, search people you've matched, rooms, events, settings),
  shortcuts listed in a `?` sheet.
- **Hover:** subtle lift on cards (translateY −2 px + e2), photo cards show the next
  photo on hover, tooltips for icon buttons.
- **Scrollbars:** thin, themed. **Selection colour:** ember at 25%.
- **SEO and sharing:** landing, public events and join links get proper titles,
  descriptions, Open Graph images (generated per event/room), and structured data
  for events.

---

## 10. Mobile app specifics (Capacitor / Android)

- **Edge to edge:** draw under the status and navigation bars, with safe-area
  insets respected everywhere; status bar icons switch light/dark with the theme
  and with full-bleed photos.
- **Back button:** closes the top sheet / lightbox / story first, then goes back,
  then on a tab root goes to Discover, then exits on a second press with a toast.
- **Tab bar:** five tabs maximum on phone (Discover, Chats, Likes, Lounge, Events),
  Profile moves to your avatar in the Discover top bar (or keep six only if usage
  data says Profile is visited daily). Active tab: custom glyph filled, label
  visible; inactive: outline, label visible. Badge as a small ember dot or count.
- **Pull to refresh** with the twin orb as the indicator.
- **Native feel:** no tap highlight flashes, no text selection on chrome, momentum
  scrolling, 60 fps on a mid-range Android (test on a 3–4-year-old device with
  3–4 GB RAM).
- **App icon:** keep the logo; add an Android 13+ themed (monochrome) icon and a
  polished adaptive icon background.
- **Splash:** as in 5.8, with the Android 12+ splash API (logo, ground colour) handing
  off seamlessly to the web splash.
- Anything that needs native changes (haptics plugin if not present, splash API,
  themed icon, notification actions) is grouped into **one** new APK release; all
  other work ships over the air.

---

## 11. Quality bars (the build is not done until these pass)

- **Performance:** web landing LCP < 2.0 s on throttled 4G; app cold start to
  interactive < 2.5 s on a mid Android; INP < 150 ms; CLS < 0.05; initial JS for
  the landing < 120 KB gzip; each app screen chunk < 80 KB gzip; no new dependency
  over 20 KB gzip without a reason written down.
- **Motion:** 60 fps on the test device for every transition; nothing animates
  layout properties.
- **Accessibility:** WCAG 2.2 AA in both themes (automated check plus a manual
  TalkBack pass on Discover, Chat, Events, Plans), all touch targets ≥ 44 px, all
  images have alt text, every icon button has a label, reduced motion honoured.
- **Consistency:** no colour, radius, shadow or font size outside the tokens
  (lint rule or a grep check in CI).
- **Copy:** every string reviewed against section 6; no "Interest", no mixed names.
- **Regression:** every existing feature still works: likes, passes and undo,
  remembered decisions, outbox, reactions, groups, games, events, hosting, plans and
  gates, payments, push, proximity, app lock, invites, deep links, OTA bundles.
- **Visual proof:** before/after screenshots of every screen at 375 px and 1440 px,
  light and dark.

---

## 12. Delivery plan (phases you can ship one by one)

Each phase ships over the air on its own, is behind a remote flag where it changes a
core flow, and is verified on a real phone before the next starts.

1. **Foundation:** tokens v2, type scale, self-hosted fonts, motion library,
   haptics map, core components (4.7), Note system, component gallery. Rename
   everything per 6.2 (with redirects). No screen redesigns yet, but everything
   adopts the new components so it already feels tighter.
2. **Discover and the person:** Discover rebuild (7.4), full profile (7.5),
   Tonight's three and the 19:00 reveal (7.6, 5.2), resonance read (5.3), the match
   (5.5), twin orb (5.1), permissions moved (8.2).
3. **Conversations:** Chats, direct chat, ask the twin, twin chat, likes (7.7–7.9,
   7.11, 7.12), first reply moment (5.6).
4. **Community:** Lounge, rooms, game rooms, Events, tickets, hosting, public
   pages (7.13, 7.14, 5.7).
5. **You:** Profile, photos, preview, Settings split, Plans and pay, Invite
   (7.15–7.18).
6. **First impression:** Landing, auth, onboarding (7.1–7.3), launch animation
   (5.8), legal and error pages (7.19).
7. **Desktop excellence:** the three-pane layouts, keyboard, command palette, hover
   (section 9) across all screens.
8. **Native release:** one APK with splash API, themed icon, notification actions,
   any native haptics (section 10), together with video dates if ready.
9. **Polish pass:** evening light (3.2), local greetings (6.3), data saver (8.4),
   performance and accessibility audits (section 11) with fixes.

For each phase report: what changed, before/after screenshots, performance numbers,
anything not done and why.

---

## 13. Don't

- Don't change the logo, the three colour meanings, or the type families.
- Don't add swiping stamps, fake counters, streak guilt, confetti, emoji chrome,
  glassmorphism everywhere, or neon gradients.
- Don't add heavy libraries (3D, Lottie players over 50 KB, UI kits) for small
  effects that CSS can do.
- Don't break any server API, route or deep link without a redirect.
- Don't ship a ceremony moment that can't be skipped or that blocks a slow phone.
- Don't ask for any permission before the member has a reason to say yes.
- Don't use real members' photos in marketing or demos.

---

## 14. The wow checklist (the final test)

Hand the app to five people who've never seen it, in Harare, on their own phones:

- [ ] Within 10 seconds of the landing page they can say what Destira does.
- [ ] On first Discover, a person is the first thing they see.
- [ ] They say "wow" or equivalent at least once unprompted (the 19:00 reveal, the
      match, or the twin).
- [ ] Nothing ever made them wait without telling them why.
- [ ] They never saw two names for the same thing.
- [ ] It felt fast on their own phone and data.
- [ ] They felt safe, and knew how to block or report.
- [ ] After a week, they open it in the evening without a notification.
