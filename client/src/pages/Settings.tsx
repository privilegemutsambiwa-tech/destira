import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, User, Brain, Compass, Shield, Bell, Wrench, Crown, HelpCircle,
  AlertTriangle, ChevronRight, LogOut, Trash2, PauseCircle, Eye, EyeOff,
  Volume2, MapPin, MessageSquare, Zap, Check, Lock, Mail, Sliders, FileText,
  ChevronDown, ChevronUp, X, Plus, Download, UserX, CreditCard, BookOpen, Phone, CalendarDays, Loader2
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { PasswordInput } from "@/components/ui/password-input";
import { useProfile, useUpdateProfile } from "@/hooks/use-profiles";
import { useToast } from "@/hooks/use-toast";
import { PLAN_CARDS as SETTINGS_PLAN_CARDS, LIMITS as SETTINGS_LIMITS } from "@shared/entitlements";
import { useCancelSubscription } from "@/hooks/use-payments";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";

const BG = "#0C0910";        // vf-ink — page ground
const CARD = "#161220";      // vf-surface2 — setting rows
const ELEVATED = "rgba(255,255,255,0.05)"; // input fill
const BORDER = "rgba(255,255,255,0.09)";   // vf-line — hairline
const MUTED = "#A79FB4";     // vf-muted — body
const FAINT = "#7E7690";     // vf-faint — 12-13px metadata only
const TEXT = "#F5F0EA";      // vf-text
const EMBER = "#FF6B4A";     // human / primary action
const MINT = "#8FE3C7";      // AI-twin layer — and toggle tracks, per the global rule
const INK = "#0C0910";       // knob on a mint track, text on an ember fill
const GOLD = "#E9C46A";      // Ember premium / upsell only

const SERIF: React.CSSProperties = { fontFamily: '"Instrument Serif", serif', fontWeight: 400 };
const MONO_EYEBROW: React.CSSProperties = {
  fontFamily: '"DM Mono", ui-monospace, monospace',
  fontSize: "10.5px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  fontWeight: 400,
};

const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  height: "52px",
  padding: "0 16px",
  cursor: "pointer",
  borderBottom: `1px solid ${BORDER}`,
};

const SECTION_HEADER_STYLE: React.CSSProperties = {
  ...MONO_EYEBROW,
  color: MUTED,
  padding: "24px 16px 10px",
};

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onChange(!value); }}
      style={{
        width: "42px", height: "24px", borderRadius: "100px",
        background: value ? MINT : "rgba(255,255,255,0.14)",
        transition: "background 0.2s", position: "relative", cursor: "pointer", flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute", top: "3px", left: value ? "21px" : "3px",
        width: "18px", height: "18px", borderRadius: "50%",
        background: value ? INK : "#CFC7DA",
        transition: "left 0.2s, background 0.2s",
      }} />
    </div>
  );
}

function ToggleRow({ icon: Icon, label, value, onChange, testId }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string; value: boolean; onChange: (v: boolean) => void; testId?: string;
}) {
  return (
    <div style={ROW_STYLE} onClick={() => onChange(!value)} data-testid={testId}>
      <Icon className="w-5 h-5 mr-3" style={{ color: MUTED }} />
      <span className="flex-1 text-sm font-medium text-white">{label}</span>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

function ChevronRow({ icon: Icon, label, sublabel, onClick, destructive, testId }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string; sublabel?: string; onClick: () => void; destructive?: boolean; testId?: string;
}) {
  return (
    <div style={ROW_STYLE} onClick={onClick} data-testid={testId}>
      <Icon className="w-5 h-5 mr-3" style={{ color: destructive ? "#EF4444" : MUTED }} />
      <div className="flex-1">
        <p className="text-sm font-medium" style={{ color: destructive ? "#EF4444" : "#FFFFFF" }}>{label}</p>
        {sublabel && <p className="text-xs" style={{ color: MUTED }}>{sublabel}</p>}
      </div>
      <ChevronRight className="w-4 h-4" style={{ color: MUTED }} />
    </div>
  );
}

function InviteRow() {
  const { data } = useQuery<{ code: string; url: string; counts: { pending: number; qualified: number; rewarded: number }; viewsEarned: number }>({
    queryKey: ["/api/referrals/me"],
  });
  const [copied, setCopied] = useState(false);

  const joined = data ? data.counts.pending + data.counts.qualified + data.counts.rewarded : 0;
  const views = data?.viewsEarned ?? 0;

  const copy = async () => {
    if (!data?.url) return;
    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked */ }
  };

  return (
    <div style={{ padding: "14px 16px" }} data-testid="row-referral">
      <div className="flex items-center gap-3">
        <Plus className="w-5 h-5 shrink-0" style={{ color: MUTED }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: TEXT }}>Invite a friend</p>
          <p style={{ ...MONO_EYEBROW, color: FAINT, marginTop: "3px" }}>
            {joined} joined · {views} views earned
          </p>
        </div>
        <button
          onClick={copy}
          disabled={!data}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg btn-press disabled:opacity-40"
          style={{ background: ELEVATED, border: `1px solid ${BORDER}`, color: copied ? MINT : TEXT }}
          data-testid="button-copy-referral"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      {data?.code && (
        <div
          className="mt-2.5 text-xs px-3 py-2 rounded-lg select-all"
          style={{ background: ELEVATED, border: `1px solid ${BORDER}`, color: MUTED, fontFamily: '"DM Mono", ui-monospace, monospace', letterSpacing: "0.12em" }}
          data-testid="text-referral-code"
        >
          {data.code}
        </div>
      )}
    </div>
  );
}

