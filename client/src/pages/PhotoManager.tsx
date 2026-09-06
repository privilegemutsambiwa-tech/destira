import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Trash2, Upload } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

type Role = "cover" | "portrait" | "gallery";

interface Photo {
  id: number;
  photoUrl: string;
  role: Role;
  coverFocalX: number;
  coverFocalY: number;
  portraitFocalX: number;
  portraitFocalY: number;
  width: number | null;
  height: number | null;
  isMainProfilePhoto?: boolean;
}

const COVER_ASPECT = 21 / 9;
const PORTRAIT_ASPECT = 4 / 5;
const ROLE_MIN: Record<"cover" | "portrait", number> = { cover: 1200, portrait: 800 };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Largest rect of `aspect` that fits inside dw×dh. */
function fitFrame(dw: number, dh: number, aspect: number) {
  if (dw / dh > aspect) return { w: dh * aspect, h: dh };
  return { w: dw, h: dw / aspect };
}
/** Top-left of a frame centred on a focal point, kept inside the image. */
function framePos(dw: number, dh: number, fw: number, fh: number, fx: number, fy: number) {
  const cx = Math.min(dw - fw / 2, Math.max(fw / 2, fx * dw));
  const cy = Math.min(dh - fh / 2, Math.max(fh / 2, fy * dh));
  return { left: cx - fw / 2, top: cy - fh / 2 };
}

function tooSmallFor(p: Photo, role: "cover" | "portrait"): string | null {
  const longEdge = Math.max(p.width ?? 0, p.height ?? 0);
  if (longEdge > 0 && longEdge < ROLE_MIN[role]) {
    return `This is ${longEdge}px on the long edge — ${role}s need at least ${ROLE_MIN[role]}px`;
  }
  return null;
}

async function measure(file: File): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({});
    img.src = URL.createObjectURL(file);
  });
}

