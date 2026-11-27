// Group info: the admin-only cards. Invite links, and the group's settings.

import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Link2, Copy, Check, Settings } from "lucide-react";
import { SURFACE2, ELEVATED, LINE, MUTED, TEXT, EMBER } from "./ui";

export function InviteLinksCard({ createInvite, handleCreateInvite, inviteLink, makeInviteUrl, handleCopyLink, copiedLink }: {
  createInvite: { isPending: boolean };
  handleCreateInvite: () => void;
  inviteLink: any;
  makeInviteUrl: (token: string) => string;
  handleCopyLink: (token: string) => void;
  copiedLink: string | null;
}) {
  return (
        <div
          style={{ background: SURFACE2, border: `1px solid ${LINE}`, borderRadius: "12px", padding: "16px" }}
          data-testid="card-invite-links"
        >
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="w-4 h-4" style={{ color: MUTED }} />
            <span className="text-sm font-medium text-foreground">Invite Links</span>
          </div>
          <button
            onClick={handleCreateInvite}
            disabled={createInvite.isPending}
            className="w-full flex items-center justify-center gap-2 text-sm font-medium btn-press"
            style={{
              height: "40px",
              borderRadius: "10px",
              background: ELEVATED,
              border: `1px solid ${LINE}`,
              color: TEXT,
            }}
            data-testid="button-create-invite"
          >
            {createInvite.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Generate Invite Link
          </button>
          {inviteLink && inviteLink.isActive && (
            <div className="flex items-center gap-2 mt-3">
              <input
                value={makeInviteUrl(inviteLink.token)}
                readOnly
                className="text-xs flex-1 px-3 py-2 outline-none"
                style={{ background: ELEVATED, border: `1px solid ${LINE}`, borderRadius: "8px", color: MUTED }}
                data-testid="input-invite-link"
              />
              <button
                onClick={() => handleCopyLink(inviteLink.token)}
                className="w-9 h-9 flex items-center justify-center rounded-lg btn-press"
                style={{ background: ELEVATED, border: `1px solid ${LINE}`, color: TEXT }}
                data-testid="button-copy-invite-link"
              >
                {copiedLink === inviteLink.token ? <Check className="w-4 h-4" style={{ color: "#22C55E" }} /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
  );
}

export function GroupSettingsCard({ setLocation, groupId, group, handleSettingToggle, handleSettingSelect }: {
  setLocation: (to: string) => void;
  groupId: number;
  group: any;
  handleSettingToggle: (key: string, value: boolean) => void;
  handleSettingSelect: (key: string, value: string) => void;
}) {
  return (
        <div
          style={{ background: SURFACE2, border: `1px solid ${LINE}`, borderRadius: "12px", padding: "16px" }}
          data-testid="card-group-settings"
        >
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4" style={{ color: MUTED }} />
              <span className="text-sm font-medium text-foreground">Group Settings</span>
            </div>
            <button
              onClick={() => setLocation(`/lounge/group/${groupId}/settings`)}
              className="text-xs font-medium btn-press px-3 py-1 rounded-full"
              style={{ background: ELEVATED, color: EMBER, border: `1px solid ${LINE}` }}
              data-testid="button-open-full-settings"
            >
              Full Settings
            </button>
          </div>
          <div className="space-y-4">
            {[
              { label: "Members can send messages", key: "canMembersSendMessages", value: group?.canMembersSendMessages ?? true, testId: "switch-send-messages" },
              { label: "Members can edit group info", key: "canMembersEditInfo", value: group?.canMembersEditInfo ?? true, testId: "switch-edit-info" },
              { label: "Members can add others", key: "canMembersAddOthers", value: group?.canMembersAddOthers ?? true, testId: "switch-add-others" },
            ].map((setting) => (
              <div key={setting.key} className="flex items-center justify-between gap-2">
                <label className="text-sm text-foreground">{setting.label}</label>
                <Switch
                  checked={setting.value}
                  onCheckedChange={(v) => handleSettingToggle(setting.key, v)}
                  data-testid={setting.testId}
                />
              </div>
            ))}
            <div style={{ height: "1px", background: LINE }} />
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm text-foreground">Posting permission</label>
              <Select
                value={group?.postingPermission || "everyone"}
                onValueChange={(v) => handleSettingSelect("postingPermission", v)}
              >
                <SelectTrigger className="w-36" data-testid="select-posting-permission" style={{ background: ELEVATED, border: `1px solid ${LINE}` }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyone">Everyone</SelectItem>
                  <SelectItem value="admins_only">Admins Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm text-foreground">Media permission</label>
              <Select
                value={group?.mediaPermission || "everyone"}
                onValueChange={(v) => handleSettingSelect("mediaPermission", v)}
              >
                <SelectTrigger className="w-36" data-testid="select-media-permission" style={{ background: ELEVATED, border: `1px solid ${LINE}` }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyone">Everyone</SelectItem>
                  <SelectItem value="admin_only">Admin Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
  );
}
