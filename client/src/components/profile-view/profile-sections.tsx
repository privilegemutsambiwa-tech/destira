// Someone's profile: the side cards (the twin transcript, rooms, vouches,
// overlap) and the block / report confirm (split out of pages/ProfileView.tsx).
import { useState } from "react";
import { VfAvatar } from "@/components/ui-vf";
import type { VouchPublic } from "@shared/vouches";
import type { TwinReadiness } from "@/hooks/use-onboarding";
import type { GateState } from "@/hooks/use-gate";
import { EYEBROW } from "@/components/profile-view/view-shell";

export function VouchList({ vouches }: { vouches: VouchPublic[] }) {
  if (!vouches.length) return null;
  return (
    <section>
      <div className={`${EYEBROW} mb-3`}>Vouched by</div>
      <div className="flex flex-col">
        {vouches.map((v) => (
          <div key={v.id} className="flex gap-3 py-4 border-b border-vf-line last:border-b-0" data-testid={`profile-vouch-${v.id}`}>
            <div className="shrink-0"><VfAvatar size={36} src={v.from.photoUrl ?? undefined} name={v.from.name} seed={v.from.userId} /></div>
            <div>
              <p className="text-[14.5px] text-vf-soft" style={{ lineHeight: 1.55 }}>&ldquo;{v.body}&rdquo;</p>
              <div className="text-[12.5px] text-vf-faint mt-1.5">{v.from.name} · {v.metLabel}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function OverlapChips({ chips }: { chips: string[] }) {
  if (!chips.length) return null;
  return (
    <section>
      <div className={`${EYEBROW} mb-3`}>Where you overlap</div>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <span key={c} className="border border-vf-line rounded-full text-[13px] text-vf-soft" style={{ padding: "8px 15px" }}>
            {c}
          </span>
        ))}
      </div>
    </section>
  );
}

export interface TwinTranscript {
  lines: { who: string; text: string }[];
  total: number;
}

/** "When you asked her twin": two lines free, the rest on Flame. */
export function TranscriptCard({ transcript, name, her, gate, readiness, onReadAll, onSharpen }: {
  transcript: TwinTranscript;
  name: string;
  her: boolean;
  gate: GateState | undefined;
  readiness: TwinReadiness | undefined;
  onReadAll: () => void;
  onSharpen: () => void;
}) {
  const full = gate?.ok === true;
  const shown = full ? transcript.lines : transcript.lines.slice(0, 2);
  return (
    <div className="rounded-[20px] p-[22px] vf-card" style={{ border: "1px solid rgba(143,227,199,.24)", background: "rgba(143,227,199,.045)" }}>
      <div className="flex items-center gap-2">
        <span
          className="block w-[11px] h-[11px] rounded-full shrink-0 animate-[vf-breathe_4.5s_ease-in-out_infinite] motion-reduce:animate-none"
          style={{ background: "radial-gradient(circle at 35% 30%, var(--vf-mint-vivid), #2E7F6B)" }}
        />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-mint">When you asked {her ? "her" : "their"} twin</span>
      </div>
      <div className="mt-4 flex flex-col gap-3.5">
        {shown.map((l, i) => (
          <div key={i}>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-vf-faint mb-1">{l.who === "viewer" ? "You" : `${name}'s twin`}</div>
            <p className="text-[14px] text-vf-soft" style={{ lineHeight: 1.55 }}>{l.text}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3.5 border-t border-vf-mint/15 text-[12.5px] text-vf-muted">
        {full ? (
          <>All <span className="font-serif text-vf-text">{transcript.total}</span> lines.</>
        ) : (
          <>
            <span className="font-serif text-vf-text">Two</span> of{" "}
            <span className="font-serif text-vf-text">{transcript.total}</span> lines.{" "}
            <button
              onClick={onReadAll}
              className="text-vf-ember hover:text-[var(--vf-ember-soft)] transition-colors"
              data-testid="link-read-transcript"
            >
              {gate?.requiredTierName || "Flame"} reads the rest.
            </button>
          </>
        )}
      </div>
      {readiness && readiness.pct < 50 && (
        <div className="mt-2.5 text-[12px] text-vf-mint/80 leading-[1.5]">
          Your own twin has {readiness.answeredCount === 1 ? "one answer" : `${readiness.answeredCount} answers`} so far —{" "}
          <button onClick={onSharpen} className="underline underline-offset-2 hover:text-vf-text transition-colors">
            sharpen it
          </button>
          .
        </div>
      )}
    </div>
  );
}

export function RoomsCard({ groups, her, onOpen }: { groups: any[]; her: boolean; onOpen: (g: any) => void }) {
  if (!groups.length) return null;
  return (
    <div className="bg-vf-surface2 rounded-[20px] vf-card" style={{ padding: "22px" }}>
      <div className={`${EYEBROW} mb-3`}>Rooms {her ? "she's" : "they're"} in</div>
      <div className="flex flex-col gap-2.5">
        {groups.map((g: any) => (
          <button
            key={g.id}
            onClick={() => onOpen(g)}
            className="flex items-center justify-between gap-3 text-left -mx-2 px-2 py-1.5 rounded-lg transition-colors duration-150 hover:bg-[var(--vf-elevated)]"
          >
            <span className="text-[14px] text-vf-text truncate">{g.name}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] shrink-0 text-vf-faint">
              {g.viewerIsMember ? "You're in it" : "Join"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Block or report, confirmed. A report can point at one photo. */
export function BlockReportConfirm({ kind, name, galleryPhotos, onClose, onBlock, onReport }: {
  kind: "block" | "report";
  name: string;
  galleryPhotos: any[];
  onClose: () => void;
  onBlock: () => void;
  onReport: (reason: string, photoId: number | null) => void;
}) {
  const [reason, setReason] = useState("");
  const [photoId, setPhotoId] = useState<number | null>(null);
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
          {kind === "block" ? `Block ${name}?` : `Report ${name}?`}
        </h2>
        <p className="text-[13.5px] leading-relaxed text-vf-muted mb-4">
          {kind === "block"
            ? "They won't see you in Discover and you won't see them. You can undo this in Settings."
            : "This sends a record to our team for review. It also blocks them."}
        </p>
        {kind === "report" && (
          <>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What's going on? (optional)"
              rows={3}
              className="w-full mb-3 rounded-[12px] bg-vf-surface2 border border-vf-line p-3 text-[14px] text-vf-text placeholder:text-vf-faint resize-none outline-none focus:border-vf-text/25"
              data-testid="input-report-reason"
            />
            {galleryPhotos.length > 0 && (
              <div className="mb-4">
                <p className="text-[12px] text-vf-faint mb-2">Is it a specific photo? (optional)</p>
                <div className="flex gap-2 flex-wrap">
                  {galleryPhotos.map((p: any) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPhotoId(photoId === p.id ? null : p.id)}
                      className="w-14 h-14 rounded-[10px] overflow-hidden shrink-0"
                      style={{
                        outline: photoId === p.id ? "2px solid hsl(var(--vf-ember))" : "2px solid transparent",
                        outlineOffset: "2px",
                      }}
                      data-testid={`button-report-photo-${p.id}`}
                    >
                      <img src={p.variants?.w800 || p.photoUrl} alt="" className="w-full h-full object-cover" />
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
            onClick={kind === "block" ? onBlock : () => onReport(reason.trim(), photoId)}
            className="flex-1 h-11 rounded-full text-[14px] font-semibold bg-vf-ember text-vf-ink hover:bg-[var(--vf-ember-soft)] transition-colors"
            data-testid="button-confirm-action"
          >
            {kind === "block" ? "Block" : "Send report"}
          </button>
        </div>
      </div>
    </div>
  );
}
