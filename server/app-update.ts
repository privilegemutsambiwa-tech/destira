// Over-the-air updates for the Android/iOS app's screens, self-hosted.
// script/app-bundle.ts packages them at deploy time into dist/app-bundle;
// these routes tell the app what's newest and hand over the zip. Nothing is
// offered in local dev (no bundle is built there).
import type { Express } from "express";
import fs from "fs";
import path from "path";
import { ANDROID_APK_KEY, ANDROID_MANIFEST_KEY, appDownloadUrl, readAppDownloadJson } from "./storage/objectStorage";

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

interface AndroidRelease {
  versionCode: number;
  versionName: string;
  publishedAt: string;
}

// The APK on offer at /download/android, as script/publish-apk.ts described
// it (uploads/android/latest.json locally). Re-read every few minutes so a
// new upload shows up without a deploy.
let androidRelease: { at: number; value: AndroidRelease | null } | null = null;
async function latestAndroid(): Promise<AndroidRelease | null> {
  if (androidRelease && Date.now() - androidRelease.at < 5 * 60 * 1000) return androidRelease.value;
  let value = await readAppDownloadJson<AndroidRelease>(ANDROID_MANIFEST_KEY).catch(() => null);
  if (!value) {
    // Locally (no storage): uploads/android/latest.json, beside the APK.
    try {
      value = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "uploads", ANDROID_MANIFEST_KEY), "utf-8"));
    } catch {
      value = null;
    }
  }
  androidRelease = { at: Date.now(), value };
  return value;
}

export function registerAppUpdateRoutes(app: Express) {
  // The newest Android app: the app compares it with its own versionCode and
  // asks the member to install it (client/src/lib/app-update.ts).
  app.get("/api/app/android", async (req, res) => {
    const info = await latestAndroid();
    if (!info) return res.status(404).json({ message: "No Android release published" });
    res.setHeader("Cache-Control", "no-cache");
    res.json({
      versionCode: info.versionCode,
      versionName: info.versionName,
      url: `${process.env.NODE_ENV === "production" ? "https" : req.protocol}://${req.get("host")}/download/android`,
    });
  });

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

  // The Android app, for installing straight from the website (the landing
  // page's "Get the Android app"). Always the latest published APK
  // (script/publish-apk.ts); locally, uploads/android/Destira.apk.
  app.get("/download/android", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const url = await appDownloadUrl(ANDROID_APK_KEY, "Destira.apk");
    if (url) return res.redirect(302, url);
    const local = path.resolve(process.cwd(), "uploads", ANDROID_APK_KEY);
    if (fs.existsSync(local)) {
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      return res.download(local, "Destira.apk");
    }
    res.status(404).send("The Android app isn't available to download right now.");
  });

  app.get("/app-bundle/:file", (req, res) => {
    const info = latest();
    if (!info || req.params.file !== `${info.version}.zip`) return res.sendStatus(404);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(path.join(bundleDir, req.params.file));
  });
}
