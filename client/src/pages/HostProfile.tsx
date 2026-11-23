// A host's page (docs/destira-3-upgrade-prompt.md Part J): events hosted,
// stars from the people who went (once there are a few), what's coming up.
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Star } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { VfAvatar } from "@/components/ui-vf";
import { RATINGS_SHOWN_FROM, type HostPage } from "@shared/event-extras";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

export default function HostProfile({ params }: { params: { userId: string } }) {
  const { data, isLoading } = useQuery<HostPage>({ queryKey: [`/api/hosts/${params.userId}`] });
  return (
    <LayoutShell>
      <div className="max-w-[520px] mx-auto pb-10 flex flex-col gap-6" data-testid="page-host">
        <button onClick={() => history.back()} className="self-start inline-flex items-center gap-1.5 text-[13px] text-vf-muted"><ArrowLeft className="w-4 h-4" /> Back</button>
        {isLoading || !data ? (
          <Loader2 className="w-6 h-6 animate-spin text-vf-faint" />
        ) : (
          <>
            <div className="flex items-center gap-4">
              <VfAvatar size={72} src={data.host.photoUrl ?? undefined} name={data.host.name} seed={data.host.userId} />
              <div>
                <div className={EYEBROW}>Host</div>
                <h1 className="font-serif font-normal text-[32px] leading-[1.05] text-vf-text mt-1">{data.host.name}</h1>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-vf-line p-4">
                <div className="font-serif text-[30px] leading-none text-vf-text" data-testid="host-hosted">{data.host.hosted}</div>
                <div className="text-[12.5px] text-vf-faint mt-1">{data.host.hosted === 1 ? "event hosted" : "events hosted"}</div>
              </div>
              <div className="rounded-2xl border border-vf-line p-4" data-testid="host-rating">
                {data.host.rating ? (
                  <>
                    <div className="font-serif text-[30px] leading-none text-vf-text inline-flex items-center gap-1.5">
                      {data.host.rating.avg.toFixed(1)} <Star className="w-5 h-5 text-vf-gold" fill="currentColor" />
                    </div>
                    <div className="text-[12.5px] text-vf-faint mt-1">from {data.host.rating.count} people who went</div>
                  </>
                ) : (
                  <div className="text-[12.5px] text-vf-faint leading-[1.5]">Stars show once {RATINGS_SHOWN_FROM} people have rated their events.</div>
                )}
              </div>
            </div>
            <section>
              <div className={`${EYEBROW} mb-2.5`}>Coming up</div>
              {data.upcoming.length ? (
                <div className="flex flex-col gap-2">
                  {data.upcoming.map((e) => (
                    <Link key={e.id} href={`/events/${e.id}`}>
                      <div className="rounded-2xl border border-vf-line p-3.5 cursor-pointer hover:border-vf-text/25" data-testid={`host-event-${e.id}`}>
                        <div className="font-mono text-[11px] tracking-[0.12em] text-vf-ember uppercase">{when(e.startsAt)}</div>
                        <div className="text-[15px] text-vf-text mt-1">{e.title}</div>
                        {e.where && <div className="text-[12.5px] text-vf-faint">{e.where}</div>}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-vf-faint">Nothing on the calendar right now.</p>
              )}
            </section>
          </>
        )}
      </div>
    </LayoutShell>
  );
}
