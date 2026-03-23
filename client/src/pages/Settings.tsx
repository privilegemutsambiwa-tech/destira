import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, User, Brain, Compass, Shield, Bell, Wrench, Crown, HelpCircle,
  AlertTriangle, ChevronRight, LogOut, Trash2, PauseCircle, Eye, EyeOff,
  Volume2, MapPin, MessageSquare, Zap, Check, Lock, Mail, Sliders, FileText,
  ChevronDown, ChevronUp, X, Plus, Download, UserX, CreditCard, BookOpen, Phone
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useProfile, useUpdateProfile } from "@/hooks/use-profiles";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";

const BG = "#0F0F14";
const CARD = "#1A1A24";
const ELEVATED = "#242433";
const BORDER = "#2E2E42";
const MUTED = "#9090A8";
const GRAD = "linear-gradient(135deg, #7C3AED, #EC4899)";

const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  height: "52px",
  padding: "0 16px",
  cursor: "pointer",
  borderBottom: `1px solid ${BORDER}`,
};

const SECTION_HEADER_STYLE: React.CSSProperties = {
  fontSize: "11px",
  letterSpacing: "1.5px",
  color: MUTED,
  textTransform: "uppercase",
  padding: "20px 16px 8px",
  fontWeight: 600,
};

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onChange(!value); }}
      style={{
        width: "42px", height: "24px", borderRadius: "12px",
        background: value ? GRAD : BORDER,
        transition: "background 0.2s", position: "relative", cursor: "pointer", flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute", top: "3px", left: value ? "21px" : "3px",
        width: "18px", height: "18px", borderRadius: "50%", background: "#FFFFFF",
        transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
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

function SliderInput({ label, value, min, max, onChange, unit = "" }: {
  label: string; value: number; min: number; max: number;
  onChange: (v: number) => void; unit?: string;
}) {
  return (
    <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}` }}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-white">{label}</span>
        <span className="text-sm font-semibold" style={{ color: "#EC4899" }}>{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full" style={{ accentColor: "#7C3AED" }}
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
  | "twin-tone" | "location" | "age-range" | "block-list"
  | "data-privacy" | "verify" | "billing" | "help" | "contact"
  | "terms" | "privacy-policy" | "clear-memory" | null;

function Panel({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: BG, color: "#FFFFFF", fontFamily: "'Inter', sans-serif" }}>
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4"
        style={{ height: "56px", background: BG, borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center" data-testid="button-panel-back">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="font-bold text-white" style={{ fontSize: "17px" }}>{title}</h1>
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
      className="w-full py-3 text-sm font-semibold text-white"
      style={{
        background: danger ? "#EF4444" : GRAD,
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
              className="w-full accent-purple-500"
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
          const res = await apiRequest("POST", "/api/location", { lat: latitude, lng: longitude, locationName: "Current Location" });
          const data = await res.json();
          setCurrentLocation(data.locationName || "Location updated");
          toast({ title: "Location updated" });
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
        <SliderInput label="Maximum Age" value={ageMax} min={ageMin + 1} max={100} onChange={(v) => setAgeMax(v)} />
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
              }}>
                <UserX className="w-4 h-4" style={{ color: MUTED }} />
              </div>
              <span className="flex-1 text-sm text-white">{entry.blockedId}</span>
              <button
                onClick={() => unblockMutation.mutate(entry.blockedId)}
                className="text-xs font-semibold px-3 py-1"
                style={{ color: "#7C3AED", border: `1px solid #7C3AED`, borderRadius: "8px" }}
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
  "Device location (when shared) for proximity features",
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
      a.download = "vibeflow-data.json";
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
                <span style={{ color: "#7C3AED", marginTop: "2px" }}>•</span>
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
          background: GRAD, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "20px",
        }}>
          <Check className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-lg font-bold text-white mb-2">Get the Blue Checkmark</h2>
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

const TIER_LABELS: Record<string, { label: string; details: string; price: string; cycle: string }> = {
  free: { label: "Free", details: "5 likes/day · 2 groups", price: "$0", cycle: "No billing" },
  plus: { label: "Plus", details: "50 likes/day · 10 groups · Priority matching", price: "$9.99", cycle: "Billed monthly" },
  vip: { label: "VIP", details: "Unlimited likes · Unlimited groups · All features", price: "$19.99", cycle: "Billed monthly" },
};

function BillingPanel({ onBack, profile }: { onBack: () => void; profile: any }) {
  const [, setLocation] = useLocation();
  const tier = profile?.subscriptionTier ?? "free";
  const tierInfo = TIER_LABELS[tier] ?? TIER_LABELS.free;

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
          <GradientButton label="Upgrade to VibeFlow Plus" onClick={() => setLocation("/upgrade")} testId="button-upgrade-billing" />
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
                <p className="text-sm text-white">VibeFlow {tierInfo.label}</p>
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
          <div style={{ ...ROW_STYLE, borderBottom: "none" }} data-testid="row-cancel-plan">
            <CreditCard className="w-5 h-5 mr-3" style={{ color: MUTED }} />
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Cancel Subscription</p>
              <p className="text-xs" style={{ color: MUTED }}>Manage via Stripe Customer Portal</p>
            </div>
            <ChevronRight className="w-4 h-4" style={{ color: MUTED }} />
          </div>
        )}
      </div>

      <p className="text-xs px-4 pt-4 pb-2 text-center" style={{ color: MUTED }}>
        Questions? Email <span style={{ color: "#7C3AED" }}>support@vibeflow.app</span>
      </p>
    </Panel>
  );
}

