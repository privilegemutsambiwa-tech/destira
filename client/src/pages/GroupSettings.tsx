import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { useGroup, useUpdateGroup, useUpdateGroupSettings } from "@/hooks/use-interactions";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function GroupSettings({ params }: { params?: { groupId?: string } }) {
  const groupId = Number(params?.groupId);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: group, isLoading } = useGroup(groupId);
  const updateGroup = useUpdateGroup(groupId);
  const updateSettings = useUpdateGroupSettings(groupId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rulesText, setRulesText] = useState("");
  const [privacyMode, setPrivacyMode] = useState("open");
  const [postingPermission, setPostingPermission] = useState("everyone");
  const [mediaPermission, setMediaPermission] = useState("everyone");
  const [canMembersAddOthers, setCanMembersAddOthers] = useState(true);
  const [canMembersSendMessages, setCanMembersSendMessages] = useState(true);
  const [canMembersEditInfo, setCanMembersEditInfo] = useState(true);
  const [maxMembers, setMaxMembers] = useState<number | "">(500);
  useEffect(() => {
    if (!group) return;
    setName(group.name || "");
    setDescription(group.description || "");
    setRulesText(group.rulesText || "");
    setPrivacyMode(group.privacyMode || "open");
    setPostingPermission(group.postingPermission || "everyone");
    setMediaPermission(group.mediaPermission || "everyone");
    setCanMembersAddOthers(group.canMembersAddOthers ?? true);
    setCanMembersSendMessages(group.canMembersSendMessages ?? true);
    setCanMembersEditInfo(group.canMembersEditInfo ?? true);
    setMaxMembers(group.maxMembers || 500);
  }, [group?.id]);

  if (!groupId || isNaN(groupId)) {
    setLocation("/lounge");
    return null;
  }

  const isAdmin = group?.myRole === "owner" || group?.myRole === "admin";

  if (!isLoading && !isAdmin) {
    setLocation(`/lounge/group/${groupId}`);
    return null;
  }

  if (isLoading) {
    return (
      <div className="h-dvh flex items-center justify-center" style={{ background: "#0F0F14" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#7C3AED" }} />
      </div>
    );
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Error", description: "Group name is required.", variant: "destructive" });
      return;
    }
    try {
      await updateGroup.mutateAsync({ name: name.trim(), description });
      await updateSettings.mutateAsync({
        rulesText,
        privacyMode,
        postingPermission,
        mediaPermission,
        canMembersAddOthers,
        canMembersSendMessages,
        canMembersEditInfo,
        maxMembers: maxMembers === "" ? 500 : Number(maxMembers),
      });
      toast({ title: "Settings saved" });
      setLocation(`/lounge/group/${groupId}/info`);
    } catch {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    }
  };

  const isPending = updateGroup.isPending || updateSettings.isPending;

  return (
    <div className="h-dvh flex flex-col" style={{ background: "#0F0F14" }}>
      <div
        className="px-4 py-3 flex items-center gap-3 sticky top-0 z-50"
        style={{ background: "#1A1A24", borderBottom: "1px solid #2E2E42" }}
      >
        <button
          onClick={() => setLocation(`/lounge/group/${groupId}/info`)}
          className="w-9 h-9 flex items-center justify-center btn-press rounded-full"
          style={{ color: "#FFFFFF", background: "transparent" }}
          data-testid="button-back-settings"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="font-bold text-white flex-1" style={{ fontSize: "15px" }}>Group Settings</h2>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold btn-press"
          style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)", color: "#fff" }}
          data-testid="button-save-settings"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-lg mx-auto w-full">
        <div
          style={{ background: "#1A1A24", border: "1px solid #2E2E42", borderRadius: "12px", padding: "16px" }}
        >
          <p className="text-xs font-semibold uppercase mb-3" style={{ color: "#9090A8", letterSpacing: "0.5px" }}>Basic Info</p>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-white block mb-1">Group Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                style={{ background: "#242433", border: "1px solid #2E2E42", color: "#FFFFFF" }}
                data-testid="input-group-name"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-white block mb-1">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="resize-none"
                style={{ background: "#242433", border: "1px solid #2E2E42", color: "#FFFFFF" }}
                data-testid="input-group-description"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-white block mb-1">Rules</label>
              <Textarea
                value={rulesText}
                onChange={(e) => setRulesText(e.target.value)}
                rows={4}
                className="resize-none"
                style={{ background: "#242433", border: "1px solid #2E2E42", color: "#FFFFFF" }}
                data-testid="input-group-rules"
              />
            </div>
          </div>
        </div>

        <div
          style={{ background: "#1A1A24", border: "1px solid #2E2E42", borderRadius: "12px", padding: "16px" }}
        >
          <p className="text-xs font-semibold uppercase mb-3" style={{ color: "#9090A8", letterSpacing: "0.5px" }}>Join Mode</p>
          <Select value={privacyMode} onValueChange={setPrivacyMode}>
            <SelectTrigger style={{ background: "#242433", border: "1px solid #2E2E42", color: "#FFFFFF" }} data-testid="select-privacy-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open — anyone can join</SelectItem>
              <SelectItem value="request-to-join">Request to Join — admin approval required</SelectItem>
              <SelectItem value="invite-only">Invite Only — link or admin add only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div
          style={{ background: "#1A1A24", border: "1px solid #2E2E42", borderRadius: "12px", padding: "16px" }}
        >
          <p className="text-xs font-semibold uppercase mb-3" style={{ color: "#9090A8", letterSpacing: "0.5px" }}>Permissions</p>
          <div className="space-y-4">
            {[
              { label: "Members can send messages", value: canMembersSendMessages, onChange: setCanMembersSendMessages, testId: "switch-members-send" },
              { label: "Members can edit group info", value: canMembersEditInfo, onChange: setCanMembersEditInfo, testId: "switch-members-edit-info" },
              { label: "Members can add others", value: canMembersAddOthers, onChange: setCanMembersAddOthers, testId: "switch-members-add" },
            ].map((s) => (
              <div key={s.testId} className="flex items-center justify-between gap-2">
                <label className="text-sm text-white">{s.label}</label>
                <Switch checked={s.value} onCheckedChange={s.onChange} data-testid={s.testId} />
              </div>
            ))}
            <div style={{ height: "1px", background: "#2E2E42" }} />
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm text-white">Who can post</label>
              <Select value={postingPermission} onValueChange={setPostingPermission}>
                <SelectTrigger className="w-36" style={{ background: "#242433", border: "1px solid #2E2E42", color: "#FFFFFF" }} data-testid="select-posting-perm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyone">Everyone</SelectItem>
                  <SelectItem value="admins_only">Admins Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm text-white">Who can post media</label>
              <Select value={mediaPermission} onValueChange={setMediaPermission}>
                <SelectTrigger className="w-36" style={{ background: "#242433", border: "1px solid #2E2E42", color: "#FFFFFF" }} data-testid="select-media-perm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyone">Everyone</SelectItem>
                  <SelectItem value="admin_only">Admin Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm text-white">Max members</label>
              <Input
                type="number"
                value={maxMembers}
                onChange={(e) => setMaxMembers(e.target.value === "" ? "" : Math.max(2, Math.min(5000, parseInt(e.target.value) || 2)))}
                className="w-24 text-right"
                min={2}
                max={5000}
                style={{ background: "#242433", border: "1px solid #2E2E42", color: "#FFFFFF" }}
                data-testid="input-max-members"
              />
            </div>
          </div>
        </div>

        <div className="pb-8" />
      </div>
    </div>
  );
}
