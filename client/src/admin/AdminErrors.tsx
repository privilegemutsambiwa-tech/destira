// Errors (Part K3): every server error and screen crash, grouped by what
// broke, kept in the database (server/admin/error-log.ts). Open errors first;
// resolving one hides it until it happens again, muting one stops its alerts.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGet, adminPatch } from "./api";
import { PageHeader, LABEL, MONO, LINE, SURFACE, MUTED, FAINT, TEXT, ALERT, EMBER, formatDateTime } from "./AdminShell";

type State = "open" | "resolved" | "muted" | "all";
type Since = "24h" | "7d" | "30d";
type Kind = "all" | "server" | "client";

interface Group {
  id: number;
  kind: "server" | "client";
  method: string;
  route: string;
  status: number;
  message: string;
  cause: string | null;
  stack: string | null;
  source: string | null;
  count: number;
  inRange: number;
  firstSeenAt: string;
  lastSeenAt: string;
  state: "open" | "resolved" | "muted";
  resolvedAt: string | null;
  lastAlertAt: string | null;
  last48h: number[];
  isNew: boolean;
  explanation: string;
}

const selectStyle: React.CSSProperties = {
  height: 34, borderRadius: 6, border: `1px solid ${LINE}`, background: SURFACE, color: TEXT, fontSize: 12.5, padding: "0 8px",
};
const btn: React.CSSProperties = {
  ...MONO, fontSize: 11.5, padding: "5px 10px", borderRadius: 8, cursor: "pointer", background: "transparent", color: MUTED, border: `1px solid ${LINE}`,
};

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/** The last 48 hours, one bar per hour, oldest on the left. */
function HourStrip({ series }: { series: number[] }) {
  const max = Math.max(1, ...series);
  const w = 3, gap = 1, h = 26;
  const total = series.reduce((a, b) => a + b, 0);
  return (
    <svg
      width={series.length * (w + gap)}
      height={h}
      role="img"
      aria-label={`${total} in the last 48 hours`}
      style={{ display: "block" }}
    >
      {series.map((n, i) => {
        const bh = n === 0 ? 1 : Math.max(3, Math.round((n / max) * h));
        return (
          <rect key={i} x={i * (w + gap)} y={h - bh} width={w} height={bh} rx={1} fill={n === 0 ? LINE : EMBER}>
            <title>{`${n} · ${48 - i === 1 ? "this hour" : `${48 - i - 1} h ago`}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function ErrorRow({ g, open, onToggle, onState }: { g: Group; open: boolean; onToggle: () => void; onState: (s: Group["state"]) => void }) {
  const what = g.kind === "client" ? "Screen crash" : g.method;
  return (
    <div style={{ border: `1px solid ${open ? "rgba(255,255,255,.2)" : LINE}`, background: SURFACE, borderRadius: 10, padding: 14, marginBottom: 10 }} data-testid={`error-${g.id}`}>
      <button onClick={onToggle} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }} aria-expanded={open} data-testid={`error-toggle-${g.id}`}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <span style={{ ...MONO, fontSize: 13, color: TEXT, wordBreak: "break-all" }}>
            {what} <strong>{g.route}</strong>
            {g.kind === "server" ? <span style={{ color: MUTED }}> · {g.status}</span> : null}
          </span>
          <span style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            {g.isNew && g.state === "open" && (
              <span style={{ ...MONO, fontSize: 10.5, color: ALERT, border: `1px solid ${ALERT}`, borderRadius: 999, padding: "1px 7px" }}>new</span>
            )}
            {g.state !== "open" && (
              <span style={{ ...MONO, fontSize: 10.5, color: MUTED, border: `1px solid ${LINE}`, borderRadius: 999, padding: "1px 7px" }}>{g.state}</span>
            )}
            <span style={{ ...MONO, fontSize: 12, color: TEXT, whiteSpace: "nowrap" }} data-testid={`error-count-${g.id}`}>
              {g.inRange}× <span style={{ color: FAINT }}>({g.count} in all)</span>
            </span>
          </span>
        </div>
        <div style={{ fontSize: 13, color: TEXT, marginTop: 6 }}>{g.explanation}</div>
        <div style={{ ...MONO, fontSize: 11.5, color: MUTED, marginTop: 6, wordBreak: "break-word" }}>{g.cause ?? g.message}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
          <span style={{ ...MONO, fontSize: 11, color: FAINT }}>
            last {ago(g.lastSeenAt)} · first {ago(g.firstSeenAt)}{g.source ? ` · ${g.source}` : ""}
          </span>
          <HourStrip series={g.last48h} />
        </div>
      </button>

      {open && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
          {g.cause && g.message !== g.cause && (
            <div style={{ ...MONO, fontSize: 11.5, color: MUTED, marginBottom: 8 }}>The person saw: {g.message}</div>
          )}
          <div style={{ ...MONO, fontSize: 11, color: FAINT, marginBottom: 8 }}>
            First {formatDateTime(g.firstSeenAt)} · last {formatDateTime(g.lastSeenAt)}
            {g.lastAlertAt ? ` · emailed ${formatDateTime(g.lastAlertAt)}` : ""}
            {g.resolvedAt ? ` · resolved ${formatDateTime(g.resolvedAt)}` : ""}
          </div>
          {g.stack && (
            <pre style={{ ...MONO, fontSize: 11, color: MUTED, background: "rgba(255,255,255,.03)", border: `1px solid ${LINE}`, borderRadius: 8, padding: 10, overflowX: "auto", maxHeight: 260, whiteSpace: "pre-wrap", wordBreak: "break-word" }} data-testid={`error-stack-${g.id}`}>
              {g.stack}
            </pre>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {g.state !== "resolved" && (
              <button style={{ ...btn, color: TEXT }} onClick={() => onState("resolved")} data-testid={`error-resolve-${g.id}`}>
                Mark resolved
              </button>
            )}
            {g.state !== "muted" && (
              <button style={btn} onClick={() => onState("muted")} data-testid={`error-mute-${g.id}`}>
                Mute
              </button>
            )}
            {g.state !== "open" && (
              <button style={btn} onClick={() => onState("open")} data-testid={`error-reopen-${g.id}`}>
                Reopen
              </button>
            )}
          </div>
          <p style={{ fontSize: 12, color: FAINT, marginTop: 8 }}>
            Resolved errors come back here as open if they happen again. Muted ones stay listed but never send an alert.
          </p>
        </div>
      )}
    </div>
  );
}

export default function AdminErrors() {
  const qc = useQueryClient();
  const [state, setState] = useState<State>("open");
  const [since, setSince] = useState<Since>("7d");
  const [kind, setKind] = useState<Kind>("all");
  const [openId, setOpenId] = useState<number | null>(null);

  // An alert email links straight to one error (?id=).
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("id"));
    if (id) {
      setOpenId(id);
      setState("all");
    }
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "error-groups", state, since, kind],
    queryFn: () => adminGet(`/api/admin/error-groups?state=${state}&since=${since}&kind=${kind}`),
    refetchInterval: 30_000,
  });

  const changeState = async (id: number, s: Group["state"]) => {
    await adminPatch(`/api/admin/error-groups/${id}`, { state: s });
    qc.invalidateQueries({ queryKey: ["admin", "error-groups"] });
    qc.invalidateQueries({ queryKey: ["admin", "overview"] });
  };

  const groups: Group[] = data?.groups ?? [];
  const states: Record<string, number> = data?.states ?? {};

  return (
    <div>
      <PageHeader
        title="Errors"
        sub="Server errors (500 and up) and screens that crashed, grouped by what broke. Wrong passwords, missing pages and bad input aren't errors."
      />
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <select value={state} onChange={(e) => setState(e.target.value as State)} style={selectStyle} aria-label="Which errors" data-testid="select-error-state">
          <option value="open">Open{states.open != null ? ` (${states.open})` : ""}</option>
          <option value="resolved">Resolved{states.resolved != null ? ` (${states.resolved})` : ""}</option>
          <option value="muted">Muted{states.muted != null ? ` (${states.muted})` : ""}</option>
          <option value="all">All</option>
        </select>
        <select value={since} onChange={(e) => setSince(e.target.value as Since)} style={selectStyle} aria-label="Seen in" data-testid="select-error-since">
          <option value="24h">Seen in the last 24 hours</option>
          <option value="7d">Seen in the last 7 days</option>
          <option value="30d">Seen in the last 30 days</option>
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} style={selectStyle} aria-label="Where" data-testid="select-error-kind">
          <option value="all">Server and screens</option>
          <option value="server">Server only</option>
          <option value="client">Screen crashes only</option>
        </select>
      </div>

      {isLoading ? (
        <p style={{ color: FAINT }}>Loading…</p>
      ) : error ? (
        <p style={{ color: ALERT, fontSize: 13 }}>{(error as Error).message}</p>
      ) : groups.length === 0 ? (
        <p style={{ color: FAINT, fontSize: 13 }} data-testid="errors-empty">
          {state === "open" ? "Nothing open. Nothing has broken in this period, or it's all been resolved." : "Nothing here."}
        </p>
      ) : (
        <>
          <p style={{ ...LABEL, color: FAINT, marginBottom: 10, textTransform: "none", letterSpacing: 0 }}>
            {groups.length} {groups.length === 1 ? "error" : "errors"}, most recent first. The count is for the period you picked; the bars are the last 48 hours.
          </p>
          {groups.map((g) => (
            <ErrorRow key={g.id} g={g} open={openId === g.id} onToggle={() => setOpenId(openId === g.id ? null : g.id)} onState={(s) => changeState(g.id, s)} />
          ))}
        </>
      )}
    </div>
  );
}
