// One-off migration: copies every file under uploads/ into the Supabase
// Storage bucket (server/storage/objectStorage.ts), preserving relative
// paths as object keys — so uploads/share-cards/foo.png becomes the key
// "share-cards/foo.png", matching exactly what a request for
// /uploads/share-cards/foo.png resolves to after the route changes in
// server/routes.ts. Idempotent (putObject upserts), so it's safe to re-run.
//
// Run with:  tsx --env-file=.env scripts/migrate-uploads-to-storage.ts
// Preview only, no writes:  tsx --env-file=.env scripts/migrate-uploads-to-storage.ts --dry-run

import fs from "fs";
import path from "path";
import {
  UPLOAD_DIR,
  putObject,
  ensureBucketExists,
  inferContentType,
  isObjectStorageEnabled,
} from "../server/storage/objectStorage";

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(abs));
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }
  return out;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (!isObjectStorageEnabled && !dryRun) {
    console.error(
      "Object storage isn't configured (SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_URL missing) — " +
        "there's nowhere to migrate to. Set those in .env first, or pass --dry-run to just list what would move.",
    );
    process.exit(1);
  }

  if (!dryRun) {
    console.log(`Ensuring bucket exists...`);
    await ensureBucketExists();
  }

  const files = listFilesRecursive(UPLOAD_DIR);
  console.log(`Found ${files.length} file(s) under ${UPLOAD_DIR}${dryRun ? " (dry run)" : ""}.\n`);

  let ok = 0;
  const failures: { key: string; error: string }[] = [];

  for (const [i, abs] of files.entries()) {
    const key = path.relative(UPLOAD_DIR, abs).split(path.sep).join("/");
    const contentType = inferContentType(key);
    const prefix = `[${i + 1}/${files.length}]`;

    if (dryRun) {
      console.log(`${prefix} would upload ${key} (${contentType})`);
      continue;
    }

    try {
      const data = await fs.promises.readFile(abs);
      await putObject(key, data, contentType);
      console.log(`${prefix} ${key} ok`);
      ok++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`${prefix} ${key} FAILED: ${message}`);
      failures.push({ key, error: message });
    }
  }

  if (dryRun) return;

  console.log(`\n${ok}/${files.length} uploaded.`);
  if (failures.length) {
    console.log(`\nFailed (${failures.length}):`);
    for (const f of failures) console.log(`  ${f.key}: ${f.error}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
