// Settings > Your twin: its tone, the About Me it writes, and clearing its memory.

import { useState } from "react";
import { Brain } from "lucide-react";
import { useUpdateProfile } from "@/hooks/use-profiles";
import { useToast } from "@/hooks/use-toast";
import { useGenerateAboutMe } from "@/hooks/use-interactions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CARD, ELEVATED, BORDER, MUTED, TEXT, EMBER, SERIF, MONO_EYEBROW, Panel, GradientButton } from "./ui";

export function TwinTonePanel({ onBack, profile }: { onBack: () => void; profile: any }) {
  const { toast } = useToast();
  const existing = typeof profile?.twinToneProfile === "object" && profile.twinToneProfile !== null
    ? profile.twinToneProfile as Record<string, number>
    : {};
  const [style, setStyle] = useState<number>(existing.style ?? 50);
  const [verbosity, setVerbosity] = useState<number>(existing.verbosity ?? 50);
  const [formality, setFormality] = useState<number>(existing.formality ?? 50);
  const [expression, setExpression] = useState<number>(existing.expression ?? 50);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/settings/twin-tone", {
      twinToneProfile: { style, verbosity, formality, expression },
    }),
    onSuccess: () => toast({ title: "Twin tone saved" }),
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const controls = [
    { key: "style", label: "Style", low: "Casual", high: "Witty", value: style, set: setStyle },
    { key: "verbosity", label: "Verbosity", low: "Concise", high: "Elaborate", value: verbosity, set: setVerbosity },
    { key: "formality", label: "Formality", low: "Relaxed", high: "Formal", value: formality, set: setFormality },
    { key: "expression", label: "Expression", low: "Reserved", high: "Expressive", value: expression, set: setExpression },
  ];

  return (
    <Panel title="Customize Twin Tone" onBack={onBack}>
      <p className="text-sm px-4 pt-4 pb-2" style={{ color: MUTED }}>
        Fine-tune how your AI Twin communicates when chatting with matches.
      </p>
      <div className="vf-card" style={{ margin: "12px 16px", borderRadius: "16px", background: CARD, padding: "4px 0" }}>
        {controls.map((c, i) => (
          <div key={c.key} style={{ padding: "14px 16px", borderBottom: i < controls.length - 1 ? `1px solid ${BORDER}` : "none" }}>
            <div className="flex justify-between mb-2">
              <p className="text-sm font-semibold text-foreground">{c.label}</p>
              <p className="text-xs font-medium" style={{ color: MUTED }}>{c.low} → {c.high}</p>
            </div>
            <input
              type="range" min={0} max={100} step={5} value={c.value}
              onChange={(e) => c.set(Number(e.target.value))}
              className="w-full vf-range"
              style={{ accentColor: EMBER }}
              data-testid={`slider-twin-${c.key}`}
            />
            <div className="flex justify-between mt-1">
              <span className="text-xs" style={{ color: MUTED }}>{c.low}</span>
              <span className="text-xs font-medium text-foreground">{c.value}</span>
              <span className="text-xs" style={{ color: MUTED }}>{c.high}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: "0 16px" }}>
        <GradientButton
          label={saveMutation.isPending ? "Saving..." : "Save Tone Settings"}
          onClick={() => saveMutation.mutate()}
          testId="button-save-tone"
        />
      </div>
    </Panel>
  );
}

