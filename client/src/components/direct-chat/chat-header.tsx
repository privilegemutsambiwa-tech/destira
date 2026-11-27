import { useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Ban, CalendarHeart, Flag, HeartOff, Loader2, MoreHorizontal, UserRound, Video } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IconButton, VfAvatar } from "@/components/ui-vf";
import { ease } from "@/lib/motion";

/** Who you're talking to, plus plan a date, video call and the menu
 *  (view profile, report, block, unmatch). */
export function ChatHeader({
  matchId,
  backRoute,
  otherUserId,
  otherName,
  otherFirst,
  otherPhoto,
  subtitle,
  firstReply,
  hasMatch,
  calling,
  onVideoCall,
  onPlan,
  onReport,
  onConfirm,
}: {
  matchId: number;
  backRoute: string;
  otherUserId?: string;
  otherName: string;
  otherFirst: string;
  otherPhoto: string | null;
  subtitle: string;
  firstReply: boolean;
  hasMatch: boolean;
  calling: boolean;
  onVideoCall: () => void;
  onPlan: () => void;
  onReport: () => void;
  onConfirm: (what: "block" | "unmatch") => void;
}) {
  const [, setLocation] = useLocation();
  const reduce = useReducedMotion();
  const openProfile = () => otherUserId && setLocation(`/u/${otherUserId}?from=/chat/${matchId}`);
  return (
    <header className="border-b border-vf-line px-2 py-2 flex items-center gap-1 sticky top-0 z-10 bg-vf-ink/95 backdrop-blur-md">
      <IconButton label="Back" onClick={() => setLocation(backRoute)} data-testid="button-back">
        <ArrowLeft className="w-5 h-5" />
      </IconButton>
      <button
        type="button"
        onClick={openProfile}
        className="flex items-center gap-3 min-w-0 text-left flex-1 rounded-[14px] px-1.5 py-1 hover:bg-vf-surface/60 transition-colors"
        aria-label={`Open ${otherName}'s profile`}
        data-testid="button-chat-profile"
      >
        <VfAvatar size={40} name={otherName} seed={otherUserId} src={otherPhoto ?? undefined} />
        <span className="min-w-0">
          <span className="relative inline-block max-w-full">
            <span className="block font-display text-[20px] leading-tight text-vf-text truncate" data-testid="text-chat-name">{otherName}</span>
            {firstReply && (
              <motion.span
                aria-hidden="true"
                className="absolute left-0 right-0 -bottom-0.5 h-[2px] rounded-full bg-vf-ember origin-left"
                initial={reduce ? { opacity: 0 } : { scaleX: 0 }}
                animate={reduce ? { opacity: 1 } : { scaleX: 1 }}
                transition={{ duration: 0.75, ease: ease.standard, delay: 0.2 }}
                data-testid="first-reply-underline"
              />
            )}
          </span>
          <span className="block vf-label text-vf-faint truncate mt-0.5">{subtitle}</span>
        </span>
      </button>
      <IconButton label={`Plan a date with ${otherFirst}`} onClick={onPlan} disabled={!hasMatch} data-testid="button-lets-meet">
        <CalendarHeart className="w-5 h-5" />
      </IconButton>
      <IconButton
        label={`Video call ${otherName}`}
        onClick={onVideoCall}
        disabled={calling || !hasMatch}
        data-testid="button-video-call"
      >
        {calling ? <Loader2 className="w-5 h-5 animate-spin text-vf-ember" /> : <Video className="w-5 h-5" />}
      </IconButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton label="More" data-testid="button-chat-menu">
            <MoreHorizontal className="w-5 h-5" />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[200px]">
          <DropdownMenuItem onSelect={openProfile}>
            <UserRound className="w-4 h-4 mr-2" /> View profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onReport} data-testid="menu-report">
            <Flag className="w-4 h-4 mr-2" /> Report {otherFirst}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onConfirm("block")} data-testid="menu-block">
            <Ban className="w-4 h-4 mr-2" /> Block
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onConfirm("unmatch")} data-testid="menu-unmatch">
            <HeartOff className="w-4 h-4 mr-2" /> Unmatch
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
