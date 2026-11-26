import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { adminGet, adminPost } from "./api";
import { PageHeader, LABEL, MONO, LINE, SURFACE, MUTED, FAINT, TEXT, ALERT, EMBER, formatDateTime, useStepUp } from "./AdminShell";
import {
  GRANT_TIERS, MAX_CREDIT, MAX_GRANT_DAYS, MEMBER_ACTION_LABEL, STEP_UP_ACTIONS,
  type MemberAction, type MemberSearchRow,
} from "@shared/member-admin";

// Member lookup and actions (server/admin/members.ts, Part L1 and L2).

type Detail = {
  userId: string;
  email: string | null;
  joinedAt: string | null;
  profile: null | {
    name: string | null; age: number | null; location: string | null; lookingFor: string | null;
    isVerified: boolean; verificationStatus: string | null;
    moderationStatus: string; moderationReason: string | null; moderationAt: string | null;
    superLikes: number; boosts: number; likesPassUntil: string | null; onboarded: boolean;
  };
  plan: null | { tier: string; period: string; provider: string | null; free: boolean; live: boolean; endsAt: string | null; cancelling: boolean };
  payments: { id: number; cents: number; status: string; provider: string; phone: string | null; what: string; failureReason: string | null; createdAt: string | null; refund: null | { at: string; cents: number; note: string } }[];
  reportsMade: { id: number; about: string; category: string; status: string; createdAt: string | null }[];
  reportsReceived: { id: number; from: string; category: string; status: string; createdAt: string | null }[];
  verification: { id: number; status: string; rejectReason: string | null; createdAt: string | null; reviewedAt: string | null }[];
  riskFlags: { id: number; kind: string; severity: string; source: string; status: string; createdAt: string | null }[];
  signIns: { method: string; network: string | null; device: string | null; at: string | null }[];
  teamActions: { id: number; action: string; details: any; by: string | null; at: string | null }[];
};

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const when = (s: string | null) => (s ? formatDateTime(s) : "–");
const GOOD = "#2E7D5B";

