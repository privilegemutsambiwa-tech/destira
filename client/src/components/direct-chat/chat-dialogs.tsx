import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VfButton, VfSheet } from "@/components/ui-vf";

/** Report the person, or one of their messages, to the team. */
export function ReportDialog({
  target,
  otherFirst,
  reason,
  busy,
  onReasonChange,
  onClose,
  onSubmit,
}: {
  target: { userId: string; messageId?: number } | null;
  otherFirst: string;
  reason: string;
  busy: boolean;
  onReasonChange: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={!!target} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{target?.messageId != null ? "Report this message" : `Report ${otherFirst}`}</DialogTitle>
          <DialogDescription>
            {target?.messageId != null
              ? "This sends a record to our team for review, citing this exact message."
              : "This sends a record to our team for review."}
          </DialogDescription>
        </DialogHeader>
        <textarea
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="What's going on? (optional)"
          rows={3}
          className="w-full rounded-[12px] border border-vf-line bg-vf-surface2 p-3 text-sm text-vf-text outline-none resize-none"
          data-testid="input-dm-report-reason"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="button-cancel-dm-report">
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={busy} data-testid="button-submit-dm-report">
            {busy ? "Sending…" : "Send report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Block X?" / "Unmatch with X?" before it happens. */
export function ConfirmChatAction({
  confirm,
  otherFirst,
  pending,
  onConfirm,
  onClose,
}: {
  confirm: "block" | "unmatch" | null;
  otherFirst: string;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <VfSheet
      open={!!confirm}
      onOpenChange={(o) => !o && onClose()}
      title={confirm === "block" ? `Block ${otherFirst}?` : `Unmatch with ${otherFirst}?`}
      description={
        confirm === "block"
          ? "They won't be able to message you or see you on Destira."
          : "This chat closes and they leave your matches."
      }
      footer={
        <div className="flex flex-col gap-2">
          <VfButton variant="destructive" fullWidth loading={pending} onClick={onConfirm} data-testid="button-confirm-chat-action">
            {confirm === "block" ? "Block" : "Unmatch"}
          </VfButton>
          <VfButton variant="quiet" size="sm" fullWidth onClick={onClose}>Cancel</VfButton>
        </div>
      }
    />
  );
}
