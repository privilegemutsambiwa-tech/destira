import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Dual-mode, same shape as server/db.ts's DATABASE_URL branch: a real
// service-role key switches every upload/read/delete to Supabase Storage;
// without one (local dev, or before this is configured) everything falls
// back to the local uploads/ disk directory exactly as before this
// migration, so nothing breaks for a dev running without cloud credentials.
export const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const BUCKET = "user-photos";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Deliberately the service-role key, never the VITE_-prefixed anon key —
// this bucket is private, and only server-side code (never the client
// bundle) should be able to read or write it directly. Client access only
// ever happens through a short-lived signed URL minted below.
let client: SupabaseClient | null = null;
if (supabaseUrl && serviceRoleKey) {
  client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
} else if (process.env.NODE_ENV === "production") {
  console.warn(
    "[SECURITY] SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_URL) is not set in production — " +
      "uploads are falling back to local disk, which does not survive a container restart/redeploy.",
  );
}

export const isObjectStorageEnabled = !!client;

function assertClient(): SupabaseClient {
  if (!client) throw new Error("Object storage is not configured (missing SUPABASE_SERVICE_ROLE_KEY)");
  return client;
}

/** Creates the bucket if it doesn't already exist. Safe to call repeatedly. */
export async function ensureBucketExists(): Promise<void> {
  const c = assertClient();
  const { data: buckets, error: listError } = await c.storage.listBuckets();
  if (listError) throw new Error(`Failed to list buckets: ${listError.message}`);
  if (buckets?.some((b) => b.name === BUCKET)) return;

  const { error: createError } = await c.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: "10MB",
  });
  if (createError) throw new Error(`Failed to create bucket "${BUCKET}": ${createError.message}`);
}

export async function putObject(key: string, data: Buffer, contentType: string): Promise<void> {
  if (client) {
    const { error } = await client.storage.from(BUCKET).upload(key, data, { contentType, upsert: true });
    if (error) throw new Error(`Object storage upload failed for "${key}": ${error.message}`);
    return;
  }
  await fs.promises.writeFile(path.join(UPLOAD_DIR, key), data);
}

export async function getObjectBuffer(key: string): Promise<Buffer | null> {
  if (client) {
    const { data, error } = await client.storage.from(BUCKET).download(key);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
  try {
    return await fs.promises.readFile(path.join(UPLOAD_DIR, key));
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  if (client) {
    await client.storage.from(BUCKET).remove([key]);
    return;
  }
  await fs.promises.unlink(path.join(UPLOAD_DIR, key)).catch(() => {});
}

/** Recovers the object key from a stored "/uploads/<key>" URL, or null for
 *  anything else (empty, or some other host/scheme entirely) — the shape a
 *  DB column holds when a record predates uploads, or was never a photo. */
export function keyFromUploadUrl(url: string | null | undefined): string | null {
  if (!url || !url.startsWith("/uploads/")) return null;
  return url.slice("/uploads/".length);
}

/** Null when object storage isn't configured — callers fall back to streaming the buffer instead. */
export async function getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string | null> {
  if (!client) return null;
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(key, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}

export function generateFilename(originalname: string, fallbackExt = ".jpg"): string {
  const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
  const ext = path.extname(originalname) || fallbackExt;
  return `${uniqueSuffix}${ext}`;
}

const EXT_CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

/** Best-effort content-type from a file's extension — used by callers (e.g.
 *  the uploads-to-storage migration script) that don't have a multer-supplied
 *  mimetype to go on. */
export function inferContentType(filename: string): string {
  return EXT_CONTENT_TYPES[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
}
