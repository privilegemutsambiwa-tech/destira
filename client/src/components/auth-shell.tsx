import { useEffect, useState, type ReactNode } from "react";
import { DestiraLockup } from "@/components/brand/logo";
import { landingPhotos } from "@/lib/landing-photos";
import { isNativeApp } from "@/lib/native";

// Brief 7.2: one shared, calm layout for sign up, log in, forgot and reset.
// Logo top, serif title, the form, one primary button. On desktop the form
// sits in a 440 px column on the left, and the right half shows an evening
// photo with one line from a twin conversation, changing slowly.

export const AUTH_INPUT =
  "w-full rounded-[12px] border border-vf-line bg-vf-text/5 px-3.5 h-12 text-[15px] text-vf-text placeholder:text-vf-faint focus:outline-none focus:ring-2 focus:ring-vf-ember/60 focus:ring-offset-2 focus:ring-offset-vf-ink transition-shadow aria-[invalid=true]:border-vf-ember";
export const AUTH_LABEL = "vf-label text-vf-faint mb-1.5 block";
export const AUTH_PRIMARY =
  "mt-1 w-full inline-flex items-center justify-center gap-2 rounded-full bg-vf-ember text-vf-ink font-semibold h-12 text-[15px] vf-press transition-colors hover:bg-[var(--vf-ember-soft)] disabled:opacity-50";
export const AUTH_SECONDARY =
  "w-full inline-flex items-center justify-center gap-2 rounded-full border border-vf-line text-vf-text hover:border-vf-text/25 h-12 text-[15px] font-medium transition-colors disabled:opacity-50";

// Twins speaking about their people, never as them.
const QUOTES = [
  { q: "She'd say yes to the hike, as long as there's tea at the top.", who: "Rudo's twin" },
  { q: "He's quiet for the first ten minutes. After that you won't get a word in.", who: "Tendai's twin" },
  { q: "Ask her about her grandmother's garden. That's where the good stories are.", who: "Nyasha's twin" },
];

const PHOTO_ORIGIN = isNativeApp() ? "https://www.destira.date" : "";
const SIDE_PHOTO = landingPhotos.find((p) => p.name === "hero-39") ?? landingPhotos[0];

function SidePanel() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % QUOTES.length), 7000);
    return () => window.clearInterval(id);
  }, []);
  const quote = QUOTES[i];
  return (
    <aside className="hidden lg:block relative overflow-hidden" aria-hidden="true">
      {SIDE_PHOTO && (
        <picture>
          <source type="image/webp" srcSet={SIDE_PHOTO.webpSrcSet.replace(/\/photos\//g, `${PHOTO_ORIGIN}/photos/`)} sizes="50vw" />
          <img
            src={`${PHOTO_ORIGIN}${SIDE_PHOTO.src}`}
            alt=""
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ backgroundImage: `url("${SIDE_PHOTO.lqip}")`, backgroundSize: "cover" }}
          />
        </picture>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
      <figure key={i} className="absolute left-12 right-12 bottom-14 text-white animate-in fade-in duration-700">
        <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(143,227,199,0.18)] px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#8FE3C7]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#8FE3C7]" />
          {quote.who}
        </div>
        <blockquote className="mt-4 font-display text-[34px] leading-[1.15] max-w-[22ch]">“{quote.q}”</blockquote>
      </figure>
    </aside>
  );
}

export function AuthShell({
  title,
  subtitle,
  progress,
  children,
  footer,
  titleTestId,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** 0..1 — a slim line above the title for multi-step flows. */
  progress?: number;
  children: ReactNode;
  footer?: ReactNode;
  titleTestId?: string;
}) {
  return (
    <div className="min-h-dvh bg-vf-ink text-vf-text lg:grid lg:grid-cols-2">
      <main className="min-h-dvh flex flex-col px-6 py-10 lg:px-16">
        <div className="flex justify-center lg:justify-start text-vf-text">
          <a href="/" aria-label="Destira home"><DestiraLockup orientation="horizontal" size={30} /></a>
        </div>
        <div className="flex-1 flex flex-col justify-center w-full max-w-[440px] mx-auto lg:mx-0 lg:ml-auto lg:mr-auto py-10">
          {progress != null && (
            <div className="h-[3px] w-full rounded-full bg-vf-line overflow-hidden mb-8" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <div className="h-full bg-vf-ember transition-[width] duration-500 ease-out" style={{ width: `${Math.max(4, progress * 100)}%` }} />
            </div>
          )}
          <h1 className="font-display text-[34px] leading-[1.1] tracking-[-0.01em]" data-testid={titleTestId}>{title}</h1>
          {subtitle && <p className="vf-body text-vf-muted mt-2.5">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 pt-6 border-t border-vf-line text-center text-[14px] text-vf-muted">{footer}</div>}
        </div>
      </main>
      <SidePanel />
    </div>
  );
}

/** Password strength said in words, not a bar of colours (brief 7.2). */
export function passwordWords(pw: string): { label: string; ok: boolean } {
  if (!pw) return { label: "At least 8 characters", ok: false };
  if (pw.length < 8) return { label: `${8 - pw.length} more character${8 - pw.length === 1 ? "" : "s"}`, ok: false };
  let s = 0;
  if (pw.length >= 12) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) s++;
  if (s === 0) return { label: "Okay. A number or a longer one would help", ok: true };
  if (s === 1) return { label: "Strong enough", ok: true };
  return { label: "Strong", ok: true };
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "p…@gmail.com": enough to recognise, not enough to read over a shoulder. */
export function maskEmail(email: string) {
  const [user, domain] = email.trim().split("@");
  if (!user || !domain) return email.trim();
  return `${user[0]}…@${domain}`;
}
