// Backups, at the top of the Errors page (Part K7): the latest daily check
// (server/admin/backup-check.ts), the last two weeks as a row of days, and
// a way to check again now. The restore drill is in docs/backups.md.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGet, adminPost } from "./api";
import { LABEL, LINE, SURFACE, MUTED, FAINT, TEXT, ALERT, EMBER, formatDateTime } from "./AdminShell";

type Check = { id: number; checkedAt: string; status: "ok" | "stale" | "missing" | "error" | "not_configured"; latestBackupAt: string | null; backupCount: number; pitr: boolean; message: string; trigger: string };

const GOOD = "#3FA37A";
const COLOR: Record<Check["status"], string> = { ok: GOOD, stale: ALERT, missing: ALERT, error: EMBER, not_configured: FAINT };
const HEADLINE: Record<Check["status"], string> = {
  ok: "Backed up",
  stale: "Backup is late",
  missing: "No backups found",
  error: "Couldn't check",
  not_configured: "Backup check not set up",
};

const ago = (iso: string) => {
  const ms = Date.now() - Date.parse(iso);
  const h = ms / 3_600_000;
  return h < 1 ? `${Math.max(1, Math.round(ms / 60000))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`;
};

export function BackupCard() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { data } = useQuery<{ latest: Check | null; checks: Check[] }>({
    queryKey: ["admin", "backups"],
    queryFn: () => adminGet("/api/admin/backups"),
  });
  const latest = data?.latest ?? null;

  // One mark per day for the last 14 days: that day's last check.
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10);
    const c = (data?.checks ?? []).find((x) => x.checkedAt.slice(0, 10) === d);
    return { d, c };
  });

  const checkNow = async () => {
    setBusy(true);
    setErr(null);
    try {
      await adminPost("/api/admin/backups/check");
      await qc.invalidateQueries({ queryKey: ["admin", "backups"] });
    } catch (e: any) {
      setErr(e?.status === 403 ? "Checking now needs an admin." : e?.message ?? "The check couldn't run.");
    } finally {
      setBusy(false);
    }
  };

  const color = latest ? COLOR[latest.status] : FAINT;
  return (
    <section style={{ border: `1px solid ${LINE}`, background: SURFACE, borderRadius: 10, padding: "12px 14px", marginBottom: 16 }} aria-labelledby="backups-heading" data-testid="card-backups">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 9, background: color, flexShrink: 0 }} />
        <h2 id="backups-heading" style={{ fontSize: 14, fontWeight: 600, color: TEXT, margin: 0 }} data-testid="text-backup-headline">
          {latest ? HEADLINE[latest.status] : "Backups: not checked yet"}
          {latest?.status === "ok" && latest.latestBackupAt ? <span style={{ fontWeight: 400, color: MUTED }}> · last backup {ago(latest.latestBackupAt)}</span> : null}
        </h2>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 3 }} role="img" aria-label="Daily checks, last 14 days">
          {days.map(({ d, c }) => (
            <span key={d} title={`${d}: ${c ? HEADLINE[c.status] : "no check"}`} style={{ width: 7, height: 16, borderRadius: 2, background: c ? COLOR[c.status] : LINE }} />
          ))}
        </div>
        <button
          type="button"
          onClick={checkNow}
          disabled={busy}
          style={{ fontSize: 12, color: TEXT, background: "transparent", border: `1px solid ${LINE}`, borderRadius: 6, padding: "4px 10px", cursor: busy ? "wait" : "pointer" }}
          data-testid="button-backup-check"
        >
          {busy ? "Checking…" : "Check now"}
        </button>
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: "8px 0 0" }} data-testid="text-backup-message">
        {latest ? latest.message : "The server checks once a day, a few minutes after it starts. Set SUPABASE_ACCESS_TOKEN in its environment first (docs/backups.md)."}
      </p>
      {latest && (
        <p style={{ ...LABEL, color: FAINT, textTransform: "none", letterSpacing: 0, margin: "6px 0 0" }}>
          Checked {formatDateTime(latest.checkedAt)}
          {latest.trigger !== "schedule" ? " from the console" : ""}. Restore drill: docs/backups.md.
        </p>
      )}
      {err && (
        <p role="alert" style={{ fontSize: 12, color: ALERT, margin: "6px 0 0" }}>
          {err}
        </p>
      )}
    </section>
  );
}