export default function AdminMembers({ id }: { id?: string }) {
  const [, setLocation] = useLocation();
  const [q, setQ] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
  const [term, setTerm] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const search = useQuery<MemberSearchRow[]>({
    queryKey: ["admin", "members", term],
    queryFn: () => adminGet(`/api/admin/members?q=${encodeURIComponent(term)}`),
    enabled: term.length >= 2,
  });

  return (
    <div style={{ maxWidth: 1100 }}>
      <PageHeader title="Members" sub="Find anyone by name, email, the last 4 digits of the phone they paid with, or their id. No message content here: that's only ever seen through a report." />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Name, email, phone ending, or id"
        autoFocus={!id}
        style={{ width: "100%", maxWidth: 520, background: SURFACE, border: `1px solid ${LINE}`, color: TEXT, borderRadius: 8, padding: "10px 12px", fontSize: 14 }}
        data-testid="input-member-search"
      />
      {term.length >= 2 && (
        <div style={{ marginTop: 12, border: `1px solid ${LINE}`, borderRadius: 10, background: SURFACE, overflow: "hidden", maxWidth: 1100 }}>
          {search.isLoading ? (
            <p style={{ color: FAINT, padding: 14, margin: 0, fontSize: 13 }}>Searching…</p>
          ) : (search.data ?? []).length === 0 ? (
            <p style={{ color: FAINT, padding: 14, margin: 0, fontSize: 13 }} data-testid="member-search-empty">Nobody matches “{term}”.</p>
          ) : (
            (search.data ?? []).map((m) => (
              <button
                key={m.userId}
                onClick={() => setLocation(`/console/members/${m.userId}`)}
                style={{ display: "flex", width: "100%", gap: 12, alignItems: "baseline", padding: "10px 14px", borderTop: `1px solid ${LINE}`, background: m.userId === id ? "rgba(255,255,255,.04)" : "transparent", color: TEXT, textAlign: "left", cursor: "pointer", border: "none", borderBottom: "none" }}
                data-testid={`member-result-${m.userId}`}
              >
                <span style={{ fontSize: 14, fontWeight: 600, minWidth: 160 }}>{m.name ?? "No profile"}</span>
                <span style={{ ...MONO, fontSize: 12, color: MUTED, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{m.email}</span>
                <span style={{ ...LABEL, color: FAINT }}>{m.tier ?? "free"}</span>
                {m.isVerified && <span style={{ ...LABEL, color: GOOD }}>verified</span>}
                {m.moderationStatus !== "active" && <span style={{ ...LABEL, color: ALERT }}>{m.moderationStatus}</span>}
              </button>
            ))
          )}
        </div>
      )}
      {id && <MemberDetail id={id} />}
    </div>
  );
}

function MemberDetail({ id }: { id: string }) {
  const { data, isLoading, error } = useQuery<Detail>({ queryKey: ["admin", "member", id], queryFn: () => adminGet(`/api/admin/members/${id}`) });
  if (isLoading) return <p style={{ color: FAINT, marginTop: 20 }}>Loading…</p>;
  if (error || !data) return <p style={{ color: ALERT, marginTop: 20 }}>{(error as Error)?.message ?? "Not found"}</p>;
  const p = data.profile;
  const status = p?.moderationStatus ?? "active";

  return (
    <div style={{ marginTop: 22 }} data-testid="member-detail">
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 22, color: TEXT, margin: 0, fontWeight: 600 }}>{p?.name ?? "No profile"}{p?.age ? `, ${p.age}` : ""}</h2>
        {p?.isVerified ? <span style={{ ...LABEL, color: GOOD }}>verified</span> : <span style={{ ...LABEL, color: FAINT }}>not verified</span>}
        {status !== "active" && <span style={{ ...LABEL, color: ALERT }} data-testid="member-status">{status}</span>}
      </div>
      <div style={{ ...MONO, fontSize: 12, color: FAINT, marginTop: 4 }}>
        {[data.email, p?.location, `joined ${when(data.joinedAt)}`, p?.lookingFor ? `here for ${p.lookingFor}` : null, data.userId].filter(Boolean).join(" · ")}
      </div>
      {status !== "active" && p?.moderationReason && (
        <p style={{ fontSize: 13, color: MUTED, margin: "8px 0 0" }}>{status === "banned" ? "Banned" : "Suspended"} {when(p.moderationAt)}: {p.moderationReason}</p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginTop: 16 }}>
        <Fact label="Plan" testId="member-plan">
          {data.plan?.live ? `${cap(data.plan.tier)} · ${data.plan.free ? `free (${data.plan.provider})` : data.plan.period}` : "Free"}
          <Sub>{data.plan?.live ? `${data.plan.cancelling ? "ends" : "renews or ends"} ${when(data.plan.endsAt)}` : data.plan?.endsAt ? `last plan ended ${when(data.plan.endsAt)}` : "never had a plan"}</Sub>
        </Fact>
        <Fact label="Credits" testId="member-credits">
          {p ? `${p.superLikes} super like${p.superLikes === 1 ? "" : "s"} · ${p.boosts} boost${p.boosts === 1 ? "" : "s"}` : "–"}
          <Sub>{p?.likesPassUntil && new Date(p.likesPassUntil) > new Date() ? `who-liked-you pass until ${when(p.likesPassUntil)}` : "no likes pass"}</Sub>
        </Fact>
        <Fact label="Paid in total">
          {usd(data.payments.filter((x) => x.status === "paid").reduce((s, x) => s + x.cents - (x.refund?.cents ?? 0), 0))}
          <Sub>{data.payments.filter((x) => x.status === "paid").length} paid · {data.payments.filter((x) => x.refund).length} refunded</Sub>
        </Fact>
        <Fact label="Reports">
          {data.reportsReceived.length} about them · {data.reportsMade.length} by them
          <Sub>{data.riskFlags.filter((f) => f.status === "open").length} open risk flag{data.riskFlags.filter((f) => f.status === "open").length === 1 ? "" : "s"}</Sub>
        </Fact>
      </div>

      <Actions d={data} />

      <Table title="Payments" empty="No payments." testId="member-payments" head={["When", "What", "Amount", "Status", "Method", ""]}>
        {data.payments.map((x) => (
          <tr key={x.id}>
            <Td mono>{when(x.createdAt)}</Td>
            <Td>{x.what}</Td>
            <Td mono>{usd(x.cents)}</Td>
            <Td>
              <span style={{ color: x.status === "paid" ? GOOD : x.status === "failed" ? ALERT : MUTED }}>{x.status}</span>
              {x.failureReason ? <Sub>{x.failureReason}</Sub> : null}
            </Td>
            <Td mono>{x.provider}{x.phone ? ` · ${x.phone}` : ""}</Td>
            <Td>{x.refund ? <span style={{ color: EMBER }} data-testid={`payment-refunded-${x.id}`}>refunded {usd(x.refund.cents)} {when(x.refund.at)}<Sub>{x.refund.note}</Sub></span> : <span style={{ ...MONO, color: FAINT }}>#{x.id}</span>}</Td>
          </tr>
        ))}
      </Table>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        <Table title="Reports about them" empty="None." head={["When", "From", "Category", "Status"]}>
          {data.reportsReceived.map((r) => (
            <tr key={r.id}>
              <Td mono>{when(r.createdAt)}</Td><Td>{r.from}</Td>
              <Td><Link href={`/console/reports/${r.id}`} style={{ color: TEXT }}>{r.category}</Link></Td><Td>{r.status}</Td>
            </tr>
          ))}
        </Table>
        <Table title="Reports they made" empty="None." head={["When", "About", "Category", "Status"]}>
          {data.reportsMade.map((r) => (
            <tr key={r.id}>
              <Td mono>{when(r.createdAt)}</Td><Td>{r.about}</Td>
              <Td><Link href={`/console/reports/${r.id}`} style={{ color: TEXT }}>{r.category}</Link></Td><Td>{r.status}</Td>
            </tr>
          ))}
        </Table>
        <Table title="Risk flags" empty="None." head={["When", "Signal", "Seen in", "Status"]}>
          {data.riskFlags.map((f) => (
            <tr key={f.id}>
              <Td mono>{when(f.createdAt)}</Td>
              <Td><span style={{ color: f.severity === "high" ? ALERT : f.severity === "medium" ? EMBER : MUTED }}>{f.kind.replace(/_/g, " ")}</span></Td>
              <Td>{f.source}</Td><Td>{f.status}</Td>
            </tr>
          ))}
        </Table>
        <Table title="Verification" empty="Never asked to verify." head={["Sent", "Outcome", "Reviewed"]}>
          {data.verification.map((v) => (
            <tr key={v.id}>
              <Td mono>{when(v.createdAt)}</Td>
              <Td>{v.status}{v.rejectReason ? <Sub>{v.rejectReason}</Sub> : null}</Td>
              <Td mono>{when(v.reviewedAt)}</Td>
            </tr>
          ))}
        </Table>
        <Table title="Recent sign-ins" empty="None recorded yet (sign-ins are kept 90 days)." testId="member-signins" head={["When", "How", "Device", "Network"]}>
          {data.signIns.map((s, i) => (
            <tr key={i}>
              <Td mono>{when(s.at)}</Td><Td>{s.method}</Td><Td>{s.device ?? "–"}</Td><Td mono>{s.network ?? "–"}</Td>
            </tr>
          ))}
        </Table>
      </div>
      <Table title="What the team did" empty="Nothing yet." testId="member-team-actions" head={["When", "Who", "Action", "Reason"]}>
        {data.teamActions.filter((a) => a.action !== "member.view").map((a) => (
          <tr key={a.id}>
            <Td mono>{when(a.at)}</Td><Td mono>{a.by ?? "–"}</Td>
            <Td>{a.action.replace(/^(member|report)\./, "").replace(/_/g, " ")}</Td>
            <Td>{a.details?.reason ?? ""}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function Actions({ d }: { d: Detail }) {
  const qc = useQueryClient();
  const stepUp = useStepUp();
  const status = d.profile?.moderationStatus ?? "active";
  const refundable = d.payments.filter((x) => x.status === "paid" && !x.refund);
  const types: MemberAction[] = [
    "grant_plan_days", "credit_super_like", "credit_boost",
    ...(refundable.length ? (["refund_given"] as const) : []),
    ...(d.profile?.isVerified ? (["reset_verification"] as const) : []),
    ...(status === "active" ? (["suspend", "ban"] as const) : status === "suspended" ? (["ban", "reinstate"] as const) : (["reinstate"] as const)),
  ];
  const [type, setType] = useState<MemberAction>(types[0]);
  const [reason, setReason] = useState("");
  const [tier, setTier] = useState<string>("flame");
  const [days, setDays] = useState("7");
  const [count, setCount] = useState("1");
  const [paymentId, setPaymentId] = useState<string>(refundable[0] ? String(refundable[0].id) : "");
  const [cents, setCents] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (!types.includes(type)) setType(types[0]); }, [types.join()]);

  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => adminPost(`/api/admin/members/${d.userId}/actions`, body),
    onSuccess: (r: any) => {
      setResult({ ok: true, text: r.message });
      setReason("");
      qc.invalidateQueries({ queryKey: ["admin", "member", d.userId] });
      qc.invalidateQueries({ queryKey: ["admin", "members"] });
    },
    onError: (e: any) => setResult({ ok: false, text: e?.message ?? "That didn't work" }),
  });
  const submit = () => {
    setResult(null);
    const body: Record<string, unknown> = { type, reason };
    if (type === "grant_plan_days") Object.assign(body, { tier, days: Number(days) });
    if (type === "credit_super_like" || type === "credit_boost") body.count = Number(count);
    if (type === "refund_given") Object.assign(body, { paymentId: Number(paymentId), ...(cents ? { cents: Math.round(Number(cents) * 100) } : {}) });
    const go = () => act.mutateAsync(body);
    (STEP_UP_ACTIONS.includes(type) ? stepUp(go) : go()).catch(() => {});
  };
  const input: React.CSSProperties = { background: "transparent", border: `1px solid ${LINE}`, color: TEXT, borderRadius: 6, padding: "6px 8px", fontSize: 13 };
  const danger = type === "ban" || type === "suspend";

  return (
    <div style={{ marginTop: 18, border: `1px solid ${LINE}`, borderRadius: 10, background: SURFACE, padding: 14 }} data-testid="member-actions">
      <div style={{ ...LABEL, color: MUTED, marginBottom: 10 }}>Act on this member</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={type} onChange={(e) => { setType(e.target.value as MemberAction); setResult(null); }} style={input} data-testid="select-member-action">
          {types.map((t) => <option key={t} value={t} style={{ color: "#000" }}>{MEMBER_ACTION_LABEL[t]}</option>)}
        </select>
        {type === "grant_plan_days" && (
          <>
            <select value={tier} onChange={(e) => setTier(e.target.value)} style={input} data-testid="select-grant-tier">
              {GRANT_TIERS.map((t) => <option key={t} value={t} style={{ color: "#000" }}>{cap(t)}</option>)}
            </select>
            <input type="number" min={1} max={MAX_GRANT_DAYS} value={days} onChange={(e) => setDays(e.target.value)} style={{ ...input, width: 70 }} data-testid="input-grant-days" />
            <span style={{ fontSize: 12.5, color: FAINT }}>days</span>
          </>
        )}
        {(type === "credit_super_like" || type === "credit_boost") && (
          <input type="number" min={1} max={MAX_CREDIT} value={count} onChange={(e) => setCount(e.target.value)} style={{ ...input, width: 70 }} data-testid="input-credit-count" />
        )}
        {type === "refund_given" && (
          <>
            <select value={paymentId} onChange={(e) => setPaymentId(e.target.value)} style={input} data-testid="select-refund-payment">
              {refundable.map((x) => <option key={x.id} value={x.id} style={{ color: "#000" }}>#{x.id} · {x.what} · {usd(x.cents)}</option>)}
            </select>
            <input value={cents} onChange={(e) => setCents(e.target.value)} placeholder="full amount" style={{ ...input, width: 110 }} data-testid="input-refund-amount" />
          </>
        )}
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder={type === "refund_given" ? "Reason, and the EcoCash or Paynow reference of the refund you sent" : "Reason (goes in the audit log)"}
        style={{ ...input, width: "100%", marginTop: 10, resize: "vertical", fontFamily: "inherit" }}
        data-testid="input-member-reason"
      />
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        <button
          onClick={submit}
          disabled={!reason.trim() || act.isPending}
          style={{ fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 8, cursor: "pointer", background: danger ? `${ALERT}22` : "transparent", color: danger ? ALERT : TEXT, border: `1px solid ${danger ? `${ALERT}88` : LINE}`, opacity: !reason.trim() ? 0.5 : 1 }}
          data-testid="button-member-act"
        >
          {act.isPending ? "Working…" : MEMBER_ACTION_LABEL[type]}
        </button>
        {STEP_UP_ACTIONS.includes(type) && <span style={{ fontSize: 12, color: FAINT }}>Asks for your password first.</span>}
        {result && <span role="status" style={{ fontSize: 13, color: result.ok ? GOOD : ALERT }} data-testid="member-action-result">{result.text}</span>}
      </div>
    </div>
  );
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function Fact({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: SURFACE, padding: 12 }} data-testid={testId}>
      <div style={{ ...LABEL, color: FAINT }}>{label}</div>
      <div style={{ fontSize: 14, color: TEXT, marginTop: 4 }}>{children}</div>
    </div>
  );
}
function Sub({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: FAINT, marginTop: 2 }}>{children}</div>;
}
function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return <td style={{ padding: "8px 12px", borderTop: `1px solid ${LINE}`, fontSize: mono ? 12 : 13, color: TEXT, verticalAlign: "top", ...(mono ? MONO : {}) }}>{children}</td>;
}
function Table({ title, head, empty, children, testId }: { title: string; head: string[]; empty: string; children: React.ReactNode; testId?: string }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div style={{ marginTop: 18 }} data-testid={testId}>
      <div style={{ ...LABEL, color: MUTED, marginBottom: 8 }}>{title}</div>
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: SURFACE, overflowX: "auto" }}>
        {has ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{head.map((h, i) => <th key={i} style={{ ...LABEL, color: FAINT, textAlign: "left", padding: "8px 12px", fontWeight: 500 }}>{h}</th>)}</tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        ) : (
          <p style={{ color: FAINT, padding: 14, margin: 0, fontSize: 13 }}>{empty}</p>
        )}
      </div>
    </div>
  );
}
