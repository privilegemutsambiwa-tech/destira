// Packages the app's screens for over-the-air updates. The Android/iOS app
// runs the same client build as the website (its API address defaults to
// https://www.destira.date), so every deploy zips dist/public, minus the
// website's photo library, into dist/app-bundle/<id>.zip and describes it in
// dist/app-bundle/latest.json. server/app-update.ts serves both; the app
// (client/src/lib/app-update.ts) downloads it and switches on next launch.
import { createHash } from "crypto";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { join, relative, sep } from "path";
import { zipSync } from "fflate";

/** Folders of dist/public the app doesn't carry (loaded from the website). */
const LEFT_OUT = new Set(["photos", "uploads"]);

/** The oldest installed app (Android versionCode) this bundle runs on. Bump
 *  it, together with the app's versionCode, whenever the screens start
 *  needing a native plugin the older app doesn't have. */
export const MIN_NATIVE_BUILD = 1;

export function newBundleId(): string {
  const commit = (process.env.RENDER_GIT_COMMIT || "").slice(0, 7);
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  return commit ? `${stamp}-${commit}` : stamp;
}

async function collect(root: string, dir: string, out: Record<string, Uint8Array>) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(root, full).split(sep).join("/");
    if (entry.isDirectory()) {
      if (dir === root && LEFT_OUT.has(entry.name)) continue;
      await collect(root, full, out);
    } else {
      out[rel] = new Uint8Array(await readFile(full));
    }
  }
}

export async function packageAppBundle(publicDir: string, outDir: string, id: string) {
  const files: Record<string, Uint8Array> = {};
  await collect(publicDir, publicDir, files);
  const zip = zipSync(files, { level: 9 });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, `${id}.zip`), zip);
  const checksum = createHash("sha256").update(zip).digest("hex");
  await writeFile(join(outDir, "latest.json"), JSON.stringify({ version: id, checksum, minNativeBuild: MIN_NATIVE_BUILD, size: zip.length }));
  console.log(`app bundle ${id}: ${Object.keys(files).length} files, ${(zip.length / 1048576).toFixed(1)} MB`);
}
