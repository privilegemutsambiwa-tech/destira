// Crown direct introductions (server/crown-perks.ts): a like that carries a
// short note. Shown only to Crown members; the server checks again.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CROWN_GRADIENT } from "@/components/crown-badge";

type Perks = { crown: boolean; privateMode: boolean; introsLeft: number; introsPerDay: number };
const MAX = 280;

export function IntroduceButton({ targetId, name }: { targetId: string; name: string }) {
  const { data: perks } = useQuery<Perks>({ queryKey: ["/api/crown/perks"], staleTime: 60_000 });
  const [open, setOpen] = useState(false);
  if (!perks?.crown) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mx-auto inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full border text-[14px] text-vf-text transition-colors hover:bg-[rgba(233,185,73,0.08)]"
        style={{ borderColor: "rgba(233,185,73,0.5)" }}
        data-testid="button-introduce"
      >
        <Crown className="w-4 h-4" style={{ color: "#E9B949" }} />
        Introduce yourself
        <span className="text-vf-faint text-[12.5px]">{perks.introsLeft} left today</span>
      </button>
      {open && <IntroSheet targetId={targetId} name={name} left={perks.introsLeft} onClose={() => setOpen(false)} />}
    </>
  );
}

function IntroSheet({ targetId, name, left, onClose }: { targetId: string; name: string; left: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/crown/intros", { targetId, note })).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/crown/perks"] });
      qc.invalidateQueries({ queryKey: ["/api/likes/outgoing"] });
      toast({ title: "Introduction sent", description: `${name} will see your note. If it's a yes, you'll match.` });
      onClose();
    },
    // apiRequest errors read "409: {json}"; show the message only.
    onError: (e: any) => {
      const raw = String(e?.message ?? "");
      const body = raw.replace(/^\d{3}:\s*/, "");
      try {
        setError(JSON.parse(body).message ?? body);
      } catch {
        setError(body || "Couldn't send. Try again.");
      }
    },
  });
  const trimmed = note.trim();
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/50" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Introduce yourself to ${name}`}>
      <div
        className="w-full sm:max-w-[440px] rounded-t-[24px] sm:rounded-[24px] bg-vf-surface border border-vf-line p-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))]"
        onClick={(e) => e.stopPropagation()}
        data-testid="sheet-introduce"
      >
        <div className="flex items-center justify-between">
          <div className="font-serif text-[20px] text-vf-text">Introduce yourself to {name}</div>
          <button onClick={onClose} aria-label="Close" className="w-10 h-10 -mr-2 flex items-center justify-center text-vf-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-[13px] text-vf-muted mt-1 leading-[1.45]">
          A like with a note. {name} chooses; if it's a no, you won't be told. Money, gifts or "allowances" are never part of it.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, MAX))}
          rows={4}
          autoFocus
          placeholder="What made you want to say hello?"
          className="mt-4 w-full rounded-[14px] border border-vf-line bg-vf-elevated p-3 text-[15px] text-vf-text placeholder:text-vf-faint outline-none focus:border-vf-text/30 resize-none"
          data-testid="input-intro-note"
        />
        <div className="flex justify-between text-[12px] text-vf-faint mt-1">
          <span>{left} of 3 left today</span>
          <span>{note.length}/{MAX}</span>
        </div>
        {error && <p className="text-[13px] text-[#D0614A] mt-2" data-testid="text-intro-error">{error}</p>}
        <button
          disabled={trimmed.length < 10 || send.isPending}
          onClick={() => { setError(null); send.mutate(); }}
          className="mt-4 w-full h-12 rounded-full font-semibold text-[14.5px] text-[#1A1418] disabled:opacity-50"
          style={{ background: CROWN_GRADIENT }}
          data-testid="button-send-intro"
        >
          {send.isPending ? "Sending…" : "Send introduction"}
        </button>
      </div>
    </div>
  );
}
