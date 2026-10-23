// Builds the screens packaged inside the Android/iOS app into dist/app
// (capacitor.config.ts webDir), separate from the website's dist/public.
// Leaves out the website's marketing photo library (hundreds of MB); the
// app's welcome screen loads those from destira.date instead (Landing.tsx).
//
//   npm run build:app && npx cap sync android
//
// Emulator build against the local dev server:
//   VITE_APP_API_BASE=http://10.0.2.2:5001 npm run build:app
//   CAP_DEV_API=1 npx cap sync android
import { build } from "vite";
import { rm, readdir, stat } from "fs/promises";
import { join, resolve } from "path";

const outDir = resolve("dist/app");
// Marks the screens shipped inside the APK; any update the server offers
// replaces them (client/src/lib/app-update.ts).
process.env.VITE_BUNDLE_ID ??= `builtin-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12)}`;
await build({ mode: "production", build: { outDir, emptyOutDir: true } });
await rm(join(outDir, "photos"), { recursive: true, force: true });

async function size(dir) {
  let total = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    total += e.isDirectory() ? await size(p) : (await stat(p)).size;
  }
  return total;
}
console.log(`\napp screens: ${(await size(outDir) / 1048576).toFixed(1)} MB in dist/app`);
