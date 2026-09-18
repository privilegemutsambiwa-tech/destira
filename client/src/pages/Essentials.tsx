import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, ArrowLeft, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useProfile } from "@/hooks/use-profiles";
import { useToast } from "@/hooks/use-toast";
import {
  GENDER_OPTIONS,
  SEEKING_OPTIONS,
  DATING_INTENT_OPTIONS,
  MIN_AGE,
  MAX_AGE,
  defaultAgeRange,
  ageFromDob,
} from "@shared/essentials";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";

const STEPS = ["gender", "seeking", "intent", "age", "area"] as const;
type Step = (typeof STEPS)[number];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-vf-ink text-vf-text flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-[520px]">{children}</div>
    </div>
  );
}

function OptionRow({
  label,
  sublabel,
  selected,
  onClick,
  testId,
}: {
  label: string;
  sublabel?: string;
  selected: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`w-full text-left rounded-[14px] px-4 py-3.5 min-h-[56px] flex items-center justify-between gap-3 transition-colors ${
        selected
          ? "border-2 border-vf-ember bg-vf-ember/10 text-vf-text"
          : "border border-vf-line text-vf-muted hover:text-vf-text hover:border-vf-text/20"
      }`}
    >
      <span>
        <span className="block text-[15px] text-vf-text">{label}</span>
        {sublabel && <span className="block text-[12.5px] text-vf-faint mt-0.5">{sublabel}</span>}
      </span>
      {selected && <Check className="w-4 h-4 text-vf-ember shrink-0" />}
    </button>
  );
}

