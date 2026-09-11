import { Link, useLocation } from "wouter";
import { adminPost } from "./api";

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

const NAV = [
  { href: "/console", label: "Overview" },
  { href: "/console/reports", label: "Reports" },
  { href: "/console/feedback", label: "Feedback" },
];

export function AdminShell({ role, children }: { role: string; children: React.ReactNode }) {
  const [location, setLocation] = useLocation();

  const signOut = async () => {
    await adminPost("/api/admin/auth/logout").catch(() => {});
    setLocation("/console/login");
    window.location.reload();
  };

  return (
    <div style={{ minHeight: "100vh", background: INK, color: TEXT, fontFamily: '"DM Sans", sans-serif' }}>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <aside style={{ width: 200, flexShrink: 0, borderRight: `1px solid ${LINE}`, padding: 18, display: "flex", flexDirection: "column", gap: 24 }}>
          <div>
            <div style={LABEL}>Destira</div>
            <div style={{ ...MONO, fontSize: 13, color: TEXT, marginTop: 2 }}>console</div>
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {NAV.map((item) => {
              const active = location === item.href;
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
                    }}
                    data-testid={`admin-nav-${item.label.toLowerCase()}`}
                  >
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </nav>
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ ...LABEL, color: FAINT }}>Role: {role}</div>
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

export function StatTile({ label, value, alert }: { label: string; value: React.ReactNode; alert?: boolean }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, background: SURFACE, borderRadius: 10, padding: 14, minWidth: 140 }}>
      <div style={LABEL}>{label}</div>
      <div style={{ ...SERIF, fontSize: 30, color: alert ? ALERT : TEXT, marginTop: 4 }}>{value}</div>
    </div>
  );
}
