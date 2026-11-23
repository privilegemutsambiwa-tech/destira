// The door (docs/destira-3-upgrade-prompt.md Part J). The host scans an
// attendee's pass with any camera app; it opens here and checks them in,
// once. The host can also type a pass code or tick people off by hand.
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { VfAvatar } from "@/components/ui-vf";
import type { CheckInResult, DoorList } from "@shared/event-door";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";
const hm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

async function post(eventId: number, body: object): Promise<CheckInResult> {
  const res = await fetch(`/api/events/${eventId}/door/checkin`, {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.message || "Something went wrong");
  return out;
}

function Result({ r, error }: { r: CheckInResult | null; error: string | null }) {
  if (error) {
    return (
      <div className="rounded-[20px] border border-vf-ember/40 bg-vf-ember/[0.06] p-5 flex items-center gap-3" data-testid="door-result-error">
        <X className="w-6 h-6 text-vf-ember shrink-0" />
        <div className="text-[15px] text-vf-text">{error}</div>
      </div>
    );
  }
  if (!r) return null;
  const fresh = r.status === "checked_in";
  return (
    <div className={`rounded-[20px] border p-5 flex items-center gap-4 ${fresh ? "border-vf-mint/50 bg-vf-mint/[0.1]" : "border-vf-gold/50 bg-vf-gold/[0.08]"}`} data-testid="door-result">
      <VfAvatar size={56} src={r.person.photoUrl ?? undefined} name={r.person.name} seed={r.person.userId} />
      <div>
        <div className="font-serif text-[26px] leading-[1.1] text-vf-text">{fresh ? `${r.person.name} is in` : `${r.person.name} is already in`}</div>
        <div className="text-[13px] text-vf-muted mt-1">
          {fresh ? "Checked in. Welcome them." : `Checked in at ${hm(r.person.checkedInAt!)}. This pass has been used.`}
        </div>
      </div>
    </div>
  );
}

export default function EventDoor({ params }: { params: { id: string } }) {
  const eventId = Number(params.id);
  const key = [`/api/events/${eventId}/door`];
  const qc = useQueryClient();
  const { data, error: listError, isLoading } = useQuery<DoorList>({ queryKey: key, retry: false, refetchInterval: 15000 });
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<number | "code" | null>(null);
  const scanned = useRef(false);

  const run = async (body: object, mark: number | "code") => {
    setBusy(mark); setError(null);
    try {
      setResult(await post(eventId, body));
      await qc.invalidateQueries({ queryKey: key });
      return true;
    } catch (e: any) {
      setResult(null); setError(e.message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  // Opened from a scanned pass: check them in straight away, once.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const a = q.get("a"), t = q.get("t");
    if (!a || !t || scanned.current) return;
    scanned.current = true;
    run({ a: Number(a), t }, "code").then(() => window.history.replaceState(null, "", `/events/${eventId}/door`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  return (
    <LayoutShell>
      <div className="max-w-[520px] mx-auto pb-10 flex flex-col gap-5" data-testid="page-event-door">
        <Link href={`/events/${eventId}`}>
          <span className="inline-flex items-center gap-1.5 text-[13px] text-vf-muted cursor-pointer"><ArrowLeft className="w-4 h-4" /> Event</span>
        </Link>
        <div>
          <div className={EYEBROW}>The door</div>
          <h1 className="font-serif font-normal text-[30px] leading-[1.1] text-vf-text mt-2">{data?.title ?? "Check-in"}</h1>
        </div>

        <Result r={result} error={error} />

        {isLoading ? (
          <Loader2 className="w-6 h-6 animate-spin text-vf-faint" />
        ) : listError || !data ? (
          !error && <p className="text-[14px] text-vf-muted">Only the host sees the door list. If you're going, show your door pass from the event page.</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <div className="font-serif text-[40px] leading-none text-vf-text" data-testid="door-count">{data.inCount}<span className="text-[18px] text-vf-faint"> of {data.people.length} in</span></div>
              {!data.open && <span className="text-[12.5px] text-vf-faint">Opens {new Date(data.opensAt).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</span>}
            </div>
            <p className="text-[13px] text-vf-muted -mt-2">Scan each pass with your phone's camera. It opens here and checks them in.</p>

            <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (await run({ code }, "code")) setCode(""); }}>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))} placeholder="Or type a pass code"
                className="flex-1 h-11 rounded-full border border-vf-line bg-transparent px-4 font-mono tracking-[0.2em] text-[15px] text-vf-text placeholder:tracking-normal placeholder:font-sans placeholder:text-vf-faint"
                data-testid="input-door-code" />
              <button disabled={code.length < 6 || busy !== null || !data.open} className="h-11 px-5 rounded-full bg-vf-ember text-vf-ink font-medium text-[14px] disabled:opacity-50" data-testid="button-door-code">
                Check in
              </button>
            </form>

            <div className="flex flex-col gap-1.5">
              {data.people.map((p) => (
                <div key={p.attendeeId} className="flex items-center gap-3 rounded-2xl border border-vf-line p-2.5" data-testid={`door-person-${p.userId}`}>
                  <VfAvatar size={36} src={p.photoUrl ?? undefined} name={p.name} seed={p.userId} />
                  <div className="flex-1 text-[14.5px] text-vf-text">{p.name}</div>
                  {p.checkedInAt ? (
                    <span className="text-[12.5px] text-vf-mint inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {hm(p.checkedInAt)}</span>
                  ) : (
                    <button onClick={() => run({ a: p.attendeeId }, p.attendeeId)} disabled={busy !== null || !data.open}
                      className="h-9 px-3.5 rounded-full border border-vf-line text-vf-soft text-[13px] disabled:opacity-50" data-testid={`door-checkin-${p.userId}`}>
                      {busy === p.attendeeId ? <Loader2 className="w-4 h-4 animate-spin" /> : "Check in"}
                    </button>
                  )}
                </div>
              ))}
              {!data.people.length && <p className="text-[13px] text-vf-faint">Nobody's going yet.</p>}
            </div>
          </>
        )}
      </div>
    </LayoutShell>
  );
}