function SliderInput({ label, value, min, max, onChange, unit = "" }: {
  label: string; value: number; min: number; max: number;
  onChange: (v: number) => void; unit?: string;
}) {
  return (
    <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}` }}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-white">{label}</span>
        <span className="text-sm" style={{ ...SERIF, color: EMBER, fontSize: "15px" }}>{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full" style={{ accentColor: EMBER }}
        data-testid={`slider-${label.toLowerCase().replace(/\s+/g, "-")}`}
      />
      <div className="flex justify-between mt-1">
        <span className="text-xs" style={{ color: MUTED }}>{min}{unit}</span>
        <span className="text-xs" style={{ color: MUTED }}>{max}{unit}</span>
      </div>
    </div>
  );
}

type PanelKey =
  | "change-email" | "change-password"
  | "twin-tone" | "location" | "age-range" | "block-list" | "proximity"
  | "data-privacy" | "verify" | "billing" | "help" | "contact" | "feedback"
  | "terms" | "privacy-policy" | "clear-memory" | null;

function Panel({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: BG, color: TEXT }}>
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4"
        style={{ height: "56px", background: BG, borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center" data-testid="button-panel-back">
          <ArrowLeft className="w-5 h-5" style={{ color: EMBER }} />
        </button>
        <h1 style={{ ...SERIF, color: TEXT, fontSize: "20px" }}>{title}</h1>
      </div>
      <div style={{ maxWidth: "480px", margin: "0 auto", paddingBottom: "40px" }}>
        {children}
      </div>
    </div>
  );
}

function GradientButton({ label, onClick, testId, danger }: {
  label: string; onClick: () => void; testId?: string; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className="w-full py-3 text-sm"
      style={{
        background: danger ? "#EF4444" : EMBER,
        color: danger ? "#FFFFFF" : INK,
        fontWeight: 600,
        borderRadius: "12px", border: "none", cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function TwinTonePanel({ onBack, profile }: { onBack: () => void; profile: any }) {
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
      <div style={{ margin: "12px 16px", borderRadius: "16px", background: CARD, padding: "4px 0" }}>
        {controls.map((c, i) => (
          <div key={c.key} style={{ padding: "14px 16px", borderBottom: i < controls.length - 1 ? `1px solid ${BORDER}` : "none" }}>
            <div className="flex justify-between mb-2">
              <p className="text-sm font-semibold text-white">{c.label}</p>
              <p className="text-xs font-medium" style={{ color: MUTED }}>{c.low} → {c.high}</p>
            </div>
            <input
              type="range" min={0} max={100} step={5} value={c.value}
              onChange={(e) => c.set(Number(e.target.value))}
              className="w-full"
              style={{ accentColor: EMBER }}
              data-testid={`slider-twin-${c.key}`}
            />
            <div className="flex justify-between mt-1">
              <span className="text-xs" style={{ color: MUTED }}>{c.low}</span>
              <span className="text-xs font-medium text-white">{c.value}</span>
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

function LocationPanel({ onBack, profile }: { onBack: () => void; profile: any }) {
  const { toast } = useToast();
  const [maxDist, setMaxDist] = useState(profile?.maxDistanceKm ?? 100);
  const [currentLocation, setCurrentLocation] = useState<string>(profile?.locationName ?? "");
  const [refreshing, setRefreshing] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/settings/discovery", { maxDistanceKm: maxDist }),
    onSuccess: () => toast({ title: "Location preferences saved" }),
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
      <div style={{ margin: "16px 16px 0", borderRadius: "16px", overflow: "hidden", background: CARD }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}` }}>
          <p className="text-xs font-semibold mb-1" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1px" }}>Current Location</p>
          <div className="flex items-center justify-between">
            <p className="text-sm text-white" data-testid="text-current-location">{currentLocation || "Not set"}</p>
            <button
              onClick={refreshLocation}
              disabled={refreshing}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: ELEVATED, border: `1px solid ${BORDER}`, color: refreshing ? MUTED : "#FFFFFF" }}
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
        <GradientButton label="Save Preferences" onClick={() => saveMutation.mutate()} testId="button-save-location" />
      </div>
    </Panel>
  );
}

