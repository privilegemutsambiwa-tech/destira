import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  EVENT_KINDS,
  EVENT_VIBES,
  EVENT_PLACE_TYPES,
  EVENT_TIME_WINDOWS,
  EVENT_ACCESS_NEEDS,
  type EventPreferences as Prefs,
} from "@shared/schema";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Draft = {
  kinds: string[];
  vibes: string[];
  maxDistanceKm: number;
  placeTypes: string[];
  groupSizeMax: number | null;
  daysOfWeek: number[];
  timeWindows: string[];
  soberOnly: boolean;
  accessibilityNeeds: string[];
  notifyOnGoodMatch: boolean;
  notifyThreshold: number;
};

const toDraft = (p: Prefs): Draft => ({
  kinds: p.kinds ?? [],
  vibes: p.vibes ?? [],
  maxDistanceKm: p.maxDistanceKm ?? 15,
  placeTypes: p.placeTypes ?? [],
  groupSizeMax: p.groupSizeMax ?? null,
  daysOfWeek: p.daysOfWeek ?? [],
  timeWindows: p.timeWindows ?? [],
  soberOnly: p.soberOnly ?? false,
  accessibilityNeeds: p.accessibilityNeeds ?? [],
  notifyOnGoodMatch: p.notifyOnGoodMatch ?? true,
  notifyThreshold: p.notifyThreshold ?? 82,
});

const eqDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint mb-3">{children}</div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3.5 h-9 text-[13px] capitalize transition-colors ${
        active
          ? "border-vf-mint/50 bg-vf-mint/10 text-vf-text"
          : "border-vf-line text-vf-muted hover:text-vf-text hover:border-white/20"
      }`}
    >
      {label}
    </button>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`w-[42px] h-[24px] rounded-full shrink-0 flex items-center p-[3px] transition-colors ${
        on ? "bg-vf-mint justify-end" : "bg-white/[0.14] justify-start"
      }`}
    >
      <span className="block w-[18px] h-[18px] rounded-full" style={{ background: on ? "hsl(var(--vf-ink))" : "#CFC7DA" }} />
    </button>
  );
}

export default function EventPreferences() {
  const [loc, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const backTo = useMemo(() => {
    const from = new URLSearchParams(window.location.search).get("from");
    return from && from.startsWith("/") ? from : "/events";
  }, [loc]);

  const { data: server, isLoading } = useQuery<Prefs>({ queryKey: ["/api/event-preferences"] });
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    if (server && !draft) setDraft(toDraft(server));
  }, [server, draft]);

  const pristine = !!server && !!draft && eqDraft(draft, toDraft(server));

  // live count for the distance slider
  const [count, setCount] = useState<number | null>(null);
  const debounce = useRef<number | null>(null);
  useEffect(() => {
    if (!draft) return;
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/events/count?distanceKm=${draft.maxDistanceKm}`, { credentials: "include" });
        if (res.ok) setCount((await res.json()).count);
      } catch {
        /* leave stale */
      }
    }, 300);
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [draft?.maxDistanceKm]);

  const save = useMutation({
    mutationFn: (d: Draft) => apiRequest("PATCH", "/api/event-preferences", d),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/event-preferences"] });
      await qc.invalidateQueries({ queryKey: ["/api/events/feed"] });
      toast({ title: "Event preferences saved" });
    },
    onError: () => toast({ title: "Could not save", variant: "destructive" }),
  });

  if (isLoading || !draft) {
    return (
      <div className="min-h-dvh bg-vf-ink flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-vf-muted" />
      </div>
    );
  }

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...(d as Draft), ...p }));
  const toggleIn = (key: keyof Draft, v: string | number) =>
    setDraft((d) => {
      const cur = (d as any)[key] as (string | number)[];
      const has = cur.includes(v);
      return { ...(d as Draft), [key]: has ? cur.filter((x) => x !== v) : [...cur, v] };
    });

  const sizeMode = draft.groupSizeMax == null ? "any" : draft.groupSizeMax <= 10 ? "intimate" : "medium";

  return (
    <div className="min-h-dvh bg-vf-ink text-vf-text">
      <div className="sticky top-0 z-10 bg-vf-ink border-b border-vf-line flex items-center gap-3 px-4 h-14">
        <button onClick={() => setLocation(backTo)} className="w-8 h-8 flex items-center justify-center" data-testid="button-prefs-back">
          <ArrowLeft className="w-5 h-5 text-vf-ember" />
        </button>
        <h1 className="font-serif text-[20px] text-vf-text">Event preferences</h1>
      </div>

      <div className="max-w-[520px] mx-auto px-4 py-6 pb-28 flex flex-col gap-8">
        <p className="text-[14px] leading-[1.6] text-vf-muted -mt-1">
          Your feed is filtered by this and sorted by fit — most people never touch it again.
        </p>

        <section>
          <GroupLabel>What you're into</GroupLabel>
          <div className="flex flex-wrap gap-2">
            {EVENT_KINDS.map((k) => (
              <Chip key={k} label={k} active={draft.kinds.includes(k)} onClick={() => toggleIn("kinds", k)} />
            ))}
          </div>
        </section>

        <section>
          <GroupLabel>Vibe</GroupLabel>
          <div className="flex flex-wrap gap-2">
            {EVENT_VIBES.map((v) => (
              <Chip key={v} label={v} active={draft.vibes.includes(v)} onClick={() => toggleIn("vibes", v)} />
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-baseline justify-between mb-3">
            <GroupLabel>Distance</GroupLabel>
            <span className="font-mono text-[12px] text-vf-text">{draft.maxDistanceKm} km</span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            value={draft.maxDistanceKm}
            onChange={(e) => patch({ maxDistanceKm: Number(e.target.value) })}
            className="w-full"
            style={{ accentColor: "var(--vf-mint-vivid)" }}
            data-testid="slider-distance"
          />
          <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">
            {count == null ? "counting…" : `${count} event${count === 1 ? "" : "s"} within ${draft.maxDistanceKm}km`}
          </p>
        </section>

        <section>
          <GroupLabel>Kind of place</GroupLabel>
          <div className="flex flex-wrap gap-2">
            {EVENT_PLACE_TYPES.map((p) => (
              <Chip key={p} label={p} active={draft.placeTypes.includes(p)} onClick={() => toggleIn("placeTypes", p)} />
            ))}
          </div>
        </section>

        <section>
          <GroupLabel>When</GroupLabel>
          <div className="flex flex-wrap gap-2 mb-3">
            {EVENT_TIME_WINDOWS.map((t) => (
              <Chip key={t} label={t} active={draft.timeWindows.includes(t)} onClick={() => toggleIn("timeWindows", t)} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => (
              <Chip key={d} label={d} active={draft.daysOfWeek.includes(i)} onClick={() => toggleIn("daysOfWeek", i)} />
            ))}
          </div>
        </section>

        <section>
          <GroupLabel>Group size</GroupLabel>
          <div className="inline-flex rounded-full border border-vf-line overflow-hidden">
            {([
              ["Intimate (under 10)", "intimate", 9],
              ["Medium", "medium", 30],
              ["Any", "any", null],
            ] as const).map(([label, mode, val]) => (
              <button
                key={mode}
                type="button"
                onClick={() => patch({ groupSizeMax: val })}
                className={`px-4 h-9 text-[13px] transition-colors ${
                  sizeMode === mode ? "bg-vf-mint/10 text-vf-text" : "text-vf-muted hover:text-vf-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <GroupLabel>Access</GroupLabel>
          <div className="flex items-center justify-between">
            <span className="text-[14px] text-vf-soft">Only sober events</span>
            <Toggle on={draft.soberOnly} onChange={(v) => patch({ soberOnly: v })} />
          </div>
          <div className="flex flex-wrap gap-2">
            {EVENT_ACCESS_NEEDS.map((a) => (
              <Chip
                key={a}
                label={a.replace("-", " ")}
                active={draft.accessibilityNeeds.includes(a)}
                onClick={() => toggleIn("accessibilityNeeds", a)}
              />
            ))}
          </div>
        </section>

        <section className="rounded-[18px] border border-vf-mint/20 bg-vf-mint/[0.04] p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-mint">Twin alert</div>
            <Toggle on={draft.notifyOnGoodMatch} onChange={(v) => patch({ notifyOnGoodMatch: v })} />
          </div>
          {draft.notifyOnGoodMatch && (
            <>
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-[13px] text-vf-soft">Only tell me about someone above</span>
                  <span className="font-mono text-[12px] text-vf-text">{draft.notifyThreshold}</span>
                </div>
                <input
                  type="range"
                  min={70}
                  max={95}
                  value={draft.notifyThreshold}
                  onChange={(e) => patch({ notifyThreshold: Number(e.target.value) })}
                  className="w-full"
                  style={{ accentColor: "var(--vf-mint-vivid)" }}
                  data-testid="slider-threshold"
                />
              </div>
              <p className="text-[12.5px] leading-[1.5] text-vf-muted">
                Your twin will message you once, the day the event is announced. Never a push at 2am.
              </p>
            </>
          )}
        </section>
      </div>

      <div
        className="fixed bottom-0 inset-x-0 bg-vf-ink/90 backdrop-blur border-t border-vf-line px-4 pt-3"
        style={{ paddingBottom: "max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))" }}
      >
        <div className="max-w-[520px] mx-auto">
          <button
            onClick={() => draft && save.mutate(draft)}
            disabled={pristine || save.isPending}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-vf-ember text-vf-ink font-bold h-12 text-[15px] btn-press transition-colors hover:bg-[var(--vf-ember-soft)] disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="button-save-prefs"
          >
            {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {pristine ? "Saved" : "Save preferences"}
          </button>
        </div>
      </div>
    </div>
  );
}
