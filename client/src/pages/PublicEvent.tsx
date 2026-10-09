// What a signed-out friend sees when they open a shared /events/:id link:
// the real event (what, when, where, how many are going) and one clear way
// in, "Save my seat". Signing up saves the seat automatically
// (lib/pending-rsvp.ts), so the link they were sent is what they get.
//
// Deliberately shows no attendee identities and no street address; the
// server teaser (/api/public/events/:id) never sends them.
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin, Users, Loader2, Sparkles, ShieldCheck } from "lucide-react";
import { DestiraLockup } from "@/components/brand/logo";
import { stashPendingEvent } from "@/lib/pending-invite";
import { stashPendingRsvp } from "@/lib/pending-rsvp";

interface Teaser {
  id: number;
  title: string;
  description: string | null;
  kind: string | null;
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  suburb: string | null;
  city: string | null;
  coverImageUrl: string | null;
  goingCount: number;
  isFull: boolean;
  status: string;
  isOfficial: boolean;
  sponsorName: string | null;
  hostLabel: string;
  costLine: string;
  hasLead: boolean;
}

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";

function whenText(startsAt: string, endsAt: string | null) {
  const s = new Date(startsAt);
  const day = s.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const t = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${t(s)}${endsAt ? `–${t(new Date(endsAt))}` : ""}`;
}

function daysAway(startsAt: string): string {
  const ms = new Date(startsAt).getTime() - Date.now();
  const days = Math.round(ms / 86_400_000);
  if (ms < 0) return "Already happened";
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

export default function PublicEvent({ eventId }: { eventId: string }) {
  const [, setLocation] = useLocation();
  const id = Number(eventId);
  const { data, isLoading, isError } = useQuery<Teaser | null>({
    queryKey: ["/api/public/events", id],
    queryFn: async () => {
      const r = await fetch(`/api/public/events/${id}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    enabled: Number.isFinite(id),
  });

  // Even "just browsing" visitors who then sign up from elsewhere should
  // land back here, not on the generic home.
  useEffect(() => {
    if (Number.isFinite(id)) stashPendingEvent(id);
  }, [id]);

  const saveSeat = () => {
    stashPendingEvent(id);
    stashPendingRsvp(id);
    setLocation("/signup");
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-dvh bg-vf-ink text-vf-text">
      <header className="max-w-xl mx-auto px-4 pt-5 pb-3 flex items-center justify-between">
        <button onClick={() => setLocation("/")} aria-label="Destira home" data-testid="public-event-home">
          <DestiraLockup orientation="horizontal" size={28} />
        </button>
        <button
          onClick={() => {
            stashPendingEvent(id);
            setLocation("/login");
          }}
          className="text-[13px] text-vf-muted hover:text-vf-text transition-colors"
          data-testid="public-event-login"
        >
          Sign in
        </button>
      </header>
      <main className="max-w-xl mx-auto px-4 pb-40">{children}</main>
    </div>
  );

  if (isLoading) {
    return shell(
      <div className="py-24 flex justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-vf-mint" />
      </div>,
    );
  }

  if (isError || !data) {
    return shell(
      <div className="py-16 text-center" data-testid="public-event-unavailable">
        <p className="font-serif text-[28px] leading-tight mb-3">This event isn't open to preview.</p>
        <p className="text-[15px] text-vf-muted mb-7">
          It may be private, or no longer running. There's plenty more happening on Destira.
        </p>
        <button
          onClick={() => setLocation("/signup")}
          className="h-12 px-7 rounded-full bg-vf-ember text-vf-ink font-semibold btn-press"
          data-testid="public-event-join-generic"
        >
          Join Destira, it's free
        </button>
      </div>,
    );
  }

  const where = [data.venueName, data.suburb, data.city].filter(Boolean).join(" · ");
  const cancelled = data.status === "cancelled";
  const past = new Date(data.startsAt).getTime() < Date.now();

  return shell(
    <>
      <div className="relative rounded-[24px] overflow-hidden border border-vf-line" style={{ aspectRatio: "16/10" }}>
        {data.coverImageUrl ? (
          <img src={data.coverImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "radial-gradient(120% 140% at 30% 0%, rgba(255,107,74,.28), transparent 60%), var(--vf-surface2)" }}
          />
        )}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(12,9,16,.9), rgba(12,9,16,.1) 60%)" }} />
        <div className="absolute left-5 right-5 bottom-4">
          {data.isOfficial && (
            <span
              className="inline-block font-mono text-[10px] uppercase tracking-[0.14em] rounded-full px-2.5 py-1 mb-2"
              style={{ background: "rgba(255,107,74,.2)", color: "#FFB4A1", border: "1px solid rgba(255,107,74,.45)" }}
            >
              Destira Official{data.sponsorName ? ` · ${data.sponsorName}` : ""}
            </span>
          )}
          <h1 className="font-serif font-normal text-white text-[clamp(28px,7vw,40px)] leading-[1.05]" data-testid="public-event-title">
            {data.title}
          </h1>
        </div>
      </div>

      {cancelled && (
        <div className="mt-4 rounded-[14px] border border-vf-line bg-vf-surface2 px-4 py-3 text-[14px] text-vf-muted">
          This one was called off. Join to see what else is on this week.
        </div>
      )}

      <div className="mt-6 grid gap-3.5">
        <div className="flex items-start gap-3">
          <CalendarDays className="w-5 h-5 text-vf-ember mt-0.5 shrink-0" />
          <div>
            <div className="text-[15.5px]">{whenText(data.startsAt, data.endsAt)}</div>
            <div className={`${EYEBROW} mt-1`}>{daysAway(data.startsAt)}</div>
          </div>
        </div>
        {where && (
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-vf-ember mt-0.5 shrink-0" />
            <div className="text-[15.5px]">{where}</div>
          </div>
        )}
        <div className="flex items-center gap-3" data-testid="public-event-going">
          <Users className="w-5 h-5 text-vf-ember shrink-0" />
          <div className="flex items-center gap-2.5">
            {data.goingCount > 0 && (
              <div className="flex -space-x-2" aria-hidden="true">
                {Array.from({ length: Math.min(4, data.goingCount) }).map((_, i) => (
                  <span
                    key={i}
                    className="w-7 h-7 rounded-full border-2 border-vf-ink"
                    style={{ background: ["#B8735F", "#7F8FA6", "#C9A27A", "#8A6F8E"][i], filter: "blur(.6px)" }}
                  />
                ))}
              </div>
            )}
            <span className="text-[15.5px]">
              {data.goingCount > 0 ? `${data.goingCount} going` : "Nobody yet. Be the first."}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <span className={`${EYEBROW} border border-vf-line rounded-full px-3 py-1.5`}>{data.hostLabel}</span>
        <span className={`${EYEBROW} border border-vf-line rounded-full px-3 py-1.5`}>{data.costLine}</span>
        {data.kind && <span className={`${EYEBROW} border border-vf-line rounded-full px-3 py-1.5`}>{data.kind}</span>}
      </div>

      {data.description && (
        <p className="mt-6 text-[16px] leading-[1.65] whitespace-pre-line" data-testid="public-event-description">
          {data.description}
        </p>
      )}

      <div className="mt-8 rounded-[18px] border border-vf-line bg-vf-surface2 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-vf-mint" />
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-mint">Why Destira</span>
        </div>
        <p className="text-[14.5px] leading-[1.6] text-vf-muted">
          Small, hosted events in real places, plus an AI twin that gets to know you and points out who you'd actually get on with.
          Your seat comes with a group chat to plan it together.
        </p>
        <div className="flex items-center gap-2 mt-3 text-[12.5px] text-vf-faint">
          <ShieldCheck className="w-4 h-4" /> Free to join. Your details are never shown to people outside the event.
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-vf-line bg-vf-ink/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-xl mx-auto px-4 py-3 flex flex-col gap-2">
          {cancelled || past ? (
            <button
              onClick={() => setLocation("/signup")}
              className="h-12 rounded-full bg-vf-ember text-vf-ink font-semibold text-[15px] btn-press"
              data-testid="public-event-join"
            >
              See what else is on
            </button>
          ) : (
            <button
              onClick={saveSeat}
              className="h-12 rounded-full bg-vf-ember text-vf-ink font-semibold text-[15px] btn-press"
              data-testid="public-event-save-seat"
            >
              {data.isFull ? "Join the waitlist, it's free" : "Save my seat, it's free"}
            </button>
          )}
          <p className="text-center text-[12px] text-vf-faint">Takes about a minute. We'll save your seat as soon as you're in.</p>
        </div>
      </div>
    </>,
  );
}
