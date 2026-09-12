import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { adminGet } from "./api";
import { PageHeader, LABEL, MONO, LINE, SURFACE, MUTED, FAINT, ALERT, TEXT, formatDateTime } from "./AdminShell";
import { REPORT_CATEGORIES, REPORT_STATUSES, REPORT_CATEGORY_LABEL } from "@shared/admin";
import { ReportVolumeStrip } from "./charts";

const th: React.CSSProperties = { ...LABEL, textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${LINE}` };
const td: React.CSSProperties = { padding: "9px 10px", fontSize: 13, borderBottom: `1px solid ${LINE}`, color: TEXT };

export default function AdminReports() {
  const [status, setStatus] = useState<string>("open");
  const [category, setCategory] = useState<string>("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "reports", status, category, page],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      if (category) qs.set("category", category);
      qs.set("page", String(page));
      return adminGet(`/api/admin/reports?${qs.toString()}`);
    },
  });
  const { data: volume } = useQuery({ queryKey: ["admin", "reports", "volume"], queryFn: () => adminGet("/api/admin/reports/volume") });

  return (
    <div>
      <PageHeader title="Reports" sub="Oldest first. Safety-category reports are pinned to the top regardless." />
      {volume && <ReportVolumeStrip series={volume.series} />}

      <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
        <div>
          <div style={{ ...LABEL, marginBottom: 4 }}>Status</div>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={selectStyle} data-testid="reports-filter-status">
            <option value="">All statuses</option>
            {REPORT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <div style={{ ...LABEL, marginBottom: 4 }}>Category</div>
          <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} style={selectStyle} data-testid="reports-filter-category">
            <option value="">All categories</option>
            {REPORT_CATEGORIES.map((c) => <option key={c} value={c}>{REPORT_CATEGORY_LABEL[c]}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? (
        <p style={{ color: FAINT }}>Loading…</p>
      ) : data.reports.length === 0 ? (
        <p style={{ color: FAINT, fontSize: 13 }}>
          {status === "open" && !category
            ? "No open reports. Safety-category reports would appear here first."
            : status === "" && !category
              ? "No reports yet."
              : "Nothing here for this filter."}
        </p>
      ) : (
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: SURFACE }}>
            <thead>
              <tr>
                <th style={th}>Filed</th>
                <th style={th}>Category</th>
                <th style={th}>Subject</th>
                <th style={th}>Repeats</th>
                <th style={th}>Status</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {data.reports.map((r: any) => (
                <tr key={r.id} data-testid={`report-row-${r.id}`}>
                  <td style={{ ...td, ...MONO, fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>{formatDateTime(r.createdAt)}</td>
                  <td style={td}>
                    {r.isSafety && (
                      <span style={{ ...LABEL, color: ALERT, fontSize: 9, marginRight: 7, border: `1px solid ${ALERT}66`, borderRadius: 4, padding: "1px 4px" }}>
                        Safety
                      </span>
                    )}
                    {REPORT_CATEGORY_LABEL[r.category as keyof typeof REPORT_CATEGORY_LABEL] || r.category}
                  </td>
                  <td style={td}>{r.subject?.displayName || r.subjectId.slice(0, 8)}</td>
                  <td style={{ ...td, ...MONO, textAlign: "right" }}>{r.repeatCount}</td>
                  <td style={td}>{r.status}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <Link href={`/console/reports/${r.id}`} data-testid={`report-open-${r.id}`} style={{ color: "#FF6B4A", fontSize: 12.5 }}>
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > data.pageSize && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={pagerBtn}>Prev</button>
          <span style={{ ...MONO, fontSize: 12, color: FAINT }}>page {page} of {Math.ceil(data.total / data.pageSize)}</span>
          <button disabled={page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)} style={pagerBtn}>Next</button>
        </div>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  height: 34,
  borderRadius: 6,
  border: `1px solid ${LINE}`,
  background: SURFACE,
  color: TEXT,
  fontSize: 12.5,
  padding: "0 8px",
};
const pagerBtn: React.CSSProperties = {
  height: 30,
  padding: "0 12px",
  borderRadius: 6,
  border: `1px solid ${LINE}`,
  background: "transparent",
  color: TEXT,
  fontSize: 12.5,
  cursor: "pointer",
};
