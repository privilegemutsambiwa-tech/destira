// Publishes a signed release APK as the one destira.date/download/android
// hands out (server/app-update.ts). Run after building a release:
//
//   npx tsx --env-file=.env script/publish-apk.ts release/Destira-1.3.apk
//
// Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the production
// storage). Replaces the previous APK; people downloading get the new one,
// and installed apps older than it ask their member to update. The version
// comes from android/app/build.gradle, so publish right after building.
import { readFile } from "fs/promises";
import { ANDROID_APK_KEY, ANDROID_MANIFEST_KEY, isObjectStorageEnabled, putAppDownload } from "../server/storage/objectStorage";

const file = process.argv[2];
if (!file || !file.endsWith(".apk")) {
  console.error("Usage: npx tsx --env-file=.env script/publish-apk.ts release/Destira-x.y.apk");
  process.exit(1);
}
if (!isObjectStorageEnabled) {
  console.error("Storage isn't configured: set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const gradle = await readFile("android/app/build.gradle", "utf-8");
const versionCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);
const versionName = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
if (!versionCode || !versionName) {
  console.error("Couldn't read versionCode/versionName from android/app/build.gradle.");
  process.exit(1);
}
if (!file.includes(versionName)) {
  console.error(`${file} doesn't look like version ${versionName} (android/app/build.gradle). Build it first.`);
  process.exit(1);
}

const data = await readFile(file);
await putAppDownload(ANDROID_APK_KEY, data, "application/vnd.android.package-archive");
// After the APK, so an app is never told to update before the file is there.
const manifest = { versionCode, versionName, publishedAt: new Date().toISOString() };
await putAppDownload(ANDROID_MANIFEST_KEY, Buffer.from(JSON.stringify(manifest)), "application/json");
console.log(`Published ${file} (${(data.length / 1048576).toFixed(1)} MB) as the Android download: ${versionName} (build ${versionCode}).`);
