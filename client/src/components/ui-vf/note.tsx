// One note at a time (docs/destira-upgrade-prompt.md §5.4). Replaces the tip
// banners that used to stack up on every screen.
//
// Rules:
//  - A screen offers its candidate notes; at most ONE shows, the highest
//    priority that applies (safety > blocking setup > helpful tip).
//  - Dismissing or acting on a note records it on the server
//    (/api/reminders/:kind, which brings it back after 7 days at the earliest),
//    so a note follows the member across devices.
//  - No more than three different notes a day across the whole app. A note
//    already shown today keeps showing; a new one waits for tomorrow.
import { type ReactNode, useEffect } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TwinGlyph } from "./glyphs";

export type NoteTone = "twin" | "human" | "safety";

/** Matches REMINDER_KINDS in shared/schema.ts (the server refuses others). */
export type NoteKind =
  | "discover_readiness_strip"
  | "twin_disclosure_intro"
  | "profile_photos_nudge"
  | "profile_completion_nudge"
  | "lounge_intro_tip"
  | "events_intro_tip";

export const NOTE_PRIORITY = { safety: 30, setup: 20, tip: 10 } as const;

export interface NoteSpec {
  kind: NoteKind;
  priority: number;
  /** False when it doesn't apply right now (profile already complete, …). */
  when?: boolean;
  tone?: NoteTone;
  eyebrow?: string;
  body: ReactNode;
  action?: { label: string; onClick: () => void; testId?: string };
  testId?: string;
}

const DAILY_LIMIT = 3;
const BUDGET_KEY = "destira.notes.today";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function readBudget(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BUDGET_KEY) || "null") as { day: string; kinds: string[] } | null;
    return raw && raw.day === today() ? raw.kinds : [];
  } catch {
    return [];
  }
}

function markShown(kind: string) {
  const kinds = readBudget();
  if (kinds.includes(kind)) return;
  try {
    localStorage.setItem(BUDGET_KEY, JSON.stringify({ day: today(), kinds: [...kinds, kind] }));
  } catch {
    /* storage unavailable: the server-side dismissals still apply */
  }
}

const reminderKey = (kind: string) => ["/api/reminders", kind];

/** Shows the one note this screen should show, or nothing. */
export function ScreenNotes({ notes, className }: { notes: NoteSpec[]; className?: string }) {
  const qc = useQueryClient();
  const candidates = notes.filter((n) => n.when !== false).sort((a, b) => b.priority - a.priority);

  const results = useQueries({
    queries: candidates.map((n) => ({
      queryKey: reminderKey(n.kind),
      queryFn: async () => {
        const res = await fetch(`/api/reminders/${n.kind}`, { credentials: "include" });
        if (!res.ok) return { dismissed: true };
        return (await res.json()) as { dismissed: boolean };
      },
    })),
  });

  // Walk down by priority. Stop at the first one still loading, so a lower
  // note never flashes up and then gets replaced by a higher one.
  const shownToday = readBudget();
  let chosen: NoteSpec | null = null;
  for (let i = 0; i < candidates.length; i++) {
    const r = results[i];
    if (!r?.data) break;
    if (r.data.dismissed) continue;
    const n = candidates[i];
    if (shownToday.includes(n.kind) || shownToday.length < DAILY_LIMIT) chosen = n;
    break;
  }

  const kind = chosen?.kind;
  useEffect(() => {
    if (kind) markShown(kind);
  }, [kind]);

  if (!chosen) return null;

  const dismiss = () => {
    qc.setQueryData(reminderKey(chosen!.kind), { dismissed: true });
    fetch(`/api/reminders/${chosen!.kind}/dismiss`, { method: "POST", credentials: "include" })
      .then(() => {
        if (chosen!.kind === "discover_readiness_strip") qc.invalidateQueries({ queryKey: ["/api/twin/readiness"] });
      })
      .catch(() => {});
  };

  return (
    <Note
      key={chosen.kind}
      tone={chosen.tone}
      eyebrow={chosen.eyebrow}
      onDismiss={dismiss}
      action={chosen.action && { ...chosen.action, onClick: () => { dismiss(); chosen!.action!.onClick(); } }}
      testId={chosen.testId}
      className={className}
    >
      {chosen.body}
    </Note>
  );
}

interface NoteProps {
  tone?: NoteTone;
  eyebrow?: string;
  children: ReactNode;
  action?: { label: string; onClick: () => void; testId?: string };
  onDismiss?: () => void;
  testId?: string;
  className?: string;
}

/** The note itself. Use through ScreenNotes so the one-at-a-time rule holds. */
export function Note({ tone = "human", eyebrow, children, action, onDismiss, testId, className }: NoteProps) {
  const accent = tone === "twin" ? "text-vf-mint" : "text-vf-ember";
  return (
    <div
      role="note"
      className={cn("vf-note-enter relative flex items-start gap-3 rounded-[16px] border border-vf-line bg-vf-surface2 vf-e1 p-4", onDismiss && "pr-12", className)}
      data-testid={testId}
    >
      <span
        className={cn(
          "shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          tone === "twin" ? "bg-vf-mint/10 text-vf-mint" : "bg-vf-ember/10 text-vf-ember",
        )}
        aria-hidden="true"
      >
        {tone === "twin" ? <TwinGlyph size={18} /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      </span>
      <div className="min-w-0 pt-0.5">
        {eyebrow && <div className={cn("vf-label mb-1", tone === "twin" ? "text-vf-mint" : "text-vf-faint")}>{eyebrow}</div>}
        <div className="vf-small text-vf-soft">{children}</div>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            data-testid={action.testId}
            className={cn("vf-press mt-2 -ml-1 inline-flex items-center h-9 px-1 text-[14px] font-semibold hover:underline underline-offset-4", accent)}
          >
            {action.label}
          </button>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute right-0.5 top-0.5 w-11 h-11 flex items-center justify-center text-vf-faint hover:text-vf-text transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