function HelpPanel({ onBack }: { onBack: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const faqs = [
    { q: "How does my AI Twin work?", a: "Your AI Twin is built from your onboarding answers and ongoing interview questions. It learns your personality, communication style, and preferences to represent you authentically." },
    { q: "Who can see my profile?", a: "Only users you've set visibility for can see your full profile. You can toggle Public Profile on or off in Settings → Privacy." },
    { q: "How do matches work?", a: "VibeFlow's AI compares personality profiles and sends you curated match suggestions. You can like, super-like, or pass on each suggestion." },
    { q: "What is VibeFlow Plus?", a: "VibeFlow Plus gives you 50 likes/day (vs 5), up to 10 groups (vs 2), priority matching, and other premium perks." },
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

function ChangeEmailPanel({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = () => {
    if (!email || !email.includes("@")) {
      toast({ title: "Please enter a valid email address", variant: "destructive" });
      return;
    }
    setSent(true);
    toast({ title: "Verification email sent", description: "Check your inbox to confirm your new email." });
  };

  return (
    <Panel title="Change Email" onBack={onBack}>
      <div style={{ padding: "16px" }}>
        <p className="text-sm mb-4" style={{ color: MUTED }}>
          Enter your new email address. We'll send a verification link to confirm the change.
        </p>
        {sent ? (
          <div className="text-center py-8">
            <div style={{
              width: "60px", height: "60px", borderRadius: "50%", background: GRAD,
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
            }}>
              <Mail className="w-7 h-7 text-white" />
            </div>
            <p className="font-semibold text-white mb-2">Check your inbox</p>
            <p className="text-sm" style={{ color: MUTED }}>A verification link has been sent to <strong style={{ color: "#FFFFFF" }}>{email}</strong></p>
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
            <GradientButton label="Send Verification Link" onClick={handleSubmit} testId="button-send-email-verify" />
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
      const msg = err instanceof Error ? err.message : "Failed to update password";
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
          <input
            type="password"
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
          <input
            type="password"
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
          <input
            type="password"
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
        <p className="mb-4">Welcome to VibeFlow. By using our service, you agree to these Terms of Service.</p>
        <p className="text-white font-semibold mb-1">1. Eligibility</p>
        <p className="mb-4">You must be at least 18 years old to use VibeFlow. By registering, you confirm you meet this requirement.</p>
        <p className="text-white font-semibold mb-1">2. Acceptable Use</p>
        <p className="mb-4">You agree not to harass, impersonate, or harm other users. Automated access, scraping, or abuse of our AI features is prohibited.</p>
        <p className="text-white font-semibold mb-1">3. Content</p>
        <p className="mb-4">You retain ownership of content you post but grant VibeFlow a license to display it within the platform.</p>
        <p className="text-white font-semibold mb-1">4. Subscriptions</p>
        <p className="mb-4">Paid subscriptions auto-renew. Cancel anytime through your billing settings. Refunds are handled per our refund policy.</p>
        <p className="text-white font-semibold mb-1">5. Termination</p>
        <p className="mb-4">VibeFlow may suspend or terminate accounts that violate these Terms, engage in fraudulent activity, or otherwise abuse the platform at our sole discretion.</p>
        <p className="text-white font-semibold mb-1">6. Limitation of Liability</p>
        <p className="mb-4">VibeFlow is provided as-is. We are not responsible for outcomes of matches or interactions between users.</p>
        <p className="text-white font-semibold mb-1">7. Contact</p>
        <p>For questions, use the Contact Us page within the app or email support@vibeflow.app.</p>
      </div>
    </Panel>
  );
}

function PrivacyPolicyPanel({ onBack }: { onBack: () => void }) {
  return (
    <Panel title="Privacy Policy" onBack={onBack}>
      <div style={{ padding: "16px", color: MUTED, fontSize: "13px", lineHeight: "1.8" }}>
        <p className="text-white font-semibold mb-2">Last updated: March 2026</p>
        <p className="mb-4">VibeFlow is committed to protecting your privacy.</p>
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
        <h2 className="text-lg font-bold text-white mb-2">Clear Twin Memory</h2>
        <p className="text-sm mb-6" style={{ color: MUTED }}>
          This will erase all memory your AI Twin has built up from interviews and conversations. Your Twin will start fresh but can be retrained.
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
  if (activePanel === "age-range") return <AgeRangePanel onBack={() => setActivePanel(null)} profile={profile} />;
  if (activePanel === "block-list") return <BlockListPanel onBack={() => setActivePanel(null)} />;
  if (activePanel === "data-privacy") return <DataPrivacyPanel onBack={() => setActivePanel(null)} />;
  if (activePanel === "verify") return <VerifyPanel onBack={() => setActivePanel(null)} />;
  if (activePanel === "billing") return <BillingPanel onBack={() => setActivePanel(null)} profile={profile} />;
  if (activePanel === "help") return <HelpPanel onBack={() => setActivePanel(null)} />;
  if (activePanel === "contact") return <ContactPanel onBack={() => setActivePanel(null)} />;
  if (activePanel === "terms") return <TermsPanel onBack={() => setActivePanel(null)} />;
  if (activePanel === "privacy-policy") return <PrivacyPolicyPanel onBack={() => setActivePanel(null)} />;
  if (activePanel === "clear-memory") return <ClearMemoryPanel onBack={() => setActivePanel(null)} />;

  return (
    <div className="min-h-screen" style={{ background: BG, color: "#FFFFFF", fontFamily: "'Inter', sans-serif" }} data-testid="page-settings">
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4"
        style={{ height: "56px", background: BG, borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={() => setLocation("/profile")} className="w-8 h-8 flex items-center justify-center" data-testid="button-settings-back">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="font-bold text-white" style={{ fontSize: "17px" }}>Settings</h1>
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
          <ChevronRow icon={X} label="Clear Twin Memory" sublabel="Reset your Twin's learned data" onClick={() => setActivePanel("clear-memory")} testId="row-clear-memory" />
        </div>

        <div style={SECTION_HEADER_STYLE}>Discovery</div>
        <div style={{ background: CARD, margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ToggleRow icon={Compass} label="Discoverable" value={discoverable} onChange={(v) => { setDiscoverable(v); saveNotif("discoverable", v); }} testId="toggle-discoverable" />
          <ToggleRow icon={MapPin} label="Show Distance" value={showDistance} onChange={handleToggleShowDistance} testId="toggle-show-distance" />
          <ChevronRow icon={MapPin} label="Location Preferences" sublabel={`Within ${profile?.maxDistanceKm ?? 100} km`} onClick={() => setActivePanel("location")} testId="row-location" />
          <ChevronRow icon={Sliders} label="Age Range" sublabel={`${profile?.ageMinPreference ?? 18}–${profile?.ageMaxPreference ?? 65} years`} onClick={() => setActivePanel("age-range")} testId="row-age-range" />
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

        <div style={SECTION_HEADER_STYLE}>Subscription</div>
        <div style={{ background: CARD, margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ChevronRow icon={Crown} label="Upgrade Plan" sublabel="Get VIP access" onClick={() => setLocation("/upgrade")} testId="row-upgrade" />
          <ChevronRow icon={CreditCard} label="Manage Billing" sublabel="View plan, cancel subscription" onClick={() => setActivePanel("billing")} testId="row-billing" />
        </div>

        <div style={SECTION_HEADER_STYLE}>Support</div>
        <div style={{ background: CARD, margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ChevronRow icon={BookOpen} label="Help Center" sublabel="FAQs and guides" onClick={() => setActivePanel("help")} testId="row-help" />
          <ChevronRow icon={Phone} label="Contact Us" sublabel="Send us a message" onClick={() => setActivePanel("contact")} testId="row-contact" />
          <ChevronRow icon={FileText} label="Terms of Service" onClick={() => setActivePanel("terms")} testId="row-terms" />
          <ChevronRow icon={Shield} label="Privacy Policy" onClick={() => setActivePanel("privacy-policy")} testId="row-privacy-policy" />
        </div>

        <div style={SECTION_HEADER_STYLE}>Danger Zone</div>
        <div style={{ background: CARD, margin: "0 16px", borderRadius: "16px", overflow: "hidden" }}>
          <ChevronRow icon={LogOut} label="Sign Out" onClick={() => logout()} testId="row-sign-out" />
          <ChevronRow icon={PauseCircle} label="Pause Account" sublabel="Hide your profile temporarily" onClick={() => setShowPauseDialog(true)} destructive testId="row-pause-account" />
          <ChevronRow icon={Trash2} label="Delete Account" sublabel="Permanently remove all data" onClick={() => setShowDeleteDialog(true)} destructive testId="row-delete-account" />
        </div>
      </div>

      <Dialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
        <DialogContent style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "20px" }}>
          <DialogHeader>
            <DialogTitle className="text-white">Pause Account</DialogTitle>
            <DialogDescription style={{ color: MUTED }}>Your profile will be hidden from discovery. You can reactivate anytime.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button className="px-4 py-2 text-sm font-medium" style={{ color: MUTED }} onClick={() => setShowPauseDialog(false)} data-testid="button-cancel-pause">Cancel</button>
            <button
              className="px-4 py-2 text-sm font-semibold text-white"
              style={{ background: "#EF4444", borderRadius: "10px", border: "none" }}
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
            <DialogTitle className="text-white">Delete Account</DialogTitle>
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
