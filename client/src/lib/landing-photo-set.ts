// The photos the landing page (and the sign-in side panel) show, by hero
// number, in the order the photo wall uses them. Destira launches in
// Zimbabwe, so it is Black couples only: a hand-picked set from
// client/public/photos (hero-81+ repeat 26–80, so only the originals are
// listed). Order is for variety along each column.
//
// Edit by hand, then run `node scripts/landing-photos.mjs` (or the whole
// `npm run photos`): it writes lib/landing-photos.ts with just these photos,
// so the landing never downloads the whole library's manifest.
export const LANDING_PHOTO_SET = [39, 64, 26, 46, 59, 41, 43, 62, 66, 36, 38, 28, 70, 30, 42, 44, 45, 52, 56, 61, 65, 67, 68, 71, 75, 37];
