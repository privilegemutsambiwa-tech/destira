import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGet, adminPatch, adminPost, AdminApiError } from "./api";
import { PageHeader, ScopedDataBanner, LABEL, MONO, LINE, SURFACE, MUTED, FAINT, TEXT, EMBER, ALERT } from "./AdminShell";
import {
  REPORT_CATEGORY_LABEL,
  REPORT_STATUSES,
  MODERATION_ACTION_TYPES,
  MODERATION_ACTION_COPY,
  type ModerationActionType,
} from "@shared/admin";

export default function AdminReportDetail({ id }: { id: string }) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const reportId = Number(id);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "reports", reportId],
    queryFn: () => adminGet(`/api/admin/reports/${reportId}`),
  });

  const [actionType, setActionType] = useState<ModerationActionType>("warn");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepUpNeeded, setStepUpNeeded] = useState(false);
  const [stepUpPassword, setStepUpPassword] = useState("");

  const setStatus = async (status: string) => {
    await adminPatch(`/api/admin/reports/${reportId}`, { status });
    refetch();
    qc.invalidateQueries({ queryKey: ["admin", "overview"] });
  };

  const submitAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!reason.trim()) return setError("A reason is required.");
    setBusy(true);
    try {
      await adminPost(`/api/admin/reports/${reportId}/actions`, { type: actionType, reason });
      setReason("");
      refetch();
      qc.invalidateQueries({ queryKey: ["admin", "overview"] });
    } catch (err) {
      if (err instanceof AdminApiError && err.stepUpRequired) {
        setStepUpNeeded(true);
      } else {
        setError(err instanceof Error ? err.message : "Failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmStepUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminPost("/api/admin/auth/step-up", { password: stepUpPassword });
      setStepUpNeeded(false);
      setStepUpPassword("");
      await submitAction(e);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wrong password");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || !data) return <p style={{ color: FAINT }}>Loading…</p>;
  const { report, reporter, subject, evidence, evidenceScoped, actions, repeatCount } = data;

  return (
    <div style={{ maxWidth: 720 }}>
      <button onClick={() => setLocation("/console/reports")} style={{ ...MONO, fontSize: 12, color: MUTED, background: "none", border: "none", cursor: "pointer", marginBottom: 10, padding: 0 }}>
        ← back to queue
      </button>
      <PageHeader
        title={`Report #${report.id} — ${REPORT_CATEGORY_LABEL[report.category as keyof typeof REPORT_CATEGORY_LABEL] || report.category}`}
        sub={`Filed ${new Date(report.createdAt).toLocaleString()} · ${repeatCount} report(s) against this subject`}
      />

      <ScopedDataBanner note="This screen shows the reporter's cited evidence and both parties' account info. Every view here is audit-logged." />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
        <Box title="Reporter">{reporter?.displayName || report.reporterId} · {reporter?.email}</Box>
        <Box title="Subject">{subject?.displayName || report.subjectId} · {subject?.email}</Box>
      </div>

      {report.freeText && (
        <Box title="What they said">
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: TEXT }}>{report.freeText}</p>
        </Box>
      )}

      <Box title={`Cited evidence${evidenceScoped ? "" : " — closed (report is no longer open)"}`}>
        {evidence.length === 0 ? (
          <p style={{ color: FAINT, fontSize: 13 }}>None cited.</p>
        ) : (
          evidence.map((ev: any, i: number) => (
            <div key={i} style={{ padding: "8px 0", borderTop: i > 0 ? `1px solid ${LINE}` : undefined }}>
              <div style={{ ...LABEL, fontSize: 9.5 }}>{ev.type} #{ev.id}</div>
              <p style={{ fontSize: 13, color: TEXT, marginTop: 3 }}>{ev.content ?? "(not available)"}</p>
            </div>
          ))
        )}
      </Box>

      {actions.length > 0 && (
        <Box title="Prior actions on this report">
          {actions.map((a: any) => (
            <div key={a.id} style={{ fontSize: 12.5, color: MUTED, padding: "4px 0" }}>
              <span style={{ color: TEXT }}>{MODERATION_ACTION_COPY[a.type as ModerationActionType]?.label || a.type}</span> — {a.reason} <span style={MONO}>({new Date(a.createdAt).toLocaleString()})</span>
            </div>
          ))}
        </Box>
      )}

      <Box title="Status">
        <div style={{ display: "flex", gap: 8 }}>
          {REPORT_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              disabled={report.status === s}
              style={{
                height: 28,
                padding: "0 10px",
                borderRadius: 6,
                border: `1px solid ${LINE}`,
                background: report.status === s ? "rgba(255,107,74,.14)" : "transparent",
                color: report.status === s ? EMBER : MUTED,
                fontSize: 12,
                cursor: report.status === s ? "default" : "pointer",
              }}
              data-testid={`report-status-${s}`}
            >
              {s}
            </button>
          ))}
        </div>
      </Box>

      <Box title="Take action">
        {!stepUpNeeded ? (
          <form onSubmit={submitAction} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <select value={actionType} onChange={(e) => setActionType(e.target.value as ModerationActionType)} style={selectStyle} data-testid="action-type">
              {MODERATION_ACTION_TYPES.map((t) => (
                <option key={t} value={t}>{MODERATION_ACTION_COPY[t].label}</option>
              ))}
            </select>
            <div style={{ fontSize: 11.5, color: FAINT }}>
              {MODERATION_ACTION_COPY[actionType].targetNotice
                ? `Subject is told: "${MODERATION_ACTION_COPY[actionType].targetNotice}"`
                : "The subject is not notified."}
              {" "}Reporter is told: "{MODERATION_ACTION_COPY[actionType].reporterNotice}"
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (required, kept in the audit log)"
              rows={3}
              style={{ ...selectStyle, height: "auto", padding: 10, resize: "vertical", fontFamily: '"DM Sans", sans-serif' }}
              data-testid="action-reason"
            />
            {error && <p style={{ color: ALERT, fontSize: 12.5 }}>{error}</p>}
            <button type="submit" disabled={busy} style={{ height: 34, borderRadius: 6, background: EMBER, color: "#0C0910", border: "none", fontWeight: 600, fontSize: 13, alignSelf: "flex-start", padding: "0 16px" }} data-testid="submit-action">
              {busy ? "Recording…" : "Record action"}
            </button>
          </form>
        ) : (
          <form onSubmit={confirmStepUp} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 12.5, color: ALERT }}>Re-enter your password to confirm this — it's a destructive action.</p>
            <input type="password" value={stepUpPassword} onChange={(e) => setStepUpPassword(e.target.value)} style={selectStyle} autoFocus data-testid="step-up-password" />
            {error && <p style={{ color: ALERT, fontSize: 12.5 }}>{error}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={busy} style={{ height: 34, borderRadius: 6, background: EMBER, color: "#0C0910", border: "none", fontWeight: 600, fontSize: 13, padding: "0 16px" }}>
                Confirm
              </button>
              <button type="button" onClick={() => setStepUpNeeded(false)} style={{ height: 34, borderRadius: 6, background: "transparent", border: `1px solid ${LINE}`, color: MUTED, fontSize: 13, padding: "0 16px" }}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </Box>
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, background: SURFACE, borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <div style={{ ...LABEL, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  height: 34,
  borderRadius: 6,
  border: `1px solid ${LINE}`,
  background: "rgba(255,255,255,.04)",
  color: TEXT,
  fontSize: 13,
  padding: "0 10px",
};
