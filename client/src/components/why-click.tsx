// "Why you might click" (docs/destira-upgrade-prompt.md §5.3), the resonance
// read: honest reasons arriving one line at a time, and a sheet that says
// where they come from. Shared by the Discover card and the full profile.
// The reasons come from the server (server/click-reasons.ts) and are only
// ever things that are true; when there are none, nothing shows.
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { ResonanceGlyph, VfButton, VfSheet } from "@/components/ui-vf";
import { ease } from "@/lib/motion";

export type ClickReason = { kind: string; text: string };

/** The reasons for one person, for screens that don't get them in a deck. */
export function useClickReasons(userId: string | undefined, enabled = true) {
  return useQuery<{ reasons: ClickReason[] }>({
    queryKey: ["/api/profiles", userId, "reasons"],
    queryFn: async () => {
      const r = await fetch(`/api/profiles/${userId}/reasons`, { credentials: "include" });
      if (!r.ok) return { reasons: [] };
      return r.json();
    },
    enabled: !!userId && enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function WhyYouMightClick({ name, reasons, onAsk }: { name: string; reasons: ClickReason[]; onAsk: () => void }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  if (!reasons.length) return null;
  const first = name.trim().split(/\s+/)[0] || "them";
  return (
    <div data-testid="why-click">
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="vf-label text-vf-mint flex items-center gap-1.5">
          <ResonanceGlyph size={16} /> Why you might click
        </div>
        <button
          onClick={() => setOpen(true)}
          className="vf-small text-vf-muted hover:text-vf-text transition-colors min-h-[32px] px-1"
          data-testid="button-why-click"
        >
          Why these?
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {reasons.map((r, i) => (
          <motion.li
            key={r.text}
            initial={reduce ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.12, duration: 0.32, ease: ease.standard }}
            className="flex items-start gap-2.5 text-[15.5px] leading-[1.45] text-vf-text"
          >
            <span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-vf-mint shrink-0" aria-hidden="true" />
            {r.text}
          </motion.li>
        ))}
      </ul>
      <VfSheet
        open={open}
        onOpenChange={setOpen}
        tone="twin"
        eyebrow="Why you might click"
        title={`You and ${first}`}
        data-testid="sheet-why-click"
        footer={
          <VfButton variant="twin" fullWidth onClick={() => { setOpen(false); onAsk(); }}>
            Ask {first.length > 10 ? "their" : `${first}'s`} twin
          </VfButton>
        }
      >
        <ul className="flex flex-col gap-2 mb-5">
          {reasons.map((r) => (
            <li key={r.text} className="flex items-start gap-2.5 vf-body text-vf-text">
              <span className="mt-[10px] w-1.5 h-1.5 rounded-full bg-vf-mint shrink-0" aria-hidden="true" />
              {r.text}
            </li>
          ))}
        </ul>
        <p className="vf-small text-vf-muted">
          Destira doesn't give people a compatibility score. A number like that would be a guess. These are only things that are true:
          what you both put on your profiles, and whether they've been around lately.
        </p>
        <p className="vf-small text-vf-muted mt-3">
          To get a feel for how {first} thinks, ask their twin. It answers from what {first} told it.
        </p>
      </VfSheet>
    </div>
  );
}

