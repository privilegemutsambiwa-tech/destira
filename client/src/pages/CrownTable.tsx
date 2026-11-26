// Crown Table (shared/crown-table.ts): this month's dinner, your seat, your
// guest, and who's coming once you're in. A guest sees only the dinner they
// were asked to, and answers here.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown as CrownIcon, Loader2, MapPin, UtensilsCrossed } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { apiRequest } from "@/lib/queryClient";
import type { CrownDinnerView, CrownTableMe } from "@shared/crown-table";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";
const GOLD = "#E9B949";
const KEY = ["/api/crown/table"];
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const errorText = (e: unknown) => String((e as any)?.message ?? "") || "That didn't work";

function Dinner({ d, options }: { d: CrownDinnerView; options: CrownTableMe["guestOptions"] }) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const call = useMutation({
    mutationFn: async ({ path, body }: { path: string; body: unknown }) => (await apiRequest("POST", `/api/crown/table/${d.id}/${path}`, body)).json(),
    onSuccess: () => { setErr(null); setPick(""); qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e) => setErr(errorText(e)),
  });
  const off = d.status === "cancelled";
  const going = d.mine === "going";

  return (
    <div className="rounded-[20px] border p-5" style={{ borderColor: off ? "var(--vf-line)" : "rgba(233,185,73,0.4)", background: off ? undefined : "rgba(233,185,73,0.04)" }} data-testid={`dinner-${d.id}`}>
      <div className="flex items-center gap-2 text-[12.5px] text-vf-muted">
        <UtensilsCrossed className="w-3.5 h-3.5" style={{ color: GOLD }} />
        {d.role === "guest" ? `${d.invitedBy} asked you` : "Crown Table"}
      </div>
      <div className="font-serif text-[24px] leading-[1.15] text-vf-text mt-1.5">{d.title}</div>
      <div className="text-[14px] text-vf-text mt-2">{when(d.startsAt)}</div>
      <div className="flex items-start gap-1.5 text-[13.5px] text-vf-muted mt-1">
        <MapPin className="w-3.5 h-3.5 mt-[3px] shrink-0" />
        <span>{d.venueName}{d.venueDetail ? ` · ${d.venueDetail}` : ""}</span>
      </div>
      {d.partnerOffer && <div className="text-[13px] mt-2 text-vf-muted"><span className="text-vf-text font-medium">Destira partner:</span> {d.partnerOffer}</div>}
      {d.note && <p className="text-[14px] text-vf-text leading-[1.5] mt-3">{d.note}</p>}
      <p className="text-[12.5px] text-vf-faint mt-3">Everyone pays the venue for their own food.</p>

      {off ? (
        <p className="text-[14px] text-vf-text mt-4" data-testid={`dinner-off-${d.id}`}>This dinner is off{d.cancelReason ? `: ${d.cancelReason}` : "."}</p>
      ) : d.role === "guest" ? (
        d.mine === "invited" ? (
          <div className="flex gap-2 mt-4">
            <button onClick={() => call.mutate({ path: "guest-answer", body: { yes: false } })} disabled={call.isPending || !d.canChange} className="h-10 px-4 rounded-full border border-vf-line text-vf-muted text-[13.5px]" data-testid={`guest-no-${d.id}`}>Can't make it</button>
            <button onClick={() => call.mutate({ path: "guest-answer", body: { yes: true } })} disabled={call.isPending || !d.canChange} className="flex-1 h-10 rounded-full font-semibold text-[13.5px] text-[#1A1418]" style={{ background: GOLD }} data-testid={`guest-yes-${d.id}`}>I'll be there</button>
          </div>
        ) : (
          <p className="text-[14px] text-vf-text mt-4" data-testid={`guest-state-${d.id}`}>{going ? "You're going." : "You said you can't make it."}</p>
        )
      ) : (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[12.5px] text-vf-text" data-testid={`dinner-seats-${d.id}`}>{d.seatsLeft} of {d.seats} seats left</span>
            {going ? (
              <button onClick={() => call.mutate({ path: "seat", body: { going: false } })} disabled={call.isPending || !d.canChange} className="h-10 px-4 rounded-full border border-vf-line text-vf-muted text-[13.5px]" data-testid={`seat-leave-${d.id}`}>Give up my seat</button>
            ) : (
              <button onClick={() => call.mutate({ path: "seat", body: { going: true } })} disabled={call.isPending || !d.canChange || d.seatsLeft === 0} className="h-10 px-5 rounded-full font-semibold text-[13.5px] text-[#1A1418] disabled:opacity-50" style={{ background: GOLD }} data-testid={`seat-take-${d.id}`}>
                {d.seatsLeft === 0 ? "Full" : "Take my seat"}
              </button>
            )}
          </div>
          {going && (
            <div className="mt-4 pt-4 border-t border-vf-line">
              <div className="text-[14px] text-vf-text">Your guest</div>
              {d.guest ? (
                <div className="flex items-center justify-between gap-3 mt-1.5">
                  <span className="text-[13.5px] text-vf-muted" data-testid={`guest-${d.id}`}>
                    {d.guest.name}: {d.guest.status === "going" ? "coming" : d.guest.status === "invited" ? "asked, waiting" : "can't make it"}
                  </span>
                  {d.canChange && (
                    <button onClick={() => call.mutate({ path: "guest", body: { userId: null } })} disabled={call.isPending} className="text-[13px] text-vf-muted underline underline-offset-2">
                      {d.guest.status === "declined" ? "Ask someone else" : "Withdraw"}
                    </button>
                  )}
                </div>
              ) : options.length && d.canChange ? (
                <div className="flex gap-2 mt-2">
                  <select value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1 h-10 rounded-full bg-vf-surface border border-vf-line px-3 text-[13.5px] text-vf-text" data-testid={`guest-pick-${d.id}`}>
                    <option value="">Bring someone you've matched with…</option>
                    {options.map((o) => <option key={o.userId} value={o.userId}>{o.name}</option>)}
                  </select>
                  <button onClick={() => call.mutate({ path: "guest", body: { userId: pick } })} disabled={!pick || call.isPending || d.seatsLeft === 0} className="h-10 px-4 rounded-full border border-vf-line text-vf-text text-[13.5px] disabled:opacity-50" data-testid={`guest-ask-${d.id}`}>Ask</button>
                </div>
              ) : (
                <p className="text-[13px] text-vf-faint mt-1">{d.canChange ? "When you match with someone, you can bring them." : "Guests are settled."}</p>
              )}
            </div>
          )}
        </div>
      )}

      {going && d.coming.length > 0 && (
        <div className="mt-4 pt-4 border-t border-vf-line" data-testid={`coming-${d.id}`}>
          <div className={EYEBROW}>Who's coming · {d.coming.length}</div>
          <div className="flex flex-wrap gap-2 mt-2.5">
            {d.coming.map((p) => (
              <span key={p.userId} className="inline-flex items-center gap-1 h-8 px-3 rounded-full border border-vf-line text-[13px] text-vf-text">
                {p.crown && <CrownIcon className="w-3 h-3" style={{ color: GOLD }} />}{p.name}
              </span>
            ))}
          </div>
        </div>
      )}
      {err && <p className="text-[13px] text-red-400 mt-3" role="alert">{err}</p>}
    </div>
  );
}

