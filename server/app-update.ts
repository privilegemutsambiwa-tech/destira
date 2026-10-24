// Over-the-air updates for the Android/iOS app's screens, self-hosted.
// script/app-bundle.ts packages them at deploy time into dist/app-bundle;
// these routes tell the app what's newest and hand over the zip. Nothing is
// offered in local dev (no bundle is built there).
import type { Express } from "express";
import fs from "fs";
import path from "path";

interface BundleInfo {
  version: string;
  checksum: string;
  minNativeBuild: number;
  size: number;
}

// npm start runs from the repo root, beside dist/app-bundle (__dirname isn't
// available when the dev server runs this as an ES module). APP_BUNDLE_DIR
// points elsewhere for testing updates locally.
const bundleDir = process.env.APP_BUNDLE_DIR || path.resolve(process.cwd(), "dist", "app-bundle");

let cached: BundleInfo | null | undefined;
function latest(): BundleInfo | null {
  if (cached !== undefined) return cached;
  try {
    cached = JSON.parse(fs.readFileSync(path.join(bundleDir, "latest.json"), "utf-8")) as BundleInfo;
  } catch {
    cached = null;
  }
  return cached;
}

export function registerAppUpdateRoutes(app: Express) {
  app.get("/api/app/bundle", (req, res) => {
    const info = latest();
    if (!info) return res.status(404).json({ message: "No app update available" });
    res.setHeader("Cache-Control", "no-cache");
    res.json({
      version: info.version,
      checksum: info.checksum,
      minNativeBuild: info.minNativeBuild,
      // Behind Render's proxy the request arrives as http; the site is https.
      url: `${process.env.NODE_ENV === "production" ? "https" : req.protocol}://${req.get("host")}/app-bundle/${encodeURIComponent(info.version)}.zip`,
    });
  });

  app.get("/app-bundle/:file", (req, res) => {
    const info = latest();
    if (!info || req.params.file !== `${info.version}.zip`) return res.sendStatus(404);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(path.join(bundleDir, req.params.file));
  });
}
