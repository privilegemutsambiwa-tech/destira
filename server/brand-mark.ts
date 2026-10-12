// The Destira app icon (two rings on a cream tile, ink lens) as an inline
// image for server-drawn share cards (event-share.ts, group-invite.ts).
// Same drawing as client/public/brand/favicon.svg, made by
// scripts/generate-brand-assets.mjs — keep the two in step.
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="#F7F1EA"/>
<defs><clipPath id="L"><circle cx="38.87" cy="32" r="14.6"/></clipPath></defs>
<g transform="rotate(-15 32 32)">
<circle cx="38.87" cy="32" r="14.6" fill="none" stroke="#8FE3C7" stroke-width="5.4"/>
<circle cx="25.13" cy="32" r="14.6" fill="none" stroke="#FF6B4A" stroke-width="5.4"/>
<g clip-path="url(#L)"><circle cx="25.13" cy="32" r="14.6" fill="#1A1418"/></g>
</g></svg>`;

// Part of every share-card cache key: bump it when the card design or the
// mark changes, so cached cards redraw instead of showing the old look.
export const SHARE_CARD_DESIGN = "rings-cream-1";

export const BRAND_ICON_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(ICON_SVG).toString("base64")}`;
