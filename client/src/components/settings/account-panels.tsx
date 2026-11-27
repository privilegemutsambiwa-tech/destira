// Settings > Account: change email and password.

import { useState } from "react";
import { Mail } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CARD, ELEVATED, BORDER, MUTED, FAINT, TEXT, EMBER, INK, SERIF, MONO_EYEBROW, Panel, GradientButton } from "./ui";

export function ChangeEmailPanel({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [done, setDone] = useState(false);

  const updateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/account/change-email", {
      newEmail: email,
      currentPassword,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setDone(true);
      toast({ title: "Email updated", description: "Your account email has been changed." });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Failed to update email";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!email || !email.includes("@")) {
      toast({ title: "Please enter a valid email address", variant: "destructive" });
      return;
    }
    if (!currentPassword) {
      toast({ title: "Current password required", description: "Confirm your password to change your email.", variant: "destructive" });
      return;
    }
    updateMutation.mutate();
  };

  return (
    <Panel title="Change Email" onBack={onBack}>
      <div style={{ padding: "16px" }}>
        <p className="text-sm mb-4" style={{ color: MUTED }}>
          Enter your new email address and confirm your password to update it.
        </p>
        {done ? (
          <div className="text-center py-8">
            <div style={{
              width: "60px", height: "60px", borderRadius: "50%", background: EMBER,
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
            }}>
              <Mail className="w-7 h-7" style={{ color: INK }} />
            </div>
            <p className="mb-2" style={{ ...SERIF, color: TEXT, fontSize: "18px" }}>Email updated</p>
            <p className="text-sm" style={{ color: MUTED }}>Your account email is now <strong style={{ color: TEXT }}>{email}</strong></p>
          </div>
        ) : (
          <>
            <div className="vf-card" style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "16px", padding: "16px", marginBottom: "16px" }}>
              <div style={{ marginBottom: "14px" }}>
                <label style={{ ...MONO_EYEBROW, color: FAINT, marginBottom: "8px", display: "block" }}>New Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="new@example.com"
                  className="w-full px-3 py-2 text-sm text-foreground vf-input-focus"
                  style={{ background: ELEVATED, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
                  data-testid="input-new-email"
                />
              </div>
              <div>
                <label style={{ ...MONO_EYEBROW, color: FAINT, marginBottom: "8px", display: "block" }}>Current Password</label>
                <PasswordInput
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-sm text-foreground vf-input-focus"
                  style={{ background: ELEVATED, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
                  data-testid="input-email-current-password"
                />
              </div>
            </div>
            <GradientButton
              label={updateMutation.isPending ? "Updating..." : "Update Email"}
              onClick={handleSubmit}
              testId="button-send-email-verify"
            />
          </>
        )}
      </div>
    </Panel>
  );
}

export function ChangePasswordPanel({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");

  const updateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/account/change-password", {
      currentPassword: current,
      newPassword: newPass,
    }),
    onSuccess: () => {
      toast({ title: "Password updated", description: "Your password has been changed successfully." });
      setCurrent(""); setNewPass(""); setConfirm("");
      onBack();
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Failed to update password";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!current) {
      toast({ title: "Current password required", variant: "destructive" });
      return;
    }
    if (newPass.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (newPass !== confirm) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    updateMutation.mutate();
  };

  return (
    <Panel title="Change Password" onBack={onBack}>
      <div style={{ padding: "16px" }}>
        <p className="text-sm mb-4" style={{ color: MUTED }}>
          Choose a strong password with at least 8 characters.
        </p>
        <div className="vf-card" style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "16px", padding: "16px", marginBottom: "16px" }}>
          <div style={{ marginBottom: "14px" }}>
            <label style={{ ...MONO_EYEBROW, color: FAINT, marginBottom: "8px", display: "block" }}>Current Password</label>
            <PasswordInput
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 text-sm text-foreground vf-input-focus"
              style={{ background: ELEVATED, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
              data-testid="input-current-password"
            />
          </div>
          <div style={{ marginBottom: "14px" }}>
            <label style={{ ...MONO_EYEBROW, color: FAINT, marginBottom: "8px", display: "block" }}>New Password</label>
            <PasswordInput
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 text-sm text-foreground vf-input-focus"
              style={{ background: ELEVATED, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
              data-testid="input-new-password"
            />
          </div>
          <div>
            <label style={{ ...MONO_EYEBROW, color: FAINT, marginBottom: "8px", display: "block" }}>Confirm New Password</label>
            <PasswordInput
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 text-sm text-foreground vf-input-focus"
              style={{ background: ELEVATED, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
              data-testid="input-confirm-password"
            />
          </div>
        </div>
        <GradientButton label={updateMutation.isPending ? "Updating..." : "Update Password"} onClick={handleSubmit} testId="button-update-password" />
      </div>
    </Panel>
  );
}