export default function Essentials() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: profile, isLoading } = useProfile();

  const [idx, setIdx] = useState(0);
  const step: Step = STEPS[idx];

  const [gender, setGender] = useState<string>("");
  const [selfDescribe, setSelfDescribe] = useState("");
  const [seeking, setSeeking] = useState<string[]>([]);
  const [intent, setIntent] = useState<string>("");
  const [ageMin, setAgeMin] = useState(MIN_AGE);
  const [ageMax, setAgeMax] = useState(60);
  const [ageMinText, setAgeMinText] = useState(String(MIN_AGE));
  const [ageMaxText, setAgeMaxText] = useState("60");
  const [ageTouched, setAgeTouched] = useState(false);
  const [area, setArea] = useState("");
  const [areaQuery, setAreaQuery] = useState("");
  const [areaResults, setAreaResults] = useState<{ label: string; lat: number | null; lng: number | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const seeded = useRef(false);

  const ownAge = useMemo(() => {
    if (profile?.dateOfBirth) return ageFromDob(profile.dateOfBirth);
    return profile?.age ?? null;
  }, [profile]);

  // Seed from an existing profile once (resume / back-out).
  useEffect(() => {
    if (seeded.current || !profile) return;
    if (profile.gender) setGender(profile.gender);
    if (profile.genderSelfDescribe) setSelfDescribe(profile.genderSelfDescribe);
    if (Array.isArray(profile.seekingGenders)) setSeeking(profile.seekingGenders);
    if (profile.datingIntent) setIntent(profile.datingIntent);
    if (profile.ageMinPreference || profile.ageMaxPreference) {
      const min = profile.ageMinPreference ?? MIN_AGE;
      const max = profile.ageMaxPreference ?? 60;
      setAgeMin(min);
      setAgeMax(max);
      setAgeMinText(String(min));
      setAgeMaxText(String(max));
      setAgeTouched(true);
    } else if (ownAge) {
      const d = defaultAgeRange(ownAge);
      setAgeMin(d.min);
      setAgeMax(d.max);
      setAgeMinText(String(d.min));
      setAgeMaxText(String(d.max));
    }
    if (profile.location) setArea(profile.location);
    seeded.current = true;
  }, [profile, ownAge]);

  // Suburb search.
  useEffect(() => {
    if (step !== "area") return;
    const q = areaQuery.trim();
    if (q.length < 2) {
      setAreaResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geo/suburbs?q=${encodeURIComponent(q)}`, { credentials: "include" });
        setAreaResults(res.ok ? await res.json() : []);
      } catch {
        setAreaResults([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [areaQuery, step]);

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      await apiRequest("POST", "/api/profiles", patch);
    } catch {
      toast({ title: "Couldn't save that — carrying on", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (idx + 1 >= STEPS.length) {
      setLocation("/onboarding");
    } else {
      setIdx((i) => i + 1);
    }
  };
  const back = () => setIdx((i) => Math.max(0, i - 1));

  const pickGender = async (v: string) => {
    setGender(v);
    if (v !== "self-describe") {
      await save({ gender: v, genderSelfDescribe: null });
      next();
    }
  };
  const confirmSelfDescribe = async () => {
    await save({ gender: "self-describe", genderSelfDescribe: selfDescribe.trim() || null });
    next();
  };
  const toggleSeeking = (v: string) =>
    setSeeking((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  const pickIntent = async (v: string) => {
    setIntent(v);
    await save({ datingIntent: v });
    next();
  };

  if (isLoading) {
    return (
      <Shell>
        <div className="flex justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-vf-ember" />
        </div>
      </Shell>
    );
  }

  const pct = Math.round(((idx + 1) / STEPS.length) * 100);

  return (
    <Shell>
      <div className="mb-6 flex items-center gap-3">
        {idx > 0 ? (
          <button onClick={back} className="w-8 h-8 -ml-2 flex items-center justify-center text-vf-muted hover:text-vf-text" aria-label="Back" data-testid="button-essentials-back">
            <ArrowLeft className="w-5 h-5" />
          </button>
        ) : (
          <div className="w-6" />
        )}
        <div className="flex-1 h-1 rounded-full bg-vf-text/10 overflow-hidden">
          <div className="h-full bg-vf-ember transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono text-[10.5px] text-vf-faint tabular-nums">
          {String(idx + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
        </span>
      </div>

      {step === "gender" && (
        <div>
          <div className={EYEBROW}>About you</div>
          <h1 className="font-serif font-normal text-[28px] leading-[1.15] text-vf-text mt-3 mb-6">
            Your gender
          </h1>
          <div className="flex flex-col gap-2.5">
            {GENDER_OPTIONS.map((o) => (
              <OptionRow
                key={o.value}
                label={o.label}
                selected={gender === o.value}
                onClick={() => pickGender(o.value)}
                testId={`essentials-gender-${o.value}`}
              />
            ))}
          </div>
          {gender === "self-describe" && (
            <div className="mt-4 flex flex-col gap-3">
              <input
                autoFocus
                value={selfDescribe}
                onChange={(e) => setSelfDescribe(e.target.value.slice(0, 60))}
                placeholder="In your words"
                className="w-full rounded-[12px] border border-vf-line bg-vf-text/5 px-3.5 h-11 text-[15px] text-vf-text placeholder:text-vf-faint outline-none focus:border-vf-ember/60"
                data-testid="input-gender-self-describe"
              />
              <button
                onClick={confirmSelfDescribe}
                disabled={saving}
                className="h-11 rounded-full bg-vf-ember text-vf-ink font-medium text-[14px] disabled:opacity-50"
                data-testid="button-gender-continue"
              >
                Continue
              </button>
            </div>
          )}
        </div>
      )}

      {step === "seeking" && (
        <div>
          <div className={EYEBROW}>Who you'd like to meet</div>
          <h1 className="font-serif font-normal text-[28px] leading-[1.15] text-vf-text mt-3 mb-1">
            Show me
          </h1>
          <p className="text-[13px] text-vf-faint mb-6">Pick as many as fit. Editable in Settings.</p>
          <div className="flex flex-col gap-2.5">
            {SEEKING_OPTIONS.map((o) => (
              <OptionRow
                key={o.value}
                label={o.label}
                selected={seeking.includes(o.value)}
                onClick={() => toggleSeeking(o.value)}
                testId={`essentials-seeking-${o.value}`}
              />
            ))}
          </div>
          <div className="mt-6 flex items-center gap-4">
            <button
              onClick={async () => {
                if (!seeking.length) return;
                await save({ seekingGenders: seeking });
                next();
              }}
              disabled={!seeking.length || saving}
              className="flex-1 h-12 rounded-full bg-vf-ember text-vf-ink font-medium text-[14px] disabled:opacity-50"
              data-testid="button-seeking-continue"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === "intent" && (
        <div>
          <div className={EYEBROW}>What you're here for</div>
          <h1 className="font-serif font-normal text-[28px] leading-[1.15] text-vf-text mt-3 mb-6">
            Right now, you're after
          </h1>
          <div className="flex flex-col gap-2.5">
            {DATING_INTENT_OPTIONS.map((o) => (
              <OptionRow
                key={o.value}
                label={o.label}
                sublabel={o.note}
                selected={intent === o.value}
                onClick={() => pickIntent(o.value)}
                testId={`essentials-intent-${o.value}`}
              />
            ))}
          </div>
          <button onClick={next} className="mt-5 text-[13px] text-vf-faint hover:text-vf-text" data-testid="button-intent-skip">
            Skip
          </button>
        </div>
      )}

      {step === "age" && (
        <div>
          <div className={EYEBROW}>Age range</div>
          <h1 className="font-serif font-normal text-[28px] leading-[1.15] text-vf-text mt-3 mb-6">
            Open to ages
          </h1>
          <div className="flex items-center justify-center gap-4 mb-6">
            <input
              type="number"
              inputMode="numeric"
              value={ageMinText}
              min={MIN_AGE}
              max={ageMax}
              onChange={(e) => {
                setAgeTouched(true);
                setAgeMinText(e.target.value);
              }}
              onBlur={() => {
                const clamped = Math.max(MIN_AGE, Math.min(Number(ageMinText) || MIN_AGE, ageMax));
                setAgeMin(clamped);
                setAgeMinText(String(clamped));
              }}
              className="w-20 rounded-[12px] border border-vf-line bg-vf-text/5 px-3 h-12 text-center text-[20px] font-serif text-vf-text outline-none focus:border-vf-ember/60"
              data-testid="input-age-min"
            />
            <span className="text-vf-faint">to</span>
            <input
              type="number"
              inputMode="numeric"
              value={ageMaxText}
              min={ageMin}
              max={MAX_AGE}
              onChange={(e) => {
                setAgeTouched(true);
                setAgeMaxText(e.target.value);
              }}
              onBlur={() => {
                const clamped = Math.min(MAX_AGE, Math.max(Number(ageMaxText) || MAX_AGE, ageMin));
                setAgeMax(clamped);
                setAgeMaxText(String(clamped));
              }}
              className="w-20 rounded-[12px] border border-vf-line bg-vf-text/5 px-3 h-12 text-center text-[20px] font-serif text-vf-text outline-none focus:border-vf-ember/60"
              data-testid="input-age-max"
            />
          </div>
          {ownAge && !ageTouched && (
            <p className="text-[12.5px] text-vf-faint text-center mb-6">Set from your age — change if you like.</p>
          )}
          <div className="flex items-center gap-4">
            <button
              onClick={async () => {
                const min = Math.max(MIN_AGE, Math.min(Number(ageMinText) || MIN_AGE, MAX_AGE));
                const max = Math.min(MAX_AGE, Math.max(Number(ageMaxText) || MAX_AGE, min));
                await save({ ageMinPreference: min, ageMaxPreference: max });
                next();
              }}
              className="flex-1 h-12 rounded-full bg-vf-ember text-vf-ink font-medium text-[14px]"
              data-testid="button-age-continue"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === "area" && (
        <div>
          <div className={EYEBROW}>Where you are</div>
          <h1 className="font-serif font-normal text-[28px] leading-[1.15] text-vf-text mt-3 mb-6">
            Your area
          </h1>
          {area && !areaQuery && (
            <div className="mb-3 rounded-[12px] border border-vf-line bg-vf-surface2 px-3.5 py-3 flex items-center justify-between">
              <span className="text-[14px] text-vf-text">{area}</span>
              <button onClick={() => setArea("")} className="text-[12px] text-vf-faint hover:text-vf-text" data-testid="button-area-clear">
                Change
              </button>
            </div>
          )}
          <input
            value={areaQuery}
            onChange={(e) => setAreaQuery(e.target.value)}
            autoComplete="address-level2"
            placeholder="Suburb or town — e.g. Avondale"
            className="w-full rounded-[12px] border border-vf-line bg-vf-text/5 px-3.5 h-11 text-[15px] text-vf-text placeholder:text-vf-faint outline-none focus:border-vf-ember/60"
            data-testid="input-area-search"
          />
          {areaResults.length > 0 && (
            <div className="mt-2 rounded-[12px] border border-vf-line bg-vf-surface2 divide-y divide-vf-line overflow-hidden">
              {areaResults.map((r) => (
                <button
                  key={r.label}
                  onClick={() => {
                    setArea(r.label);
                    setAreaQuery("");
                    setAreaResults([]);
                  }}
                  className="w-full text-left px-3.5 py-3 text-[14px] text-vf-text hover:bg-vf-text/[0.04]"
                  data-testid={`area-result-${r.label}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => {
              if (!navigator.geolocation) return;
              navigator.geolocation.getCurrentPosition(
                async (pos) => {
                  try {
                    const res = await fetch(`/api/geo/suburbs?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`, { credentials: "include" });
                    const hits = res.ok ? await res.json() : [];
                    if (hits[0]) {
                      setArea(hits[0].label);
                      setAreaQuery("");
                    }
                  } catch {
                    /* ignore */
                  }
                },
                () => toast({ title: "Couldn't get your location" }),
                { timeout: 8000 },
              );
            }}
            className="mt-3 text-[13px] text-vf-ember hover:text-vf-text"
            data-testid="button-area-use-location"
          >
            Use my location
          </button>

          <div className="mt-6 flex items-center gap-4">
            <button
              onClick={async () => {
                if (area) await save({ location: area });
                next();
              }}
              disabled={saving}
              className="flex-1 h-12 rounded-full bg-vf-ember text-vf-ink font-medium text-[14px] disabled:opacity-50"
              data-testid="button-area-continue"
            >
              {idx + 1 >= STEPS.length ? "Done" : "Continue"}
            </button>
            <button onClick={next} className="text-[13px] text-vf-faint hover:text-vf-text" data-testid="button-area-skip">
              Skip
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}
