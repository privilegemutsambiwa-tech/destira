# Landing page — photo slots

Every slot is a `<PhotoFrame slot="…">` (or, for the closing full-bleed, a
`[data-photo-slot]` div) in `client/src/pages/Landing.tsx`. Drop files in and
wire `src`/`alt`; the reserved aspect box is already there so there is no CLS.

**The rule for every frame:** two people, mid-interaction, the place visible in
frame, no one looking at the lens. Never a photo you could swipe on — always a
photo of an evening that happened. Reject any frame with one person alone,
anyone smiling into the lens, a white/studio background, or a phone in use.

`srcSet` widths: **640 / 960 / 1440 / 1920**. "Min width" below is the smallest
that must exist for that slot to look right at its largest render size.

## Current fill — Pexels placeholders (2026-09-06)

Interim images are in place so the layout is real. All are **Pexels License**
(free commercial use, no attribution required) and are meant to be replaced with
the commissioned/curated frames. Source originals: `client/public/photos/_src/`
(git-ignored). Regenerate variants after swapping a source: `npm run photos`.

| slot id | source | photo page |
|---|---|---|
| `hero-primary` | Pexels, Andres Ayrton | https://www.pexels.com/photo/happy-african-american-couple-hugging-each-other-6578931/ |
| `hero-secondary` | Pexels, Andres Ayrton | https://www.pexels.com/photo/faceless-black-couple-holding-hands-while-having-date-at-table-6579002/ |
| `turn` | Pexels, Andres Ayrton | https://www.pexels.com/photo/african-american-couple-drinking-wine-at-table-6579021/ |
| `group-late-practice` | Pexels, Jeff Vinluan | https://www.pexels.com/photo/group-of-musicians-in-a-rehearsal-space-8827042/ |
| `group-sunday-trail` | Pexels | https://www.pexels.com/photo/hikers-ascending-mountain-ridge-at-sunrise-30867724/ |
| `group-table-for-six` | Pexels, coco HACHE | https://www.pexels.com/photo/top-view-of-people-sitting-at-table-eating-12412203/ |
| `closing` | Pexels, Amine İspir | https://www.pexels.com/photo/couple-hugging-on-the-street-13639163/ |

Direction (2026-09-06): the hero pair, `turn` and `closing` now carry
"people in love" energy — a Black couple across the hero + wine-date + a
night-street embrace. The three Communities covers stay as *group* scenes
(band / trail / table-of-six) — that section is about the rooms people meet
through, not couples.

Known compromises: `group-sunday-trail` is hikers, not runners. `closing`
(13639163) is a tall portrait hard-cropped to a 16/9 full-bleed — the hug sits
low; reshoot or recrop for the real pass. Vet all against the
evidence-vs-catalogue test before shipping.

---

| slot id | aspect | min width | caption | the shot |
|---|---|---|---|---|
| `hero-primary` | 4/5 | 960 | `MIRA & KABELO · RESONANCE 87 · MET IN LATE PRACTICE` | Two people at a small table, leaning in, one talking with their hands. Bar or café, Avondale/Milton Park (Harare). Documentary, available light, f/2. |
| `hero-secondary` | 1/1 | 640 | `THURSDAY · THE LISTENING ROOM` | A dim listening room, two people side by side facing away from camera, records/turntable visible. |
| `turn` | 16/9 | 960 | `NINETY SECONDS OF TWIN CONVERSATION, THEN AN ACTUAL EVENING` | Mid-laugh across a table, wine, phones face-down on the table and legibly face-down. `treatment="plain"` — no warm lift here. |
| `group-late-practice` | 3/2 | 640 | — (card carries the title) | A band mid-rehearsal in a small practice room, instruments, low light, one player looking at another. |
| `group-sunday-trail` | 3/2 | 640 | — | Runners on a ridge at dawn, mid-stride, mostly backs to camera. |
| `group-table-for-six` | 3/2 | 640 | — | A long table shot from above: six sets of hands, plates, mid-service, mid-laugh. The one place a group over two is right. |
| `closing-fullbleed` | full-bleed (~16/9 crop, `object-position: center 40%`) | 1920 | — | Two people walking away from camera on a lit street at night, shot from behind. Scrim is `linear-gradient(rgba(12,9,16,.72), rgba(12,9,16,.88))` + a 120px fade top and bottom into `#0C0910`. **Check the "Stop auditioning." headline holds ≥ 4.5:1 against the scrimmed image at its lightest pixel — if not, deepen the scrim, do not lighten the type.** |

## OG image — `client/public/brand/og.png`

Referenced from the head meta in `Landing.tsx` (`og:image`). Expected **1200 × 630 px**.
Use the `hero-primary` photo, warm treatment, with the VibeFlow lockup
bottom-left and *"Resonance over photographs."* set in Instrument Serif.

## Notes / deviations

- `closing-fullbleed` is a raw `[data-photo-slot]` div, not a `<PhotoFrame>` —
  the frame's rounded card + caption scrim actively conflict with a 100vw
  bleed that fades into the neighbouring sections.
- Section 4 (The Read) and Section 6 (The Objection) are deliberately
  photo-free. Do not add images there.
