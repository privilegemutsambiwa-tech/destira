// Phone cameras routinely produce 4–12MB photos, well past the upload limits
// (5MB in several places), so a straight "take a photo" would fail often.
// Downscale anything big to a sensible max dimension and re-encode as JPEG.
// Re-encoding through a canvas also drops EXIF (including GPS), which is a
// privacy plus. Falls back to the original file on any failure — a larger
// file that the server may reject beats losing the photo silently.
const SKIP_BELOW_BYTES = 1.5 * 1024 * 1024;

export async function shrinkImage(file: File, maxDim = 2048, quality = 0.85): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size < SKIP_BELOW_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
