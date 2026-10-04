// "Take a photo" vs "Choose from library" for any image upload. A plain
// <input type="file"> on phones already offers both in the OS picker, but
// it's easy to miss, and many browsers only show the camera if the input
// carries `capture`. This gives every upload spot an explicit, consistent
// choice. On desktop browsers `capture` is ignored and both buttons open
// the normal file picker, which is the best the web platform allows.
//
// Both inputs stay mounted even while the sheet is closed: the OS dialog
// fires `change` after the sheet has already gone, and an unmounted input
// would silently drop the file.
import { useRef } from "react";
import { Camera, Image as ImageIcon } from "lucide-react";
import { shrinkImage } from "@/lib/shrink-image";

const LINE = "var(--vf-line)";
const MUTED = "var(--vf-muted)";
const TEXT = "hsl(var(--vf-text))";
const SURFACE = "var(--vf-surface)";
const EMBER = "hsl(var(--vf-ember))";

export function PhotoSourceSheet({
  open, onClose, onFile, onFiles, multiple = false, accept = "image/*", title = "Add a photo", camera = "environment",
}: {
  open: boolean;
  onClose: () => void;
  onFile?: (file: File) => void;
  /** With `multiple`, the library picker allows several photos at once. */
  onFiles?: (files: File[]) => void;
  multiple?: boolean;
  accept?: string;
  title?: string;
  camera?: "user" | "environment";
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    onClose();
    if (picked.length === 0) return;
    const files = await Promise.all(picked.map((f) => shrinkImage(f)));
    if (onFiles) onFiles(files);
    else onFile?.(files[0]);
  };

  return (
    <>
      <input ref={cameraRef} type="file" accept={accept} capture={camera} className="hidden" onChange={handle} data-testid="input-photo-camera" />
      <input ref={libraryRef} type="file" accept={accept} multiple={multiple} className="hidden" onChange={handle} data-testid="input-photo-library" />

      {open && (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center"
          style={{ background: "rgba(12,9,16,0.72)" }}
          onClick={onClose}
          data-testid="photo-source-overlay"
        >
          <div
            className="w-full max-w-md p-5 pb-7"
            style={{ background: SURFACE, borderRadius: "26px 26px 0 0", border: `1px solid ${LINE}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-center mb-4" style={{ fontFamily: '"Instrument Serif", serif', fontWeight: 400, color: TEXT, fontSize: "21px" }}>
              {title}
            </h2>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                className="flex flex-col items-center gap-2 p-4 transition-colors hover:brightness-110"
                style={{ background: "rgba(255,255,255,0.04)", borderRadius: "18px", border: `1px solid ${LINE}` }}
                onClick={() => cameraRef.current?.click()}
                data-testid="button-photo-camera"
              >
                <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "hsl(var(--vf-ember) / 0.14)" }}>
                  <Camera className="w-5 h-5" style={{ color: EMBER }} />
                </span>
                <span className="text-sm font-medium" style={{ color: TEXT }}>Take a photo</span>
              </button>
              <button
                className="flex flex-col items-center gap-2 p-4 transition-colors hover:brightness-110"
                style={{ background: "rgba(255,255,255,0.04)", borderRadius: "18px", border: `1px solid ${LINE}` }}
                onClick={() => libraryRef.current?.click()}
                data-testid="button-photo-library"
              >
                <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "hsl(var(--vf-ember) / 0.14)" }}>
                  <ImageIcon className="w-5 h-5" style={{ color: EMBER }} />
                </span>
                <span className="text-sm font-medium" style={{ color: TEXT }}>Choose from library</span>
              </button>
            </div>
            <button className="w-full text-sm font-medium" style={{ color: MUTED }} onClick={onClose} data-testid="button-photo-source-cancel">
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
