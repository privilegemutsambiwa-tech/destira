import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2, Lock, Check } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  DISCLOSURE_CATEGORIES,
  DISCLOSURE_STATES,
  NEVER_DISCLOSED,
  DIRECTIVE_MAX,
  DISCLOSURE_REFUSAL,
  normalizeDisclosure,
  type DisclosureSettings,
  type DisclosureState,
} from "@shared/disclosure";

const LABEL = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";

const STATE_META: Record<DisclosureState, { label: string; hint: string }> = {
  closed: { label: "Won't discuss", hint: "The twin won't touch it." },
  acknowledge: { label: "Vague only", hint: "One general sentence, no specifics." },
  open: { label: "Can discuss", hint: "The twin can speak to it." },
};

function StatePicker({
  value,
  onChange,
}: {
  value: DisclosureState;
  onChange: (v: DisclosureState) => void;
}) {
  return (
    <div className="flex gap-1.5" role="radiogroup">
      {DISCLOSURE_STATES.map((s) => {
        const active = s === value;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(s)}
            className={`flex-1 min-h-[44px] rounded-[10px] px-2 py-2 text-[12px] leading-tight transition-colors ${
              active
                ? "border-2 border-vf-ember bg-vf-ember/10 text-vf-text font-medium"
                : "border border-vf-line bg-vf-text/[0.03] text-vf-muted hover:text-vf-text"
            }`}
            data-testid={`disclosure-state-${s}`}
          >
            <span className="flex items-center justify-center gap-1">
              {active && <Check className="w-3 h-3 shrink-0" aria-hidden="true" />}
              {STATE_META[s].label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function TwinDisclosure() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ settings: DisclosureSettings; directive: string }>({
    queryKey: ["/api/twin/disclosure"],
    queryFn: async () => {
      const res = await fetch("/api/twin/disclosure", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const [settings, setSettings] = useState<DisclosureSettings | null>(null);
  const [directive, setDirective] = useState("");
  const [dirtyDirective, setDirtyDirective] = useState(false);

  useEffect(() => {
    if (data && !settings) {
      setSettings(normalizeDisclosure(data.settings));
      setDirective(data.directive || "");
    }
  }, [data, settings]);

  const saveSettings = useMutation({
    mutationFn: (next: DisclosureSettings) =>
      apiRequest("PUT", "/api/twin/disclosure", { settings: next }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/twin/disclosure"] }),
    onError: () => toast({ title: "Couldn't save that", variant: "destructive" }),
  });

  const saveDirective = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/twin/disclosure", { directive }),
    onSuccess: () => {
      setDirtyDirective(false);
      qc.invalidateQueries({ queryKey: ["/api/twin/disclosure"] });
      toast({ title: "Saved" });
    },
    onError: () => toast({ title: "Couldn't save that", variant: "destructive" }),
  });

  const setCategory = (key: string, v: DisclosureState) => {
    if (!settings) return;
    const next = { ...settings, [key]: v };
    setSettings(next);
    saveSettings.mutate(next);
  };

  const openCount = useMemo(
    () => (settings ? Object.values(settings).filter((v) => v !== "closed").length : 0),
    [settings],
  );

  if (isLoading || !settings) {
    return (
      <div className="min-h-dvh bg-vf-ink flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-vf-ember" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-vf-ink text-vf-text">
      <div className="sticky top-0 z-10 bg-vf-ink border-b border-vf-line flex items-center gap-3 px-4 h-14">
        <button onClick={() => setLocation("/settings")} className="w-8 h-8 flex items-center justify-center" data-testid="button-disclosure-back">
          <ArrowLeft className="w-5 h-5 text-vf-ember" />
        </button>
        <h1 className="font-serif text-[20px] text-vf-text">What your twin may discuss</h1>
      </div>

      <div className="max-w-[560px] mx-auto px-4 py-6 pb-28 flex flex-col gap-8">
        <p className="text-[14px] leading-[1.6] text-vf-muted -mt-1">
          When someone interviews your twin before deciding to reach out, this is what it's
          allowed to say. Everything starts closed — you open what you're comfortable with.
        </p>

        <section className="flex flex-col gap-5">
          <div className="flex items-baseline justify-between">
            <div className={LABEL}>Topics</div>
            <div className="font-mono text-[10.5px] text-vf-faint">{openCount} of {DISCLOSURE_CATEGORIES.length} open</div>
          </div>
          {DISCLOSURE_CATEGORIES.map((c) => (
            <div key={c.key} className="flex flex-col gap-2" data-testid={`disclosure-row-${c.key}`}>
              <div>
                <div className="text-[14.5px] text-vf-text">{c.label}</div>
                <div className="text-[12.5px] text-vf-faint leading-snug mt-0.5">
                  Open means: {c.openMeans}
                </div>
              </div>
              <StatePicker value={settings[c.key] ?? "closed"} onChange={(v) => setCategory(c.key, v)} />
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-2.5">
          <div className={LABEL}>Never — regardless of the above</div>
          <div className="rounded-[14px] border border-vf-line bg-vf-text/[0.02] divide-y divide-vf-line">
            {NEVER_DISCLOSED.map((n) => (
              <div key={n} className="flex items-center gap-2.5 px-3.5 py-3">
                <Lock className="w-3.5 h-3.5 text-vf-faint shrink-0" />
                <span className="text-[13px] text-vf-muted">{n}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <div className={LABEL}>Anything else</div>
          <p className="text-[13px] leading-[1.6] text-vf-muted">
            Not everything's on that list. Tell your twin what else to keep to itself — it
            refuses those in plain terms, without making it strange. Written like a note to a
            friend, not a form.
          </p>
          <textarea
            value={directive}
            onChange={(e) => {
              setDirective(e.target.value.slice(0, DIRECTIVE_MAX));
              setDirtyDirective(true);
            }}
            rows={4}
            placeholder="e.g. Don't bring up my divorce, and never mention my sister at all."
            className="w-full rounded-[12px] border border-vf-line bg-vf-text/[0.04] p-3.5 text-[14px] leading-[1.6] text-vf-text placeholder:text-vf-faint outline-none focus:border-vf-ember/60 transition-colors resize-none"
            data-testid="input-disclosure-directive"
          />
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10.5px] text-vf-faint">
              {directive.length}/{DIRECTIVE_MAX}
            </span>
            <button
              onClick={() => saveDirective.mutate()}
              disabled={!dirtyDirective || saveDirective.isPending}
              className="h-9 px-4 rounded-full text-[13px] font-medium bg-vf-ember text-vf-ink disabled:opacity-40 transition-opacity"
              data-testid="button-save-directive"
            >
              {saveDirective.isPending ? "Saving…" : dirtyDirective ? "Save" : "Saved"}
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <div className={LABEL}>What the other person hears at a boundary</div>
          <div className="rounded-[14px] border border-vf-line bg-vf-surface2 px-4 py-3.5">
            <p className="text-[15px] leading-[1.5] text-vf-text">"{DISCLOSURE_REFUSAL}"</p>
            <p className="text-[12.5px] text-vf-faint mt-1.5">
              Said in your twin's voice. It never names the topic, and the conversation carries on.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
