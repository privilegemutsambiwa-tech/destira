// "Dating in Harare" (Part H6): a public page for search, with the city's
// upcoming public events and how Destira works. Its title, tags and a plain
// HTML copy are written in on the server (server/city-pages.ts); this is the
// same content once the app loads. No member data, no made-up numbers.
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { DestiraLockup } from "@/components/brand/logo";
import { EventCard } from "@/components/landing/events";
import { SignupButtons } from "@/components/landing/hero";
import { Eyebrow, SectionHeading } from "@/components/landing/shared";
import { recordLandingVisit } from "@/lib/attribution";
import { useAuth } from "@/hooks/use-auth";
import { CITY_PAGES, HOW_IT_WORKS, cityBySlug, cityPath, cityTitle, type CityPage as City } from "@shared/city-pages";
import type { LandingEvent } from "@/components/landing/events";

export default function CityPage({ params }: { params: { city: string } }) {
  const city = cityBySlug(params.city);
  const { user } = useAuth();
  const { data, isLoading } = useQuery<{ city: City; events: LandingEvent[] }>({
    queryKey: ["/api/public/city", params.city],
    queryFn: async () => (await fetch(`/api/public/city/${encodeURIComponent(params.city)}`)).json(),
    enabled: !!city,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!city) return;
    document.title = cityTitle(city);
    // The Funnel's first step, counted under this page (console, Growth).
    recordLandingVisit(`city-${city.slug}`);
  }, [city]);

  const others = CITY_PAGES.filter((c) => c.slug !== city?.slug);

  return (
    <div className="min-h-dvh bg-vf-ink text-vf-text" data-testid="page-city">
      <header className="max-w-[1080px] mx-auto flex items-center justify-between px-4 sm:px-6 h-16">
        <a href="/" className="flex items-center" data-testid="link-logo"><DestiraLockup orientation="horizontal" size={28} /></a>
        {user ? (
          <a href="/discover" className="text-[14px] text-vf-muted hover:text-vf-text">Open Destira</a>
        ) : (
          <a href="/login" className="text-[14px] text-vf-muted hover:text-vf-text">Sign in</a>
        )}
      </header>

      <main className="max-w-[1080px] mx-auto px-4 sm:px-6 pb-16">
        {!city ? (
          <section className="py-16" data-testid="city-unknown">
            <h1 className="vf-h1">We're not in that city yet</h1>
            <p className="vf-small text-vf-muted mt-2">Destira is in {CITY_PAGES.map((c) => c.name).join(" and ")} for now.</p>
            <div className="mt-4 flex gap-3">
              {CITY_PAGES.map((c) => (
                <a key={c.slug} href={cityPath(c)} className="text-vf-ember underline underline-offset-4">Dating in {c.name}</a>
              ))}
            </div>
          </section>
        ) : (
          <>
            <section className="pt-8 sm:pt-14 pb-10">
              <Eyebrow tone="ember">Destira in {city.name}</Eyebrow>
              <h1 className="font-serif font-normal mt-3 text-[clamp(38px,8vw,64px)] leading-[1.02] tracking-[-0.02em]" data-testid="text-city-title">
                Dating in {city.name}
              </h1>
              <p className="mt-4 text-[17px] leading-[1.6] text-vf-muted max-w-[56ch]">{city.blurb}</p>
              {!user && <SignupButtons className="mt-7" testId="city" />}
            </section>

            <section aria-labelledby="city-events" className="py-6" data-testid="section-city-events">
              <SectionHeading id="city-events">Coming up in {city.name}</SectionHeading>
              {isLoading ? (
                <div className="mt-6 h-[260px] rounded-[22px] bg-vf-surface animate-pulse" />
              ) : data?.events?.length ? (
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.events.map((e) => (
                    <div key={e.id} className="[&>button]:w-full">
                      <EventCard e={e} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-[15px] text-vf-muted" data-testid="city-no-events">
                  New events are posted every week. Join to hear about the next one in {city.name}.
                </p>
              )}
            </section>

            <section aria-labelledby="city-how" className="py-10">
              <SectionHeading id="city-how">How Destira works</SectionHeading>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {HOW_IT_WORKS.map((h) => (
                  <div key={h.title} className="rounded-[20px] border border-vf-line bg-vf-surface p-5">
                    <h3 className="text-[16px] font-semibold">{h.title}</h3>
                    <p className="mt-1.5 text-[14.5px] leading-[1.6] text-vf-muted">{h.body}</p>
                  </div>
                ))}
              </div>
            </section>

            {!user && (
              <section className="py-8 flex flex-col items-start gap-4">
                <h2 className="vf-h2">Free to join, with a month of Flame on us.</h2>
                <SignupButtons testId="city-bottom" />
              </section>
            )}

            {others.length > 0 && (
              <nav className="pt-6 border-t border-vf-line vf-small text-vf-muted flex flex-wrap gap-x-4 gap-y-2" aria-label="Other cities">
                {others.map((c) => (
                  <a key={c.slug} href={cityPath(c)} className="hover:text-vf-text">Dating in {c.name}</a>
                ))}
              </nav>
            )}
          </>
        )}
      </main>
    </div>
  );
}
