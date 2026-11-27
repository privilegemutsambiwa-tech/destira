// Landing: real upcoming events and the Tonight's three teaser.

import { useLocation } from "wouter";
import { ArrowRight, Lock, Users } from "lucide-react";
import { useTonight } from "./hero";
import { usePhotos } from "./photos";
import { Reveal, Eyebrow, SectionHeading } from "./shared";

// ── 6 · Happening soon ───────────────────────────────────────────────

export interface LandingEvent {
  id: number;
  title: string;
  startsAt: string;
  suburb: string | null;
  city: string | null;
  coverImageUrl: string | null;
  goingCount: number;
  isFull: boolean;
  costLine: string;
  isOfficial: boolean;
}

function eventDay(iso: string) {
  const d = new Date(iso);
  return {
    dow: d.toLocaleDateString(undefined, { weekday: "short" }),
    day: d.toLocaleDateString(undefined, { day: "numeric" }),
    mon: d.toLocaleDateString(undefined, { month: "short" }),
    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

export function EventCard({ e }: { e: LandingEvent }) {
  const [, setLocation] = useLocation();
  const when = eventDay(e.startsAt);
  const place = [e.suburb, e.city].filter(Boolean).join(", ");
  return (
    <button
      onClick={() => setLocation(`/events/${e.id}`)}
      className="group text-left shrink-0 w-[78%] sm:w-auto snap-start rounded-[22px] border border-vf-line bg-vf-surface overflow-hidden btn-press"
      data-testid={`landing-event-${e.id}`}
    >
      <div className="relative aspect-[16/10] bg-vf-surface2">
        {e.coverImageUrl && (
          <img src={e.coverImageUrl} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        )}
        <div className="absolute top-3 left-3 rounded-[12px] bg-vf-surface/95 text-center px-2.5 py-1.5 shadow-sm">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-vf-ember">{when.dow}</div>
          <div className="font-serif text-[20px] leading-none text-vf-text mt-0.5">{when.day}</div>
          <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-vf-muted mt-0.5">{when.mon}</div>
        </div>
        {e.isOfficial && (
          <span className="absolute top-3 right-3 rounded-full bg-vf-ember text-white text-[11px] font-semibold px-2.5 py-1">Destira event</span>
        )}
      </div>
      <div className="p-4">
        <div className="text-[16px] font-semibold text-vf-text leading-snug line-clamp-2">{e.title}</div>
        <div className="mt-1.5 text-[13px] text-vf-muted">
          {when.time}
          {place && ` · ${place}`}
        </div>
        <div className="mt-3 flex items-center justify-between text-[12.5px]">
          <span className="text-vf-muted">{e.costLine}</span>
          {e.isFull ? (
            <span className="text-vf-ember font-medium">Full</span>
          ) : e.goingCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-vf-text font-medium">
              <Users className="w-3.5 h-3.5" /> {e.goingCount} going
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

// ── 3 · Tonight's three ──────────────────────────────────────────────
// Three locked example cards. The colour behind each is only the photo's
// tiny blur-up placeholder, so this section costs no image bytes.

const TEASER = [
  { n: 59, reason: "You'd both rather talk it out than go quiet.", rot: -8, y: 18 },
  { n: 39, reason: "Family comes first for both of you.", rot: 0, y: 0 },
  { n: 64, reason: "One of you plans the date. Both of you let it wander.", rot: 8, y: 18 },
];

export function TonightsThreeTeaser() {
  const t = useTonight();
  const [, setLocation] = useLocation();
  const photos = usePhotos();
  const cards = TEASER.map((c) => ({ ...c, p: photos?.byName.get(`hero-${c.n}`) }));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-12 lg:gap-16 items-center">
      <div>
        <Reveal>
          <Eyebrow tone="ember">Every evening · 19:00</Eyebrow>
          <SectionHeading id="tonight-heading">
            Three people. Every evening. <em className="italic text-vf-ember">Chosen, not swiped.</em>
          </SectionHeading>
          <p className="mt-4 text-[16px] md:text-[17px] leading-[1.6] text-vf-muted max-w-[46ch]">
            At seven, your twin brings you three people it has already talked to, each with the reason it thinks
            you'd click. No endless feed. Just three good reasons to say hello.
          </p>
        </Reveal>
        <Reveal delay={100}>
          <div className="mt-8 rounded-[24px] border border-vf-line bg-vf-surface px-5 py-4 inline-flex flex-col" data-testid="tonight-countdown">
            {t.out ? (
              <>
                <span className="font-display text-[34px] sm:text-[40px] leading-none text-vf-text">Out now</span>
                <span className="mt-2 text-[13.5px] text-vf-muted">Tonight's three have arrived. The next three come tomorrow at 19:00.</span>
              </>
            ) : (
              <>
                <span className="font-mono tabular-nums text-vf-text leading-none" style={{ fontSize: "clamp(38px, 7vw, 56px)", letterSpacing: "-0.02em" }}>
                  {t.clock}
                </span>
                <span className="mt-2 text-[13.5px] text-vf-muted">until tonight's three · 19:00 Harare time</span>
              </>
            )}
          </div>
          <div className="mt-6">
            <button
              onClick={() => setLocation("/signup")}
              className="inline-flex items-center gap-2 rounded-full bg-vf-ember text-white font-semibold h-[52px] px-7 text-[15.5px] btn-press hover:bg-[var(--vf-ember-soft)] transition-colors"
              data-testid="button-tonight-join"
            >
              Get your three <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </Reveal>
      </div>

      <Reveal delay={120}>
        <div className="relative flex justify-center items-start pt-2 pb-10" aria-hidden="true">
          {cards.map((c, i) => (
            <div
              key={c.n}
              className={`relative shrink-0 ${i === 1 ? "z-10 w-[36%] -mx-1 sm:-mx-2 max-w-[240px]" : "z-0 w-[32%] max-w-[220px]"}`}
              style={{ transform: `translateY(${c.y}px) rotate(${c.rot}deg)` }}
            >
              <div className="relative overflow-hidden rounded-[22px] shadow-[0_30px_60px_-28px_rgba(0,0,0,0.55)]" style={{ aspectRatio: "3/4", background: "#2a1f24" }}>
                {c.p && (
                  <div
                    className="absolute inset-0"
                    style={{ backgroundImage: `url("${c.p.lqip}")`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(10px) saturate(1.25)", transform: "scale(1.35)" }}
                  />
                )}
                <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(12,9,16,0.05) 30%, rgba(12,9,16,0.82) 100%)" }} />
                <div className={`absolute inset-0 items-center justify-center ${i === 1 ? "flex" : "hidden sm:flex"}`}>
                  <span className="w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md" style={{ background: "rgba(245,240,234,0.18)", border: "1px solid rgba(245,240,234,0.35)" }}>
                    <Lock className="w-[18px] h-[18px]" style={{ color: "#F5F0EA" }} />
                  </span>
                </div>
                {i === 1 && (
                  <span className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em]" style={{ background: "rgba(12,9,16,0.6)", color: "#F5F0EA" }}>
                    Example
                  </span>
                )}
                <p className={`absolute bottom-2.5 sm:bottom-3 text-[11.5px] sm:text-[13px] leading-[1.35] ${i === 0 ? "left-2.5 right-4 sm:left-3 sm:right-6" : i === 2 ? "left-4 right-2.5 sm:left-6 sm:right-3" : "left-2.5 right-2.5 sm:left-3 sm:right-3"}`} style={{ color: "#F5F0EA" }}>
                  {c.reason}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </div>
  );
}
