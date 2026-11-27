// Settings > Discovery: where you are, who you see and proximity alerts.

import { useState } from "react";
import { Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SEEKING_OPTIONS, ageFieldError } from "@shared/essentials";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CARD, ELEVATED, BORDER, MUTED, FAINT, TEXT, EMBER, INK, GOLD, MONO_EYEBROW, SECTION_HEADER_STYLE, SliderInput, Panel, GradientButton, ChoiceRow } from "./ui";

export function LocationPanel({ onBack, profile }: { onBack: () => void; profile: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [maxDist, setMaxDist] = useState(profile?.maxDistanceKm ?? 100);
  const [currentLocation, setCurrentLocation] = useState<string>(profile?.locationName ?? "");
  const [refreshing, setRefreshing] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/settings/discovery", { maxDistanceKm: Number(maxDist) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/discover"] });
      // Re-sync from what was actually sent, so this stays correct even if
      // the panel is unmounted/remounted before the refetch above resolves.
      setMaxDist(Number(maxDist));
      toast({ title: "Location preferences saved" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const refreshLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocation not supported by your browser", variant: "destructive" });
      return;
    }
    setRefreshing(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await apiRequest("POST", "/api/location/report", { lat: latitude, lng: longitude });
          const data = await res.json();
          setCurrentLocation(data.place?.name || "No named place here");
          toast({ title: data.place?.name ? `You're at ${data.place.name}` : "Location updated" });
        } catch {
          toast({ title: "Failed to update location", variant: "destructive" });
        } finally {
          setRefreshing(false);
        }
      },
      () => {
        toast({ title: "Could not get your location", variant: "destructive" });
        setRefreshing(false);
      }
    );
  };

  return (
    <Panel title="Location Preferences" onBack={onBack}>
      <div className="vf-card" style={{ margin: "16px 16px 0", borderRadius: "16px", overflow: "hidden", background: CARD }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}` }}>
          <p className="text-xs font-semibold mb-1" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1px" }}>Current Location</p>
          <div className="flex items-center justify-between">
            <p className="text-sm text-foreground" data-testid="text-current-location">{currentLocation || "Not set"}</p>
            <button
              onClick={refreshLocation}
              disabled={refreshing}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg btn-press transition-colors duration-150 hover:border-vf-text/25 disabled:opacity-50"
              style={{ background: ELEVATED, border: `1px solid ${BORDER}`, color: refreshing ? MUTED : TEXT }}
              data-testid="button-refresh-location"
            >
              {refreshing ? "Updating..." : "Refresh"}
            </button>
          </div>
        </div>
        <SliderInput label="Max Distance" value={maxDist} min={5} max={500} onChange={setMaxDist} unit=" km" />
      </div>
      <p className="text-xs px-4 pt-3" style={{ color: MUTED }}>
        Only show profiles within {maxDist} km of your current location.
      </p>
      <div style={{ padding: "16px" }}>
        <GradientButton
          label={saveMutation.isPending ? "Saving..." : "Save Preferences"}
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          testId="button-save-location"
        />
      </div>
    </Panel>
  );
}

export function ProximityPanel({ onBack, profile }: { onBack: () => void; profile: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/proximity/settings"] });

  const patch = useMutation({
    mutationFn: (body: any) => apiRequest("PATCH", "/api/proximity/settings", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/proximity/settings"] }),
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });
  const pause = useMutation({
    mutationFn: (hours: number | null) =>
      hours == null
        ? apiRequest("DELETE", "/api/proximity/pause")
        : apiRequest("POST", "/api/proximity/pause", { hours }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/proximity/settings"] }),
  });
  const hideHere = useMutation({
    mutationFn: () => apiRequest("POST", "/api/proximity/invisible", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/proximity/settings"] });
      toast({ title: "You're invisible here" });
    },
    onError: () => toast({ title: "No named place to hide at", variant: "destructive" }),
  });
  const unhide = useMutation({
    mutationFn: (placeId: number) => apiRequest("DELETE", `/api/proximity/invisible/${placeId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/proximity/settings"] }),
  });

  const paused = data?.pausedUntil && new Date(data.pausedUntil).getTime() > Date.now();

  return (
    <Panel title="Proximity Alerts" onBack={onBack}>
      <p className="text-xs px-4 pt-4 pb-1" style={{ color: MUTED, lineHeight: 1.6 }}>
        Your twin can tell you when someone well inside what you're looking for is at the same named
        place — a campus, a mall, an office park. Never a map, never a direction, never a trail. It only
        works while the app is open, and only if you're verified. It's the same the other way: if you
        show up in someone's alert, they show up in yours.
      </p>

      {!isLoading && !data?.isVerified && (
        <p className="text-xs mx-4 mt-2 px-3 py-2 rounded-lg" style={{ background: ELEVATED, border: `1px solid ${BORDER}`, color: GOLD }}>
          Proximity alerts need a verified profile on both sides. Verify yours to switch this on.
        </p>
      )}

      <div className="vf-card" style={{ background: CARD, margin: "12px 16px 0", borderRadius: "16px", overflow: "hidden" }}>
        <ChoiceRow
          label="Where alerts can fire"
          value={data?.mode ?? "off"}
          onChange={(v) => patch.mutate({ proximityMode: v })}
          options={[
            { value: "off", label: "Off" },
            { value: "campus_work", label: "Campus & work" },
            { value: "everywhere", label: "Everywhere" },
          ]}
          testId="proximity-mode"
        />
        <ChoiceRow
          label="How strong the match has to be"
          value={data?.floor ?? "sometimes"}
          onChange={(v) => patch.mutate({ proximityFloor: v })}
          options={[
            { value: "rare", label: "Only the rare ones" },
            { value: "sometimes", label: "Sometimes" },
            { value: "strong", label: "Strong matches" },
          ]}
          testId="proximity-floor"
        />
        <div style={{ padding: "14px 16px" }}>
          <p style={{ ...MONO_EYEBROW, color: FAINT, marginBottom: "10px" }}>Quiet hours</p>
          <div className="flex items-center gap-2 text-sm" style={{ color: TEXT }}>
            <span style={{ color: MUTED }}>From</span>
            <select
              value={data?.quietStart ?? 21}
              onChange={(e) => patch.mutate({ proximityQuietStart: Number(e.target.value) })}
              className="px-2 py-1 rounded-lg text-sm vf-input-focus"
              style={{ background: ELEVATED, border: `1px solid ${BORDER}`, color: TEXT }}
              data-testid="proximity-quiet-start"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
              ))}
            </select>
            <span style={{ color: MUTED }}>to</span>
            <select
              value={data?.quietEnd ?? 8}
              onChange={(e) => patch.mutate({ proximityQuietEnd: Number(e.target.value) })}
              className="px-2 py-1 rounded-lg text-sm vf-input-focus"
              style={{ background: ELEVATED, border: `1px solid ${BORDER}`, color: TEXT }}
              data-testid="proximity-quiet-end"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
              ))}
            </select>
          </div>
          <p className="text-xs mt-2" style={{ color: FAINT }}>In your local time.</p>
        </div>
      </div>

      <div className="vf-card" style={{ background: CARD, margin: "16px 16px 0", borderRadius: "16px", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}` }}>
          <p style={{ ...MONO_EYEBROW, color: FAINT, marginBottom: "4px" }}>Right now</p>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm" style={{ color: TEXT }}>
              {data?.currentPlace ? data.currentPlace.name : "Not at a named place"}
            </p>
            {data?.currentPlace && (
              <button
                onClick={() => hideHere.mutate()}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg btn-press transition-colors duration-150"
                style={{ background: ELEVATED, border: `1px solid ${BORDER}`, color: TEXT }}
                data-testid="proximity-hide-here"
              >
                Be invisible here
              </button>
            )}
          </div>
        </div>
        <div style={{ padding: "14px 16px" }}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm" style={{ color: TEXT }}>
              {paused
                ? `Paused until ${new Date(data.pausedUntil).toLocaleString()}`
                : "Alerts are live"}
            </p>
            <button
              onClick={() => pause.mutate(paused ? null : 8)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg btn-press transition-colors duration-150"
              style={{ background: paused ? EMBER : ELEVATED, border: `1px solid ${BORDER}`, color: paused ? INK : TEXT }}
              data-testid="proximity-pause"
            >
              {paused ? "Resume now" : "Pause for 8 hours"}
            </button>
          </div>
        </div>
      </div>

      {Array.isArray(data?.invisibleAt) && data.invisibleAt.length > 0 && (
        <>
          <div style={SECTION_HEADER_STYLE}>Invisible at</div>
          <div className="vf-card" style={{ background: CARD, margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
            {data.invisibleAt.map((pl: any, i: number) => (
              <div
                key={pl.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 16px",
                  borderBottom: i < data.invisibleAt.length - 1 ? `1px solid ${BORDER}` : "none",
                }}
              >
                <span className="text-sm" style={{ color: TEXT }}>{pl.name}</span>
                <button
                  onClick={() => unhide.mutate(pl.id)}
                  className="text-xs font-semibold px-3 py-1 btn-press transition-colors duration-150"
                  style={{ color: EMBER, border: `1px solid rgba(255,107,74,0.4)`, borderRadius: "8px" }}
                  data-testid={`proximity-unhide-${pl.id}`}
                >
                  Show again
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

export function AgeRangePanel({ onBack, profile }: { onBack: () => void; profile: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [ageMinText, setAgeMinText] = useState(String(profile?.ageMinPreference ?? 18));
  const [ageMaxText, setAgeMaxText] = useState(String(profile?.ageMaxPreference ?? 35));

  const ageMinNum = Number(ageMinText);
  const ageMaxNum = Number(ageMaxText);
  const ageMinFieldError = ageFieldError("Minimum age", ageMinText);
  const ageMaxFieldError = ageFieldError("Maximum age", ageMaxText);
  const rangeInvalid = !ageMinFieldError && !ageMaxFieldError && ageMaxNum < ageMinNum;
  const minInvalid = !!ageMinFieldError;
  const maxInvalid = !!ageMaxFieldError;
  const ageError = ageMinFieldError || ageMaxFieldError || (rangeInvalid ? "Maximum age must be greater than or equal to minimum age" : null);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/settings/discovery", { ageMinPreference: ageMinNum, ageMaxPreference: ageMaxNum }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      // Re-sync from what was actually sent, so this stays correct even if
      // the panel is unmounted/remounted before the refetch above resolves.
      setAgeMinText(String(ageMinNum));
      setAgeMaxText(String(ageMaxNum));
      toast({ title: "Age range saved" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to save", variant: "destructive" }),
  });

  return (
    <Panel title="Age Range" onBack={onBack}>
      <div
        style={{ margin: "16px 16px 0", borderRadius: "16px", background: CARD, padding: "20px 16px" }}
        className="flex items-center justify-center gap-4 vf-card"
      >
        <label className="flex flex-col items-center gap-2">
          <span className="text-xs" style={{ color: MUTED }}>Minimum Age</span>
          <input
            type="number"
            inputMode="numeric"
            min={18}
            max={99}
            value={ageMinText}
            onChange={(e) => setAgeMinText(e.target.value)}
            className="w-20 h-11 rounded-xl text-center text-base outline-none vf-input-focus"
            style={{ background: ELEVATED, border: `1px solid ${minInvalid ? "#EF4444" : BORDER}`, color: TEXT }}
            data-testid="input-age-min"
          />
        </label>
        <span className="mt-5" style={{ color: MUTED }}>to</span>
        <label className="flex flex-col items-center gap-2">
          <span className="text-xs" style={{ color: MUTED }}>Maximum Age</span>
          <input
            type="number"
            inputMode="numeric"
            min={18}
            max={99}
            value={ageMaxText}
            onChange={(e) => setAgeMaxText(e.target.value)}
            className="w-20 h-11 rounded-xl text-center text-base outline-none vf-input-focus"
            style={{ background: ELEVATED, border: `1px solid ${maxInvalid || rangeInvalid ? "#EF4444" : BORDER}`, color: TEXT }}
            data-testid="input-age-max"
          />
        </label>
      </div>
      {ageError ? (
        <p className="text-xs px-4 pt-3" style={{ color: "#EF4444" }} data-testid="age-range-error">
          {ageError}
        </p>
      ) : (
        <p className="text-xs px-4 pt-3" style={{ color: MUTED }}>
          Show profiles for people aged {ageMinNum}–{ageMaxNum}.
        </p>
      )}
      <div style={{ padding: "16px" }}>
        <GradientButton
          label="Save Age Range"
          onClick={() => saveMutation.mutate()}
          disabled={!!ageError || saveMutation.isPending}
          testId="button-save-age-range"
        />
      </div>
    </Panel>
  );
}

export function SeekingGendersPanel({ onBack, profile }: { onBack: () => void; profile: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>(profile?.seekingGenders ?? []);
  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/settings/discovery", { seekingGenders: selected }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/discover"] });
      // Re-sync from what was actually sent, so this stays correct even if
      // the panel is unmounted/remounted before the refetch above resolves.
      setSelected(selected);
      toast({ title: "Preference saved" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const toggle = (value: string) => {
    if (value === "everyone") {
      setSelected(["everyone"]);
      return;
    }
    setSelected((prev) => {
      const withoutEveryone = prev.filter((v) => v !== "everyone");
      return withoutEveryone.includes(value)
        ? withoutEveryone.filter((v) => v !== value)
        : [...withoutEveryone, value];
    });
  };

  return (
    <Panel title="Who You See" onBack={onBack}>
      <div className="vf-card" style={{ margin: "16px 16px 0", borderRadius: "16px", overflow: "hidden", background: CARD }}>
        {SEEKING_OPTIONS.map((opt, i) => {
          const active = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => toggle(opt.value)}
              className="w-full flex items-center justify-between vf-row transition-colors duration-150"
              style={{
                padding: "14px 16px",
                borderBottom: i < SEEKING_OPTIONS.length - 1 ? `1px solid ${BORDER}` : "none",
              }}
              data-testid={`option-seeking-${opt.value}`}
            >
              <span className="text-sm" style={{ color: TEXT }}>{opt.label}</span>
              {active && <Check className="w-4 h-4" style={{ color: EMBER }} />}
            </button>
          );
        })}
      </div>
      <p className="text-xs px-4 pt-3" style={{ color: MUTED }}>
        {selected.length === 0 || selected.includes("everyone")
          ? "You'll see profiles and stories from everyone."
          : "You'll only see profiles and stories that match your selection, unless you choose Everyone."}
      </p>
      <div style={{ padding: "16px" }}>
        <GradientButton
          label={saveMutation.isPending ? "Saving..." : "Save Preference"}
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          testId="button-save-seeking-genders"
        />
      </div>
    </Panel>
  );
}