function ChoiceRow({ label, options, value, onChange, testId }: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  return (
    <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}` }} data-testid={testId}>
      <p style={{ ...MONO_EYEBROW, color: FAINT, marginBottom: "10px" }}>{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg btn-press"
              style={{
                background: active ? "rgba(143,227,199,0.14)" : ELEVATED,
                border: `1px solid ${active ? "rgba(143,227,199,0.4)" : BORDER}`,
                color: active ? MINT : TEXT,
              }}
              data-testid={testId ? `${testId}-${o.value}` : undefined}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProximityPanel({ onBack, profile }: { onBack: () => void; profile: any }) {
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

      <div style={{ background: CARD, margin: "12px 16px 0", borderRadius: "16px", overflow: "hidden" }}>
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
              className="px-2 py-1 rounded-lg text-sm"
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
              className="px-2 py-1 rounded-lg text-sm"
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

      <div style={{ background: CARD, margin: "16px 16px 0", borderRadius: "16px", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}` }}>
          <p style={{ ...MONO_EYEBROW, color: FAINT, marginBottom: "4px" }}>Right now</p>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm" style={{ color: TEXT }}>
              {data?.currentPlace ? data.currentPlace.name : "Not at a named place"}
            </p>
            {data?.currentPlace && (
              <button
                onClick={() => hideHere.mutate()}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg btn-press"
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
              className="text-xs font-semibold px-3 py-1.5 rounded-lg btn-press"
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
          <div style={{ background: CARD, margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
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
                  className="text-xs font-semibold px-3 py-1"
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

function AgeRangePanel({ onBack, profile }: { onBack: () => void; profile: any }) {
  const { toast } = useToast();
  const [ageMin, setAgeMin] = useState(profile?.ageMinPreference ?? 18);
  const [ageMax, setAgeMax] = useState(profile?.ageMaxPreference ?? 65);
  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/settings/discovery", { ageMinPreference: ageMin, ageMaxPreference: ageMax }),
    onSuccess: () => toast({ title: "Age range saved" }),
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });
  return (
    <Panel title="Age Range" onBack={onBack}>
      <div style={{ margin: "16px 16px 0", borderRadius: "16px", overflow: "hidden", background: CARD }}>
        <SliderInput label="Minimum Age" value={ageMin} min={18} max={ageMax - 1} onChange={(v) => setAgeMin(v)} />
        <SliderInput label="Maximum Age" value={ageMax} min={ageMin + 1} max={65} onChange={(v) => setAgeMax(v)} />
      </div>
      <p className="text-xs px-4 pt-3" style={{ color: MUTED }}>
        Show profiles for people aged {ageMin}–{ageMax}.
      </p>
      <div style={{ padding: "16px" }}>
        <GradientButton label="Save Age Range" onClick={() => saveMutation.mutate()} testId="button-save-age-range" />
      </div>
    </Panel>
  );
}

function BlockListPanel({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: blockedList = [] } = useQuery<any[]>({ queryKey: ["/api/users/blocked"] });

  const unblockMutation = useMutation({
    mutationFn: (targetUserId: string) => apiRequest("DELETE", `/api/users/block/${targetUserId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/blocked"] });
      toast({ title: "User unblocked" });
    },
    onError: () => toast({ title: "Failed to unblock", variant: "destructive" }),
  });

  return (
    <Panel title="Block List" onBack={onBack}>
      {blockedList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16" style={{ color: MUTED }}>
          <Shield className="w-12 h-12 mb-4" style={{ opacity: 0.4 }} />
          <p className="text-sm">No blocked users</p>
        </div>
      ) : (
        <div style={{ margin: "16px 16px 0", borderRadius: "16px", overflow: "hidden", background: CARD }}>
          {blockedList.map((entry: any, i: number) => (
            <div key={entry.id} style={{
              display: "flex", alignItems: "center", padding: "12px 16px",
              borderBottom: i < blockedList.length - 1 ? `1px solid ${BORDER}` : "none",
            }}>
              <div style={{
                width: "36px", height: "36px", borderRadius: "50%",
                background: ELEVATED, display: "flex", alignItems: "center", justifyContent: "center", marginRight: "12px",
                overflow: "hidden", flexShrink: 0,
              }}>
                {entry.photoUrl
                  ? <img src={entry.photoUrl} alt={entry.displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <UserX className="w-4 h-4" style={{ color: MUTED }} />
                }
              </div>
              <span className="flex-1 text-sm text-white" data-testid={`text-blocked-name-${entry.blockedId}`}>{entry.displayName || entry.blockedId}</span>
              <button
                onClick={() => unblockMutation.mutate(entry.blockedId)}
                className="text-xs font-semibold px-3 py-1"
                style={{ color: EMBER, border: `1px solid rgba(255,107,74,0.4)`, borderRadius: "8px" }}
                data-testid={`button-unblock-${entry.blockedId}`}
              >
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

const COLLECTED_DATA_ITEMS = [
  "Profile information (name, age, bio, location)",
  "Personality assessment answers and derived profile",
  "AI Twin memory — facts, summaries, and conversation history",
  "Match history and interaction data",
  "Group membership and activity",
  "Approximate location, only while the app is open and only if you turn on proximity alerts — kept as a single latest point, resolved to a named place, and erased after 30 minutes. No trail, no map, no direction.",
  "Usage data for app improvement (no personal identifiers)",
  "Support ticket content",
];

function DataPrivacyPanel({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [showCollect, setShowCollect] = useState(false);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/account", { confirmation: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Account deleted", description: "All your data has been erased." });
      window.location.href = "/";
    },
    onError: () => toast({ title: "Deletion failed", variant: "destructive" }),
  });

  const handleExport = async () => {
    try {
      const response = await fetch("/api/account/export-data");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "destira-data.json";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Data exported" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  if (deleteStep === 1) {
    return (
      <Panel title="Delete All Data" onBack={() => setDeleteStep(0)}>
        <div style={{ padding: "16px" }}>
          <div className="text-center mb-6">
            <div style={{
              width: "60px", height: "60px", borderRadius: "50%", background: "rgba(239,68,68,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px",
            }}>
              <Trash2 className="w-7 h-7" style={{ color: "#EF4444" }} />
            </div>
            <p className="font-semibold text-white mb-1">This is permanent</p>
            <p className="text-sm" style={{ color: MUTED }}>All your profile data, matches, Twin memory, and account will be permanently deleted. This cannot be undone.</p>
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label className="text-xs font-semibold mb-1 block" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1px" }}>Type DELETE to confirm</label>
            <input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full px-3 py-2 text-sm text-white"
              style={{ background: CARD, border: `1px solid #EF4444`, borderRadius: "10px", outline: "none" }}
              data-testid="input-delete-confirm"
            />
          </div>
          <button
            disabled={deleteConfirmText !== "DELETE" || deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
            className="w-full py-3 text-sm font-semibold text-white rounded-xl"
            style={{
              background: deleteConfirmText === "DELETE" ? "#EF4444" : ELEVATED,
              opacity: deleteConfirmText !== "DELETE" || deleteMutation.isPending ? 0.5 : 1,
              cursor: deleteConfirmText === "DELETE" ? "pointer" : "default",
            }}
            data-testid="button-confirm-delete-all"
          >
            {deleteMutation.isPending ? "Deleting..." : "Permanently Delete Everything"}
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Data & Privacy" onBack={onBack}>
      <p className="text-sm px-4 pt-4 pb-2" style={{ color: MUTED }}>
        You own your data. Download or delete everything at any time.
      </p>
      <div style={{ margin: "12px 16px", borderRadius: "16px", overflow: "hidden", background: CARD }}>
        <div
          style={{ ...ROW_STYLE, cursor: "pointer" }}
          onClick={() => setShowCollect(v => !v)}
          data-testid="row-what-we-collect"
        >
          <Shield className="w-5 h-5 mr-3" style={{ color: MUTED }} />
          <div className="flex-1">
            <p className="text-sm font-medium text-white">What We Collect</p>
            <p className="text-xs" style={{ color: MUTED }}>See all data categories we store</p>
          </div>
          {showCollect ? <ChevronUp className="w-4 h-4" style={{ color: MUTED }} /> : <ChevronDown className="w-4 h-4" style={{ color: MUTED }} />}
        </div>
        {showCollect && (
          <div style={{ padding: "0 16px 14px", borderBottom: `1px solid ${BORDER}` }}>
            {COLLECTED_DATA_ITEMS.map((item, i) => (
              <div key={i} className="flex items-start gap-2 py-1.5">
                <span style={{ color: FAINT, marginTop: "2px" }}>•</span>
                <p className="text-xs" style={{ color: MUTED }}>{item}</p>
              </div>
            ))}
          </div>
        )}
        <div style={ROW_STYLE} onClick={handleExport} data-testid="row-export-data">
          <Download className="w-5 h-5 mr-3" style={{ color: MUTED }} />
          <div className="flex-1">
            <p className="text-sm font-medium text-white">Export My Data</p>
            <p className="text-xs" style={{ color: MUTED }}>Download a JSON file of your profile and data</p>
          </div>
          <ChevronRight className="w-4 h-4" style={{ color: MUTED }} />
        </div>
        <div style={{ ...ROW_STYLE, borderBottom: "none" }} onClick={() => setDeleteStep(1)} data-testid="row-delete-data">
          <Trash2 className="w-5 h-5 mr-3" style={{ color: "#EF4444" }} />
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: "#EF4444" }}>Delete All Data</p>
            <p className="text-xs" style={{ color: MUTED }}>Permanently erase your account</p>
          </div>
          <ChevronRight className="w-4 h-4" style={{ color: MUTED }} />
        </div>
      </div>
    </Panel>
  );
}

function VerifyPanel({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [submitted, setSubmitted] = useState(false);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [selfieBase64, setSelfieBase64] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setSelfiePreview(result);
      setSelfieBase64(result.split(",")[1] ?? null);
    };
    reader.readAsDataURL(file);
  };

  const submitMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/profile/verify", { selfieBase64 }),
    onSuccess: () => { setSubmitted(true); toast({ title: "Verification submitted" }); },
    onError: () => toast({ title: "Failed to submit", variant: "destructive" }),
  });

  return (
    <Panel title="Verify Profile" onBack={onBack}>
      <div className="flex flex-col items-center px-6 pt-8 text-center">
        <div style={{
          width: "80px", height: "80px", borderRadius: "50%",
          background: EMBER, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "20px",
        }}>
          <Check className="w-10 h-10" style={{ color: INK }} />
        </div>
        <h2 className="text-lg mb-2" style={{ ...SERIF, color: TEXT }}>Get the verified mark</h2>
        <p className="text-sm mb-6" style={{ color: MUTED }}>
          Take a selfie matching one of the reference poses to verify your identity. Verification adds trust and boosts your matches.
        </p>
        {submitted ? (
          <div className="w-full py-4 text-center rounded-xl" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <Check className="w-6 h-6 mx-auto mb-2" style={{ color: "#10B981" }} />
            <p className="text-sm font-semibold text-white">Verification Pending</p>
            <p className="text-xs mt-1" style={{ color: MUTED }}>We'll review your submission within 24 hours</p>
          </div>
        ) : (
          <>
            <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handleFileChange} data-testid="input-selfie" />
            {selfiePreview && (
              <img src={selfiePreview} alt="Selfie preview" className="w-32 h-32 rounded-full object-cover mb-4" style={{ border: `2px solid ${BORDER}` }} />
            )}
            <div style={{ width: "100%", marginBottom: "12px" }}>
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full py-3 text-sm font-semibold text-white mb-3"
                style={{ background: ELEVATED, borderRadius: "12px", border: `1px solid ${BORDER}` }}
                data-testid="button-take-selfie"
              >
                {selfiePreview ? "Retake Selfie" : "Take Selfie"}
              </button>
              <GradientButton
                label={submitMutation.isPending ? "Submitting..." : "Submit for Verification"}
                onClick={() => {
                  if (!selfieBase64) {
                    toast({ title: "Please take a selfie first", variant: "destructive" });
                    return;
                  }
                  submitMutation.mutate();
                }}
                testId="button-submit-verify"
              />
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

function BillingPanel({ onBack, profile }: { onBack: () => void; profile: any }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const cancelSub = useCancelSubscription();
  const raw = profile?.subscriptionTier ?? "free";
  const tier: "free" | "spark" | "flame" | "ember" =
    raw === "plus" ? "flame" : raw === "vip" ? "ember" : (["spark", "flame", "ember"].includes(raw) ? raw : "free");
  const card = SETTINGS_PLAN_CARDS.find((c) => c.tier === tier) ?? SETTINGS_PLAN_CARDS[0];
  const tierInfo = {
    label: card.name,
    price: card.priceCents === 0 ? "$0" : `$${(card.priceCents / 100).toFixed(2)}`,
    cycle: card.priceCents === 0 ? "No billing" : "Billed monthly, USD",
    details: card.gets.slice(0, 3).join(" · "),
  };

  return (
    <Panel title="Manage Billing" onBack={onBack}>
      <div style={{ margin: "16px", borderRadius: "16px", background: CARD, padding: "20px" }}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1.2px" }}>Current Plan</p>
            <p className="text-xl font-bold text-white">{tierInfo.label}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-white">{tierInfo.price}</p>
            <p className="text-xs" style={{ color: MUTED }}>{tierInfo.cycle}</p>
          </div>
        </div>
        <p className="text-sm" style={{ color: MUTED }}>{tierInfo.details}</p>
      </div>

      {tier === "free" && (
        <div style={{ padding: "0 16px 16px" }}>
          <GradientButton label="See plans" onClick={() => setLocation("/plans")} testId="button-upgrade-billing" />
        </div>
      )}

      <div style={{ margin: "0 16px", borderRadius: "16px", background: CARD, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}` }}>
          <p className="text-xs font-semibold mb-2" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1px" }}>Payment History</p>
          {tier === "free" ? (
            <p className="text-sm text-center py-2" style={{ color: MUTED }}>No payment history</p>
          ) : (
            <div>
              <div className="flex justify-between items-center py-1.5">
                <p className="text-sm text-white">Destira {tierInfo.label}</p>
                <p className="text-sm font-semibold text-white">{tierInfo.price}</p>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <p className="text-xs" style={{ color: MUTED }}>March 1, 2026</p>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.15)", color: "#10B981" }}>Paid</span>
              </div>
            </div>
          )}
        </div>
        {tier !== "free" && (
          <button
            style={{ ...ROW_STYLE, borderBottom: "none", width: "100%", textAlign: "left", background: "transparent", border: "none" }}
            data-testid="row-cancel-plan"
            disabled={cancelSub.isPending}
            onClick={() => {
              if (!window.confirm(`Cancel ${tierInfo.label}? You keep it until the paid period ends, then you're on Free.`)) return;
              cancelSub.mutate(undefined, {
                onSuccess: (r) =>
                  toast({
                    title: "Cancelled",
                    description: r.endsAt
                      ? `You're on ${tierInfo.label} until ${new Date(r.endsAt).toLocaleDateString()}, then Free.`
                      : "You're back on Free.",
                  }),
              });
            }}
          >
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Cancel subscription</p>
              <p className="text-xs" style={{ color: MUTED }}>Keeps working until the period ends. No exit fee.</p>
            </div>
            {cancelSub.isPending ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: MUTED }} /> : <ChevronRight className="w-4 h-4" style={{ color: MUTED }} />}
          </button>
        )}
      </div>

      <p className="text-xs px-4 pt-4 pb-2 text-center" style={{ color: MUTED }}>
        Questions? Email <span style={{ color: EMBER }}>support@destira.date</span>
      </p>
    </Panel>
  );
}

