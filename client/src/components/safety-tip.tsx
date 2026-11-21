import { useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { detectRisks, worstRisk, RISK_TIP, type RiskKind } from "@shared/safety";

// A calm safety note under a conversation when the other person's messages
// look like a known scam (asking for money, an investment pitch, a "stuck
// abroad" story, moving to WhatsApp early). Worked out on the phone from the
// same rules the server uses to flag the sender; nothing is sent anywhere.
// Dismissed per conversation and kind, so it never nags.

type Msg = { id: number; senderId: string; content: string };

const seenKey = (matchId: number, kind: RiskKind) => `destira.safetyTip.${matchId}.${kind}`;

/** Off-platform is only worth a note early on, before people know each other. */
const EARLY_MESSAGES = 30;

export function SafetyTip({ matchId, myId, messages, onReport }: {
  matchId: number;
  myId: string | undefined;
  messages: Msg[];
  onReport: (messageId: number, kind: RiskKind) => void;
}) {
  const [dismissed, setDismissed] = useState(0);
  const hit = useMemo(() => {
    if (!myId) return null;
    let best: { kind: RiskKind; messageId: number; rank: number } | null = null;
    const rank = { high: 0, medium: 1, low: 2 } as const;
    messages.forEach((m, i) => {
      if (m.senderId === myId) return;
      const w = worstRisk(detectRisks(m.content));
      if (!w) return;
      if (w.kind === "off_platform" && i >= EARLY_MESSAGES) return;
      try {
        if (localStorage.getItem(seenKey(matchId, w.kind))) return;
      } catch {
        /* storage blocked: show it */
      }
      if (!best || rank[w.severity] < best.rank) best = { kind: w.kind, messageId: m.id, rank: rank[w.severity] };
    });
    return best as { kind: RiskKind; messageId: number; rank: number } | null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, myId, matchId, dismissed]);

  if (!hit) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(seenKey(matchId, hit.kind), "1");
    } catch {
      /* ignore */
    }
    setDismissed((n) => n + 1);
  };

  return (
    <div
      role="note"
      className="mx-auto my-2 w-full max-w-[520px] rounded-2xl border border-vf-line bg-vf-surface2 px-4 py-3"
      data-testid={`safety-tip-${hit.kind}`}
    >
      <div className="flex gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-vf-ember" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[14px] leading-[1.5] text-vf-text">{RISK_TIP[hit.kind]}</p>
          <div className="mt-2 flex gap-4 text-[13.5px] font-semibold">
            {hit.kind !== "off_platform" && (
              <button className="text-vf-ember" onClick={() => onReport(hit.messageId, hit.kind)} data-testid="button-safety-report">
                Report
              </button>
            )}
            <button className="text-vf-muted" onClick={dismiss} data-testid="button-safety-dismiss">
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
