// "About you": faith, children, marriage plans and everyday details
// (shared/profile-details.ts). Every field is optional; each tap saves on its
// own, and tapping a chosen answer again clears it.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useProfile } from "@/hooks/use-profiles";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { LayoutShell } from "@/components/layout-shell";
import {
  BASE_OPTIONS,
  DRINKING_OPTIONS,
  EDUCATION_OPTIONS,
  FAITH_IMPORTANCE_OPTIONS,
  FAITH_OPTIONS,
  HAS_CHILDREN_OPTIONS,
  LANGUAGE_OPTIONS,
  MARRIAGE_OPTIONS,
  MOVING_BACK_OPTIONS,
  SMOKING_OPTIONS,
  WANTS_CHILDREN_OPTIONS,
  type ProfileDetails,
} from "@shared/profile-details";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";

export function Chip({ label, on, onClick, testId }: { label: string; on: boolean; onClick: () => void; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-full text-[14px] transition-colors ${
        on ? "border-2 border-vf-ember bg-vf-ember/10 text-vf-text" : "border border-vf-line text-vf-muted hover:text-vf-text hover:border-vf-text/25"
      }`}
      data-testid={testId}
    >
      {on && <Check className="w-3.5 h-3.5 text-vf-ember" />}
      {label}
    </button>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="py-5 border-b border-vf-line last:border-b-0">
      <h2 className="text-[16px] text-vf-text">{title}</h2>
      {note && <p className="text-[12.5px] text-vf-faint mt-0.5">{note}</p>}
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

export default function ProfileDetailsPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [d, setD] = useState<ProfileDetails>({});
  const [job, setJob] = useState("");
  const [height, setHeight] = useState("");
  const [country, setCountry] = useState("");

  useEffect(() => {
    const cur = ((profile as any)?.details ?? {}) as ProfileDetails;
    setD(cur);
    setJob(cur.job ?? "");
    setHeight(cur.heightCm ? String(cur.heightCm) : "");
    setCountry(cur.country ?? "");
  }, [profile]);

  const save = async (patch: Record<string, unknown>) => {
    if (!user) return;
    const before = d;
    setD((cur) => {
      const next: Record<string, unknown> = { ...cur };
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || (Array.isArray(v) && v.length === 0) || v === "") delete next[k];
        else next[k] = v;
      }
      return next as ProfileDetails;
    });
    try {
      const res = await apiRequest("PUT", `/api/profiles/${user.id}`, { details: patch });
      const saved = await res.json();
      setD((saved?.details ?? {}) as ProfileDetails);
      qc.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      qc.invalidateQueries({ queryKey: ["/api/profiles/me/completion"] });
    } catch {
      setD(before);
      toast({ title: "Couldn't save that", description: "Check your connection and try again.", variant: "destructive" });
    }
  };
  // One answer: tap to choose, tap again to clear.
  const pick = (key: keyof ProfileDetails, value: string) => save({ [key]: (d as any)[key] === value ? null : value });

  if (isLoading) {
    return (
      <LayoutShell>
        <Loader2 className="w-6 h-6 animate-spin text-vf-faint" />
      </LayoutShell>
    );
  }

  const one = (key: keyof ProfileDetails, options: { value: string; label: string }[]) =>
    options.map((o) => (
      <Chip key={o.value} label={o.label} on={(d as any)[key] === o.value} onClick={() => pick(key, o.value)} testId={`detail-${String(key)}-${o.value}`} />
    ));

  const langs = d.languages ?? [];
  const showImportance = !!d.faith && d.faith !== "prefer_not" && d.faith !== "none";

  return (
    <LayoutShell>
      <div className="max-w-[640px]">
        <button onClick={() => setLocation("/profile")} className="inline-flex items-center gap-1.5 text-[13px] text-vf-muted hover:text-vf-text" data-testid="button-details-back">
          <ArrowLeft className="w-4 h-4" /> Profile
        </button>
        <div className={`${EYEBROW} mt-6`}>About you</div>
        <h1 className="font-serif font-normal text-[30px] leading-[1.1] text-vf-text mt-2">The things people choose on</h1>
        <p className="text-[14px] text-vf-muted mt-2 leading-[1.5]">
          All optional. What you pick shows as a chip on your profile, and when you and someone else picked the same thing, we'll say so. "Prefer not to say" never shows. Your twin follows what you've set in "What your twin may discuss".
        </p>

        <div className="mt-4" data-testid="details-form">
          <Group title="Faith">{one("faith", FAITH_OPTIONS)}</Group>
          {showImportance && <Group title="How important is it to you?">{one("faithImportance", FAITH_IMPORTANCE_OPTIONS)}</Group>}
          <Group title="Children">{one("hasChildren", HAS_CHILDREN_OPTIONS)}</Group>
          <Group title="Do you want children?">{one("wantsChildren", WANTS_CHILDREN_OPTIONS)}</Group>
          <Group title="Marriage">{one("marriage", MARRIAGE_OPTIONS)}</Group>
          <Group title="Languages" note="Pick all you speak.">
            {LANGUAGE_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                on={langs.includes(o.value)}
                onClick={() => save({ languages: langs.includes(o.value) ? langs.filter((l) => l !== o.value) : [...langs, o.value] })}
                testId={`detail-languages-${o.value}`}
              />
            ))}
          </Group>
          <Group title="Education">{one("education", EDUCATION_OPTIONS)}</Group>
          <Group title="Work" note="A job title is plenty. No employer needed.">
            <input
              value={job}
              onChange={(e) => setJob(e.target.value.slice(0, 60))}
              onBlur={() => job.trim() !== (d.job ?? "") && save({ job: job.trim() || null })}
              placeholder="e.g. Nurse, Accountant, Runs a salon"
              className="w-full max-w-[360px] rounded-[12px] border border-vf-line bg-vf-text/5 px-3.5 h-11 text-[15px] text-vf-text placeholder:text-vf-faint outline-none focus:border-vf-ember/60"
              aria-label="What you do"
              data-testid="input-detail-job"
            />
          </Group>
          <Group title="Height">
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={height}
                min={130}
                max={230}
                onChange={(e) => setHeight(e.target.value)}
                onBlur={() => {
                  const n = Number(height);
                  if (!height) return d.heightCm && save({ heightCm: null });
                  if (Number.isInteger(n) && n >= 130 && n <= 230 && n !== d.heightCm) save({ heightCm: n });
                }}
                placeholder="170"
                className="w-24 rounded-[12px] border border-vf-line bg-vf-text/5 px-3 h-11 text-center text-[15px] text-vf-text outline-none focus:border-vf-ember/60"
                aria-label="Height in centimetres"
              data-testid="input-detail-height"
              />
              <span className="text-vf-muted text-[14px]">cm</span>
            </div>
          </Group>
          <Group title="Drinking">{one("drinking", DRINKING_OPTIONS)}</Group>
          <Group title="Smoking">{one("smoking", SMOKING_OPTIONS)}</Group>
          <Group title="Where you're based">{one("base", BASE_OPTIONS)}</Group>
          {d.base === "diaspora" && (
            <>
              <Group title="Which country?">
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value.slice(0, 40))}
                  onBlur={() => country.trim() !== (d.country ?? "") && save({ country: country.trim() || null })}
                  placeholder="e.g. South Africa, UK"
                  className="w-full max-w-[360px] rounded-[12px] border border-vf-line bg-vf-text/5 px-3.5 h-11 text-[15px] text-vf-text placeholder:text-vf-faint outline-none focus:border-vf-ember/60"
                  data-testid="input-detail-country"
                />
              </Group>
              <Group title="Moving back home?">{one("movingBack", MOVING_BACK_OPTIONS)}</Group>
            </>
          )}
        </div>
      </div>
    </LayoutShell>
  );
}