export default function CrownTablePage() {
  const { data, isLoading } = useQuery<CrownTableMe>({ queryKey: KEY, staleTime: 0 });
  return (
    <LayoutShell>
      <div className="max-w-[460px] mx-auto pb-10" data-testid="page-crown-table">
        <div className={EYEBROW}>Destira Crown</div>
        <h1 className="font-serif font-normal text-[30px] leading-[1.1] text-vf-text mt-2">Crown Table</h1>
        {isLoading || !data ? (
          <Loader2 className="w-6 h-6 animate-spin text-vf-faint mt-6" />
        ) : (
          <>
            <p className="text-[14px] text-vf-muted mt-2 leading-[1.5]">
              {data.crown
                ? "A private dinner each month at a partner venue, with other Crown members and their guests. Your seat at every official event and Sunday Table is kept too: you're never waitlisted."
                : "A Crown member would like you at their table."}
            </p>
            {data.dinners.length ? (
              <div className="mt-6 flex flex-col gap-4">{data.dinners.map((d) => <Dinner key={d.id} d={d} options={data.guestOptions} />)}</div>
            ) : (
              <p className="mt-6 text-[14px] text-vf-muted" data-testid="crown-table-empty">
                {data.crown ? "The next dinner isn't set yet. You'll hear as soon as it is." : "Nothing here right now."}
              </p>
            )}
          </>
        )}
      </div>
    </LayoutShell>
  );
}
