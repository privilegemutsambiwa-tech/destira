// Settings > Privacy: blocked members and your data.

import { useState } from "react";
import { Shield, ChevronRight, Trash2, ChevronDown, ChevronUp, Download, UserX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { pressable } from "@/lib/a11y";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CARD, ELEVATED, BORDER, MUTED, FAINT, TEXT, EMBER, MONO_EYEBROW, ROW_STYLE, Panel, GradientButton } from "./ui";

export function BlockListPanel({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: blockedList = [] } = useQuery<any[]>({ queryKey: ["/api/users/blocked"] });

  const unblockMutation = useMutation({
    mutationFn: (targetUserId: string) => apiRequest("DELETE", `/api/users/block/${targetUserId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/blocked"] });
      toast({ title: "User unblocked" });
    },
    onError: () => toast({ title: "Failed to unblock", variant: "destructive" }),
  });

  return (
    <Panel title="Block List" onBack={onBack}>
      {blockedList.length === 0 ? (
        <div
          className="vf-card flex flex-col items-center justify-center text-center"
          style={{ margin: "16px 16px 0", borderRadius: "16px", background: CARD, padding: "48px 24px" }}
        >
          <div style={{
            width: "56px", height: "56px", borderRadius: "50%", background: ELEVATED,
            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px",
          }}>
            <Shield className="w-6 h-6" style={{ color: MUTED }} />
          </div>
          <p className="text-sm font-medium" style={{ color: TEXT }}>No blocked users</p>
          <p className="text-xs mt-1" style={{ color: MUTED }}>Anyone you block will show up here.</p>
        </div>
      ) : (
        <div className="vf-card" style={{ margin: "16px 16px 0", borderRadius: "16px", overflow: "hidden", background: CARD }}>
          {blockedList.map((entry: any, i: number) => (
            <div key={entry.id} style={{
              display: "flex", alignItems: "center", padding: "12px 16px",
              borderBottom: i < blockedList.length - 1 ? `1px solid ${BORDER}` : "none",
            }}>
              <div style={{
                width: "36px", height: "36px", borderRadius: "50%",
                background: ELEVATED, display: "flex", alignItems: "center", justifyContent: "center", marginRight: "12px",
                overflow: "hidden", flexShrink: 0,
              }}>
                {entry.photoUrl
                  ? <img src={entry.photoUrl} alt={entry.displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <UserX className="w-4 h-4" style={{ color: MUTED }} />
                }
              </div>
              <span className="flex-1 text-sm text-foreground" data-testid={`text-blocked-name-${entry.blockedId}`}>{entry.displayName || entry.blockedId}</span>
              <button
                onClick={() => unblockMutation.mutate(entry.blockedId)}
                className="text-xs font-semibold px-3 py-1 btn-press transition-colors duration-150"
                style={{ color: EMBER, border: `1px solid rgba(255,107,74,0.4)`, borderRadius: "8px" }}
                data-testid={`button-unblock-${entry.blockedId}`}
              >
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

const COLLECTED_DATA_ITEMS = [
  "Profile information (name, age, bio, location)",
  "Personality assessment answers and derived profile",
  "AI Twin memory — facts, summaries, and conversation history",
  "Match history and interaction data",
  "Group membership and activity",
  "Approximate location, only while the app is open and only if you turn on proximity alerts — kept as a single latest point, resolved to a named place, and erased after 30 minutes. No trail, no map, no direction.",
  "Usage data for app improvement (no personal identifiers)",
  "Support ticket content",
];

export function DataPrivacyPanel({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [showCollect, setShowCollect] = useState(false);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/account", { confirmation: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Account deleted", description: "All your data has been erased." });
      window.location.href = "/";
    },
    onError: () => toast({ title: "Deletion failed", variant: "destructive" }),
  });

  const handleExport = async () => {
    try {
      const response = await fetch("/api/account/export-data");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "destira-data.json";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Data exported" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  if (deleteStep === 1) {
    return (
      <Panel title="Delete all data" onBack={() => setDeleteStep(0)}>
        <div style={{ padding: "16px" }}>
          <div
            className="vf-card"
            style={{ background: CARD, border: "1px solid rgba(239,68,68,0.3)", borderRadius: "16px", padding: "24px 20px", marginBottom: "16px" }}
          >
            <div className="text-center mb-6">
              <div style={{
                width: "60px", height: "60px", borderRadius: "50%", background: "rgba(239,68,68,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px",
              }}>
                <Trash2 className="w-7 h-7" style={{ color: "var(--vf-danger)" }} />
              </div>
              <p className="font-semibold text-foreground mb-1">This is permanent</p>
              <p className="text-sm" style={{ color: MUTED }}>All your profile data, matches, Twin memory, and account will be permanently deleted. This cannot be undone.</p>
            </div>
            <div>
              <label style={{ ...MONO_EYEBROW, color: FAINT, marginBottom: "8px", display: "block" }}>Type DELETE to confirm</label>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full px-3 py-2 text-sm text-foreground vf-input-focus"
                style={{ background: ELEVATED, border: `1px solid var(--vf-danger)`, borderRadius: "10px", outline: "none" }}
                data-testid="input-delete-confirm"
              />
            </div>
          </div>
          <GradientButton
            label={deleteMutation.isPending ? "Deleting..." : "Permanently Delete Everything"}
            onClick={() => deleteMutation.mutate()}
            disabled={deleteConfirmText !== "DELETE" || deleteMutation.isPending}
            danger
            testId="button-confirm-delete-all"
          />
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Your data" onBack={onBack}>
      <p className="text-sm px-4 pt-4 pb-2" style={{ color: MUTED }}>
        You own your data. Download or delete everything at any time.
      </p>
      <div className="vf-card" style={{ margin: "12px 16px", borderRadius: "16px", overflow: "hidden", background: CARD }}>
        <div
          className="vf-row"
          style={{ ...ROW_STYLE, cursor: "pointer" }}
          {...pressable(() => setShowCollect(v => !v), { expanded: showCollect })}
          data-testid="row-what-we-collect"
        >
          <Shield className="w-5 h-5 mr-3" style={{ color: MUTED }} />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">What We Collect</p>
            <p className="text-xs" style={{ color: MUTED }}>See all data categories we store</p>
          </div>
          {showCollect ? <ChevronUp className="w-4 h-4" style={{ color: MUTED }} /> : <ChevronDown className="w-4 h-4" style={{ color: MUTED }} />}
        </div>
        {showCollect && (
          <div style={{ padding: "0 16px 14px", borderBottom: `1px solid ${BORDER}` }}>
            {COLLECTED_DATA_ITEMS.map((item, i) => (
              <div key={i} className="flex items-start gap-2 py-1.5">
                <span style={{ color: FAINT, marginTop: "2px" }}>•</span>
                <p className="text-xs" style={{ color: MUTED }}>{item}</p>
              </div>
            ))}
          </div>
        )}
        <div className="vf-row" style={ROW_STYLE} {...pressable(handleExport)} data-testid="row-export-data">
          <Download className="w-5 h-5 mr-3" style={{ color: MUTED }} />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Export My Data</p>
            <p className="text-xs" style={{ color: MUTED }}>Download a JSON file of your profile and data</p>
          </div>
          <ChevronRight className="w-4 h-4" style={{ color: MUTED }} />
        </div>
        <div className="vf-row" style={{ ...ROW_STYLE, borderBottom: "none" }} {...pressable(() => setDeleteStep(1))} data-testid="row-delete-data">
          <Trash2 className="w-5 h-5 mr-3" style={{ color: "var(--vf-danger)" }} />
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: "var(--vf-danger)" }}>Delete all data</p>
            <p className="text-xs" style={{ color: MUTED }}>Permanently erase your account</p>
          </div>
          <ChevronRight className="w-4 h-4" style={{ color: MUTED }} />
        </div>
      </div>
    </Panel>
  );
}