export default function PhotoManager() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const userId = user?.id;

  const { data: photos = [], isLoading } = useQuery<Photo[]>({
    queryKey: ["/api/photos", userId],
    queryFn: async () => {
      const res = await fetch(`/api/photos/${userId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId,
  });

  const cover = useMemo(() => photos.find((p) => p.role === "cover"), [photos]);
  const portrait = useMemo(() => photos.find((p) => p.role === "portrait"), [photos]);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeRole, setActiveRole] = useState<"cover" | "portrait">("cover");
  // live focal draft for the selected photo (before the PATCH resolves)
  const [draft, setDraft] = useState<null | {
    id: number;
    coverFocalX: number;
    coverFocalY: number;
    portraitFocalX: number;
    portraitFocalY: number;
  }>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const focalTimer = useRef<number | null>(null);

  const selected = photos.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) { setDraft(null); return; }
    setDraft({
      id: selected.id,
      coverFocalX: selected.coverFocalX,
      coverFocalY: selected.coverFocalY,
      portraitFocalX: selected.portraitFocalX,
      portraitFocalY: selected.portraitFocalY,
    });
    setActiveRole(selected.role === "portrait" ? "portrait" : "cover");
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/photos", userId] });
    queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
  };

  const focalFor = (p: Photo, role: "cover" | "portrait") => {
    const d = draft && draft.id === p.id ? draft : p;
    return role === "cover"
      ? { x: d.coverFocalX, y: d.coverFocalY }
      : { x: d.portraitFocalX, y: d.portraitFocalY };
  };

  const setRole = async (photoId: number, role: Role) => {
    try {
      const res = await fetch(`/api/photos/${photoId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || "Couldn't set that role");
      invalidate();
      if (body.displaced) {
        toast({ title: `Your previous ${body.displaced.role} moved to gallery` });
      }
      if (role === "cover" || role === "portrait") setActiveRole(role);
    } catch (e: any) {
      toast({ title: "Couldn't update", description: e.message, variant: "destructive" });
    }
  };

  const commitFocal = useCallback(
    (photoId: number, role: "cover" | "portrait", x: number, y: number) => {
      if (focalTimer.current) window.clearTimeout(focalTimer.current);
      focalTimer.current = window.setTimeout(async () => {
        try {
          await fetch(`/api/photos/${photoId}/focal`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ x, y, target: role }),
            credentials: "include",
          });
          invalidate();
        } catch {
          /* keep the draft on screen; a reload will re-sync */
        }
      }, 350);
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const nudgeFocal = (dx: number, dy: number) => {
    if (!draft || !selected) return;
    const key = activeRole === "cover" ? "coverFocal" : "portraitFocal";
    const nx = clamp01((draft as any)[`${key}X`] + dx);
    const ny = clamp01((draft as any)[`${key}Y`] + dy);
    setDraft({ ...draft, [`${key}X`]: nx, [`${key}Y`]: ny });
    commitFocal(selected.id, activeRole, nx, ny);
  };

  const doUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "That's not an image", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum size is 5MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const dims = await measure(file);
      const fd = new FormData();
      fd.append("image", file);
      const up = await fetch("/api/uploads/image", { method: "POST", body: fd, credentials: "include" });
      if (!up.ok) throw new Error("Upload failed");
      const { url } = await up.json();
      await fetch("/api/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrl: url, orderIndex: photos.length, width: dims.width, height: dims.height }),
        credentials: "include",
      });
      invalidate();
      toast({ title: "Added to gallery" });
    } catch {
      toast({ title: "Couldn't upload", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const del = async (photoId: number) => {
    try {
      await fetch(`/api/photos/${photoId}`, { method: "DELETE", credentials: "include" });
      if (selectedId === photoId) setSelectedId(null);
      invalidate();
      toast({ title: "Photo removed" });
    } catch {
      toast({ title: "Couldn't remove that", variant: "destructive" });
    }
  };

  const objPos = (f: { x: number; y: number }) => `${Math.round(f.x * 100)}% ${Math.round(f.y * 100)}%`;

  return (
    <LayoutShell>
      <div
        className="flex flex-col gap-8"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) doUpload(f);
        }}
      >
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/profile")} className="w-9 h-9 flex items-center justify-center -ml-1" data-testid="button-back">
            <ArrowLeft className="w-5 h-5 text-vf-ember" />
          </button>
          <h1 className="font-serif font-normal text-2xl text-vf-text">Photos</h1>
        </div>

        {isLoading ? (
          <div className="h-[40vh] flex items-center justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-vf-mint" />
          </div>
        ) : photos.length === 0 ? (
          <EmptyState onPick={() => fileRef.current?.click()} dragOver={dragOver} uploading={uploading} />
        ) : (
          <>
            {/* live header preview (~40% scale) */}
            <div>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint mb-2.5">How your header reads</div>
              <div className="relative" style={{ maxWidth: 420 }}>
                <div className="overflow-hidden rounded-[16px] bg-vf-surface2" style={{ aspectRatio: "21 / 9" }}>
                  {cover ? (
                    <img
                      src={cover.photoUrl}
                      alt=""
                      className="w-full h-full object-cover motion-reduce:transition-none transition-[object-position] duration-200"
                      style={{ objectPosition: objPos(focalFor(cover, "cover")) }}
                    />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-[11px] text-vf-faint">no cover yet</div>
                  )}
                </div>
                <div
                  className="absolute -bottom-4 left-4 overflow-hidden rounded-[12px] bg-vf-surface2"
                  style={{ width: 74, aspectRatio: "4 / 5", border: "3px solid #0C0910" }}
                >
                  {portrait ? (
                    <img
                      src={portrait.photoUrl}
                      alt=""
                      className="w-full h-full object-cover motion-reduce:transition-none transition-[object-position] duration-200"
                      style={{ objectPosition: objPos(focalFor(portrait, "portrait")) }}
                    />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-[9px] text-vf-faint text-center leading-tight">no<br/>portrait</div>
                  )}
                </div>
              </div>
              <p className="text-[12px] text-vf-faint mt-6">Two different photos work better than one good one used twice.</p>
            </div>

            {/* grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {photos.map((p) => {
                const isCover = p.role === "cover";
                const isPortrait = p.role === "portrait";
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                    className={`relative overflow-hidden rounded-[16px] transition-colors ${
                      isCover ? "border-2 border-vf-mint" : isPortrait ? "border-2 border-vf-ember" : "border border-vf-line hover:border-white/25"
                    } ${selectedId === p.id ? "ring-2 ring-vf-text/60" : ""}`}
                    style={{ aspectRatio: "3 / 4" }}
                    data-testid={`photo-tile-${p.id}`}
                  >
                    <img src={p.photoUrl} alt="" className="w-full h-full object-cover" />
                    {isCover && (
                      <span className="absolute top-1.5 left-1.5 font-mono text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded bg-vf-mint text-vf-ink">Cover</span>
                    )}
                    {isPortrait && (
                      <span className="absolute top-1.5 left-1.5 font-mono text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded bg-vf-ember text-vf-ink">Portrait</span>
                    )}
                  </button>
                );
              })}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className={`rounded-[16px] border border-dashed flex flex-col items-center justify-center gap-1.5 text-vf-faint transition-colors ${
                  dragOver ? "border-vf-text/60 text-vf-text" : "border-vf-line hover:border-white/25 hover:text-vf-text"
                }`}
                style={{ aspectRatio: "3 / 4" }}
                data-testid="button-upload"
              >
                {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Upload className="w-5 h-5" /><span className="text-[11px]">Add photo</span></>}
              </button>
            </div>

            {/* editor for the selected photo */}
            {selected && (
              <PhotoEditor
                key={selected.id}
                photo={selected}
                activeRole={activeRole}
                draftFocal={draft}
                onRole={(r) => setRole(selected.id, r)}
                onActiveRole={setActiveRole}
                onFocal={(role, x, y) => {
                  setDraft((d) => (d ? { ...d, [`${role}FocalX`]: x, [`${role}FocalY`]: y } : d));
                  commitFocal(selected.id, role, x, y);
                }}
                onNudge={nudgeFocal}
                onDelete={() => del(selected.id)}
                onClose={() => setSelectedId(null)}
              />
            )}
          </>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) doUpload(f); }}
          data-testid="input-file"
        />
      </div>
    </LayoutShell>
  );
}

