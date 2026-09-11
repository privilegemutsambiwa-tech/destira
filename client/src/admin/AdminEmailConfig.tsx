import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGet, adminPatch, adminPost } from "./api";
import { PageHeader, LABEL, MONO, LINE, SURFACE, MUTED, FAINT, TEXT, EMBER, ALERT } from "./AdminShell";

export default function AdminEmailConfig() {
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery({ queryKey: ["admin", "email", "config"], queryFn: () => adminGet("/api/admin/email/config") });
  const { data: log } = useQuery({ queryKey: ["admin", "email", "log"], queryFn: () => adminGet("/api/admin/email/log") });
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  const update = async (type: string, patch: any) => {
    await adminPatch(`/api/admin/email/config/${type}`, patch);
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

  if (isLoading || !config) return <p style={{ color: FAINT }}>Loading…</p>;

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader title="Email alerts" sub="Which alerts fire, where, and whether delivery is actually working." />

      <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
        {config.map((c: any) => (
          <div key={c.alertType} style={{ padding: "12px 14px", borderBottom: `1px solid ${LINE}`, background: SURFACE }} data-testid={`alert-config-${c.alertType}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div>
                <div style={{ fontSize: 13.5, color: TEXT }}>{c.label}</div>
                {!c.configurable && <div style={{ ...MONO, fontSize: 9.5, color: ALERT }}>always on — not configurable</div>}
              </div>
              {c.configurable && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: MUTED }}>
                  <input type="checkbox" checked={c.enabled} onChange={(e) => update(c.alertType, { enabled: e.target.checked })} />
                  enabled
                </label>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
              <input
                placeholder="recipient@email"
                defaultValue={c.recipientEmail}
                onBlur={(e) => e.target.value !== c.recipientEmail && update(c.alertType, { recipientEmail: e.target.value })}
                style={{ flex: 1, height: 30, borderRadius: 6, border: `1px solid ${LINE}`, background: "rgba(255,255,255,.04)", color: TEXT, fontSize: 12.5, padding: "0 8px" }}
              />
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
                disabled={testing === c.alertType}
                style={{ height: 30, padding: "0 10px", borderRadius: 6, border: `1px solid ${LINE}`, background: "transparent", color: EMBER, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}
                data-testid={`test-send-${c.alertType}`}
              >
                {testing === c.alertType ? "Sending…" : "Test send"}
              </button>
            </div>
            {testResult[c.alertType] && (
              <div style={{ ...MONO, fontSize: 11, color: testResult[c.alertType] === "sent" ? EMBER : ALERT, marginTop: 4 }}>{testResult[c.alertType]}</div>
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
            <span style={{ color: l.status === "sent" ? EMBER : l.status === "failed" ? ALERT : FAINT }}>
              {l.status}{l.error ? ` (${l.error})` : ""}
            </span>
            <span style={{ ...MONO, color: FAINT }}>{new Date(l.createdAt).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
