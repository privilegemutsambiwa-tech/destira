// Public, signed-out pages the app stores and the law ask for:
//   /privacy         the privacy policy (Google Play: "Privacy policy URL")
//   /delete-account  how to delete your account and what happens (Google
//                    Play: "Delete account URL", required for apps with accounts)
// Written to match what the code does — keep them in step when it changes
// (server/storage.ts deleteAllUserData, the services in render.yaml).
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DestiraLockup } from "@/components/brand/logo";

// Typeset like a good book (brief 7.19): a 640 px measure, serif headings,
// "last updated" in mono, a plain-language summary at the top, and on
// desktop a sticky contents list built from the page's own headings.
const H2 = "font-display font-normal text-[26px] leading-tight text-vf-text mt-12 mb-3 scroll-mt-6";
const P = "text-[15px] leading-[1.7] text-vf-muted mb-4";
const LI = "text-[15px] leading-[1.7] text-vf-muted";

function slug(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function Shell({ title, updated, summary, children }: { title: string; updated: string; summary?: string[]; children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const body = useRef<HTMLDivElement>(null);
  const [toc, setToc] = useState<{ id: string; text: string }[]>([]);

  useEffect(() => {
    const hs = Array.from(body.current?.querySelectorAll("h2") ?? []);
    setToc(hs.map((h) => {
      const text = h.textContent ?? "";
      if (!h.id) h.id = slug(text);
      return { id: h.id, text };
    }));
  }, []);

  return (
    <div className="min-h-dvh bg-vf-ink text-vf-text">
      <div className="max-w-[1040px] mx-auto px-5 sm:px-8 py-8 lg:grid lg:grid-cols-[220px_minmax(0,640px)] lg:gap-16">
        <div className="lg:col-span-2">
          <button onClick={() => setLocation("/")} className="text-vf-text" aria-label="Destira home">
            <DestiraLockup orientation="horizontal" size={28} />
          </button>
        </div>
        {toc.length > 2 ? (
          <nav className="hidden lg:block" aria-label="On this page">
            <div className="sticky top-8 mt-[124px]">
              <div className="vf-label text-vf-faint mb-3">On this page</div>
              <ul className="space-y-2 border-l border-vf-line">
                {toc.map((t) => (
                  <li key={t.id}>
                    <a href={`#${t.id}`} className="block pl-4 -ml-px border-l border-transparent hover:border-vf-ember text-[14px] text-vf-muted hover:text-vf-text transition-colors">
                      {t.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        ) : <div className="hidden lg:block" />}
        <article className="max-w-[640px]">
          <h1 className="font-display font-normal text-[clamp(34px,6vw,48px)] leading-[1.05] tracking-[-0.02em] mt-10">{title}</h1>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-vf-faint mt-3">Last updated {updated}</p>
          {summary && (
            <aside className="mt-7 rounded-[18px] border border-vf-line bg-vf-surface p-5" data-testid="legal-summary">
              <div className="vf-label text-vf-faint">In plain words</div>
              <ul className="mt-3 space-y-2">
                {summary.map((line) => (
                  <li key={line} className="flex gap-2.5 text-[15px] leading-[1.55] text-vf-text">
                    <span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-vf-ember shrink-0" aria-hidden="true" />
                    {line}
                  </li>
                ))}
              </ul>
            </aside>
          )}
          <div className="mt-6" ref={body}>{children}</div>
          <p className={`${P} mt-12`}>
            Questions: <span className="text-vf-text select-all">support@destira.date</span>
          </p>
        </article>
      </div>
    </div>
  );
}

export function PrivacyPolicy() {
  return (
    <Shell
      title="Privacy policy"
      updated="13 October 2026"
      summary={[
        "We never sell your personal data.",
        "Your twin only shares what you allow, and never speaks as you.",
        "Other members never see where you are on a map.",
        "You can download or delete everything, any time.",
      ]}
    >
      <p className={P}>
        Destira is a dating and social app for adults (18 and over). This page explains what we collect, why, who
        helps us run the service, and the choices you have. We never sell your personal data.
      </p>

      <h2 className={H2}>What we collect</h2>
      <ul className="list-disc pl-5 mb-4 space-y-1.5">
        <li className={LI}><b className="text-vf-text font-medium">Account details:</b> email address, name, and a password (stored only as a one-way hash), or your Google account if you sign in with Google.</li>
        <li className={LI}><b className="text-vf-text font-medium">Your profile:</b> photos, age, gender, who you want to meet, your city, prompts and your answers to the twin's questions.</li>
        <li className={LI}><b className="text-vf-text font-medium">What you do in the app:</b> likes, matches, messages, conversations with AI twins, events you join, groups and stories.</li>
        <li className={LI}><b className="text-vf-text font-medium">Video dates:</b> who called whom, when, and how long the call lasted. The video and sound go straight between the two of you through our video provider and are never recorded or stored by us. Your camera and microphone are used only while you're on a call.</li>
        <li className={LI}><b className="text-vf-text font-medium">Location, only if you turn it on:</b> used to tell you when someone worth meeting is at the same named place. You can switch it off at any time.</li>
        <li className={LI}><b className="text-vf-text font-medium">Payments:</b> the plan you bought, the amount and the result. Your mobile-money PIN and card number go to the payment provider, never to us.</li>
        <li className={LI}><b className="text-vf-text font-medium">Device and usage:</b> a notification token for your phone or browser if you allow notifications, which days you used the app, and how you first found Destira (for example an invite link).</li>
      </ul>

      <h2 className={H2}>How we use it</h2>
      <ul className="list-disc pl-5 mb-4 space-y-1.5">
        <li className={LI}>To build your AI twin, which answers other members' questions about you, only on topics you have allowed.</li>
        <li className={LI}>To suggest people and events, send the notifications you asked for, and run the service safely.</li>
        <li className={LI}>To review reports, prevent abuse and keep members safe.</li>
        <li className={LI}>To understand, in totals, how many people join, stay and pay, so we can improve the app.</li>
      </ul>

      <h2 className={H2}>Who helps us run Destira</h2>
      <p className={P}>These companies process data for us, only to provide their service:</p>
      <ul className="list-disc pl-5 mb-4 space-y-1.5">
        <li className={LI}>Render: hosts the app.</li>
        <li className={LI}>Supabase: stores the database and photos (servers in Ireland) and handles Google sign-in.</li>
        <li className={LI}>Hive Models, using DeepSeek: generates your AI twin's replies.</li>
        <li className={LI}>Resend: sends our emails.</li>
        <li className={LI}>Paynow: takes payments by EcoCash, OneMoney, InnBucks and card.</li>
        <li className={LI}>Google (Firebase): delivers notifications to the Android app.</li>
        <li className={LI}>LiveKit: carries the video and sound of video dates between the two phones. It doesn't record them.</li>
      </ul>

      <h2 className={H2}>What other members see</h2>
      <p className={P}>
        Other members see your profile and what your twin says about you. Your twin never shares topics you have
        kept private, and you can change what it may discuss at any time in the app.
      </p>

      <h2 className={H2}>Your choices</h2>
      <ul className="list-disc pl-5 mb-4 space-y-1.5">
        <li className={LI}>Download a copy of your data: Settings, then Data & Privacy.</li>
        <li className={LI}>Turn location and notifications on or off at any time.</li>
        <li className={LI}>Delete your account and data: see <a href="/delete-account" className="text-vf-ember underline underline-offset-2">how to delete your account</a>.</li>
      </ul>

      <h2 className={H2}>Keeping and deleting data</h2>
      <p className={P}>
        We keep your data while your account is open. When you delete your account, we delete your profile,
        photos, answers, twin memory, messages, matches and notification tokens straight away, and erase your
        email, name and password, so the account can never be signed in to again.
      </p>

      <h2 className={H2}>Children</h2>
      <p className={P}>Destira is only for people aged 18 and over. We remove accounts we find belong to anyone younger.</p>
    </Shell>
  );
}

export function DeleteAccountInfo() {
  const [, setLocation] = useLocation();
  return (
    <Shell
      title="Delete your Destira account"
      updated="14 November 2026"
      summary={["You can do it yourself, in a minute.", "It's permanent: your profile, twin, chats and photos go straight away."]}
    >
      <p className={P}>You can delete your account yourself, at any time, from the app or the website.</p>
      <ol className="list-decimal pl-5 mb-6 space-y-1.5">
        <li className={LI}>Sign in at destira.date or in the Destira app.</li>
        <li className={LI}>Open Settings, then Privacy & safety, then Your data.</li>
        <li className={LI}>Tap Delete all data and type DELETE to confirm.</li>
      </ol>
      <button
        onClick={() => setLocation("/login")}
        className="h-12 px-7 rounded-full bg-vf-ember text-vf-ink font-semibold text-[15px] btn-press"
      >
        Sign in to delete it
      </button>

      <h2 className={H2}>What is deleted</h2>
      <p className={P}>
        Straight away: your profile, photos, answers, AI twin and its memory, matches, messages, likes, stories,
        group memberships, invite records and notification tokens. Your email, name and password are erased, so
        the account can never be signed in to again, and you can sign up afresh with the same email later.
      </p>
      <h2 className={H2}>What is kept</h2>
      <p className={P}>
        An anonymous account number, with nothing that identifies you, so that events and groups other members
        still use keep working.
      </p>
      <h2 className={H2}>Can't sign in?</h2>
      <p className={P}>
        Email support@destira.date from the address on your account and ask us to delete it. We will confirm
        within 7 days.
      </p>
    </Shell>
  );
}
