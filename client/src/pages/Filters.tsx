// Filters and dealbreakers (shared/match-prefs.ts, Part D1-D2). Verified
// and photos are for everyone; faith, children and marriage need Spark.
// Each tap saves on its own. A preference moves people up the deck; a
// dealbreaker hides everyone else, including people who haven't said.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LayoutShell } from "@/components/layout-shell";
import { Switch } from "@/components/ui/switch";
import { Gated } from "@/components/gated";
import { Chip } from "@/pages/ProfileDetails";
import { useProfile } from "@/hooks/use-profiles";
import { ADVANCED_PREF_KEYS, PREF_OPTIONS, type AdvancedPrefKey, type MatchPrefs } from "@shared/match-prefs";
import { FormSkeleton } from "@/components/ui-vf/skeletons";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";

const QUESTION: Record<AdvancedPrefKey, string> = {
  faith: "Their faith",
  wantsChildren: "Whether they want children",
  marriage: "When they'd like to marry",
};

function ToggleRow({ label, note, on, onChange, testId }: { label: string; note: string; on: boolean; onChange: (v: boolean) => void; testId: string }) {
  return (
    <label className="flex items-start justify-between gap-4 py-4 border-b border-vf-line last:border-b-0 cursor-pointer">
      <span>
        <span className="block text-[15px] text-vf-text">{label}</span>
        <span className="block text-[12.5px] text-vf-faint mt-0.5">{note}</span>
      </span>
      <Switch checked={on} onCheckedChange={onChange} data-testid={testId} />
    </label>
  );
}

export default function FiltersPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ prefs: MatchPrefs; advanced: boolean }>({ queryKey: ["/api/match-prefs"] });
  const [p, setP] = useState<MatchPrefs>({});
  const { data: profile } = useProfile();
  const abroad = (profile as any)?.details?.base === "diaspora";

  useEffect(() => {
    if (data) setP(data.prefs ?? {});
  }, [data]);

  const save = async (patch: Partial<Record<keyof MatchPrefs, unknown>>) => {
    const before = p;
    setP((cur) => {
      const next: Record<string, unknown> = { ...cur };
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === false) delete next[k];
        else next[k] = v;
      }
      return next as MatchPrefs;
    });
    try {
      const res = await apiRequest("PUT", "/api/match-prefs", patch);
      const saved = await res.json();
      setP(saved.prefs ?? {});
      qc.invalidateQueries({ queryKey: ["/api/match-prefs"] });
      qc.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      qc.invalidateQueries({ queryKey: ["/api/profiles/discover"] });
    } catch {
      setP(before);
      toast({ title: "Couldn't save that", description: "Check your connection and try again.", variant: "destructive" });
    }
  };

  const toggleValue = (key: AdvancedPrefKey, value: string) => {
    const cur = p[key];
    const values = cur?.values ?? [];
    const next = values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
    save({ [key]: next.length ? { values: next, must: cur?.must ?? false } : null });
  };

  if (isLoading) {
    return (
      <LayoutShell>
        <FormSkeleton className="max-w-[560px] mx-auto" />
      </LayoutShell>
    );
  }

  const advancedBlock = (
    <div data-testid="filters-advanced">
      {ADVANCED_PREF_KEYS.map((key) => {
        const cur = p[key];
        return (
          <section key={key} className="py-5 border-b border-vf-line last:border-b-0">
            <h2 className="text-[16px] text-vf-text">{QUESTION[key]}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {PREF_OPTIONS[key].map((o) => (
                <Chip key={o.value} label={o.label} on={!!cur?.values.includes(o.value)} onClick={() => toggleValue(key, o.value)} testId={`pref-${key}-${o.value}`} />
              ))}
            </div>
            {cur && (
              <label className="mt-3 flex items-center justify-between gap-4 rounded-[12px] bg-vf-text/5 px-3.5 py-3 cursor-pointer">
                <span>
                  <span className="block text-[14px] text-vf-text">Make it a dealbreaker</span>
                  <span className="block text-[12px] text-vf-faint mt-0.5">
                    {cur.must
                      ? `Only people who picked one of these. Anyone who hasn't said is hidden too.`
                      : `Off: these people come up first, and everyone else still shows.`}
                  </span>
                </span>
                <Switch checked={cur.must} onCheckedChange={(v) => save({ [key]: { values: cur.values, must: v } })} data-testid={`pref-${key}-must`} />
              </label>
            )}
          </section>
        );
      })}
    </div>
  );

  return (
    <LayoutShell>
      <div className="max-w-[640px]">
        <button onClick={() => setLocation("/settings")} className="inline-flex items-center gap-1.5 text-[13px] text-vf-muted hover:text-vf-text" data-testid="button-filters-back">
          <ArrowLeft className="w-4 h-4" /> Settings
        </button>
        <div className={`${EYEBROW} mt-6`}>Filters</div>
        <h1 className="font-serif font-normal text-[30px] leading-[1.1] text-vf-text mt-2">Who comes up in Discover</h1>
        <p className="text-[14px] text-vf-muted mt-2 leading-[1.5]">
          Age, distance and who you see are in Settings. Nobody is told what you filter on.
        </p>

        <div className="mt-4" data-testid="filters-basic">
          <ToggleRow label="Verified only" note="People who passed the selfie check." on={!!p.verifiedOnly} onChange={(v) => save({ verifiedOnly: v })} testId="pref-verified-only" />
          <ToggleRow label="With photos only" note="Skip profiles that have no photo yet." on={!!p.hasPhotos} onChange={(v) => save({ hasPhotos: v })} testId="pref-has-photos" />
        </div>

        <div className={`${EYEBROW} mt-8`}>Home and abroad</div>
        <div className="mt-1" data-testid="filters-diaspora">
          {abroad ? (
            <ToggleRow
              label="Diaspora mode"
              note="See people at home in Zimbabwe, however far. People at home who are open to diaspora see you too."
              on={!!p.diasporaMode}
              onChange={(v) => save({ diasporaMode: v })}
              testId="pref-diaspora-mode"
            />
          ) : (
            <ToggleRow
              label="Open to diaspora"
              note="Also see Zimbabweans abroad who are looking at home, however far."
              on={!!p.openToDiaspora}
              onChange={(v) => save({ openToDiaspora: v })}
              testId="pref-open-to-diaspora"
            />
          )}
          <p className="text-[12.5px] text-vf-faint pb-2">
            {abroad ? "You said you live abroad." : "Live abroad?"}{" "}
            <button onClick={() => setLocation("/profile/details")} className="underline underline-offset-2 hover:text-vf-text" data-testid="link-filters-base">
              {abroad ? "Change it in About you" : "Say so in About you"}
            </button>
            .
          </p>
        </div>

        <div className={`${EYEBROW} mt-8`}>Faith, children and marriage</div>
        <p className="text-[13px] text-vf-faint mt-1.5 leading-[1.5]">
          Pick what you'd like. People who match come up first. Turn on "dealbreaker" and only they show.
        </p>
        <div className="mt-3">
          {data?.advanced ? advancedBlock : <Gated feature="advanced_filters">{advancedBlock}</Gated>}
        </div>
      </div>
    </LayoutShell>
  );
}

