// Twin chat: message types, prompts, the avatar, typing dots and the trust panel (split out of pages/TwinChat.tsx).
import { Switch } from "@/components/ui/switch";
import { Brain, Shield, Loader2, Check, CheckCheck, RefreshCw } from "lucide-react";
import { useTwinStructuredProfile, useExtractTwinProfile } from "@/hooks/use-interactions";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { type CoachResult } from "@/components/twin-coach";

export type MessageStatus = "sending" | "sent" | "delivered";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: MessageStatus;
  timestamp: Date;
  quickReplies?: string[];
  /** A dating-coach answer: shown in the chat, never saved to twin memory. */
  coach?: CoachResult;
}

// One a day, the same for everyone that day: a gentle way in when the
// conversation is empty. Tapping one asks it.
export const DAILY_PROMPTS = [
  "Tell me about a weekend you'd happily repeat.",
  "What's something you changed your mind about recently?",
  "Who do you call when something good happens?",
  "What does a good first date look like to you?",
  "What are you looking forward to this month?",
  "What's a small thing that makes a day better for you?",
  "What would your closest friend say you're like in a relationship?",
];

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function StatusIndicator({ status }: { status: MessageStatus }) {
  if (status === "sending") {
    return <Loader2 className="w-3 h-3 animate-spin text-vf-faint" />;
  }
  if (status === "sent") {
    return <Check className="w-3 h-3 text-vf-faint" />;
  }
  return <CheckCheck className="w-3 h-3 text-vf-ember" />;
}

// Small round twin avatar — the user's cover photo when they have one,
// falling back to the same mint gradient dot used everywhere else.
export function TwinAvatar({ url, size = 20 }: { url: string | null; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, background: "radial-gradient(circle at 35% 30%, var(--vf-mint-vivid), #2E7F6B)" }}
    >
      <Brain className="text-vf-ink" style={{ width: size * 0.55, height: size * 0.55 }} />
    </div>
  );
}

export function TypingIndicator({ twinName, avatarUrl }: { twinName: string; avatarUrl: string | null }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex justify-start"
      data-testid="typing-indicator"
    >
      <div className="max-w-[80%]">
        <div className="flex items-center gap-1.5 ml-3 mb-1">
          <TwinAvatar url={avatarUrl} size={14} />
          <span className="text-xs text-vf-mint font-medium">{twinName}</span>
        </div>
        <div className="rounded-[18px] rounded-bl-[6px] border border-vf-mint/25 bg-vf-mint/10 px-4 py-3 flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <motion.span
              className="w-1.5 h-1.5 rounded-full bg-vf-mint"
              animate={{ opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0 }}
            />
            <motion.span
              className="w-1.5 h-1.5 rounded-full bg-vf-mint"
              animate={{ opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
            />
            <motion.span
              className="w-1.5 h-1.5 rounded-full bg-vf-mint"
              animate={{ opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
            />
          </div>
          <span className="text-xs text-vf-muted">Twin is thinking...</span>
        </div>
      </div>
    </motion.div>
  );
}

// Right-column "trust surface". Two things the redesign brief asks for here
// (per-fact suppress toggles, three boolean boundary switches) have no
// backend behind them yet — twin_memory_facts has no visibility flag, and
// `boundaries` is one AI-extracted sentence, not three togglable topics.
// Rather than ship controls that look functional but do nothing, this shows
// the real facts/boundaries read-only, with the one real action available
// today (re-run extraction) and a link to the real, safely-gated bulk clear
// in Settings instead of a fake per-fact switch.
export function TwinTrustPanel({
  memoryFacts,
  memorySummary,
  trainingOptOut,
  onTrainingOptOutChange,
}: {
  memoryFacts: any[];
  memorySummary: string | null;
  trainingOptOut: boolean;
  onTrainingOptOutChange: (v: boolean) => void;
}) {
  const { data: structured } = useTwinStructuredProfile();
  const extractProfile = useExtractTwinProfile();

  const structuredLines: { label: string; value: string }[] = [];
  if (structured?.relationshipGoals) structuredLines.push({ label: "Looking for", value: structured.relationshipGoals });
  if (structured?.boundaries) structuredLines.push({ label: "Boundaries", value: structured.boundaries });
  if (structured?.communicationStyle) structuredLines.push({ label: "Communication style", value: structured.communicationStyle });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[20px] border border-vf-line bg-vf-surface2 p-5">
        <h2 className="font-serif text-xl text-vf-text mb-1">What your twin remembers</h2>
        <p className="text-[13px] text-vf-muted leading-relaxed mb-4">
          Facts your twin has picked up from your conversations.
        </p>
        <div className="flex flex-wrap gap-2">
          {memoryFacts.length > 0 ? (
            memoryFacts.slice(0, 12).map((fact: any, i: number) => (
              <span
                key={i}
                className="text-[13px] px-3 py-1.5 rounded-full border border-vf-mint/30 bg-vf-mint/10 text-vf-mint"
                data-testid={`memory-fact-${i}`}
              >
                {typeof fact === "string" ? fact : fact.content || fact.fact || fact.factText || ""}
              </span>
            ))
          ) : (
            <p className="text-[13px] text-vf-faint">Nothing learned yet — keep chatting.</p>
          )}
        </div>
        {memorySummary && (
          <p className="text-[12.5px] text-vf-muted leading-relaxed mt-4 pt-4 border-t border-vf-line" data-testid="text-memory-summary">
            {memorySummary}
          </p>
        )}
        <Link href="/settings" asChild>
          <a className="inline-block text-[12.5px] text-vf-faint hover:text-vf-text underline mt-4" data-testid="link-manage-memory">
            Manage or clear this memory →
          </a>
        </Link>
      </div>

      <div className="rounded-[20px] border border-vf-line bg-vf-surface2 p-5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="font-serif text-xl text-vf-text">About your twin</h2>
          <button
            onClick={() => extractProfile.mutate()}
            disabled={extractProfile.isPending}
            className="flex items-center gap-1.5 text-[12px] text-vf-mint hover:text-vf-text disabled:opacity-50"
            data-testid="button-reextract-profile"
          >
            {extractProfile.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
        </div>
        {structuredLines.length > 0 ? (
          <div className="flex flex-col gap-3 mt-3">
            {structuredLines.map((line) => (
              <div key={line.label}>
                <div className="text-[11px] uppercase tracking-[0.1em] text-vf-faint mb-1">{line.label}</div>
                <p className="text-[13.5px] text-vf-text leading-relaxed">{line.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-vf-faint mt-3">
            Chat a bit more, then hit Refresh to have your twin summarize what it's picked up.
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-vf-line">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-vf-faint" />
            <span className="text-[12.5px] text-vf-muted">Training opt-out</span>
          </div>
          <Switch
            checked={trainingOptOut}
            onCheckedChange={onTrainingOptOutChange}
            data-testid="switch-training-optout"
          />
        </div>
      </div>
    </div>
  );
}
