// Group info: add a member, search messages, edit the description and rules,
// share the invite link, and leave.

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { INK, SURFACE2, ELEVATED, LINE, MUTED, TEXT, EMBER, SERIF } from "./ui";

export function AddMemberDialog({ addMemberOpen, setAddMemberOpen, addMemberQuery, setAddMemberQuery, userSearchResults, handleAddMember, addGroupMember }: {
  addMemberOpen: boolean;
  setAddMemberOpen: (open: boolean) => void;
  addMemberQuery: string;
  setAddMemberQuery: (q: string) => void;
  userSearchResults: unknown;
  handleAddMember: (userId: string) => void;
  addGroupMember: { isPending: boolean };
}) {
  return (
    <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
      <DialogContent style={{ background: SURFACE2, border: `1px solid ${LINE}` }}>
        <DialogHeader>
          <DialogTitle style={{ ...SERIF, color: TEXT }}>Add Member</DialogTitle>
          <DialogDescription style={{ color: MUTED }}>Search for a user to add to the group.</DialogDescription>
        </DialogHeader>
        <Input
          placeholder="Search by name or nickname..."
          value={addMemberQuery}
          onChange={(e) => setAddMemberQuery(e.target.value)}
          style={{ background: ELEVATED, border: `1px solid ${LINE}`, color: TEXT }}
          data-testid="input-add-member-search"
        />
        <div className="space-y-1 max-h-64 overflow-y-auto mt-1">
          {addMemberQuery.trim().length >= 2 && ((userSearchResults as { userId: string; displayName: string; groupNickname?: string }[]) || []).length === 0 && (
            <p className="text-sm text-center py-4" style={{ color: MUTED }}>No users found</p>
          )}
          {((userSearchResults as { userId: string; displayName: string; groupNickname?: string }[]) || []).map((u) => (
            <div
              key={u.userId}
              className="flex items-center justify-between gap-3 py-2 px-1 rounded-lg"
              data-testid={`result-user-${u.userId}`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-foreground"
                  style={{ background: ELEVATED, border: `1px solid ${LINE}` }}
                >
                  {(u.displayName || "?")[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{u.displayName}</p>
                  {u.groupNickname && <p className="text-xs" style={{ color: MUTED }}>@{u.groupNickname}</p>}
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => handleAddMember(u.userId)}
                disabled={addGroupMember.isPending}
                style={{ background: EMBER, border: "none", color: INK, height: "32px", fontSize: "12px" }}
                data-testid={`button-add-user-${u.userId}`}
              >
                Add
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SearchMessagesDialog({ searchOpen, setSearchOpen, searchQuery, setSearchQuery, messageSearchResults, setLocation, groupId }: {
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  messageSearchResults: unknown;
  setLocation: (to: string) => void;
  groupId: number;
}) {
  return (
    <Dialog open={searchOpen} onOpenChange={(open) => { setSearchOpen(open); if (!open) setSearchQuery(""); }}>
      <DialogContent style={{ background: SURFACE2, border: `1px solid ${LINE}` }}>
        <DialogHeader>
          <DialogTitle style={{ ...SERIF, color: TEXT }}>Search Messages</DialogTitle>
          <DialogDescription style={{ color: MUTED }}>Find messages in this group.</DialogDescription>
        </DialogHeader>
        <Input
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ background: ELEVATED, border: `1px solid ${LINE}`, color: TEXT }}
          data-testid="input-search-messages"
        />
        <div className="space-y-2 max-h-80 overflow-y-auto mt-1">
          {searchQuery.trim().length > 0 && ((messageSearchResults as { id: number; content: string; nickname?: string; createdAt?: string }[]) || []).length === 0 && (
            <p className="text-sm text-center py-4" style={{ color: MUTED }}>No messages found</p>
          )}
          {((messageSearchResults as { id: number; content: string; nickname?: string; createdAt?: string }[]) || []).map((msg) => (
            <button
              key={msg.id}
              className="w-full text-left rounded-lg p-3 btn-press"
              style={{ background: ELEVATED }}
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery("");
                setLocation(`/lounge/group/${groupId}?msg=${msg.id}`);
              }}
              data-testid={`search-result-${msg.id}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-foreground">{msg.nickname || "Unknown"}</span>
                <span className="text-xs" style={{ color: MUTED }}>
                  {msg.createdAt ? new Date(msg.createdAt).toLocaleDateString() : ""}
                </span>
              </div>
              <p className="text-sm" style={{ color: MUTED }}>{msg.content}</p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EditAboutDialog({ editDescOpen, setEditDescOpen, editDesc, setEditDesc, editRules, setEditRules, handleSaveDescRules, updateGroup, updateSettings }: {
  editDescOpen: boolean;
  setEditDescOpen: (open: boolean) => void;
  editDesc: string;
  setEditDesc: (v: string) => void;
  editRules: string;
  setEditRules: (v: string) => void;
  handleSaveDescRules: () => void;
  updateGroup: { isPending: boolean };
  updateSettings: { isPending: boolean };
}) {
  return (
    <Dialog open={editDescOpen} onOpenChange={setEditDescOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Description & Rules</DialogTitle>
          <DialogDescription>Update your group description and rules.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Description</label>
            <Textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              className="resize-none"
              rows={3}
              data-testid="input-edit-description"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Rules</label>
            <Textarea
              value={editRules}
              onChange={(e) => setEditRules(e.target.value)}
              className="resize-none"
              rows={4}
              data-testid="input-edit-rules"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditDescOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSaveDescRules}
            disabled={updateGroup.isPending || updateSettings.isPending}
            style={{ background: EMBER, border: "none", color: INK }}
            data-testid="button-save-desc-rules"
          >
            {(updateGroup.isPending || updateSettings.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ShareLinkDialog({ shareDialogOpen, setShareDialogOpen, shareLink, handleCopyShareLink }: {
  shareDialogOpen: boolean;
  setShareDialogOpen: (open: boolean) => void;
  shareLink: string;
  handleCopyShareLink: () => void;
}) {
  return (
    <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
      <DialogContent style={{ background: SURFACE2, border: `1px solid ${LINE}` }}>
        <DialogHeader>
          <DialogTitle style={{ ...SERIF, color: TEXT }}>Invite Link</DialogTitle>
          <DialogDescription style={{ color: MUTED }}>Share this link to invite people to the group.</DialogDescription>
        </DialogHeader>
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm break-all"
          style={{ background: ELEVATED, border: `1px solid ${LINE}`, color: MUTED }}
          data-testid="text-share-link"
        >
          {shareLink}
        </div>
        <DialogFooter>
          <Button
            onClick={handleCopyShareLink}
            style={{ background: EMBER, border: "none", color: INK }}
            data-testid="button-copy-share-link"
          >
            Copy Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LeaveGroupDialog({ leaveConfirmOpen, setLeaveConfirmOpen, group, handleLeave }: {
  leaveConfirmOpen: boolean;
  setLeaveConfirmOpen: (open: boolean) => void;
  group: any;
  handleLeave: () => void;
}) {
  return (
    <Dialog open={leaveConfirmOpen} onOpenChange={setLeaveConfirmOpen}>
      <DialogContent style={{ background: SURFACE2, border: `1px solid ${LINE}` }}>
        <DialogHeader>
          <DialogTitle style={{ ...SERIF, color: TEXT }}>Leave {group?.name || "this group"}?</DialogTitle>
          <DialogDescription style={{ color: MUTED }}>
            You'll stop seeing this room. You can rejoin later if it's open or you're invited back.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <button
            className="px-4 py-2 text-sm font-medium"
            style={{ color: MUTED }}
            onClick={() => setLeaveConfirmOpen(false)}
            data-testid="button-cancel-leave"
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 text-sm font-semibold"
            style={{ background: EMBER, color: INK, borderRadius: "10px", border: "none" }}
            onClick={() => { setLeaveConfirmOpen(false); handleLeave(); }}
            data-testid="button-confirm-leave"
          >
            Leave group
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