function HelpPanel({ onBack }: { onBack: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const faqs = [
    { q: "How does my AI Twin work?", a: "Your AI Twin is built from your onboarding answers and ongoing interview questions. It learns your personality, communication style, and preferences to represent you authentically." },
    { q: "Who can see my profile?", a: "Only users you've set visibility for can see your full profile. You can toggle Public Profile on or off in Settings → Privacy." },
    { q: "How do matches work?", a: "Your twin talks to other people's twins. When a conversation resonates, you get a curated read — with the transcript and a resonance score — and you decide whether to ask to meet. You can like or pass." },
    { q: "What do the paid plans give me?", a: `Free is ${SETTINGS_LIMITS.free.dailyLikes} likes a day and the two-line transcript. Spark ($${(SETTINGS_LIMITS.spark.priceCents / 100).toFixed(2)}) shows you who asked to meet you and raises likes to ${SETTINGS_LIMITS.spark.dailyLikes} a day. Flame ($${(SETTINGS_LIMITS.flame.priceCents / 100).toFixed(2)}) opens the full transcript and lets you host events. Ember ($${(SETTINGS_LIMITS.ember.priceCents / 100).toFixed(2)}) removes the ceilings entirely. See Plans for the full breakdown.` },
    { q: "How do I delete my account?", a: "Go to Settings → Danger Zone → Delete Account, then type DELETE to confirm permanent deletion of all your data." },
    { q: "Is my data shared with third parties?", a: "We never sell your personal data. AI processing uses Google Vertex AI under strict data agreements. See our Privacy Policy for full details." },
  ];

  return (
    <Panel title="Help Center" onBack={onBack}>
      <p className="text-sm px-4 pt-4 pb-2" style={{ color: MUTED }}>Frequently asked questions</p>
      <div style={{ margin: "0 16px", borderRadius: "16px", background: CARD, overflow: "hidden" }}>
        {faqs.map((faq, i) => (
          <div key={i} style={{ borderBottom: i < faqs.length - 1 ? `1px solid ${BORDER}` : "none" }}>
            <div
              onClick={() => setOpen(open === i ? null : i)}
              style={{ display: "flex", alignItems: "center", padding: "14px 16px", cursor: "pointer" }}
              data-testid={`faq-toggle-${i}`}
            >
              <p className="flex-1 text-sm font-medium text-white">{faq.q}</p>
              {open === i ? <ChevronUp className="w-4 h-4" style={{ color: MUTED }} /> : <ChevronDown className="w-4 h-4" style={{ color: MUTED }} />}
            </div>
            {open === i && (
              <div style={{ padding: "0 16px 14px", color: MUTED, fontSize: "13px", lineHeight: "1.6" }}>
                {faq.a}
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

const CONTACT_SUBJECTS = [
  "Report a bug",
  "Billing issue",
  "Account access",
  "Safety concern",
  "Feature request",
  "Privacy inquiry",
  "Other",
];

function ContactPanel({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [subject, setSubject] = useState(CONTACT_SUBJECTS[0]);
  const [message, setMessage] = useState("");

  const submitMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/support/tickets", { subject, message }),
    onSuccess: () => {
      toast({ title: "Message sent", description: "We'll respond within 24–48 hours." });
      setSubject(CONTACT_SUBJECTS[0]);
      setMessage("");
    },
    onError: () => toast({ title: "Failed to send", variant: "destructive" }),
  });

  return (
    <Panel title="Contact Us" onBack={onBack}>
      <div style={{ padding: "16px" }}>
        <p className="text-sm mb-4" style={{ color: MUTED }}>Send us a message and we'll get back to you within 24–48 hours.</p>
        <div style={{ marginBottom: "12px" }}>
          <label className="text-xs font-semibold mb-1 block" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1px" }}>Subject</label>
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 text-sm text-white"
            style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
            data-testid="select-contact-subject"
          >
            {CONTACT_SUBJECTS.map(s => (
              <option key={s} value={s} style={{ background: CARD }}>{s}</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label className="text-xs font-semibold mb-1 block" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1px" }}>Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe your issue or question..."
            rows={5}
            className="w-full px-3 py-2 text-sm text-white resize-none"
            style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
            data-testid="input-contact-message"
          />
        </div>
        <GradientButton
          label={submitMutation.isPending ? "Sending..." : "Send Message"}
          onClick={() => {
            if (!message.trim()) {
              toast({ title: "Please enter a message", variant: "destructive" });
              return;
            }
            submitMutation.mutate();
          }}
          testId="button-send-contact"
        />
      </div>
    </Panel>
  );
}

const FEEDBACK_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "bug", label: "Something's broken" },
  { value: "idea", label: "An idea" },
  { value: "confusing", label: "Something's confusing" },
  { value: "praise", label: "Just saying thanks" },
  { value: "other", label: "Other" },
];

// Different job from Contact Us: no ticket, no reply promised — a note that
// lands in the operator's feedback queue, separate from the abuse-report queue.
function FeedbackPanel({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [category, setCategory] = useState("idea");
  const [freeText, setFreeText] = useState("");
  const [contactBackConsent, setContactBackConsent] = useState(false);

  const submitMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/feedback", {
        category,
        freeText,
        contactBackConsent,
        appVersion: "1.0.0",
        platform: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 40) : null,
      }),
    onSuccess: () => {
      toast({ title: "Thanks — sent." });
      setFreeText("");
      setContactBackConsent(false);
    },
    onError: () => toast({ title: "Failed to send", variant: "destructive" }),
  });

  return (
    <Panel title="Send Feedback" onBack={onBack}>
      <div style={{ padding: "16px" }}>
        <p className="text-sm mb-4" style={{ color: MUTED }}>
          Not a support ticket — this goes straight to whoever's running Destira. No reply is promised.
        </p>
        <div style={{ marginBottom: "12px" }}>
          <label className="text-xs font-semibold mb-1 block" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1px" }}>What kind of thing is this</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 text-sm text-white"
            style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
            data-testid="select-feedback-category"
          >
            {FEEDBACK_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} style={{ background: CARD }}>{o.label}</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: "12px" }}>
          <label className="text-xs font-semibold mb-1 block" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1px" }}>Tell us</label>
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="What happened, or what you'd change..."
            rows={5}
            className="w-full px-3 py-2 text-sm text-white resize-none"
            style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
            data-testid="input-feedback-text"
          />
        </div>
        <label className="flex items-center gap-2 mb-4 text-sm" style={{ color: MUTED }}>
          <input type="checkbox" checked={contactBackConsent} onChange={(e) => setContactBackConsent(e.target.checked)} data-testid="checkbox-feedback-contact-back" />
          It's OK to contact me about this
        </label>
        <GradientButton
          label={submitMutation.isPending ? "Sending..." : "Send Feedback"}
          onClick={() => {
            if (!freeText.trim()) {
              toast({ title: "Say a bit more first", variant: "destructive" });
              return;
            }
            submitMutation.mutate();
          }}
          testId="button-send-feedback"
        />
      </div>
    </Panel>
  );
}

function ChangeEmailPanel({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [done, setDone] = useState(false);

  const updateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/account/change-email", {
      newEmail: email,
      currentPassword,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setDone(true);
      toast({ title: "Email updated", description: "Your account email has been changed." });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Failed to update email";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!email || !email.includes("@")) {
      toast({ title: "Please enter a valid email address", variant: "destructive" });
      return;
    }
    if (!currentPassword) {
      toast({ title: "Current password required", description: "Confirm your password to change your email.", variant: "destructive" });
      return;
    }
    updateMutation.mutate();
  };

  return (
    <Panel title="Change Email" onBack={onBack}>
      <div style={{ padding: "16px" }}>
        <p className="text-sm mb-4" style={{ color: MUTED }}>
          Enter your new email address and confirm your password to update it.
        </p>
        {done ? (
          <div className="text-center py-8">
            <div style={{
              width: "60px", height: "60px", borderRadius: "50%", background: EMBER,
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
            }}>
              <Mail className="w-7 h-7" style={{ color: INK }} />
            </div>
            <p className="mb-2" style={{ ...SERIF, color: TEXT, fontSize: "18px" }}>Email updated</p>
            <p className="text-sm" style={{ color: MUTED }}>Your account email is now <strong style={{ color: "#FFFFFF" }}>{email}</strong></p>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: "12px" }}>
              <label className="text-xs font-semibold mb-1 block" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1px" }}>New Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="new@example.com"
                className="w-full px-3 py-2 text-sm text-white"
                style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
                data-testid="input-new-email"
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label className="text-xs font-semibold mb-1 block" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1px" }}>Current Password</label>
              <PasswordInput
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-sm text-white"
                style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
                data-testid="input-email-current-password"
              />
            </div>
            <GradientButton
              label={updateMutation.isPending ? "Updating..." : "Update Email"}
              onClick={handleSubmit}
              testId="button-send-email-verify"
            />
          </>
        )}
      </div>
    </Panel>
  );
}

