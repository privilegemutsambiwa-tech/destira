import { lookingForOf } from "@shared/friends";
import { PUSH_CATEGORIES, PUSH_CATEGORY_INFO, PUSH_DAILY_BUDGET, QUIET_END_HOUR, QUIET_START_HOUR, type NotificationCategory } from "@shared/notify";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, User, Brain, Shield, Bell, Wrench, Crown, AlertTriangle, LogOut, Trash2, PauseCircle, Eye, EyeOff,
  Volume2, MapPin, MessageSquare, Zap, Check, Lock, Mail, Sliders, FileText, Heart, X, CreditCard, BookOpen, Phone, CalendarDays, Users, Megaphone, SlidersHorizontal, Sparkles, BadgeCheck, Clock, Utensils, CircleDot, ClipboardList, Quote, HeartHandshake, AtSign
} from "lucide-react";
import { filtersSummary } from "@shared/match-prefs";
import { useAuth } from "@/hooks/use-auth";
import { useProfile, useUpdateProfile } from "@/hooks/use-profiles";
import { useToast } from "@/hooks/use-toast";
import { SEEKING_OPTIONS } from "@shared/essentials";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { AppLockSetting } from "@/components/app-lock";
import { SearchField } from "@/components/ui-vf";
import { plainBackground, setPlainBackground } from "@/lib/ambient";
import { bytesThisWeek, formatBytes, setDataSaverPref, useDataSaver } from "@/lib/data-saver";
import { PushTestRow } from "@/components/push-test";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ChangeEmailPanel, ChangePasswordPanel } from "@/components/settings/account-panels";
import { BillingPanel } from "@/components/settings/billing-panel";
import { LocationPanel, ProximityPanel, AgeRangePanel, SeekingGendersPanel } from "@/components/settings/discovery-panels";
import { HelpPanel, ContactPanel, FeedbackPanel, TermsPanel, PrivacyPolicyPanel } from "@/components/settings/help-panels";
import { BlockListPanel, DataPrivacyPanel } from "@/components/settings/privacy-panels";
import { LookingForRow, InviteRow, AppearanceRow } from "@/components/settings/rows";
import { TwinTonePanel, AiSummaryPanel, ClearMemoryPanel } from "@/components/settings/twin-panels";
import { BG, CARD, ELEVATED, BORDER, MUTED, TEXT, EMBER, INK, SERIF, MONO_EYEBROW, SECTION_HEADER_STYLE, ToggleRow, ChevronRow } from "@/components/settings/ui";
import { VerifyPanel } from "@/components/settings/verify-panel";

const PUSH_ICON: Record<NotificationCategory, typeof Bell> = {
  matches: Zap,
  messages: MessageSquare,
  unread: Clock,
  events: CalendarDays,
  event_reminders: Bell,
  event_likes: Heart,
  tables: Utensils,
  circles: CircleDot,
  board: ClipboardList,
  vouches: Quote,
  wingman: HeartHandshake,
  lounge: AtSign,
  stories: Eye,
  interviews: Brain,
  twin: Sparkles,
  plan: Crown,
  account: BadgeCheck,
};

type PanelKey =
  | "change-email" | "change-password"
  | "twin-tone" | "location" | "age-range" | "seeking-genders" | "block-list" | "proximity"
  | "data-privacy" | "verify" | "billing" | "help" | "contact" | "feedback"
  | "terms" | "privacy-policy" | "clear-memory" | "ai-summary" | null;