function EmptyState({ onPick, dragOver, uploading }: { onPick: () => void; dragOver: boolean; uploading: boolean }) {
  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-4">
        {[
          { label: "COVER · wide, where you are", ratio: "21 / 9" },
          { label: "PORTRAIT · you, close", ratio: "4 / 5" },
        ].map((z) => (
          <button
            key={z.label}
            onClick={onPick}
            disabled={uploading}
            className={`rounded-[18px] border border-dashed p-6 flex flex-col items-center justify-center gap-3 text-center transition-colors ${
              dragOver ? "border-vf-text/60" : "border-vf-line hover:border-white/25"
            }`}
            style={{ minHeight: 200 }}
          >
            <div className="w-full max-w-[220px] rounded-[10px] bg-vf-surface2" style={{ aspectRatio: z.ratio }} />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">{z.label}</span>
          </button>
        ))}
      </div>
      <p className="text-[13px] text-vf-muted mt-4">Two different photos work better than one good one used twice.</p>
    </div>
  );
}

function PhotoEditor({
  photo,
  activeRole,
  draftFocal,
  onRole,
  onActiveRole,
  onFocal,
  onNudge,
  onDelete,
  onClose,
}: {
  photo: Photo;
  activeRole: "cover" | "portrait";
  draftFocal: { id: number; coverFocalX: number; coverFocalY: number; portraitFocalX: number; portraitFocalY: number } | null;
  onRole: (r: Role) => void;
  onActiveRole: (r: "cover" | "portrait") => void;
  onFocal: (role: "cover" | "portrait", x: number, y: number) => void;
  onNudge: (dx: number, dy: number) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const draggingRef = useRef(false);

  const f = draftFocal && draftFocal.id === photo.id ? draftFocal : photo;
  const focal =
    activeRole === "cover"
      ? { x: f.coverFocalX, y: f.coverFocalY }
      : { x: f.portraitFocalX, y: f.portraitFocalY };

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setBox({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const coverFrame = box.w ? fitFrame(box.w, box.h, COVER_ASPECT) : { w: 0, h: 0 };
  const portraitFrame = box.w ? fitFrame(box.w, box.h, PORTRAIT_ASPECT) : { w: 0, h: 0 };
  const coverPos = framePos(box.w, box.h, coverFrame.w, coverFrame.h, f.coverFocalX, f.coverFocalY);
  const portraitPos = framePos(box.w, box.h, portraitFrame.w, portraitFrame.h, f.portraitFocalX, f.portraitFocalY);

  const activeFrame = activeRole === "cover" ? coverFrame : portraitFrame;
  const activePos = activeRole === "cover" ? coverPos : portraitPos;

  const moveFromPointer = (clientX: number, clientY: number) => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    onFocal(activeRole, clamp01((clientX - r.left) / r.width), clamp01((clientY - r.top) / r.height));
  };

  const coverErr = tooSmallFor(photo, "cover");
  const portraitErr = tooSmallFor(photo, "portrait");
  const roleErr = photo.role === "gallery" ? null : activeRole === "cover" ? coverErr : portraitErr;

  return (
    <div className="rounded-[18px] border border-vf-line bg-vf-surface2 p-4 sm:p-5 flex flex-col gap-4" data-testid="photo-editor">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">Editing this photo</div>
        <button onClick={onClose} className="text-[13px] text-vf-muted hover:text-vf-text">Done</button>
      </div>

      {/* segmented role control + delete */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex rounded-full border border-vf-line overflow-hidden">
          {(["cover", "portrait", "gallery"] as Role[]).map((r) => {
            const disabled = (r === "cover" && !!coverErr) || (r === "portrait" && !!portraitErr);
            const on = photo.role === r;
            return (
              <button
                key={r}
                onClick={() => { if (disabled) return; onRole(r); if (r !== "gallery") onActiveRole(r); }}
                disabled={disabled}
                className={`px-4 h-9 text-[13px] capitalize transition-colors ${
                  on ? "bg-vf-text/10 text-vf-text" : "text-vf-muted hover:text-vf-text"
                } ${disabled ? "opacity-35 cursor-not-allowed" : ""}`}
                data-testid={`role-${r}`}
              >
                {r}
              </button>
            );
          })}
        </div>
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-vf-line text-vf-faint hover:text-vf-text hover:border-white/25 text-[13px] transition-colors"
          data-testid="button-delete-selected"
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>

      {roleErr && <p className="text-[12.5px] text-vf-ember -mt-1">{roleErr}</p>}
      {photo.role === "gallery" && (coverErr || portraitErr) && (
        <p className="text-[12px] text-vf-faint -mt-1">
          {coverErr && <>{coverErr}. </>}{portraitErr && <>{portraitErr}.</>}
        </p>
      )}

      {/* dual-crop overlay — only meaningful for cover/portrait */}
      {photo.role !== "gallery" ? (
        <div>
          <div className="flex items-center gap-4 mb-2">
            {(["cover", "portrait"] as const).map((r) => (
              <button
                key={r}
                onClick={() => onActiveRole(r)}
                className={`font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${
                  activeRole === r ? "text-vf-text" : "text-vf-faint hover:text-vf-muted"
                }`}
              >
                {r} frame
              </button>
            ))}
          </div>

          <div ref={boxRef} className="relative w-full max-w-[560px] select-none rounded-[12px] overflow-hidden bg-vf-ink">
            <img src={photo.photoUrl} alt="" className="w-full h-auto block pointer-events-none" draggable={false} />

            {box.w > 0 && (
              <>
                {/* scrim outside the active frame */}
                <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: `0 0 0 9999px rgba(12,9,16,.55)`, clipPath: `inset(${activePos.top}px ${box.w - activePos.left - activeFrame.w}px ${box.h - activePos.top - activeFrame.h}px ${activePos.left}px)` }} />
                {/* inactive frame — dashed hairline */}
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: activeRole === "cover" ? portraitPos.left : coverPos.left,
                    top: activeRole === "cover" ? portraitPos.top : coverPos.top,
                    width: activeRole === "cover" ? portraitFrame.w : coverFrame.w,
                    height: activeRole === "cover" ? portraitFrame.h : coverFrame.h,
                    border: "1px dashed rgba(255,255,255,.4)",
                  }}
                />
                {/* active frame — solid cream */}
                <div
                  className="absolute pointer-events-none motion-reduce:transition-none transition-[left,top,width,height] duration-150"
                  style={{ left: activePos.left, top: activePos.top, width: activeFrame.w, height: activeFrame.h, border: "2px solid var(--vf-text)" }}
                />
                {/* focal ring */}
                <div
                  role="slider"
                  aria-label={`${activeRole} focal point`}
                  aria-valuetext={`${Math.round(focal.x * 100)}% from left, ${Math.round(focal.y * 100)}% from top`}
                  tabIndex={0}
                  onPointerDown={(e) => { draggingRef.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); moveFromPointer(e.clientX, e.clientY); }}
                  onPointerMove={(e) => { if (draggingRef.current) moveFromPointer(e.clientX, e.clientY); }}
                  onPointerUp={(e) => { draggingRef.current = false; (e.target as HTMLElement).releasePointerCapture(e.pointerId); }}
                  onKeyDown={(e) => {
                    const step = 0.02;
                    if (e.key === "ArrowLeft") { e.preventDefault(); onNudge(-step, 0); }
                    else if (e.key === "ArrowRight") { e.preventDefault(); onNudge(step, 0); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); onNudge(0, -step); }
                    else if (e.key === "ArrowDown") { e.preventDefault(); onNudge(0, step); }
                  }}
                  className="absolute grid place-items-center focus:outline-none"
                  style={{ left: focal.x * box.w - 22, top: focal.y * box.h - 22, width: 44, height: 44, cursor: "grab" }}
                  data-testid="focal-ring"
                >
                  <span className="block w-8 h-8 rounded-full border-2 border-vf-text bg-vf-text/10 focus-visible:ring-2 focus-visible:ring-vf-text" />
                </div>
              </>
            )}
          </div>
          <p className="text-[12px] text-vf-faint mt-2">Drag the ring, or focus it and use the arrow keys, to set what stays in frame.</p>
        </div>
      ) : (
        <p className="text-[13px] text-vf-muted">Set this as your cover or portrait to position it.</p>
      )}
    </div>
  );
}
