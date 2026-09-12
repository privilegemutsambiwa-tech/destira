import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGet, adminPost, adminPatch } from "./api";
import { PageHeader, LABEL, MONO, LINE, SURFACE, MUTED, FAINT, TEXT, ALERT, EMBER, formatDateTime, ConfirmDialog, Modal, useStepUp } from "./AdminShell";
import { ADMIN_ROLES, type AdminRole } from "@shared/admin";

const th: React.CSSProperties = { ...LABEL, textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${LINE}` };
const td: React.CSSProperties = { padding: "9px 10px", fontSize: 13, borderBottom: `1px solid ${LINE}`, color: TEXT };
const btn: React.CSSProperties = { height: 26, padding: "0 8px", borderRadius: 5, border: `1px solid ${LINE}`, background: "transparent", color: MUTED, fontSize: 11.5, cursor: "pointer", whiteSpace: "nowrap" };
const dangerBtn: React.CSSProperties = { ...btn, borderColor: `${ALERT}66`, color: ALERT };

function rank(r: string): number {
  return (ADMIN_ROLES as readonly string[]).indexOf(r);
}
function canActOn(myRole: string, targetRole: string): boolean {
  if (targetRole === "owner") return myRole === "owner";
  return rank(myRole) >= rank(targetRole);
}

function StatusBadge({ status }: { status: string }) {
  const color = status === "active" ? MUTED : status === "suspended" ? ALERT : FAINT;
  return <span style={{ ...MONO, fontSize: 10.5, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>{status}</span>;
}

export default function AdminTeam() {
  const qc = useQueryClient();
  const withStepUp = useStepUp();
  const { data: who } = useQuery({ queryKey: ["admin", "whoami"], queryFn: () => adminGet("/api/admin/auth/whoami") });
  const { data, isLoading } = useQuery({ queryKey: ["admin", "team"], queryFn: () => adminGet("/api/admin/team") });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [roleDialogFor, setRoleDialogFor] = useState<{ userId: string; name: string; currentRole: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ userId: string; name: string; kind: "suspend" | "remove" } | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "team"] });

  const revokeInvite = async (id: number) => {
    await withStepUp(() => adminPost(`/api/admin/team/invites/${id}/revoke`));
    invalidate();
  };
  const reactivate = async (userId: string) => {
    await withStepUp(() => adminPost(`/api/admin/team/${userId}/reactivate`));
    invalidate();
  };

  if (isLoading || !data || !who) return <p style={{ color: FAINT }}>Loading…</p>;
  const myRole = who.role as string;

  return (
    <div>
      <PageHeader title="Team" sub="Who has console access, and at what level." />

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button
          onClick={() => setInviteOpen(true)}
          style={{ height: 32, padding: "0 14px", borderRadius: 6, border: "none", background: EMBER, color: "#1a0e08", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          data-testid="team-invite-open"
        >
          Invite
        </button>
      </div>

      {data.invites.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ ...LABEL, marginBottom: 8 }}>Pending invites</div>
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", background: SURFACE }}>
              <thead>
                <tr>
                  <th style={th}>Email</th>
                  <th style={th}>Role</th>
                  <th style={th}>Expires</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {data.invites.map((i: any) => (
                  <tr key={i.id}>
                    <td style={{ ...td, ...MONO }}>{i.email}</td>
                    <td style={td}>{i.role}</td>
                    <td style={{ ...td, ...MONO, fontSize: 11.5, color: i.expired ? ALERT : MUTED }}>{i.expired ? "expired" : formatDateTime(i.expiresAt)}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <button onClick={() => revokeInvite(i.id)} style={btn} data-testid={`invite-revoke-${i.id}`}>
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", background: SURFACE }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Email</th>
              <th style={th}>Role</th>
              <th style={th}>2FA</th>
              <th style={th}>Status</th>
              <th style={th}>Last sign-in</th>
              <th style={th}>Granted by</th>
              <th style={th}>Granted at</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {data.admins.map((a: any) => {
              const isSelf = a.email === who.email;
              const actionable = !isSelf && canActOn(myRole, a.role) && a.status !== "removed";
              return (
                <tr key={a.userId} data-testid={`team-row-${a.userId}`}>
                  <td style={td}>{a.name || <span style={{ color: FAINT }}>—</span>}</td>
                  <td style={{ ...td, ...MONO, fontSize: 12 }}>{a.email}</td>
                  <td style={td}>
                    {a.role}
                    {isSelf && <span style={{ ...MONO, fontSize: 10, color: FAINT, marginLeft: 6 }}>(you)</span>}
                  </td>
                  <td style={{ ...td, ...MONO, fontSize: 11.5, color: a.totpEnabled ? MUTED : ALERT }}>{a.totpEnabled ? "on" : "off"}</td>
                  <td style={td}>
                    <StatusBadge status={a.status} />
                  </td>
                  <td style={{ ...td, ...MONO, fontSize: 11.5, color: FAINT }}>{a.lastSignInAt ? formatDateTime(a.lastSignInAt) : "never"}</td>
                  <td style={{ ...td, fontSize: 12, color: MUTED }}>{a.grantedByName || "—"}</td>
                  <td style={{ ...td, ...MONO, fontSize: 11.5, color: FAINT }}>{a.grantedAt ? formatDateTime(a.grantedAt) : "—"}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {actionable && (
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        {myRole === "owner" && (
                          <button onClick={() => setRoleDialogFor({ userId: a.userId, name: a.name || a.email, currentRole: a.role })} style={btn} data-testid={`team-role-${a.userId}`}>
                            Change role
                          </button>
                        )}
                        {a.status === "suspended" ? (
                          <button onClick={() => reactivate(a.userId)} style={btn} data-testid={`team-reactivate-${a.userId}`}>
                            Reactivate
                          </button>
                        ) : (
                          <button onClick={() => setConfirmAction({ userId: a.userId, name: a.name || a.email, kind: "suspend" })} style={dangerBtn} data-testid={`team-suspend-${a.userId}`}>
                            Suspend
                          </button>
                        )}
                        <button onClick={() => setConfirmAction({ userId: a.userId, name: a.name || a.email, kind: "remove" })} style={dangerBtn} data-testid={`team-remove-${a.userId}`}>
                          Remove
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div>
        <div style={{ ...LABEL, marginBottom: 8 }}>Role reference</div>
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden" }}>
          {ADMIN_ROLES.map((r) => (
            <div key={r} style={{ padding: "10px 14px", borderBottom: `1px solid ${LINE}`, display: "flex", gap: 14 }}>
              <div style={{ ...MONO, fontSize: 12, color: TEXT, width: 90, flexShrink: 0, paddingTop: 1 }}>{r}</div>
              <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>{data.roleReference[r]}</div>
            </div>
          ))}
        </div>
      </div>

      {inviteOpen && (
        <InviteModal
          onClose={() => {
            setInviteOpen(false);
            setInviteError(null);
          }}
          myRole={myRole}
          onInvited={() => {
            setInviteOpen(false);
            invalidate();
          }}
        />
      )}

      {roleDialogFor && (
        <RoleChangeModal
          target={roleDialogFor}
          onClose={() => setRoleDialogFor(null)}
          withStepUp={withStepUp}
          onDone={() => {
            setRoleDialogFor(null);
            invalidate();
          }}
        />
      )}

      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.kind === "suspend" ? `Suspend ${confirmAction.name}?` : `Remove ${confirmAction.name}?`}
          consequence={
            confirmAction.kind === "suspend" ? (
              <>Access is revoked immediately and every active session of theirs is signed out. This is reversible — reactivating restores access with the same role.</>
            ) : (
              <>
                Access is revoked immediately and every active session of theirs is signed out. Their audit-log history is <strong style={{ color: TEXT }}>never deleted</strong> — it stays attached to their
                account permanently.
              </>
            )
          }
          confirmLabel={confirmAction.kind === "suspend" ? "Suspend" : "Remove"}
          requireReason
          onConfirm={async (reason) => {
            await withStepUp(() => adminPost(`/api/admin/team/${confirmAction.userId}/${confirmAction.kind}`, { reason }));
            invalidate();
          }}
          onClose={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

function InviteModal({ onClose, onInvited, myRole }: { onClose: () => void; onInvited: () => void; myRole: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("support");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableRoles = ADMIN_ROLES.filter((r) => (r === "owner" ? myRole === "owner" : true));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminPost("/api/admin/team/invite", { email: email.trim(), role });
      onInvited();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to invite");
      setBusy(false);
    }
  };

  return (
    <Modal onClose={busy ? undefined : onClose}>
      <div style={{ ...LABEL, marginBottom: 10 }}>Invite an admin</div>
      <p style={{ fontSize: 12, color: FAINT, marginTop: 0, marginBottom: 12 }}>
        No password is set here — they get a link, valid 24 hours, and set their own password when they accept. 2FA enrollment is required before the account can do anything.
      </p>
      <input
        type="email"
        placeholder="email@example.com"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", height: 34, borderRadius: 6, border: `1px solid ${LINE}`, background: "rgba(255,255,255,.04)", color: TEXT, fontSize: 13, padding: "0 10px", boxSizing: "border-box", marginBottom: 10 }}
        data-testid="invite-email"
      />
      <select value={role} onChange={(e) => setRole(e.target.value as AdminRole)} style={{ width: "100%", height: 34, borderRadius: 6, border: `1px solid ${LINE}`, background: SURFACE, color: TEXT, fontSize: 13, padding: "0 8px" }} data-testid="invite-role">
        {availableRoles.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {error && <p style={{ color: ALERT, fontSize: 12.5, marginTop: 10 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
        <button onClick={onClose} disabled={busy} style={{ height: 32, padding: "0 12px", borderRadius: 6, border: `1px solid ${LINE}`, background: "transparent", color: MUTED, fontSize: 12.5, cursor: "pointer" }}>
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!email.trim() || busy}
          style={{ height: 32, padding: "0 14px", borderRadius: 6, border: "none", background: EMBER, color: "#1a0e08", fontSize: 12.5, fontWeight: 600, cursor: email.trim() && !busy ? "pointer" : "not-allowed", opacity: email.trim() && !busy ? 1 : 0.5 }}
          data-testid="invite-submit"
        >
          {busy ? "Sending…" : "Send invite"}
        </button>
      </div>
    </Modal>
  );
}

function RoleChangeModal({
  target,
  onClose,
  onDone,
  withStepUp,
}: {
  target: { userId: string; name: string; currentRole: string };
  onClose: () => void;
  onDone: () => void;
  withStepUp: ReturnType<typeof useStepUp>;
}) {
  const [role, setRole] = useState<AdminRole>(target.currentRole as AdminRole);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!reason.trim()) {
      setError("A reason is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await withStepUp(() => adminPatch(`/api/admin/team/${target.userId}/role`, { role, reason: reason.trim() }));
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change role");
      setBusy(false);
    }
  };

  return (
    <Modal onClose={busy ? undefined : onClose}>
      <div style={{ ...LABEL, marginBottom: 10 }}>Change role — {target.name}</div>
      <p style={{ fontSize: 12, color: FAINT, marginTop: 0, marginBottom: 12 }}>
        Currently <span style={{ ...MONO, color: MUTED }}>{target.currentRole}</span>.
      </p>
      <select value={role} onChange={(e) => setRole(e.target.value as AdminRole)} style={{ width: "100%", height: 34, borderRadius: 6, border: `1px solid ${LINE}`, background: SURFACE, color: TEXT, fontSize: 13, padding: "0 8px", marginBottom: 10 }} data-testid="role-change-select">
        {ADMIN_ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <textarea
        placeholder="Reason (required — kept in the audit log)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        style={{ width: "100%", borderRadius: 6, border: `1px solid ${LINE}`, background: "rgba(255,255,255,.04)", color: TEXT, fontSize: 13, padding: 10, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}
        data-testid="role-change-reason"
      />
      {error && <p style={{ color: ALERT, fontSize: 12.5, marginTop: 10 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
        <button onClick={onClose} disabled={busy} style={{ height: 32, padding: "0 12px", borderRadius: 6, border: `1px solid ${LINE}`, background: "transparent", color: MUTED, fontSize: 12.5, cursor: "pointer" }}>
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={busy || role === target.currentRole}
          style={{ height: 32, padding: "0 14px", borderRadius: 6, border: "none", background: EMBER, color: "#1a0e08", fontSize: 12.5, fontWeight: 600, cursor: !busy && role !== target.currentRole ? "pointer" : "not-allowed", opacity: !busy && role !== target.currentRole ? 1 : 0.5 }}
          data-testid="role-change-submit"
        >
          {busy ? "Saving…" : `Change to ${role}`}
        </button>
      </div>
    </Modal>
  );
}
