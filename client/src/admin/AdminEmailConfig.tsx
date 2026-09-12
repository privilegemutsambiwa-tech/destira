import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGet, adminPatch, adminPost } from "./api";
import { PageHeader, LABEL, MONO, LINE, SURFACE, MUTED, FAINT, TEXT, ALERT, formatDateTime } from "./AdminShell";

const inputStyle: React.CSSProperties = { flex: 1, height: 30, borderRadius: 6, border: `1px solid ${LINE}`, background: "rgba(255,255,255,.04)", color: TEXT, fontSize: 12.5, padding: "0 8px" };
const secondaryBtn: React.CSSProperties = { height: 30, padding: "0 10px", borderRadius: 6, border: `1px solid ${LINE}`, background: "transparent", color: MUTED, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" };

export default function AdminEmailConfig() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "email", "config"], queryFn: () => adminGet("/api/admin/email/config") });
  const { data: log } = useQuery({ queryKey: ["admin", "email", "log"], queryFn: () => adminGet("/api/admin/email/log") });
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [defaultDraft, setDefaultDraft] = useState<string | null>(null);

  const update = async (type: string, patch: any) => {
    await adminPatch(`/api/admin/email/config/${type}`, patch);
    qc.invalidateQueries({ queryKey: ["admin", "email", "config"] });
  };

  const saveDefault = async (value: string) => {
    await adminPatch(`/api/admin/email/default-recipient`, { recipientEmail: value });
    setDefaultDraft(null);
    qc.invalidateQueries({ queryKey: ["admin", "email", "config"] });
  };

  const testSend = async (type: string) => {
    setTesting(type);
    try {
      const r = await adminPost("/api/admin/email/test-send", { type });
      setTestResult((s) => ({ ...s, [type]: r.ok ? "sent" : `failed: ${r.error}` }));
    } catch (e) {
      setTestResult((s) => ({ ...s, [type]: "failed" }));
    } finally {
      setTesting(null);
      qc.invalidateQueries({ queryKey: ["admin", "email", "log"] });
    }
  };

  if (isLoading || !data) return <p style={{ color: FAINT }}>Loading…</p>;

  const defaultRecipient: string = data.defaultRecipient;
  const items: any[] = data.items;
  const missingRecipient = items.filter((c) => c.noRecipient);

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader title="Email alerts" sub="Which alerts fire, where, and whether delivery is actually working." />

      <div style={{ border: `1px solid ${LINE}`, background: SURFACE, borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <div style={{ ...LABEL, marginBottom: 8 }}>Default recipient</div>
        <p style={{ fontSize: 12, color: MUTED, margin: "0 0 8px" }}>Every alert below sends here unless it has its own override.</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            placeholder="ops@destira.date"
            defaultValue={defaultRecipient}
            onChange={(e) => setDefaultDraft(e.target.value)}
            onBlur={(e) => e.target.value !== defaultRecipient && saveDefault(e.target.value.trim())}
            style={inputStyle}
            data-testid="email-default-recipient"
          />
        </div>
      </div>

      {missingRecipient.length > 0 && (
        <div
          style={{ border: `1px solid ${ALERT}55`, background: `${ALERT}14`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "baseline", gap: 8 }}
          data-testid="email-missing-recipient-banner"
        >
          <span style={{ ...LABEL, color: ALERT, flexShrink: 0 }}>No recipient</span>
          <span style={{ fontSize: 12.5, color: TEXT }}>
            {missingRecipient.length} alert{missingRecipient.length === 1 ? "" : "s"} enabled with nowhere to send: {missingRecipient.map((c) => c.label).join(", ")}. Set a default above, or an override below.
          </span>
        </div>
      )}

      <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
        {items.map((c: any) => (
          <div key={c.alertType} style={{ padding: "12px 14px", borderBottom: `1px solid ${LINE}`, background: SURFACE }} data-testid={`alert-config-${c.alertType}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div>
                <div style={{ fontSize: 13.5, color: TEXT }}>{c.label}</div>
                {!c.configurable && <div style={{ ...MONO, fontSize: 9.5, color: FAINT, marginTop: 2 }}>always on — not configurable</div>}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: c.configurable ? MUTED : FAINT }}>
                <input type="checkbox" checked={c.configurable ? c.enabled : true} disabled={!c.configurable} onChange={(e) => update(c.alertType, { enabled: e.target.checked })} />
                enabled
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <input
                  placeholder={defaultRecipient || "recipient@email"}
                  defaultValue={c.recipientEmail}
                  onBlur={(e) => e.target.value !== c.recipientEmail && update(c.alertType, { recipientEmail: e.target.value.trim() })}
                  style={{ ...inputStyle, width: "100%" }}
                  data-testid={`recipient-${c.alertType}`}
                />
                {c.isInherited && (
                  <div style={{ ...MONO, fontSize: 10, color: FAINT, marginTop: 3 }}>
                    {c.effectiveRecipient ? `inherits ${c.effectiveRecipient}` : "no default recipient set"}
                  </div>
                )}
              </div>
              {c.hasThreshold && (
                <input
                  placeholder="threshold"
                  defaultValue={c.threshold || ""}
                  onBlur={(e) => e.target.value !== (c.threshold || "") && update(c.alertType, { threshold: e.target.value || null })}
                  style={{ width: 90, height: 30, borderRadius: 6, border: `1px solid ${LINE}`, background: "rgba(255,255,255,.04)", color: TEXT, fontSize: 12.5, padding: "0 8px" }}
                />
              )}
              <button
                onClick={() => testSend(c.alertType)}
                disabled={testing === c.alertType || !c.effectiveRecipient}
                title={!c.effectiveRecipient ? "No recipient — set a default above or an override for this alert" : undefined}
                style={{ ...secondaryBtn, opacity: !c.effectiveRecipient ? 0.5 : 1, cursor: !c.effectiveRecipient ? "not-allowed" : "pointer" }}
                data-testid={`test-send-${c.alertType}`}
              >
                {testing === c.alertType ? "Sending…" : "Test send"}
              </button>
            </div>
            {testResult[c.alertType] && (
              <div style={{ ...MONO, fontSize: 12.5, color: testResult[c.alertType] === "sent" ? TEXT : ALERT, marginTop: 6 }}>
                {testResult[c.alertType] === "sent" ? "✓ sent" : testResult[c.alertType]}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={LABEL}>Recent send attempts</div>
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden", marginTop: 8 }}>
        {(!log || log.length === 0) && <p style={{ padding: 14, fontSize: 12.5, color: FAINT }}>Nothing sent yet.</p>}
        {log?.map((l: any) => (
          <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 14px", borderBottom: `1px solid ${LINE}`, fontSize: 12 }}>
            <span style={{ color: TEXT }}>{l.type} → {l.recipient}</span>
            <span style={{ color: l.status === "sent" ? MUTED : l.status === "failed" ? ALERT : FAINT }}>
              {l.status}{l.error ? ` (${l.error})` : ""}
            </span>
            <span style={{ ...MONO, color: FAINT }}>{formatDateTime(l.createdAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