function ChangePasswordPanel({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");

  const updateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/account/change-password", {
      currentPassword: current,
      newPassword: newPass,
    }),
    onSuccess: () => {
      toast({ title: "Password updated", description: "Your password has been changed successfully." });
      setCurrent(""); setNewPass(""); setConfirm("");
      onBack();
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Failed to update password";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!current) {
      toast({ title: "Current password required", variant: "destructive" });
      return;
    }
    if (newPass.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (newPass !== confirm) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    updateMutation.mutate();
  };

  return (
    <Panel title="Change Password" onBack={onBack}>
      <div style={{ padding: "16px" }}>
        <p className="text-sm mb-4" style={{ color: MUTED }}>
          Choose a strong password with at least 8 characters.
        </p>
        <div style={{ marginBottom: "12px" }}>
          <label className="text-xs font-semibold mb-1 block" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1px" }}>Current Password</label>
          <PasswordInput
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2 text-sm text-white"
            style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
            data-testid="input-current-password"
          />
        </div>
        <div style={{ marginBottom: "12px" }}>
          <label className="text-xs font-semibold mb-1 block" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1px" }}>New Password</label>
          <PasswordInput
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2 text-sm text-white"
            style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
            data-testid="input-new-password"
          />
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label className="text-xs font-semibold mb-1 block" style={{ color: MUTED, textTransform: "uppercase", letterSpacing: "1px" }}>Confirm New Password</label>
          <PasswordInput
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2 text-sm text-white"
            style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
            data-testid="input-confirm-password"
          />
        </div>
        <GradientButton label={updateMutation.isPending ? "Updating..." : "Update Password"} onClick={handleSubmit} testId="button-update-password" />
      </div>
    </Panel>
  );
}

