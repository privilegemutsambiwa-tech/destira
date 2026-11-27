// Settings > Help: help, contact, feedback, terms and the privacy policy.

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { pressable } from "@/lib/a11y";
import { LIMITS as SETTINGS_LIMITS } from "@shared/entitlements";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CARD, ELEVATED, BORDER, MUTED, FAINT, EMBER, MONO_EYEBROW, Panel, GradientButton } from "./ui";

export function HelpPanel({ onBack }: { onBack: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const faqs = [
    { q: "How does my AI Twin work?", a: "Your AI Twin is built from your onboarding answers and ongoing interview questions. It learns your personality, communication style, and preferences to represent you authentically." },
    { q: "Who can see my profile?", a: "Only users you've set visibility for can see your full profile. You can toggle Public Profile on or off in Settings → Privacy." },
    { q: "How do matches work?", a: "Your twin talks to other people's twins. When a conversation resonates, you get a curated read — with the transcript and a resonance score — and you decide whether to ask to meet. You can like or pass." },
    { q: "What do the paid plans give me?", a: `Free is ${SETTINGS_LIMITS.free.dailyLikes} likes a day and the two-line transcript. Spark ($${(SETTINGS_LIMITS.spark.priceCents / 100).toFixed(2)}) shows you who asked to meet you and raises likes to ${SETTINGS_LIMITS.spark.dailyLikes} a day. Flame ($${(SETTINGS_LIMITS.flame.priceCents / 100).toFixed(2)}) opens the full transcript and lets you host events. Ember ($${(SETTINGS_LIMITS.ember.priceCents / 100).toFixed(2)}) removes the ceilings entirely. See Plans for the full breakdown.` },
    { q: "How do I delete my account?", a: "Go to Settings → Danger Zone → Delete Account, then type DELETE to confirm permanent deletion of all your data." },
    { q: "Is my data shared with third parties?", a: "We never sell your personal data. AI processing uses Hive Models (DeepSeek) under strict data agreements. See our Privacy Policy for full details." },
  ];

  return (
    <Panel title="Help Center" onBack={onBack}>
      <p className="text-sm px-4 pt-4 pb-2" style={{ color: MUTED }}>Frequently asked questions</p>
      <div className="vf-card" style={{ margin: "0 16px", borderRadius: "16px", background: CARD, overflow: "hidden" }}>
        {faqs.map((faq, i) => (
          <div key={i} style={{ borderBottom: i < faqs.length - 1 ? `1px solid ${BORDER}` : "none" }}>
            <div
              className="vf-row"
              {...pressable(() => setOpen(open === i ? null : i), { expanded: open === i })}
              style={{ display: "flex", alignItems: "center", padding: "14px 16px", cursor: "pointer" }}
              data-testid={`faq-toggle-${i}`}
            >
              <p className="flex-1 text-sm font-medium text-foreground">{faq.q}</p>
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

export function ContactPanel({ onBack }: { onBack: () => void }) {
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
        <div className="vf-card" style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "16px", padding: "16px", marginBottom: "16px" }}>
          <div style={{ marginBottom: "14px" }}>
            <label style={{ ...MONO_EYEBROW, color: FAINT, marginBottom: "8px", display: "block" }}>Subject</label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 text-sm text-foreground vf-input-focus"
              style={{ background: ELEVATED, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
              data-testid="select-contact-subject"
            >
              {CONTACT_SUBJECTS.map(s => (
                <option key={s} value={s} style={{ background: CARD }}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ ...MONO_EYEBROW, color: FAINT, marginBottom: "8px", display: "block" }}>Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your issue or question..."
              rows={5}
              className="w-full px-3 py-2 text-sm text-foreground resize-none vf-input-focus"
              style={{ background: ELEVATED, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
              data-testid="input-contact-message"
            />
          </div>
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
export function FeedbackPanel({ onBack }: { onBack: () => void }) {
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
        <div className="vf-card" style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "16px", padding: "16px", marginBottom: "16px" }}>
          <div style={{ marginBottom: "14px" }}>
            <label style={{ ...MONO_EYEBROW, color: FAINT, marginBottom: "8px", display: "block" }}>What kind of thing is this</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm text-foreground vf-input-focus"
              style={{ background: ELEVATED, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
              data-testid="select-feedback-category"
            >
              {FEEDBACK_CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} style={{ background: CARD }}>{o.label}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: "14px" }}>
            <label style={{ ...MONO_EYEBROW, color: FAINT, marginBottom: "8px", display: "block" }}>Tell us</label>
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="What happened, or what you'd change..."
              rows={5}
              className="w-full px-3 py-2 text-sm text-foreground resize-none vf-input-focus"
              style={{ background: ELEVATED, border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none" }}
              data-testid="input-feedback-text"
            />
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: MUTED }}>
            <input
              type="checkbox"
              checked={contactBackConsent}
              onChange={(e) => setContactBackConsent(e.target.checked)}
              style={{ accentColor: EMBER }}
              data-testid="checkbox-feedback-contact-back"
            />
            It's OK to contact me about this
          </label>
        </div>
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

export function TermsPanel({ onBack }: { onBack: () => void }) {
  return (
    <Panel title="Terms of Service" onBack={onBack}>
      <div
        className="vf-card"
        style={{ margin: "16px", borderRadius: "16px", background: CARD, border: `1px solid ${BORDER}`, padding: "20px", color: MUTED, fontSize: "13px", lineHeight: "1.8" }}
      >
        <p className="text-foreground font-semibold mb-2">Last updated: March 2026</p>
        <p className="mb-4">Welcome to Destira. By using our service, you agree to these Terms of Service.</p>
        <p className="text-foreground font-semibold mb-1">1. Eligibility</p>
        <p className="mb-4">You must be at least 18 years old to use Destira. By registering, you confirm you meet this requirement.</p>
        <p className="text-foreground font-semibold mb-1">2. Acceptable Use</p>
        <p className="mb-4">You agree not to harass, impersonate, or harm other users. Automated access, scraping, or abuse of our AI features is prohibited.</p>
        <p className="text-foreground font-semibold mb-1">3. Content</p>
        <p className="mb-4">You retain ownership of content you post but grant Destira a license to display it within the platform.</p>
        <p className="text-foreground font-semibold mb-1">4. Subscriptions</p>
        <p className="mb-4">Plans do not renew on their own: you pay for each week, month or six months, and your plan simply ends if you don't pay again. Refunds are handled per our refund policy.</p>
        <p className="text-foreground font-semibold mb-1">5. Termination</p>
        <p className="mb-4">Destira may suspend or terminate accounts that violate these Terms, engage in fraudulent activity, or otherwise abuse the platform at our sole discretion.</p>
        <p className="text-foreground font-semibold mb-1">6. Limitation of Liability</p>
        <p className="mb-4">Destira is provided as-is. We are not responsible for outcomes of matches or interactions between users.</p>
        <p className="text-foreground font-semibold mb-1">7. Contact</p>
        <p>For questions, use the Contact Us page within the app or email support@destira.date.</p>
      </div>
    </Panel>
  );
}

export function PrivacyPolicyPanel({ onBack }: { onBack: () => void }) {
  return (
    <Panel title="Privacy Policy" onBack={onBack}>
      <div
        className="vf-card"
        style={{ margin: "16px", borderRadius: "16px", background: CARD, border: `1px solid ${BORDER}`, padding: "20px", color: MUTED, fontSize: "13px", lineHeight: "1.8" }}
      >
        <p className="text-foreground font-semibold mb-2">Last updated: March 2026</p>
        <p className="mb-4">Destira is committed to protecting your privacy.</p>
        <p className="text-foreground font-semibold mb-1">Data We Collect</p>
        <p className="mb-4">We collect your name, email, profile data, location (if permitted), and conversation data to power AI features.</p>
        <p className="text-foreground font-semibold mb-1">How We Use Data</p>
        <p className="mb-4">Your data trains your personal AI Twin and improves match quality. We never sell personal data to third parties.</p>
        <p className="text-foreground font-semibold mb-1">AI Processing</p>
        <p className="mb-4">AI features use Hive Models, routed to DeepSeek. Data sent for AI processing is subject to Hive's data processing terms.</p>
        <p className="mb-4">The full policy, including every company that helps us run Destira, is at destira.date/privacy.</p>
        <p className="text-foreground font-semibold mb-1">Data Retention</p>
        <p className="mb-4">You can delete all your data at any time via Settings → Privacy & safety → Your data → Delete all data.</p>
        <p className="text-foreground font-semibold mb-1">Cookies</p>
        <p className="mb-4">We use session cookies for authentication. No third-party advertising cookies are used.</p>
        <p className="text-foreground font-semibold mb-1">Contact</p>
        <p>Reach us via the Contact Us page for any privacy concerns.</p>
      </div>
    </Panel>
  );
}