export default function Settings() {
  const [, setLocation] = useLocation();
  const { logout } = useAuth();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const { toast } = useToast();

  const [activePanel, setActivePanel] = useState<PanelKey>(null);
  const [activeSection, setActiveSection] = useState("account"); // desktop two-pane nav only
  // ?q= opens Settings already filtered (the command palette links here).
  const [plainBg, setPlainBg] = useState(plainBackground);
  const dataSaver = useDataSaver();
  const usedThisWeek = bytesThisWeek();
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

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
    // A receipt's "Settings" link opens the payment history.
    if (requested === "billing" || (typeof window !== "undefined" && window.location.hash === "#payments")) {
      setActivePanel("billing");
    }
    // The "try your selfie again" notification opens the verify panel.
    if (requested === "verify" || (typeof window !== "undefined" && window.location.hash === "#verify")) {
      setActivePanel("verify");
    }
    // The bell's "Choose what you hear about" opens Notifications.
    if (typeof window !== "undefined" && window.location.hash === "#notifications") {
      setActiveSection("notifications");
      setTimeout(() => document.getElementById("settings-section-notifications")?.scrollIntoView({ block: "start" }), 50);
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

  const notifPrefs: Record<string, boolean> = (profile as any)?.notificationPrefs || {};
  const notifEnabled = (key: string) => notifPrefs[key] !== false;
  const handleToggleNotifPref = async (key: string, value: boolean) => {
    if (!profile) return;
    try {
      await updateProfile.mutateAsync({ userId: profile.userId, data: { notificationPrefs: { ...notifPrefs, [key]: value } } });
    } catch {
      toast({ title: "Error saving preference", variant: "destructive" });
    }
  };

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/account", { confirmation: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Account deleted", description: "All your data has been erased." });
      // Straight to "/", not logout() — the account row is already gone, so
      // routing through /api/logout would just be an extra round trip for
      // nothing (matches the Data & Privacy panel's delete flow below).
      window.location.href = "/";
    },
    onError: () => toast({ title: "Failed to delete account", variant: "destructive" }),
  });

  if (activePanel === "change-email") return <ChangeEmailPanel onBack={() => setActivePanel(null)} />;
  if (activePanel === "change-password") return <ChangePasswordPanel onBack={() => setActivePanel(null)} />;
  if (activePanel === "twin-tone") return <TwinTonePanel onBack={() => setActivePanel(null)} profile={profile} />;
  if (activePanel === "location") return <LocationPanel onBack={() => setActivePanel(null)} profile={profile} />;
  if (activePanel === "proximity") return <ProximityPanel onBack={() => { setActivePanel(null); if (window.location.hash) history.replaceState(null, "", window.location.pathname); }} profile={profile} />;
  if (activePanel === "age-range") return <AgeRangePanel onBack={() => setActivePanel(null)} profile={profile} />;
  if (activePanel === "seeking-genders") return <SeekingGendersPanel onBack={() => setActivePanel(null)} profile={profile} />;
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
  if (activePanel === "ai-summary") return <AiSummaryPanel onBack={() => setActivePanel(null)} profile={profile} />;

  // One list of sections drives both layouts — mobile's stacked drill-down
  // column and desktop's two-pane nav — so they can never drift apart into
  // two different settings screens that happen to look similar. `content`
  // is just the card's rows; margin/wrapping is applied by whichever layout
  // is rendering it, not baked in here.
  const cardStyle: React.CSSProperties = { background: CARD, borderRadius: "16px", overflow: "hidden" };
  // Grouped as the brief asks (docs/destira-upgrade-prompt.md §7.16): Account,
  // Your twin, Privacy & safety, Notifications, Discovery, Plan & billing,
  // App, Help, Legal, then the things that can't be undone, last.
  // `keywords` is what "Search settings" matches, besides the label.
  const sections: { id: string; label: string; keywords: string; danger?: boolean; content: React.ReactNode }[] = [
    {
      id: "account",
      label: "Account",
      keywords: "edit profile email password verify verification pause hide sign out log out",
      content: (
        <div className="vf-card" style={cardStyle}>
          <ChevronRow icon={User} label="Edit profile" sublabel="Name, photos, your words" onClick={() => setLocation("/profile")} testId="row-edit-profile" />
          <ChevronRow icon={Mail} label="Change email" sublabel="Where we send sign-in links" onClick={() => setActivePanel("change-email")} testId="row-change-email" />
          <ChevronRow icon={Lock} label="Change password" onClick={() => setActivePanel("change-password")} testId="row-change-password" />
          <ChevronRow icon={Check} label="Verify your profile" sublabel={profile?.isVerified ? "Verified" : profile?.verificationStatus === "pending" ? "With our team" : profile?.verificationStatus === "rejected" ? "Try your selfie again" : "A quick selfie, checked by a person"} onClick={() => setActivePanel("verify")} testId="row-verify" />
          <ChevronRow icon={PauseCircle} label="Pause account" sublabel="Hide your profile for a while" onClick={() => setShowPauseDialog(true)} testId="row-pause-account" />
          <ChevronRow icon={LogOut} label="Sign out" onClick={() => logout()} testId="row-sign-out" />
        </div>
      ),
    },
    {
      id: "twin",
      label: "Your twin",
      keywords: "twin ai talk interview tone style boundaries discuss topics summary",
      content: (
        <div className="vf-card" style={cardStyle}>
          <ChevronRow icon={Brain} label="Talk to your twin" sublabel="Tell it more, so it answers better" onClick={() => setLocation("/twin-chat?from=/settings")} testId="row-twin-chat" />
          <ChevronRow icon={Volume2} label="How your twin talks" sublabel="Style, length, formality" onClick={() => setActivePanel("twin-tone")} testId="row-twin-tone" />
          <ChevronRow icon={Shield} label="What your twin may discuss" sublabel="Per topic: open, vague or off, plus your own note" onClick={() => setLocation("/twin-disclosure")} testId="row-twin-boundaries" />
          <ChevronRow icon={Wrench} label="Write your summary with AI" sublabel="A starting point you can edit" onClick={() => setActivePanel("ai-summary")} testId="row-ai-summary" />
        </div>
      ),
    },
    {
      id: "privacy",
      label: "Privacy & safety",
      keywords: "public private profile distance block blocked data export delete app lock fingerprint",
      content: (
        <div className="vf-card" style={cardStyle}>
          <ToggleRow
            icon={profile?.isPublic ? Eye : EyeOff}
            label="Public profile"
            sublabel={profile?.isPublic ? "People can find you in Discover" : "Hidden from Discover; your chats carry on"}
            value={profile?.isPublic ?? false}
            onChange={handleTogglePublic}
            testId="toggle-public-profile"
          />
          <ToggleRow icon={MapPin} label="Show distance" sublabel="Others see roughly how far away you are, never where" value={showDistance} onChange={handleToggleShowDistance} testId="toggle-show-distance" />
          <AppLockSetting Row={ToggleRow} />
          <ChevronRow icon={Shield} label="Blocked people" sublabel="See and undo blocks" onClick={() => setActivePanel("block-list")} testId="row-block-list" />
          <ChevronRow icon={FileText} label="Your data" sublabel="Download a copy, or delete it" onClick={() => setActivePanel("data-privacy")} testId="row-data-privacy" />
        </div>
      ),
    },
    {
      id: "notifications",
      label: "Notifications",
      keywords: "push notifications bell activity matches messages unread reminders stories interviews events twin plan account quiet hours email digest tips news test",
      content: (
        <div className="flex flex-col gap-4">
          <div className="vf-card" style={cardStyle}>
            {PUSH_CATEGORIES.map((key) => (
              <ToggleRow
                key={key}
                icon={PUSH_ICON[key]}
                label={PUSH_CATEGORY_INFO[key].label}
                sublabel={PUSH_CATEGORY_INFO[key].hint}
                value={notifEnabled(key)}
                onChange={(v) => handleToggleNotifPref(key, v)}
                testId={`toggle-notif-${key}`}
              />
            ))}
            <p className="text-[12.5px] leading-[1.5] px-1 pt-3 pb-1" style={{ color: MUTED }} data-testid="text-push-budget">
              Matches and messages come straight away. Everything else is at most {PUSH_DAILY_BUDGET} a day and never between {QUIET_START_HOUR}:00 and {String(QUIET_END_HOUR).padStart(2, "0")}:00 your time. Anything that waits arrives together, as one.
            </p>
            <PushTestRow Row={ChevronRow} />
          </div>
          <div className="vf-card" style={cardStyle}>
            <ToggleRow icon={Mail} label="Email from Destira" sublabel="Turn off to get no email except account and safety notes" value={notifEnabled("email_all")} onChange={(v) => handleToggleNotifPref("email_all", v)} testId="toggle-email-all" />
            {notifEnabled("email_all") && (
              <>
                <ToggleRow icon={Heart} label="When someone likes you" sublabel="One email, not one per like" value={notifEnabled("email_likes")} onChange={(v) => handleToggleNotifPref("email_likes", v)} testId="toggle-email-likes" />
                <ToggleRow icon={CalendarDays} label="Weekly digest" sublabel="What happened while you were away" value={notifEnabled("email_digest")} onChange={(v) => handleToggleNotifPref("email_digest", v)} testId="toggle-email-digest" />
                <ToggleRow icon={Bell} label="Getting-started tips" sublabel="A few, early on, then they stop" value={notifEnabled("email_tips")} onChange={(v) => handleToggleNotifPref("email_tips", v)} testId="toggle-email-tips" />
                <ToggleRow icon={Megaphone} label="News and updates" sublabel="New features, now and then" value={notifEnabled("email_news")} onChange={(v) => handleToggleNotifPref("email_news", v)} testId="toggle-email-news" />
                <ToggleRow icon={Bell} label="Plan reminders" sublabel="Before a plan or free trial ends. Receipts always come" value={notifEnabled("email_billing")} onChange={(v) => handleToggleNotifPref("email_billing", v)} testId="toggle-email-billing" />
              </>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "discovery",
      label: "Discovery",
      keywords: "love friends both here for location distance km proximity alerts age range who you see gender events preferences filters dealbreakers faith children marriage verified",
      content: (
        <div className="vf-card" style={cardStyle}>
          <LookingForRow
            value={lookingForOf((profile as any)?.lookingFor)}
            onChange={async (v) => {
              if (!profile) return;
              const seekingNone = !((profile.seekingGenders as string[] | null)?.length);
              await updateProfile.mutateAsync({ userId: profile.userId, data: v === "friends" && seekingNone ? { lookingFor: v, seekingGenders: ["everyone"] } : { lookingFor: v } as any });
              toast({ title: v === "friends" ? "Friends only. Your dating profile is hidden." : v === "both" ? "Love and Friends, kept separate." : "Love only. Friends is off." });
            }}
          />
          <ChevronRow icon={MapPin} label="How far to look" sublabel={`Within ${profile?.maxDistanceKm ?? 100} km`} onClick={() => setActivePanel("location")} testId="row-location" />
          <ChevronRow icon={Sliders} label="Age range" sublabel={`${profile?.ageMinPreference ?? 18}–${profile?.ageMaxPreference ?? 65} years`} onClick={() => setActivePanel("age-range")} testId="row-age-range" />
          <ChevronRow
            icon={Users}
            label="Who you see"
            sublabel={
              !profile?.seekingGenders?.length || profile.seekingGenders.includes("everyone")
                ? "Everyone"
                : profile.seekingGenders
                    .map((v: string) => SEEKING_OPTIONS.find((o) => o.value === v)?.label ?? v)
                    .join(", ")
            }
            onClick={() => setActivePanel("seeking-genders")}
            testId="row-seeking-genders"
          />
          <ChevronRow icon={SlidersHorizontal} label="Filters" sublabel={filtersSummary((profile as any)?.matchPrefs)} onClick={() => setLocation("/settings/filters")} testId="row-filters" />
          <ChevronRow icon={Zap} label="Proximity alerts" sublabel="When someone worth knowing is at the same place" onClick={() => setActivePanel("proximity")} testId="row-proximity" />
          <ChevronRow icon={CalendarDays} label="Event preferences" sublabel="What shows up in your Events feed" onClick={() => setLocation("/settings/events?from=/settings")} testId="row-event-preferences" />
        </div>
      ),
    },
    {
      id: "subscription",
      label: "Plan & billing",
      keywords: "plan plans subscription billing cancel upgrade spark flame ember invite friend referral",
      content: (
        <div className="vf-card" style={cardStyle}>
          <ChevronRow icon={Crown} label="Plans" sublabel="What each plan opens up" onClick={() => setLocation("/plans")} testId="row-upgrade" />
          <ChevronRow icon={CreditCard} label="Billing" sublabel="Your plan, renewals, cancel" onClick={() => setActivePanel("billing")} testId="row-billing" />
          <InviteRow />
        </div>
      ),
    },
    {
      id: "appearance",
      label: "App",
      keywords: "appearance theme dark light system photos background evening light data saver mobile data",
      content: (
        <div className="vf-card" style={cardStyle}>
          <AppearanceRow />
          <ToggleRow
            icon={Sliders}
            label="Plain background"
            sublabel="Turns off the light that follows the time of day"
            value={plainBg}
            onChange={(v) => { setPlainBackground(v); setPlainBg(v); }}
            testId="toggle-plain-background"
          />
          <ToggleRow
            icon={Zap}
            label="Always save data"
            sublabel={`${
              dataSaver.pref === "on"
                ? "Smaller photos, and story videos wait for a tap."
                : dataSaver.slow
                  ? "On by itself right now: your connection is slow."
                  : "Off: it turns on by itself on a slow connection."
            }${usedThisWeek > 0 ? ` About ${formatBytes(usedThisWeek)} used this week on this device.` : ""}`}
            value={dataSaver.pref === "on"}
            onChange={(v) => setDataSaverPref(v ? "on" : "auto")}
            testId="toggle-data-saver"
          />
          <ChevronRow icon={Wrench} label="Photos" sublabel="Order, cover and crops" onClick={() => setLocation("/photos")} testId="row-manage-photos" />
        </div>
      ),
    },
    {
      id: "support",
      label: "Help",
      keywords: "help faq contact support feedback bug idea",
      content: (
        <div className="vf-card" style={cardStyle}>
          <ChevronRow icon={BookOpen} label="Help centre" sublabel="Answers to common questions" onClick={() => setActivePanel("help")} testId="row-help" />
          <ChevronRow icon={Phone} label="Contact us" sublabel="A person reads every message" onClick={() => setActivePanel("contact")} testId="row-contact" />
          <ChevronRow icon={Wrench} label="Send feedback" sublabel="A bug, an idea, or just a note" onClick={() => setActivePanel("feedback")} testId="row-feedback" />
        </div>
      ),
    },
    {
      id: "legal",
      label: "Legal",
      keywords: "terms service privacy policy legal",
      content: (
        <div className="vf-card" style={cardStyle}>
          <ChevronRow icon={FileText} label="Terms of service" onClick={() => setActivePanel("terms")} testId="row-terms" />
          <ChevronRow icon={Shield} label="Privacy policy" onClick={() => setActivePanel("privacy-policy")} testId="row-privacy-policy" />
        </div>
      ),
    },
    {
      id: "irreversible",
      label: "Can't be undone",
      keywords: "delete account clear twin memory forget erase",
      danger: true,
      // Its own visually distinct strip, not just another vf-card: a red
      // wash + border and a "think twice" header, so these two rows never
      // blend into the neutral settings rows around them.
      content: (
        <div
          className="vf-card"
          style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.28)", borderRadius: "16px", overflow: "hidden" }}
          data-testid="card-irreversible"
        >
          <div
            className="flex items-center gap-2"
            style={{ padding: "11px 16px", borderBottom: "1px solid rgba(239,68,68,0.18)" }}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--vf-danger)" }} />
            <span style={{ ...MONO_EYEBROW, color: "var(--vf-danger)" }}>Think twice: these can't be undone</span>
          </div>
          <ChevronRow icon={X} label="Clear your twin's memory" sublabel="Your twin forgets everything it has learned" onClick={() => setActivePanel("clear-memory")} destructive testId="row-clear-memory" />
          <ChevronRow icon={Trash2} label="Delete account" sublabel="Everything, permanently" onClick={() => setShowDeleteDialog(true)} destructive testId="row-delete-account" />
        </div>
      ),
    },
  ];

  const q = query.trim().toLowerCase();
  const matching = q
    ? sections.filter((s) => s.label.toLowerCase().includes(q) || s.keywords.includes(q))
    : sections;

  const activeSectionObj = sections.find((s) => s.id === activeSection) ?? sections[0];

  return (
    <div className="min-h-dvh" style={{ background: BG, color: TEXT }} data-testid="page-settings">
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4"
        style={{ height: "56px", background: BG, borderBottom: `1px solid ${BORDER}` }}>
        <button aria-label="Back" onClick={() => setLocation("/profile")} className="w-8 h-8 flex items-center justify-center" data-testid="button-settings-back">
          <ArrowLeft className="w-5 h-5" style={{ color: EMBER }} />
        </button>
        <h1 style={{ ...SERIF, color: TEXT, fontSize: "20px" }}>Settings</h1>
      </div>

      <div style={{ maxWidth: "1080px", margin: "0 auto" }} className="px-4 pt-4">
        <div className="lg:max-w-[480px]">
          <SearchField label="Search settings" value={query} onChange={setQuery} data-testid="input-search-settings" />
        </div>
      </div>

      {q ? (
        <div style={{ maxWidth: "620px", margin: "0 auto", padding: "0 0 40px" }} data-testid="settings-search-results">
          {matching.length === 0 ? (
            <p className="px-4 pt-8 text-center text-[14px]" style={{ color: MUTED }}>Nothing called that. Try another word.</p>
          ) : (
            matching.map((s) => (
              <div key={s.id}>
                <div style={s.danger ? { ...SECTION_HEADER_STYLE, color: "var(--vf-danger)" } : SECTION_HEADER_STYLE}>{s.label}</div>
                <div style={{ margin: "0 16px" }}>{s.content}</div>
              </div>
            ))
          )}
        </div>
      ) : (
      <>

      {/* Mobile / tablet — the existing stacked drill-down column, touch
          friendly, unchanged in every way except that "Irreversible" now
          renders its own distinct strip instead of a plain vf-card. */}
      <div className="lg:hidden" style={{ maxWidth: "480px", margin: "0 auto", paddingBottom: "40px" }}>
        {sections.map((s) => (
          <div key={s.id} id={`settings-section-${s.id}`} style={{ scrollMarginTop: "64px" }}>
            <div style={s.danger ? { ...SECTION_HEADER_STYLE, color: "var(--vf-danger)" } : SECTION_HEADER_STYLE}>{s.label}</div>
            <div style={{ margin: "0 16px" }}>{s.content}</div>
          </div>
        ))}
      </div>

      {/* Desktop — a real two-pane destination: a sticky jump-nav on the
          left picks the section, its rows render on the right. Every
          drill-down (Change Email, Verify Profile, …) still opens as its
          own focused panel over the top, same as on mobile — this only
          restructures the top-level list, which is what actually read as
          "a settings dump" rather than a place worth arriving at. */}
      <div className="hidden lg:flex" style={{ maxWidth: "1080px", margin: "0 auto", paddingBottom: "48px" }}>
        <nav className="shrink-0 sticky" style={{ width: "224px", top: "80px", alignSelf: "flex-start", padding: "24px 12px" }}>
          {sections.map((s) => {
            const active = s.id === activeSectionObj.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className="w-full text-left transition-colors duration-150 vf-row"
                style={{
                  display: "block",
                  padding: "9px 14px",
                  borderRadius: "10px",
                  fontSize: "13.5px",
                  marginBottom: "2px",
                  background: active ? ELEVATED : undefined,
                  color: s.danger ? "var(--vf-danger)" : active ? TEXT : MUTED,
                  fontWeight: active ? 500 : 400,
                }}
                data-testid={`nav-section-${s.id}`}
              >
                {s.label}
              </button>
            );
          })}
        </nav>

        <div className="flex-1 min-w-0" style={{ padding: "24px 8px 24px 20px" }}>
          <h2 style={{ ...SERIF, color: TEXT, fontSize: "24px", marginBottom: "18px" }} data-testid="text-active-section">
            {activeSectionObj.label}
          </h2>
          <div style={{ maxWidth: "620px" }}>{activeSectionObj.content}</div>
        </div>
      </div>
      </>
      )}

      <Dialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
        <DialogContent style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "20px" }}>
          <DialogHeader>
            <DialogTitle style={{ ...SERIF, color: TEXT }}>Pause Account</DialogTitle>
            <DialogDescription style={{ color: MUTED }}>Your profile will be hidden from discovery. You can reactivate anytime.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button className="px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-150 hover:bg-[var(--vf-elevated)]" style={{ color: MUTED }} onClick={() => setShowPauseDialog(false)} data-testid="button-cancel-pause">Cancel</button>
            <button
              className="px-4 py-2 text-sm vf-btn-primary"
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
            <p className="text-xs mb-2" style={{ color: MUTED }}>Type <strong style={{ color: "var(--vf-danger)" }}>DELETE</strong> to confirm</p>
            <input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full px-3 py-2 text-sm text-foreground vf-input-focus"
              style={{ background: ELEVATED, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
              data-testid="input-delete-confirm"
            />
          </div>
          <DialogFooter className="gap-2">
            <button className="px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-150 hover:bg-[var(--vf-elevated)]" style={{ color: MUTED }} onClick={() => { setShowDeleteDialog(false); setDeleteConfirmText(""); }} data-testid="button-cancel-delete">Cancel</button>
            <button
              disabled={deleteConfirmText !== "DELETE" || deleteMutation.isPending}
              className="px-4 py-2 text-sm font-semibold vf-btn-primary"
              style={{ background: deleteConfirmText === "DELETE" ? "#C62828" : BORDER, color: deleteConfirmText === "DELETE" ? "#FFFFFF" : TEXT, borderRadius: "10px", border: "none", cursor: deleteConfirmText === "DELETE" ? "pointer" : "not-allowed" }}
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