function TermsPanel({ onBack }: { onBack: () => void }) {
  return (
    <Panel title="Terms of Service" onBack={onBack}>
      <div style={{ padding: "16px", color: MUTED, fontSize: "13px", lineHeight: "1.8" }}>
        <p className="text-white font-semibold mb-2">Last updated: March 2026</p>
        <p className="mb-4">Welcome to Destira. By using our service, you agree to these Terms of Service.</p>
        <p className="text-white font-semibold mb-1">1. Eligibility</p>
        <p className="mb-4">You must be at least 18 years old to use Destira. By registering, you confirm you meet this requirement.</p>
        <p className="text-white font-semibold mb-1">2. Acceptable Use</p>
        <p className="mb-4">You agree not to harass, impersonate, or harm other users. Automated access, scraping, or abuse of our AI features is prohibited.</p>
        <p className="text-white font-semibold mb-1">3. Content</p>
        <p className="mb-4">You retain ownership of content you post but grant Destira a license to display it within the platform.</p>
        <p className="text-white font-semibold mb-1">4. Subscriptions</p>
        <p className="mb-4">Paid subscriptions auto-renew. Cancel anytime through your billing settings. Refunds are handled per our refund policy.</p>
        <p className="text-white font-semibold mb-1">5. Termination</p>
        <p className="mb-4">Destira may suspend or terminate accounts that violate these Terms, engage in fraudulent activity, or otherwise abuse the platform at our sole discretion.</p>
        <p className="text-white font-semibold mb-1">6. Limitation of Liability</p>
        <p className="mb-4">Destira is provided as-is. We are not responsible for outcomes of matches or interactions between users.</p>
        <p className="text-white font-semibold mb-1">7. Contact</p>
        <p>For questions, use the Contact Us page within the app or email support@destira.date.</p>
      </div>
    </Panel>
  );
}

function PrivacyPolicyPanel({ onBack }: { onBack: () => void }) {
  return (
    <Panel title="Privacy Policy" onBack={onBack}>
      <div style={{ padding: "16px", color: MUTED, fontSize: "13px", lineHeight: "1.8" }}>
        <p className="text-white font-semibold mb-2">Last updated: March 2026</p>
        <p className="mb-4">Destira is committed to protecting your privacy.</p>
        <p className="text-white font-semibold mb-1">Data We Collect</p>
        <p className="mb-4">We collect your name, email, profile data, location (if permitted), and conversation data to power AI features.</p>
        <p className="text-white font-semibold mb-1">How We Use Data</p>
        <p className="mb-4">Your data trains your personal AI Twin and improves match quality. We never sell personal data to third parties.</p>
        <p className="text-white font-semibold mb-1">AI Processing</p>
        <p className="mb-4">AI features use Google Vertex AI (Gemini). Data sent to Gemini is subject to Google's data processing terms.</p>
        <p className="text-white font-semibold mb-1">Data Retention</p>
        <p className="mb-4">You can delete all your data at any time via Settings → Data & Privacy → Delete All Data.</p>
        <p className="text-white font-semibold mb-1">Cookies</p>
        <p className="mb-4">We use session cookies for authentication. No third-party advertising cookies are used.</p>
        <p className="text-white font-semibold mb-1">Contact</p>
        <p>Reach us via the Contact Us page for any privacy concerns.</p>
      </div>
    </Panel>
  );
}

