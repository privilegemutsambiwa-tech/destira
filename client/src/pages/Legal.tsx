// Public, signed-out pages the app stores and the law ask for:
//   /privacy         the privacy policy (Google Play: "Privacy policy URL")
//   /delete-account  how to delete your account and what happens (Google
//                    Play: "Delete account URL", required for apps with accounts)
// Written to match what the code does — keep them in step when it changes
// (server/storage.ts deleteAllUserData, the services in render.yaml).
import { useLocation } from "wouter";
import { DestiraLockup } from "@/components/brand/logo";

const H2 = "font-serif font-normal text-[24px] leading-tight text-vf-text mt-10 mb-3";
const P = "text-[15px] leading-[1.7] text-vf-muted mb-4";
const LI = "text-[15px] leading-[1.7] text-vf-muted";

function Shell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-dvh bg-vf-ink text-vf-text">
      <div className="max-w-[680px] mx-auto px-5 sm:px-8 py-8">
        <button onClick={() => setLocation("/")} className="text-vf-text" aria-label="Destira home">
          <DestiraLockup orientation="horizontal" size={28} />
        </button>
        <h1 className="font-serif font-normal text-[clamp(32px,6vw,44px)] leading-[1.05] tracking-[-0.02em] mt-10">{title}</h1>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-vf-faint mt-3">Last updated {updated}</p>
        <div className="mt-6">{children}</div>
        <p className={`${P} mt-12`}>
          Questions: <span className="text-vf-text select-all">support@destira.date</span>
        </p>
      </div>
    </div>
  );
}

export function PrivacyPolicy() {
  return (
    <Shell title="Privacy policy" updated="13 October 2026">
      <p className={P}>
        Destira is a dating and social app for adults (18 and over). This page explains what we collect, why, who
        helps us run the service, and the choices you have. We never sell your personal data.
      </p>

      <h2 className={H2}>What we collect</h2>
      <ul className="list-disc pl-5 mb-4 space-y-1.5">
        <li className={LI}><b className="text-vf-text font-medium">Account details:</b> email address, name, and a password (stored only as a one-way hash), or your Google account if you sign in with Google.</li>
        <li className={LI}><b className="text-vf-text font-medium">Your profile:</b> photos, age, gender, who you want to meet, your city, prompts and your answers to the twin's questions.</li>
        <li className={LI}><b className="text-vf-text font-medium">What you do in the app:</b> likes, matches, messages, conversations with AI twins, events you join, groups and stories.</li>
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
    <Shell title="Delete your Destira account" updated="13 October 2026">
      <p className={P}>You can delete your account yourself, at any time, from the app or the website.</p>
      <ol className="list-decimal pl-5 mb-6 space-y-1.5">
        <li className={LI}>Sign in at destira.date or in the Destira app.</li>
        <li className={LI}>Open Settings, then Data & Privacy.</li>
        <li className={LI}>Tap Delete All Data and type DELETE to confirm.</li>
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
