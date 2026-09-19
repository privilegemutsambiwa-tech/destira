import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/** Proofreads a bio or prompt/onboarding answer in place — fixes typos/grammar,
 *  keeps voice. Never overwrites automatically: shows a preview the user
 *  accepts or dismisses, and accepting stays undoable until they navigate away
 *  or the field changes again. Used beside every free-text input across the
 *  app: onboarding questions, the profile bio (page + preview), and prompt
 *  answers. */
export function RefineWithAI({
  value,
  fieldType,
  promptContext,
  onApply,
}: {
  value: string;
  fieldType: "bio" | "answer";
  promptContext?: string;
  onApply: (text: string) => void;
}) {
  const [refining, setRefining] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [refinedFrom, setRefinedFrom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ previous: string; next: string } | null>(null);

  const trimmed = value.trim();
  const disabled = trimmed.length === 0 || trimmed === refinedFrom;

  // Clear the undo affordance once the field diverges from what we applied,
  // so "Undo" never silently discards edits made after accepting.
  useEffect(() => {
    if (applied && value !== applied.next) setApplied(null);
  }, [value, applied]);

  const handleRefine = async () => {
    setRefining(true);
    setError(null);
    setApplied(null);
    try {
      const res = await fetch("/api/profile/refine-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, fieldType, promptContext: promptContext?.slice(0, 200) }),
        credentials: "include",
      });
      if (res.status === 429) {
        setError("Too many requests — wait a moment and try again.");
        return;
      }
      if (!res.ok) {
        setError("Couldn't refine that right now.");
        return;
      }
      const data = await res.json();
      setRefinedFrom(trimmed);
      setSuggestion(typeof data.refinedText === "string" ? data.refinedText : value);
    } catch {
      setError("Couldn't refine that right now.");
    } finally {
      setRefining(false);
    }
  };

  const accept = () => {
    if (!suggestion) return;
    setApplied({ previous: value, next: suggestion });
    onApply(suggestion);
    setSuggestion(null);
  };

  const undo = () => {
    if (!applied) return;
    onApply(applied.previous);
    setApplied(null);
  };

  const keepOriginal = () => {
    setSuggestion(null);
    setRefinedFrom(null);
    setError(null);
  };

  const unchanged = suggestion !== null && suggestion.trim() === refinedFrom;

  return (
    <div>
      <button
        type="button"
        onClick={handleRefine}
        disabled={disabled || refining}
        className="border border-vf-line hover:border-vf-ember/50 bg-vf-surface2/60 text-[12px] font-medium text-vf-faint hover:text-vf-ember transition-all px-3 py-1.5 rounded-full flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-vf-line disabled:hover:text-vf-faint"
        data-testid="button-refine-ai"
      >
        {refining && <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin text-vf-ember" />}
        Refine with AI
      </button>

      {error && (
        <p className="text-[12.5px] text-vf-faint mt-2" data-testid="text-refine-error">
          {error}
        </p>
      )}

      {suggestion !== null && (
        <div className="mt-2 rounded-[12px] border border-vf-ember/20 bg-vf-ember/5 p-3" data-testid="card-refine-suggestion">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">AI polish suggestion</div>
          {unchanged ? (
            <p className="text-[13.5px] text-vf-muted mt-2">Nothing to fix — this already reads clean.</p>
          ) : (
            <>
              <p className="text-[14px] text-vf-text mt-2 whitespace-pre-line">{suggestion}</p>
              <p className="text-[11.5px] text-vf-faint mt-2">Still your words, just cleaned up — review before applying.</p>
            </>
          )}
          <div className="mt-3 flex items-center gap-2">
            {!unchanged && (
              <button
                type="button"
                onClick={accept}
                className="bg-vf-ember text-vf-ink text-[13px] font-medium px-4 py-2 rounded-full hover:brightness-105 transition-all"
                data-testid="button-accept-refine"
              >
                Accept & Apply
              </button>
            )}
            <button
              type="button"
              onClick={keepOriginal}
              className="text-vf-faint hover:text-vf-text text-[13px] px-3 py-2 transition-colors"
              data-testid="button-keep-original"
            >
              Keep original
            </button>
          </div>
        </div>
      )}

      {applied && (
        <div className="mt-2 flex items-center gap-2 text-[12.5px] text-vf-faint" data-testid="row-refine-applied">
          <span>AI polish applied.</span>
          <button type="button" onClick={undo} className="text-vf-ember hover:text-[var(--vf-ember-soft)] transition-colors" data-testid="button-undo-refine">
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