function ClearMemoryPanel({ onBack }: { onBack: () => void }) {
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
          background: "#1A1A24", border: `2px solid #EF4444`,
          display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "20px",
        }}>
          <Brain className="w-10 h-10" style={{ color: "#EF4444" }} />
        </div>
        <h2 className="text-lg mb-2" style={{ ...SERIF, color: TEXT }}>Clear Twin Memory</h2>
        <p className="text-sm mb-6" style={{ color: MUTED }}>
          Your twin forgets everything. Your reads reset to zero and rebuild over about a week.
        </p>
        {!confirmed ? (
          <GradientButton label="I understand, clear memory" onClick={() => setConfirmed(true)} testId="button-confirm-clear-step1" danger />
        ) : (
          <div className="w-full space-y-3">
            <p className="text-sm font-semibold" style={{ color: "#EF4444" }}>Are you absolutely sure?</p>
            <button
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending}
              className="w-full py-3 text-sm font-semibold text-white"
              style={{ background: "#EF4444", borderRadius: "12px", border: "none", cursor: "pointer" }}
              data-testid="button-confirm-clear-final"
            >
              {clearMutation.isPending ? "Clearing..." : "Yes, clear all memory"}
            </button>
            <button
              onClick={() => setConfirmed(false)}
              className="w-full py-3 text-sm font-medium"
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

export default function Settings() {
  const [, setLocation] = useLocation();
  const { logout } = useAuth();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const { toast } = useToast();

  const [activePanel, setActivePanel] = useState<PanelKey>(null);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const [notifMatches, setNotifMatches] = useState(() => localStorage.getItem("notif_matches") !== "false");
  const [notifMessages, setNotifMessages] = useState(() => localStorage.getItem("notif_messages") !== "false");
  const [notifStories, setNotifStories] = useState(() => localStorage.getItem("notif_stories") !== "false");
  const [notifInterviews, setNotifInterviews] = useState(() => localStorage.getItem("notif_interviews") !== "false");
  const [discoverable, setDiscoverable] = useState(() => localStorage.getItem("discoverable") !== "false");
  const [showDistance, setShowDistance] = useState(() => localStorage.getItem("show_distance") !== "false");

  useEffect(() => {
    if (profile && typeof profile.showDistance === "boolean") {
      setShowDistance(profile.showDistance);
    }
  }, [profile?.showDistance]);

  useEffect(() => {
    let requested: string | null = null;
    try {
      requested = sessionStorage.getItem("open_settings_panel");
      if (requested) sessionStorage.removeItem("open_settings_panel");
    } catch {
      /* ignore */
    }
    if (requested === "proximity" || (typeof window !== "undefined" && window.location.hash === "#proximity")) {
      setActivePanel("proximity");
    }
  }, []);

  const handleTogglePublic = async () => {
    if (!profile) return;
    try {
      await updateProfile.mutateAsync({ userId: profile.userId, data: { isPublic: !profile.isPublic } });
      toast({ title: profile.isPublic ? "Profile set to private" : "Profile set to public" });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const handleToggleShowDistance = async (v: boolean) => {
    setShowDistance(v);
    localStorage.setItem("show_distance", String(v));
    if (!profile) return;
    try {
      await updateProfile.mutateAsync({ userId: profile.userId, data: { showDistance: v } });
    } catch {
      toast({ title: "Error saving preference", variant: "destructive" });
    }
  };

  function saveNotif(key: string, value: boolean) {
    localStorage.setItem(key, String(value));
  }

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/account", { confirmation: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Account deleted" });
      logout();
    },
    onError: () => toast({ title: "Failed to delete account", variant: "destructive" }),
  });

  if (activePanel === "change-email") return <ChangeEmailPanel onBack={() => setActivePanel(null)} />;
  if (activePanel === "change-password") return <ChangePasswordPanel onBack={() => setActivePanel(null)} />;
  if (activePanel === "twin-tone") return <TwinTonePanel onBack={() => setActivePanel(null)} profile={profile} />;
  if (activePanel === "location") return <LocationPanel onBack={() => setActivePanel(null)} profile={profile} />;
  if (activePanel === "proximity") return <ProximityPanel onBack={() => { setActivePanel(null); if (window.location.hash) history.replaceState(null, "", window.location.pathname); }} profile={profile} />;
  if (activePanel === "age-range") return <AgeRangePanel onBack={() => setActivePanel(null)} profile={profile} />;
  if (activePanel === "block-list") return <BlockListPanel onBack={() => setActivePanel(null)} />;
  if (activePanel === "data-privacy") return <DataPrivacyPanel onBack={() => setActivePanel(null)} />;
  if (activePanel === "verify") return <VerifyPanel onBack={() => setActivePanel(null)} />;
  if (activePanel === "billing") return <BillingPanel onBack={() => setActivePanel(null)} profile={profile} />;
  if (activePanel === "help") return <HelpPanel onBack={() => setActivePanel(null)} />;
  if (activePanel === "contact") return <ContactPanel onBack={() => setActivePanel(null)} />;
  if (activePanel === "feedback") return <FeedbackPanel onBack={() => setActivePanel(null)} />;
  if (activePanel === "terms") return <TermsPanel onBack={() => setActivePanel(null)} />;
  if (activePanel === "privacy-policy") return <PrivacyPolicyPanel onBack={() => setActivePanel(null)} />;
  if (activePanel === "clear-memory") return <ClearMemoryPanel onBack={() => setActivePanel(null)} />;

  return (
    <div className="min-h-screen" style={{ background: BG, color: TEXT }} data-testid="page-settings">
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4"
        style={{ height: "56px", background: BG, borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={() => setLocation("/profile")} className="w-8 h-8 flex items-center justify-center" data-testid="button-settings-back">
          <ArrowLeft className="w-5 h-5" style={{ color: EMBER }} />
        </button>
        <h1 style={{ ...SERIF, color: TEXT, fontSize: "20px" }}>Settings</h1>
      </div>

      <div style={{ maxWidth: "480px", margin: "0 auto", paddingBottom: "40px" }}>

        <div style={SECTION_HEADER_STYLE}>Account</div>
        <div style={{ background: CARD, margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ChevronRow icon={User} label="Edit Profile" onClick={() => setLocation("/profile")} testId="row-edit-profile" />
          <ChevronRow icon={Mail} label="Change Email" sublabel="Update your email address" onClick={() => setActivePanel("change-email")} testId="row-change-email" />
          <ChevronRow icon={Lock} label="Change Password" sublabel="Update your password" onClick={() => setActivePanel("change-password")} testId="row-change-password" />
        </div>

        <div style={SECTION_HEADER_STYLE}>Twin Settings</div>
        <div style={{ background: CARD, margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ChevronRow icon={Brain} label="Interview AI Twin" onClick={() => setLocation("/twin-chat?from=/settings")} testId="row-twin-chat" />
          <ChevronRow icon={Volume2} label="Customize Twin Tone" sublabel="Style, verbosity, formality" onClick={() => setActivePanel("twin-tone")} testId="row-twin-tone" />
          <ChevronRow icon={Shield} label="What your twin may discuss" sublabel="Per-topic: open, vague, or off — plus your own note" onClick={() => setLocation("/twin-disclosure")} testId="row-twin-boundaries" />
        </div>

        <div style={SECTION_HEADER_STYLE}>Discovery</div>
        <div style={{ background: CARD, margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ToggleRow icon={Compass} label="Discoverable" value={discoverable} onChange={(v) => { setDiscoverable(v); saveNotif("discoverable", v); }} testId="toggle-discoverable" />
          <ToggleRow icon={MapPin} label="Show Distance" value={showDistance} onChange={handleToggleShowDistance} testId="toggle-show-distance" />
          <ChevronRow icon={MapPin} label="Location Preferences" sublabel={`Within ${profile?.maxDistanceKm ?? 100} km`} onClick={() => setActivePanel("location")} testId="row-location" />
          <ChevronRow icon={Zap} label="Proximity Alerts" sublabel="When someone worth knowing is at the same place" onClick={() => setActivePanel("proximity")} testId="row-proximity" />
          <ChevronRow icon={Sliders} label="Age Range" sublabel={`${profile?.ageMinPreference ?? 18}–${profile?.ageMaxPreference ?? 65} years`} onClick={() => setActivePanel("age-range")} testId="row-age-range" />
          <ChevronRow icon={CalendarDays} label="Event Preferences" sublabel="What shows up in your Events feed" onClick={() => setLocation("/settings/events?from=/settings")} testId="row-event-preferences" />
        </div>

        <div style={SECTION_HEADER_STYLE}>Privacy</div>
        <div style={{ background: CARD, margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ToggleRow
            icon={profile?.isPublic ? Eye : EyeOff}
            label="Public Profile"
            value={profile?.isPublic ?? false}
            onChange={handleTogglePublic}
            testId="toggle-public-profile"
          />
          <ChevronRow icon={Shield} label="Block List" sublabel="Manage blocked users" onClick={() => setActivePanel("block-list")} testId="row-block-list" />
          <ChevronRow icon={FileText} label="Data & Privacy" sublabel="Export or delete your data" onClick={() => setActivePanel("data-privacy")} testId="row-data-privacy" />
        </div>

        <div style={SECTION_HEADER_STYLE}>Notifications</div>
        <div style={{ background: CARD, margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ToggleRow icon={Zap} label="New Matches" value={notifMatches} onChange={(v) => { setNotifMatches(v); saveNotif("notif_matches", v); }} testId="toggle-notif-matches" />
          <ToggleRow icon={MessageSquare} label="Messages" value={notifMessages} onChange={(v) => { setNotifMessages(v); saveNotif("notif_messages", v); }} testId="toggle-notif-messages" />
          <ToggleRow icon={Bell} label="Stories" value={notifStories} onChange={(v) => { setNotifStories(v); saveNotif("notif_stories", v); }} testId="toggle-notif-stories" />
          <ToggleRow icon={Brain} label="Interview Requests" value={notifInterviews} onChange={(v) => { setNotifInterviews(v); saveNotif("notif_interviews", v); }} testId="toggle-notif-interviews" />
        </div>

        <div style={SECTION_HEADER_STYLE}>Profile Tools</div>
        <div style={{ background: CARD, margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ChevronRow icon={Wrench} label="Generate AI Summary" onClick={() => setLocation("/profile")} testId="row-ai-summary" />
          <ChevronRow icon={Check} label="Verify Profile" sublabel={profile?.verificationStatus === "pending" ? "Pending review" : profile?.isVerified ? "Verified" : "Get the blue checkmark"} onClick={() => setActivePanel("verify")} testId="row-verify" />
          <ChevronRow icon={Wrench} label="Manage Photos" onClick={() => setLocation("/profile")} testId="row-manage-photos" />
        </div>

        <div style={SECTION_HEADER_STYLE}>Invite</div>
        <div style={{ background: CARD, margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <InviteRow />
        </div>

        <div style={SECTION_HEADER_STYLE}>Subscription</div>
        <div style={{ background: CARD, margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ChevronRow icon={Crown} label="Plans" sublabel="See what each plan gets you" onClick={() => setLocation("/plans")} testId="row-upgrade" />
          <ChevronRow icon={CreditCard} label="Manage Billing" sublabel="View plan, cancel subscription" onClick={() => setActivePanel("billing")} testId="row-billing" />
        </div>

        <div style={SECTION_HEADER_STYLE}>Support</div>
        <div style={{ background: CARD, margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ChevronRow icon={BookOpen} label="Help Center" sublabel="FAQs and guides" onClick={() => setActivePanel("help")} testId="row-help" />
          <ChevronRow icon={Phone} label="Contact Us" sublabel="Send us a message" onClick={() => setActivePanel("contact")} testId="row-contact" />
          <ChevronRow icon={Wrench} label="Send Feedback" sublabel="A bug, an idea, or just a note" onClick={() => setActivePanel("feedback")} testId="row-feedback" />
          <ChevronRow icon={FileText} label="Terms of Service" onClick={() => setActivePanel("terms")} testId="row-terms" />
          <ChevronRow icon={Shield} label="Privacy Policy" onClick={() => setActivePanel("privacy-policy")} testId="row-privacy-policy" />
        </div>

        <div style={SECTION_HEADER_STYLE}>Irreversible</div>
        <div style={{ background: CARD, margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ChevronRow icon={X} label="Clear Twin Memory" sublabel="Your twin forgets everything it has learned" onClick={() => setActivePanel("clear-memory")} destructive testId="row-clear-memory" />
          <ChevronRow icon={Trash2} label="Delete Account" sublabel="Permanently remove all data" onClick={() => setShowDeleteDialog(true)} destructive testId="row-delete-account" />
        </div>

        <div style={SECTION_HEADER_STYLE}>Account actions</div>
        <div style={{ background: CARD, margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ChevronRow icon={PauseCircle} label="Pause Account" sublabel="Hide your profile temporarily" onClick={() => setShowPauseDialog(true)} testId="row-pause-account" />
          <ChevronRow icon={LogOut} label="Sign Out" onClick={() => logout()} testId="row-sign-out" />
        </div>
      </div>

      <Dialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
        <DialogContent style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "20px" }}>
          <DialogHeader>
            <DialogTitle style={{ ...SERIF, color: TEXT }}>Pause Account</DialogTitle>
            <DialogDescription style={{ color: MUTED }}>Your profile will be hidden from discovery. You can reactivate anytime.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button className="px-4 py-2 text-sm font-medium" style={{ color: MUTED }} onClick={() => setShowPauseDialog(false)} data-testid="button-cancel-pause">Cancel</button>
            <button
              className="px-4 py-2 text-sm"
              style={{ background: EMBER, color: INK, fontWeight: 600, borderRadius: "10px", border: "none" }}
              onClick={async () => {
                setShowPauseDialog(false);
                if (profile) await updateProfile.mutateAsync({ userId: profile.userId, data: { isPublic: false } });
                toast({ title: "Account paused", description: "Your profile is now hidden." });
              }}
              data-testid="button-confirm-pause"
            >
              Pause Account
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={(open) => { setShowDeleteDialog(open); setDeleteConfirmText(""); }}>
        <DialogContent style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "20px" }}>
          <DialogHeader>
            <DialogTitle style={{ ...SERIF, color: TEXT }}>Delete Account</DialogTitle>
            <DialogDescription style={{ color: MUTED }}>
              This will permanently delete your profile, matches, Twin memory, and all data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div style={{ padding: "8px 0" }}>
            <p className="text-xs mb-2" style={{ color: MUTED }}>Type <strong style={{ color: "#EF4444" }}>DELETE</strong> to confirm</p>
            <input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full px-3 py-2 text-sm text-white"
              style={{ background: ELEVATED, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
              data-testid="input-delete-confirm"
            />
          </div>
          <DialogFooter className="gap-2">
            <button className="px-4 py-2 text-sm font-medium" style={{ color: MUTED }} onClick={() => { setShowDeleteDialog(false); setDeleteConfirmText(""); }} data-testid="button-cancel-delete">Cancel</button>
            <button
              disabled={deleteConfirmText !== "DELETE" || deleteMutation.isPending}
              className="px-4 py-2 text-sm font-semibold text-white"
              style={{ background: deleteConfirmText === "DELETE" ? "#EF4444" : BORDER, borderRadius: "10px", border: "none", cursor: deleteConfirmText === "DELETE" ? "pointer" : "not-allowed" }}
              onClick={() => deleteMutation.mutate()}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Account"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
