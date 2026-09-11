import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { adminGet, adminPost } from "./api";
import "./admin.css";

export const INK = "#0C0910";
export const SURFACE = "#161220";
export const SURFACE2 = "#14101C";
export const LINE = "rgba(255,255,255,.09)";
export const TEXT = "#F5F0EA";
export const MUTED = "#A79FB4";
export const FAINT = "#7E7690";
export const EMBER = "#FF6B4A";
// The one alert colour, used sparingly, and never the only signal — every use
// is paired with a text label. Distinct from ember so the two are never
// confused: ember = primary action, this = something is actually wrong.
export const ALERT = "#EF4444";

export const LABEL: React.CSSProperties = {
  fontFamily: '"DM Mono", monospace',
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: FAINT,
};
export const MONO: React.CSSProperties = { fontFamily: '"DM Mono", monospace' };
export const SERIF: React.CSSProperties = { fontFamily: '"Instrument Serif", serif', fontWeight: 400 };

/** Every timestamp in the console goes through this — date, time, and the
 *  viewer's own timezone stated explicitly. "9:05:59 PM" with no date or
 *  zone is ambiguous the moment more than one person or one day is involved. */
export function formatDateTime(iso: string | number | Date): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const tz = get("timeZoneName");
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}${tz ? ` ${tz}` : ""}`;
}

/** Money is always two decimals. A real figure that rounds to $0.00 still
 *  shows $0.00 — with the raw amount underneath in mono, muted, so "is this
 *  actually zero or just small" has an answer without a third decimal place
 *  cluttering the headline number. */
export function Money({ usd, size = 30 }: { usd: number | null | undefined; size?: number }) {
  if (usd == null) return <span style={{ ...SERIF, fontSize: size }}>—</span>;
  const rounds_to_zero = usd > 0 && usd < 0.005;
  return (
    <span>
      <span style={{ ...SERIF, fontSize: size }}>${usd.toFixed(2)}</span>
      {rounds_to_zero && <div style={{ ...MONO, fontSize: 10.5, color: FAINT, marginTop: 2 }}>raw: ${usd.toFixed(4)}</div>}
    </span>
  );
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

const NAV = [
  { href: "/console", label: "Overview" },
  { href: "/console/reports", label: "Reports", badgeKey: "openReports" as const },
  { href: "/console/feedback", label: "Feedback", badgeKey: "openFeedback" as const },
  { href: "/console/metrics", label: "Metrics" },
  { href: "/console/email", label: "Email alerts" },
];

type OverviewSnapshot = {
  openReports: number;
  safetyReportsOpen: number;
  failedPaymentsToday: number;
  openFeedback: number;
};

export function AdminShell({ role, email, children }: { role: string; email?: string | null; children: React.ReactNode }) {
  const [location, setLocation] = useLocation();

  // Same query key AdminOverview.tsx uses — one shared QueryClient means
  // this dedupes into the same request/cache entry, not a second poll.
  const { data: overview } = useQuery<OverviewSnapshot>({
    queryKey: ["admin", "overview"],
    queryFn: () => adminGet("/api/admin/overview"),
    refetchInterval: 30_000,
  });

  const signOut = async () => {
    await adminPost("/api/admin/auth/logout").catch(() => {});
    setLocation("/console/login");
    window.location.reload();
  };

  const attention = overview
    ? ([
        overview.safetyReportsOpen > 0 ? { label: "safety-category open", n: overview.safetyReportsOpen } : null,
        overview.openReports > 0 ? { label: "open reports", n: overview.openReports } : null,
        overview.failedPaymentsToday > 0 ? { label: "failed payments today", n: overview.failedPaymentsToday } : null,
      ].filter(Boolean) as { label: string; n: number }[])
    : [];

  return (
    <div className="console-root" style={{ minHeight: "100vh", background: INK, color: TEXT, fontFamily: '"DM Sans", sans-serif' }}>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <aside style={{ width: 200, flexShrink: 0, borderRight: `1px solid ${LINE}`, padding: 18, display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <div style={LABEL}>Destira</div>
            <div style={{ ...MONO, fontSize: 13, color: TEXT, marginTop: 2 }}>console</div>
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {NAV.map((item) => {
              const active = location === item.href;
              const badgeN = item.badgeKey && overview ? overview[item.badgeKey] : undefined;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      fontSize: 13.5,
                      cursor: "pointer",
                      background: active ? "rgba(255,255,255,.06)" : "transparent",
                      color: active ? TEXT : MUTED,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                    data-testid={`admin-nav-${item.label.toLowerCase()}`}
                  >
                    <span>{item.label}</span>
                    {badgeN != null && (
                      <span style={{ ...MONO, fontSize: 11, color: badgeN > 0 ? ALERT : FAINT }}>{badgeN}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </nav>

          <div>
            <div style={{ ...LABEL, marginBottom: 8 }}>Needs attention</div>
            {attention.length === 0 ? (
              <p style={{ fontSize: 12, color: FAINT, margin: 0 }}>All clear.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {attention.map((a) => (
                  <div key={a.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 12, color: MUTED }}>{a.label}</span>
                    <span style={{ ...MONO, fontSize: 13, color: ALERT }}>{a.n}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <div style={{ ...LABEL, color: FAINT }}>Role: {role}</div>
              {email && (
                <div style={{ ...MONO, fontSize: 11, color: FAINT, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={email}>
                  {email}
                </div>
              )}
            </div>
            <button
              onClick={signOut}
              style={{ height: 34, borderRadius: 6, border: `1px solid ${LINE}`, background: "transparent", color: MUTED, fontSize: 12.5, cursor: "pointer" }}
              data-testid="admin-sign-out"
            >
              Sign out
            </button>
          </div>
        </aside>
        <main style={{ flex: 1, minWidth: 0, padding: "20px 28px", overflowX: "auto" }}>{children}</main>
      </div>
    </div>
  );
}

/** Shown whenever the current view contains report-scoped personal data — the
 *  access is logged, and this says so plainly. Not decorative. */
export function ScopedDataBanner({ note }: { note: string }) {
  return (
    <div
      style={{
        border: `1px solid ${ALERT}55`,
        background: `${ALERT}14`,
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12.5,
        color: TEXT,
        marginBottom: 14,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
      data-testid="scoped-data-banner"
    >
      <span style={{ ...LABEL, color: ALERT, flexShrink: 0 }}>Logged access</span>
      <span style={{ color: MUTED }}>{note}</span>
    </div>
  );
}

export function PageHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h1 style={{ ...SERIF, fontSize: 26, color: TEXT, margin: 0 }}>{title}</h1>
      {sub && <p style={{ color: MUTED, fontSize: 13, marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

/** A tiny axis-less trace — decoration, not a chart. Renders nothing (not a
 *  flat line) when there isn't enough real history to draw, per the "never a
 *  fake curve" rule that applies to every chart in this console. */
function Sparkline({ values, alert }: { values: number[]; alert?: boolean }) {
  if (values.length < 2 || values.every((v) => v === values[0])) return null;
  const w = 100;
  const h = 26;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", marginTop: 6, overflow: "visible" }} aria-hidden="true">
      <polyline points={points} fill="none" stroke={alert ? ALERT : MUTED} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
    </svg>
  );
}

export function StatTile({
  label,
  value,
  alert,
  trend,
  sparkline,
}: {
  label: string;
  value: React.ReactNode;
  /** Only for a genuinely bad reading — a count that should worry you. A
   *  card sitting at a healthy zero (open reports, failed payments) stays
   *  neutral, not colored, so color keeps meaning something. */
  alert?: boolean;
  /** e.g. "was 2 yesterday" — bare text, no leading separator. */
  trend?: string;
  sparkline?: number[];
}) {
  return (
    <div style={{ border: `1px solid ${LINE}`, background: SURFACE, borderRadius: 10, padding: 14, minWidth: 0 }}>
      <div style={LABEL}>{label}</div>
      <div style={{ ...SERIF, fontSize: 30, color: alert ? ALERT : TEXT, marginTop: 4 }}>{value}</div>
      {trend && (
        <div style={{ ...MONO, fontSize: 11, color: alert ? `${ALERT}CC` : FAINT, marginTop: 3 }}>{trend}</div>
      )}
      {sparkline && <Sparkline values={sparkline} alert={alert} />}
    </div>
  );
}