// Writes a fresh "About Me" from what the twin already knows (structured
// profile + question answers) — same review-before-apply shape as "Refine
// with AI" beside the bio field in Profile.tsx, just generating from
// scratch instead of proofreading existing text.
export function AiSummaryPanel({ onBack, profile }: { onBack: () => void; profile: any }) {
  const { toast } = useToast();
  const generate = useGenerateAboutMe();
  const updateProfile = useUpdateProfile();
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const handleGenerate = () => {
    setSuggestion(null);
    generate.mutate(undefined, {
      onError: () => toast({ title: "Couldn't generate that right now", variant: "destructive" }),
      onSuccess: (data: any) => setSuggestion(data?.aboutMeText || ""),
    });
  };

  const handleApply = async () => {
    if (!suggestion || !profile) return;
    try {
      await updateProfile.mutateAsync({ userId: profile.userId, data: { aboutMe: suggestion, bio: suggestion } });
      toast({ title: "About Me updated" });
      onBack();
    } catch {
      toast({ title: "Couldn't save that", variant: "destructive" });
    }
  };

  return (
    <Panel title="Generate AI Summary" onBack={onBack}>
      <div className="flex flex-col px-6 pt-6">
        <p className="text-sm mb-6" style={{ color: MUTED }}>
          Your twin writes a fresh "About Me" from your profile and question answers. You review it before anything changes.
        </p>

        {suggestion === null ? (
          <GradientButton
            label={generate.isPending ? "Writing…" : "Generate"}
            onClick={handleGenerate}
            disabled={generate.isPending}
            testId="button-generate-ai-summary"
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-[12px] p-4" style={{ background: ELEVATED, border: `1px solid ${BORDER}` }}>
              <div style={MONO_EYEBROW}>Suggestion</div>
              <p className="text-sm mt-2 whitespace-pre-line" style={{ color: TEXT }} data-testid="text-ai-summary-suggestion">
                {suggestion || "Nothing came back — try again."}
              </p>
            </div>
            {suggestion && (
              <GradientButton
                label={updateProfile.isPending ? "Saving…" : "Use this as my About Me"}
                onClick={handleApply}
                disabled={updateProfile.isPending}
                testId="button-apply-ai-summary"
              />
            )}
            <button
              onClick={handleGenerate}
              disabled={generate.isPending}
              className="w-full py-3 text-sm font-medium rounded-xl transition-colors duration-150 hover:bg-[var(--vf-elevated)]"
              style={{ color: MUTED, background: "none", border: "none", cursor: "pointer" }}
              data-testid="button-regenerate-ai-summary"
            >
              {generate.isPending ? "Writing…" : "Write another version"}
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
}

export function ClearMemoryPanel({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);

  const clearMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/twin/memory", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/twin/memory"] });
      toast({ title: "Twin memory cleared" });
      setConfirmed(false);
    },
    onError: () => toast({ title: "Failed to clear memory", variant: "destructive" }),
  });

  return (
    <Panel title="Clear Twin Memory" onBack={onBack}>
      <div className="flex flex-col items-center px-6 pt-8 text-center">
        <div style={{
          width: "80px", height: "80px", borderRadius: "50%",
          background: ELEVATED, border: `2px solid var(--vf-danger)`,
          display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "20px",
        }}>
          <Brain className="w-10 h-10" style={{ color: "var(--vf-danger)" }} />
        </div>
        <h2 className="text-lg mb-2" style={{ ...SERIF, color: TEXT }}>Clear Twin Memory</h2>
        <p className="text-sm mb-6" style={{ color: MUTED }}>
          Your twin forgets everything. Your reads reset to zero and rebuild over about a week.
        </p>
        {!confirmed ? (
          <GradientButton label="I understand, clear memory" onClick={() => setConfirmed(true)} testId="button-confirm-clear-step1" danger />
        ) : (
          <div className="w-full space-y-3">
            <p className="text-sm font-semibold" style={{ color: "var(--vf-danger)" }}>Are you absolutely sure?</p>
            <button
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending}
              className="w-full py-3 text-sm font-semibold text-foreground vf-btn-primary"
              style={{ background: "#C62828", color: "#FFFFFF", borderRadius: "12px", border: "none", cursor: "pointer" }}
              data-testid="button-confirm-clear-final"
            >
              {clearMutation.isPending ? "Clearing..." : "Yes, clear all memory"}
            </button>
            <button
              onClick={() => setConfirmed(false)}
              className="w-full py-3 text-sm font-medium rounded-xl transition-colors duration-150 hover:bg-[var(--vf-elevated)]"
              style={{ color: MUTED, background: "none", border: "none", cursor: "pointer" }}
              data-testid="button-cancel-clear"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
}
