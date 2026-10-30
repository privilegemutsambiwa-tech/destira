// Publishes a signed release APK as the one destira.date/download/android
// hands out (server/app-update.ts). Run after building a release:
//
//   npx tsx --env-file=.env script/publish-apk.ts release/Destira-1.3.apk
//
// Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the production
// storage). Replaces the previous APK; people downloading get the new one.
import { readFile } from "fs/promises";
import { ANDROID_APK_KEY, isObjectStorageEnabled, putAppDownload } from "../server/storage/objectStorage";

const file = process.argv[2];
if (!file || !file.endsWith(".apk")) {
  console.error("Usage: npx tsx --env-file=.env script/publish-apk.ts release/Destira-x.y.apk");
  process.exit(1);
}
if (!isObjectStorageEnabled) {
  console.error("Storage isn't configured: set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const data = await readFile(file);
await putAppDownload(ANDROID_APK_KEY, data, "application/vnd.android.package-archive");
console.log(`Published ${file} (${(data.length / 1048576).toFixed(1)} MB) as the Android download.`);
