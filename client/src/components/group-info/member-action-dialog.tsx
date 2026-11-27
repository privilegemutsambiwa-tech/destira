// Group info: what an admin can do to a member (promote, demote, pause, remove).

import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, UserMinus, ShieldCheck, ShieldOff, Hourglass } from "lucide-react";
import { avatarColor } from "@/lib/avatar-color";
import { PAUSE_OPTIONS, pausedUntilLabel } from "@/components/room-moderation";
import { INK, SURFACE2, LINE, MUTED, TEXT, EMBER, SERIF } from "./ui";

// Two steps on purpose: pick what to do, then confirm it in plain words. A
// stray tap can open this menu but can never promote or remove anyone.
export type MemberAction = "promote" | "demote" | "remove" | "pause" | "unpause";

export function MemberActionDialog({ target, busy, canManage, onClose, onPick, onConfirm, onPause }: {
  target: { member: any; action: MemberAction | null } | null;
  busy: boolean;
  /** The owner: roles and removal too. Admins only pause members. */
  canManage: boolean;
  onClose: () => void;
  onPick: (action: MemberAction) => void;
  onConfirm: () => void;
  onPause: (minutes: number) => void;
}) {
  // Keep showing the last member while the dialog animates closed — with
  // `target` already null the content would blank out mid-fade.
  const lastTarget = useRef(target);
  if (target) lastTarget.current = target;
  const shown = target ?? lastTarget.current;
  const member = shown?.member;
  const action = shown?.action ?? null;
  const name = member?.nickname || "this member";
  const isAdminNow = member?.role === "admin";

  const copy = {
    promote: {
      title: `Make ${name} an admin?`,
      body: "Admins can manage members, edit the group's details and settings, and moderate messages. You can take it back any time.",
      confirm: "Make admin",
      danger: false,
    },
    demote: {
      title: `Remove ${name}'s admin role?`,
      body: "They'll stay in the group as a regular member and lose admin controls.",
      confirm: "Remove admin role",
      danger: false,
    },
    remove: {
      title: `Remove ${name} from the group?`,
      body: "They'll lose access to this room and its messages. If the group is open they can rejoin; otherwise they'd need to be invited again.",
      confirm: "Remove from group",
      danger: true,
    },
    pause: {
      title: `Pause ${name}'s messages?`,
      body: "They can still read the room, but can't post until it ends. They'll be told, without your name.",
      confirm: "",
      danger: false,
    },
    unpause: {
      title: `Let ${name} post again?`,
      body: "Their pause ends now.",
      confirm: "Let them post",
      danger: false,
    },
  } as const;
  const paused = !!pausedUntilLabel(member?.mutedUntil);

  const rows: { key: MemberAction; icon: any; label: string; hint: string; danger?: boolean }[] = [
    paused
      ? { key: "unpause", icon: Hourglass, label: "Let them post again", hint: pausedUntilLabel(member?.mutedUntil) ?? "" }
      : { key: "pause", icon: Hourglass, label: "Pause their messages", hint: "1 hour, 1 day or 1 week. They can still read." },
    ...(canManage
      ? [
          isAdminNow
            ? { key: "demote" as const, icon: ShieldOff, label: "Remove admin role", hint: "Keep them as a regular member" }
            : { key: "promote" as const, icon: ShieldCheck, label: "Make admin", hint: "Let them manage members and settings" },
          { key: "remove" as const, icon: UserMinus, label: "Remove from group", hint: "They lose access to this room", danger: true },
        ]
      : []),
  ];

  return (
    <Dialog open={!!target} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent style={{ background: SURFACE2, border: `1px solid ${LINE}` }}>
        {member && action === null && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-base font-bold text-white"
                  style={{ background: avatarColor(member.userId) }}
                >
                  {member.nickname?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="min-w-0 text-left">
                  <DialogTitle style={{ ...SERIF, color: TEXT, fontSize: "20px" }}>{name}</DialogTitle>
                  <DialogDescription className="capitalize" style={{ color: MUTED }}>{member.role}</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-2">
              {rows.map((r) => (
                <button
                  key={r.key}
                  onClick={() => onPick(r.key)}
                  className="w-full flex items-center gap-3 text-left p-3 transition-colors hover:brightness-110"
                  style={{ borderRadius: 12, border: `1px solid ${r.danger ? "rgba(239,68,68,0.3)" : LINE}`, background: r.danger ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.03)" }}
                  data-testid={`member-action-${r.key}`}
                >
                  <span
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: r.danger ? "rgba(239,68,68,0.12)" : "hsl(var(--vf-ember) / 0.14)" }}
                  >
                    <r.icon className="w-4 h-4" style={{ color: r.danger ? "#EF4444" : EMBER }} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold" style={{ color: r.danger ? "#EF4444" : TEXT }}>{r.label}</div>
                    <div className="text-xs mt-0.5" style={{ color: MUTED }}>{r.hint}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {member && action !== null && (
          <>
            <DialogHeader>
              <DialogTitle style={{ ...SERIF, color: TEXT, fontSize: "20px" }}>{copy[action].title}</DialogTitle>
              <DialogDescription style={{ color: MUTED }}>{copy[action].body}</DialogDescription>
            </DialogHeader>
            {action === "pause" && (
              <div className="space-y-2">
                {PAUSE_OPTIONS.map((o) => (
                  <button
                    key={o.minutes}
                    onClick={() => onPause(o.minutes)}
                    disabled={busy}
                    className="w-full p-3 text-sm font-semibold text-left disabled:opacity-60"
                    style={{ borderRadius: 12, border: `1px solid ${LINE}`, color: TEXT, background: "rgba(255,255,255,0.03)" }}
                    data-testid={`pause-${o.minutes}`}
                  >
                    For {o.label}
                  </button>
                ))}
              </div>
            )}
            <DialogFooter className="gap-2">
              <button
                className="px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={{ color: MUTED }}
                onClick={onClose}
                disabled={busy}
                data-testid="button-member-action-cancel"
              >
                Cancel
              </button>
              {action !== "pause" && <button
                className="px-4 py-2 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                style={{
                  background: copy[action].danger ? "#EF4444" : EMBER,
                  color: copy[action].danger ? "#fff" : INK,
                  borderRadius: "10px",
                  border: "none",
                }}
                onClick={action === "unpause" ? () => onPause(0) : onConfirm}
                disabled={busy}
                data-testid="button-member-action-confirm"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {copy[action].confirm}
              </button>}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
