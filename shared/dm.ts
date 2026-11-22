// Direct-message extras shared by the server (server/dm-extras.ts) and the
// chat screen: reactions, edit and unsend, photos and voice notes.

/** Edit or unsend: only the sender, only this long after sending. */
export const DM_EDIT_WINDOW_MS = 10 * 60 * 1000;

/** The quick reactions, in the order the picker shows them. */
export const DM_REACTIONS = ["❤️", "😂", "😮", "😢", "🔥", "👍"] as const;

/** Voice notes stop recording here. */
export const VOICE_MAX_MS = 60 * 1000;
/** Opus at this rate is ~180 KB a minute: fine on a slow connection. */
export const VOICE_BITS_PER_SECOND = 24_000;
/** Upload caps (bytes). A voice note is well under this at the rate above. */
export const VOICE_MAX_BYTES = 1.5 * 1024 * 1024;
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

export const DM_TEXT_MAX = 4000;

export type DmContentType = "text" | "photo" | "voice";

/** What the chat gets for each message (never the stored key or original). */
export interface DmMessageView {
  id: number;
  matchId: number;
  senderId: string;
  content: string;
  contentType: DmContentType;
  createdAt: string;
  editedAt: string | null;
  unsentAt: string | null;
  clientId: string | null;
  isDeletedByAdmin: boolean | null;
  /** Photo or voice: can this viewer still load it from /api/dm/media/:id? */
  mediaAvailable: boolean;
  viewOnce: boolean;
  /** A view-once photo the recipient has opened. */
  viewed: boolean;
  durationMs: number | null;
  reactions: { userId: string; emoji: string }[];
}

export function canStillChange(createdAt: string | Date | null | undefined, now = Date.now()): boolean {
  if (!createdAt) return false;
  return now - new Date(createdAt).getTime() < DM_EDIT_WINDOW_MS;
}
