import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGet, adminPatch } from "./api";
import { PageHeader, LABEL, MONO, LINE, SURFACE, MUTED, FAINT, TEXT, formatDateTime } from "./AdminShell";
import { FEEDBACK_CATEGORY_LABEL } from "@shared/admin";

function CopyableId({ id, label }: { id: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span
      onClick={() => navigator.clipboard?.writeText(id).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); })}
      title="Click to copy"
      style={{ ...MONO, fontSize: 11, color: FAINT, cursor: "pointer" }}
      data-testid="copyable-id"
    >
      {copied ? "copied" : label ?? id}
    </span>
  );
}

export default function AdminFeedback() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("open");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "feedback", status, page],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      qs.set("page", String(page));
      return adminGet(`/api/admin/feedback?${qs.toString()}`);
    },
  });

  const markReviewed = async (id: number) => {
    await adminPatch(`/api/admin/feedback/${id}`, { status: "reviewed" });
    qc.invalidateQueries({ queryKey: ["admin", "feedback"] });
    qc.invalidateQueries({ queryKey: ["admin", "overview"] });
  };

  return (
    <div>
      <PageHeader title="Feedback" sub="A different job from reports — no target user, no action, just a note." />
      <div style={{ marginBottom: 14 }}>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ height: 34, borderRadius: 6, border: `1px solid ${LINE}`, background: SURFACE, color: TEXT, fontSize: 12.5, padding: "0 8px" }}>
          <option value="open">Open</option>
          <option value="reviewed">Reviewed</option>
          <option value="">All</option>
        </select>
      </div>

      {isLoading ? (
        <p style={{ color: FAINT }}>Loading…</p>
      ) : data.feedback.length === 0 ? (
        <p style={{ color: FAINT, fontSize: 13 }}>Nothing here.</p>
      ) : (
        data.feedback.map((f: any) => (
          <div key={f.id} style={{ border: `1px solid ${LINE}`, background: SURFACE, borderRadius: 10, padding: 14, marginBottom: 10 }} data-testid={`feedback-${f.id}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={LABEL}>{FEEDBACK_CATEGORY_LABEL[f.category as keyof typeof FEEDBACK_CATEGORY_LABEL] || f.category}</span>
                {f.contactBackConsent && (
                  <>
                    <span style={{ color: FAINT, fontSize: 10 }}>·</span>
                    <span style={{ ...MONO, fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>ok to contact</span>
                  </>
                )}
              </div>
              <span style={{ ...MONO, fontSize: 11, color: FAINT }}>{formatDateTime(f.createdAt)} · APP {f.appVersion || "—"} · {f.platform || "—"}</span>
            </div>
            <p style={{ fontSize: 13.5, color: TEXT, marginTop: 8, lineHeight: 1.55 }}>{f.freeText}</p>
            <p style={{ marginTop: 6 }}>
              {f.displayName ? <span style={{ fontSize: 11.5, color: FAINT }}>{f.displayName}</span> : <CopyableId id={f.userId} />}
            </p>
            {f.status === "open" && (
              <button onClick={() => markReviewed(f.id)} style={{ marginTop: 8, height: 28, padding: "0 10px", borderRadius: 6, border: `1px solid ${LINE}`, background: "transparent", color: MUTED, fontSize: 12, cursor: "pointer" }} data-testid={`feedback-reviewed-${f.id}`}>
                Mark reviewed
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
