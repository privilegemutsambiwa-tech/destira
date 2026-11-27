// Discover: "Block this person?" / "Report this person?", with an optional
// reason and the photo it's about.

import type { GalleryPhoto } from "./card-gallery";

export function BlockReportDialog({
  confirm, name, photos, reportReason, setReportReason, reportPhotoId, setReportPhotoId, onClose, onConfirm,
}: {
  confirm: "block" | "report";
  name: string | null | undefined;
  photos: GalleryPhoto[];
  reportReason: string;
  setReportReason: (v: string) => void;
  reportPhotoId: number | null;
  setReportPhotoId: (v: number | null) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
      <div
        className="fixed inset-0 flex items-center justify-center z-[100] p-4"
        style={{ background: "rgba(8,6,11,.82)", backdropFilter: "blur(14px)" }}
        onClick={onClose}
      >
        <div
          className="w-full max-w-[400px] rounded-[20px] border border-vf-line bg-vf-surface p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="font-serif font-normal text-[20px] text-vf-text mb-1.5">
            {confirm === "block" ? `Block ${name || "this person"}?` : `Report ${name || "this person"}?`}
          </h2>
          <p className="text-[13.5px] leading-relaxed text-vf-muted mb-4">
            {confirm === "block"
              ? "They won't see you in Discover and you won't see them. You can undo this in Settings."
              : "This sends a record to our team for review. It also blocks them."}
          </p>
          {confirm === "report" && (
            <>
              <textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="What's going on? (optional)"
                rows={3}
                className="w-full mb-3 rounded-[12px] bg-vf-surface2 border border-vf-line p-3 text-[14px] text-vf-text placeholder:text-vf-faint resize-none outline-none focus:border-vf-text/25"
                data-testid="input-report-reason"
              />
              {photos.some((p) => p.id != null) && (
                <div className="mb-4">
                  <p className="text-[12px] text-vf-faint mb-2">Is it a specific photo? (optional)</p>
                  <div className="flex gap-2 flex-wrap">
                    {photos.filter((p) => p.id != null).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setReportPhotoId(reportPhotoId === p.id ? null : p.id!)}
                        className="w-14 h-14 rounded-[10px] overflow-hidden shrink-0"
                        style={{
                          outline: reportPhotoId === p.id ? "2px solid hsl(var(--vf-ember))" : "2px solid transparent",
                          outlineOffset: "2px",
                        }}
                        data-testid={`button-report-photo-${p.id}`}
                      >
                        <img src={p.w800 || p.url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          <div className="flex gap-2.5">
            <button
              onClick={onClose}
              className="flex-1 h-11 rounded-full border border-vf-text/14 text-[14px] text-vf-muted hover:text-vf-text transition-colors"
              data-testid="button-confirm-cancel"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 h-11 rounded-full text-[14px] font-semibold bg-vf-ember text-vf-ink hover:bg-[var(--vf-ember-soft)] transition-colors"
              data-testid="button-confirm-action"
            >
              {confirm === "block" ? "Block" : "Send report"}
            </button>
          </div>
        </div>
      </div>
  );
}
