import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGet, adminPost, adminPatch, adminFetch, AdminApiError } from "./api";
import { PageHeader, LABEL, LINE, SURFACE, MUTED, FAINT, TEXT, EMBER, MONO } from "./AdminShell";

// The official Destira status: a library of images and short videos, of which
// 2 or 3 go out every day as stories from the Destira account, first in
// everyone's story row (server/official-stories.ts). Anything scheduled for a
// date goes out that day; evergreen items rotate, least recently shown first.

interface Item {
  id: number;
  mediaType: "image" | "video";
  durationSec: number | null;
  caption: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  eventId: number | null;
  eventTitle: string | null;
  scheduledFor: string | null;
  evergreen: boolean;
  active: boolean;
  timesShown: number;
  lastShownOn: string | null;
  previewUrl: string;
}
interface Data {
  perDay: 2 | 3;
  today: { day: string; stories: { storyId: number; itemId: number | null; publishAt: string; views: number; likes: number }[] };
  items: Item[];
}

const LINKS = [
  { label: "No button", url: "" },
  { label: "Invite a friend", url: "/invite" },
  { label: "See events", url: "/events" },
  { label: "Open Discover", url: "/discover" },
  { label: "Join the Lounge", url: "/lounge" },
  { label: "See plans", url: "/plans" },
];

const field: React.CSSProperties = { height: 36, borderRadius: 6, border: `1px solid ${LINE}`, background: SURFACE, color: TEXT, fontSize: 13, padding: "0 10px", width: "100%" };
const btn = (primary = false): React.CSSProperties => ({
  height: 34, padding: "0 14px", borderRadius: 6, fontSize: 12.5, cursor: "pointer",
  border: `1px solid ${primary ? EMBER : LINE}`, background: primary ? EMBER : SURFACE, color: primary ? "#0C0910" : TEXT, fontWeight: primary ? 600 : 400,
});
const card: React.CSSProperties = { border: `1px solid ${LINE}`, background: SURFACE, borderRadius: 10, padding: 16, marginBottom: 14 };

function videoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { resolve(v.duration); URL.revokeObjectURL(v.src); };
    v.onerror = () => reject(new Error("Couldn't read that video"));
    v.src = URL.createObjectURL(file);
  });
}

function Thumb({ item, size = 96 }: { item: Item; size?: number }) {
  const style: React.CSSProperties = { width: size, aspectRatio: "9 / 16", objectFit: "cover", borderRadius: 8, background: "#000", display: "block" };
  return item.mediaType === "video"
    ? <video src={item.previewUrl} style={style} muted preload="metadata" />
    : <img src={item.previewUrl} alt="" style={style} />;
}

export default function AdminOfficialStatus() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Data>({ queryKey: ["admin", "official-stories"], queryFn: () => adminGet("/api/admin/official-stories") });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "official-stories"] });

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [link, setLink] = useState("");
  const [eventId, setEventId] = useState("");
  const [when, setWhen] = useState<"evergreen" | "date">("evergreen");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof AdminApiError || e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const pick = (f: File | null) => {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const upload = () =>
    run("upload", async () => {
      if (!file) throw new Error("Choose an image or a video first");
      const form = new FormData();
      form.append("media", file);
      if (file.type.startsWith("video/")) form.append("durationSec", String(Math.round(await videoDuration(file))));
      if (caption.trim()) form.append("caption", caption.trim());
      const l = LINKS.find((x) => x.url === link);
      if (link && l) { form.append("ctaLabel", l.label); form.append("ctaUrl", link); }
      if (eventId.trim()) form.append("eventId", eventId.trim());
      form.append("evergreen", String(when === "evergreen"));
      if (when === "date") form.append("scheduledFor", date);
      // FormData sets its own content type; the JSON default must not apply.
      await adminFetch("/api/admin/official-stories", { method: "POST", body: form, headers: {} });
      pick(null);
      setCaption(""); setLink(""); setEventId(""); setWhen("evergreen"); setDate("");
      if (fileRef.current) fileRef.current.value = "";
    });

  if (isLoading || !data) return <p style={{ color: FAINT }}>Loading…</p>;
  const byId = new Map(data.items.map((i) => [i.id, i]));
  const activeCount = data.items.filter((i) => i.active && i.evergreen).length;

  return (
    <div>
      <PageHeader title="Destira status" sub="Official posts from the Destira account, 2 or 3 a day, shown first in everyone's story row." />
      {error && <p style={{ color: "#EF4444", fontSize: 13, marginBottom: 12 }} role="alert">{error}</p>}

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={LABEL}>Today · {data.today.day}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12.5, color: MUTED }}>Posts a day</span>
            {[2, 3].map((n) => (
              <button key={n} style={{ ...btn(data.perDay === n), width: 36, padding: 0 }} aria-pressed={data.perDay === n}
                onClick={() => run(`per${n}`, () => adminPost("/api/admin/official-stories/settings", { perDay: n }))}>{n}</button>
            ))}
            <button style={btn()} disabled={busy === "rebuild"} onClick={() => run("rebuild", () => adminPost("/api/admin/official-stories/rebuild-today"))}>
              {busy === "rebuild" ? "Rebuilding…" : "Rebuild today's posts"}
            </button>
          </div>
        </div>
        {data.today.stories.length === 0 ? (
          <p style={{ fontSize: 13, color: FAINT }}>Nothing out today yet. Add something to the library below, then rebuild today's posts.</p>
        ) : (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {data.today.stories.map((t) => {
              const item = t.itemId != null ? byId.get(t.itemId) : undefined;
              const time = new Date(t.publishAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Harare" });
              return (
                <div key={t.storyId} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {item ? <Thumb item={item} size={110} /> : <div style={{ width: 110, aspectRatio: "9/16", borderRadius: 8, background: "#000" }} />}
                  <div style={{ ...MONO, fontSize: 11, color: TEXT }}>{time}{new Date(t.publishAt) > new Date() ? " · scheduled" : " · live"}</div>
                  <div style={{ ...MONO, fontSize: 11, color: FAINT }}>{t.views} views · {t.likes} likes</div>
                </div>
              );
            })}
          </div>
        )}
        <p style={{ fontSize: 11.5, color: FAINT, marginTop: 12 }}>
          Posts go out at {data.perDay === 3 ? "07:00, 12:30 and 18:00" : "08:00 and 18:00"} Harare time and stay up until 06:30 the next morning. {activeCount} evergreen {activeCount === 1 ? "post is" : "posts are"} in rotation.
        </p>
      </div>

      <div style={card}>
        <div style={{ ...LABEL, marginBottom: 12 }}>Add to the library</div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 140px", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={(e) => pick(e.target.files?.[0] ?? null)} style={{ fontSize: 12.5, color: MUTED }} />
            <p style={{ fontSize: 11.5, color: FAINT, margin: 0 }}>Portrait 1080 × 1920 looks best. Images up to 8 MB; videos MP4 or WebM, up to 60 seconds and 50 MB.</p>
            <input style={field} placeholder="Caption (optional, shown on the post)" maxLength={140} value={caption} onChange={(e) => setCaption(e.target.value)} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <select style={field} value={link} onChange={(e) => setLink(e.target.value)} aria-label="Button">
                {LINKS.map((l) => <option key={l.url} value={l.url}>{l.url ? `Button: ${l.label}` : l.label}</option>)}
              </select>
              <input style={field} placeholder="Or an event id (shows its live seats)" value={eventId} onChange={(e) => setEventId(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 13, color: TEXT, flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="radio" checked={when === "evergreen"} onChange={() => setWhen("evergreen")} /> Evergreen: rotates with the others</label>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="radio" checked={when === "date"} onChange={() => setWhen("date")} /> On a date</label>
              {when === "date" && <input type="date" style={{ ...field, width: 160 }} value={date} onChange={(e) => setDate(e.target.value)} />}
            </div>
            <div><button style={btn(true)} disabled={busy === "upload"} onClick={upload}>{busy === "upload" ? "Uploading…" : "Add to the library"}</button></div>
          </div>
          <div>
            {preview && file?.type.startsWith("video/") && <video src={preview} style={{ width: 140, aspectRatio: "9/16", objectFit: "cover", borderRadius: 8, background: "#000" }} muted autoPlay loop playsInline />}
            {preview && file && !file.type.startsWith("video/") && <img src={preview} alt="" style={{ width: 140, aspectRatio: "9/16", objectFit: "cover", borderRadius: 8 }} />}
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ ...LABEL, marginBottom: 12 }}>Library · {data.items.length}</div>
        {data.items.length === 0 ? (
          <p style={{ fontSize: 13, color: FAINT }}>The library is empty.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
            {data.items.map((i) => (
              <div key={i.id} style={{ display: "flex", gap: 12, border: `1px solid ${LINE}`, borderRadius: 8, padding: 10, opacity: i.active ? 1 : 0.55 }}>
                <Thumb item={i} />
                <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0, fontSize: 12.5 }}>
                  <div style={{ color: TEXT }}>{i.caption || <span style={{ color: FAINT }}>No caption</span>}</div>
                  <div style={{ ...MONO, fontSize: 10.5, color: FAINT }}>
                    {i.mediaType === "video" ? `VIDEO · ${i.durationSec}s` : "IMAGE"} · {i.scheduledFor ? `ON ${i.scheduledFor}` : ""}{i.scheduledFor && i.evergreen ? " · " : ""}{i.evergreen ? "EVERGREEN" : ""}
                  </div>
                  {(i.ctaLabel || i.eventTitle) && <div style={{ color: MUTED }}>Button: {i.eventTitle ? `See the event (${i.eventTitle})` : `${i.ctaLabel} → ${i.ctaUrl}`}</div>}
                  <div style={{ color: FAINT }}>Shown {i.timesShown}× {i.lastShownOn ? `· last ${i.lastShownOn}` : ""}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: "auto", flexWrap: "wrap" }}>
                    <button style={btn()} onClick={() => run(`a${i.id}`, () => adminPatch(`/api/admin/official-stories/${i.id}`, { active: !i.active }))}>{i.active ? "Pause" : "Resume"}</button>
                    {confirmDelete === i.id ? (
                      <>
                        <button style={{ ...btn(), borderColor: "#EF4444", color: "#EF4444" }} onClick={() => run(`d${i.id}`, () => adminFetch(`/api/admin/official-stories/${i.id}`, { method: "DELETE" })).then(() => setConfirmDelete(null))}>Delete for good</button>
                        <button style={btn()} onClick={() => setConfirmDelete(null)}>Keep</button>
                      </>
                    ) : (
                      <button style={btn()} onClick={() => setConfirmDelete(i.id)}>Delete</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
