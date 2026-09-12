import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/use-profiles";
import { useGroups } from "@/hooks/use-interactions";
import {
  useHostEvent,
  usePlaces,
  useAddEventPhoto,
  useSetHostVideo,
  type HostEventInput,
  type SeatModel,
  type EventCostModel,
  type Place,
} from "@/hooks/use-events";
import { HostVideoRecorder, type RecordedVideo } from "@/components/host-video-recorder";
import { EVENT_KINDS, EVENT_VIBES, EVENT_PLACE_TYPES, EVENT_ACCESS_NEEDS } from "@shared/schema";

const KNOWN_SUBURBS = [
  "Avondale", "Borrowdale", "Mount Pleasant", "Newlands", "Milton Park",
  "Belgravia", "Highlands", "Msasa", "Hillside", "Suburbs", "Kumalo", "Famona",
];

type Draft = {
  title: string;
  kind: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  city: string;
  suburb: string;
  venueName: string;
  placeType: string;
  placeId: number | null;
  placeName: string;
  addressLine: string;
  isPrivateAddress: boolean;
  visibility: "public" | "group";
  groupId: number | null;
  seatModel: SeatModel;
  seatCount: string;
  costModel: EventCostModel;
  contributionAmount: string;
  contributionNote: string;
  contactPhone: string;
  contactWhatsapp: string;
  vibes: string[];
  isSober: boolean;
  accessibility: string[];
  photos: File[];
  video: RecordedVideo | null;
};

const EMPTY: Draft = {
  title: "", kind: "", description: "", date: "", startTime: "18:00", endTime: "",
  city: "", suburb: "", venueName: "", placeType: "",
  placeId: null, placeName: "", addressLine: "", isPrivateAddress: false,
  visibility: "public", groupId: null,
  seatModel: "open", seatCount: "",
  costModel: "free_hosted", contributionAmount: "", contributionNote: "",
  contactPhone: "", contactWhatsapp: "",
  vibes: [], isSober: false, accessibility: [],
  photos: [], video: null,
};

const STEPS = ["What", "Where", "Show them", "Who & cost", "Review"];

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint mb-3">{children}</div>;
}
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3.5 h-9 text-[13px] capitalize transition-colors ${
        active ? "border-vf-mint/50 bg-vf-mint/10 text-vf-text" : "border-vf-line text-vf-muted hover:text-vf-text hover:border-vf-text/20"
      }`}
    >
      {label}
    </button>
  );
}
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">{label}</span>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-1.5 text-[12px] text-vf-faint">{hint}</p>}
    </label>
  );
}
const inputCls =
  "w-full bg-vf-surface2 border border-vf-line rounded-[12px] px-3.5 h-11 text-[15px] text-vf-text placeholder:text-vf-faint outline-none focus:border-vf-mint/50 transition-colors";

function contributionLine(amount: string): string {
  const n = Number(amount);
  return `CONTRIBUTION · $${Number.isFinite(n) ? n : 0} · SETTLED IN PERSON ON THE DAY · DESTIRA NEVER HANDLES IT`;
}

export default function HostEvent() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: profile } = useProfile();
  const { data: groups } = useGroups();
  const host = useHostEvent();
  const addPhoto = useAddEventPhoto();
  const setVideo = useSetHostVideo();

  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(() => ({ ...EMPTY }));
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeOpen, setPlaceOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: places = [] } = usePlaces(placeQuery);

  const set = (p: Partial<Draft>) => setD((cur) => ({ ...cur, ...p }));
  const toggle = (key: "vibes" | "accessibility", v: string) =>
    setD((cur) => ({ ...cur, [key]: cur[key].includes(v) ? cur[key].filter((x) => x !== v) : [...cur[key], v] }));

  const myGroups: { id: number; name: string }[] = useMemo(
    () => (groups ?? []).map((g: any) => ({ id: g.id, name: g.name })),
    [groups],
  );

  useEffect(() => {
    const guess = String(profile?.location ?? "").split(",").pop()?.trim() ?? "";
    if (guess) setD((cur) => (cur.city ? cur : { ...cur, city: guess }));
  }, [profile?.location]);

  const startsAtISO = useMemo(() => {
    if (!d.date || !d.startTime) return null;
    const dt = new Date(`${d.date}T${d.startTime}`);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }, [d.date, d.startTime]);
  const endsAtISO = useMemo(() => {
    if (!d.date || !d.endTime) return null;
    const dt = new Date(`${d.date}T${d.endTime}`);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }, [d.date, d.endTime]);

  const idVerified = !!(profile as any)?.isVerified;

  const pickPlace = (p: Place) => {
    set({
      placeId: p.id,
      placeName: p.name,
      venueName: p.name,
      suburb: p.suburb,
      city: p.city,
      addressLine: p.addressLine,
      isPrivateAddress: false,
    });
    setPlaceOpen(false);
    setPlaceQuery("");
  };
  const clearPlace = () => set({ placeId: null, placeName: "", addressLine: "" });

  const stepValid = (s: number): string | null => {
    if (s === 0) {
      if (d.title.trim().length < 4) return "Give it a title (4+ characters).";
      if (!d.kind) return "Pick what kind of thing it is.";
      if (!startsAtISO) return "Set a date and start time.";
      if (new Date(startsAtISO).getTime() <= Date.now()) return "Pick a date in the future.";
      if (endsAtISO && new Date(endsAtISO).getTime() <= new Date(startsAtISO).getTime())
        return "End time has to be after the start.";
      return null;
    }
    if (s === 1) {
      if (d.city.trim().length < 2) return "Which city?";
      if (d.suburb.trim().length < 2) return "Which suburb?";
      if (!d.placeType) return "Pick the kind of place.";
      if (d.isPrivateAddress && d.addressLine.trim().length < 5) return "A private address needs the full street address.";
      return null;
    }
    if (s === 3) {
      if (d.seatModel !== "open" && (!d.seatCount || Number(d.seatCount) < 2)) return "Set how many seats (2+).";
      if (d.visibility === "group" && d.groupId == null) return "Choose which group.";
      if (d.costModel === "contribute") {
        const n = Number(d.contributionAmount);
        if (!n || n <= 0) return "Set how much everyone chips in.";
        if (n > 200) return "Contributions over $200 aren't allowed on Destira.";
      }
      return null;
    }
    return null;
  };

  const next = () => {
    const err = stepValid(step);
    if (err) return toast({ title: err, variant: "destructive" });
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => (step === 0 ? setLocation("/events") : setStep((s) => s - 1));

  const submit = async () => {
    for (let s = 0; s <= 3; s++) {
      const err = stepValid(s);
      if (err) {
        setStep(s);
        return toast({ title: err, variant: "destructive" });
      }
    }
    const payload: HostEventInput = {
      title: d.title.trim(),
      description: d.description.trim() || undefined,
      kind: d.kind,
      vibes: d.vibes,
      placeType: d.placeType,
      venueName: d.venueName.trim() || undefined,
      suburb: d.suburb.trim(),
      city: d.city.trim(),
      startsAt: startsAtISO!,
      endsAt: endsAtISO,
      seatModel: d.seatModel,
      seatCount: d.seatModel === "open" ? null : Number(d.seatCount),
      isSober: d.isSober,
      accessibility: d.accessibility,
      visibility: d.visibility,
      groupId: d.visibility === "group" ? d.groupId : null,
      placeId: d.placeId,
      addressLine: d.addressLine.trim() || undefined,
      isPrivateAddress: d.isPrivateAddress,
      costModel: d.costModel,
      contributionAmount: d.costModel === "contribute" ? Number(d.contributionAmount) : null,
      contributionNote: d.contributionNote.trim() || undefined,
      contactPhone: d.contactPhone.trim() || undefined,
      contactWhatsapp: d.contactWhatsapp.trim() || undefined,
    };
    setBusy(true);
    try {
      const ev = await host.mutateAsync(payload);
      for (const file of d.photos.slice(0, 6)) {
        try {
          await addPhoto.mutateAsync({ eventId: ev.id, file });
        } catch (e: any) {
          toast({ title: "A photo didn't upload", description: e.message, variant: "destructive" });
        }
      }
      if (d.video) {
        try {
          await setVideo.mutateAsync({
            eventId: ev.id,
            video: d.video.blob,
            poster: d.video.poster,
            durationSec: d.video.durationSec,
          });
        } catch (e: any) {
          toast({ title: "The video didn't upload", description: e.message, variant: "destructive" });
        }
      }
      toast({
        title: ev.status === "pending_review" ? "Sent for a quick look" : "Your event is live",
        description:
          ev.status === "pending_review"
            ? "We give first events and private homes a once-over before they go public."
            : undefined,
      });
      setLocation(`/events/${ev.id}`);
    } catch (e: any) {
      toast({ title: "Couldn't create it", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const checklist: { label: string; done: boolean }[] = [
    { label: "exact address", done: d.addressLine.trim().length >= 5 },
    { label: "venue photos", done: d.photos.length >= 2 },
    { label: "a short video from you", done: !!d.video },
    { label: "your ID verified", done: idVerified },
    { label: "what it costs", done: d.costModel !== "free_hosted" || d.contributionAmount !== "" },
    { label: "a contact number", done: d.contactPhone.trim().length > 0 },
  ];

  return (
    <div className="min-h-dvh bg-vf-ink text-vf-text">
      <div className="sticky top-0 z-10 bg-vf-ink border-b border-vf-line flex items-center gap-3 px-4 h-14">
        <button onClick={back} className="w-8 h-8 flex items-center justify-center" data-testid="button-host-back">
          <ArrowLeft className="w-5 h-5 text-vf-ember" />
        </button>
        <h1 className="font-serif text-[20px] text-vf-text">Host an event</h1>
      </div>

      <div className="max-w-[560px] mx-auto px-4 py-6 pb-28">
        <div className="flex items-center gap-2 mb-7">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-mono ${
                  i < step
                    ? "bg-vf-mint text-vf-ink"
                    : i === step
                      ? "border border-vf-mint text-vf-mint"
                      : "border border-vf-line text-vf-faint"
                }`}
              >
                {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className="w-5 h-px bg-vf-line" />}
            </div>
          ))}
          <span className="ml-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">{STEPS[step]}</span>
        </div>

        {/* STEP 0 — WHAT */}
        {step === 0 && (
          <div className="flex flex-col gap-6">
            <Field label="Title">
              <input className={inputCls} value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="Sunrise trail run, then breakfast" data-testid="input-title" />
            </Field>
            <div>
              <GroupLabel>What kind of thing</GroupLabel>
              <div className="flex flex-wrap gap-2">
                {EVENT_KINDS.map((k) => <Chip key={k} label={k} active={d.kind === k} onClick={() => set({ kind: k })} />)}
              </div>
            </div>
            <Field label="Description" hint="Optional. What to expect, what to bring, how to find you.">
              <textarea className={`${inputCls} h-24 py-2.5 leading-[1.5]`} value={d.description} onChange={(e) => set({ description: e.target.value })} placeholder="Easy 5k out, coffee and eggs after. Bring layers." data-testid="input-description" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><input type="date" className={inputCls} value={d.date} onChange={(e) => set({ date: e.target.value })} data-testid="input-date" /></Field>
              <Field label="Start"><input type="time" className={inputCls} value={d.startTime} onChange={(e) => set({ startTime: e.target.value })} data-testid="input-start-time" /></Field>
            </div>
            <Field label="End" hint="Optional."><input type="time" className={inputCls} value={d.endTime} onChange={(e) => set({ endTime: e.target.value })} data-testid="input-end-time" /></Field>
          </div>
        )}

        {/* STEP 1 — WHERE */}
        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div>
              <GroupLabel>Find the place</GroupLabel>
              {d.placeId ? (
                <div className="flex items-center gap-2 rounded-[12px] border border-vf-mint/40 bg-vf-mint/[0.06] px-3.5 h-11">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-vf-mint">Verified venue</span>
                  <span className="text-[14px] text-vf-text truncate">{d.placeName}</span>
                  <button type="button" onClick={clearPlace} className="ml-auto text-vf-faint hover:text-vf-text" data-testid="button-clear-place">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    className={inputCls}
                    value={placeQuery}
                    onChange={(e) => { setPlaceQuery(e.target.value); setPlaceOpen(true); }}
                    onFocus={() => setPlaceOpen(true)}
                    placeholder="Search restaurants, bars, clubs…"
                    data-testid="input-place-search"
                  />
                  {placeOpen && placeQuery.trim().length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-[12px] border border-vf-line bg-vf-surface2 overflow-hidden">
                      {places.length === 0 ? (
                        <button type="button" onClick={() => { setPlaceOpen(false); }} className="block w-full text-left px-3.5 py-2.5 text-[13px] text-vf-muted hover:bg-vf-text/[0.03]">
                          Nothing matched — enter it as "somewhere else" below.
                        </button>
                      ) : (
                        places.map((p) => (
                          <button key={p.id} type="button" onClick={() => pickPlace(p)} className="block w-full text-left px-3.5 py-2.5 hover:bg-vf-text/[0.03]" data-testid={`place-option-${p.id}`}>
                            <div className="text-[14px] text-vf-text flex items-center gap-2">
                              {p.name}
                              {p.verifiedAt && <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-vf-mint">verified</span>}
                            </div>
                            <div className="text-[12px] text-vf-faint">{p.addressLine} · {p.suburb}</div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {!d.placeId && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="City"><input className={inputCls} value={d.city} onChange={(e) => set({ city: e.target.value })} placeholder="Harare" data-testid="input-city" /></Field>
                  <Field label="Suburb" hint="A known suburb lets your event show up by distance.">
                    <input className={inputCls} list="known-suburbs" value={d.suburb} onChange={(e) => set({ suburb: e.target.value })} placeholder="Borrowdale" data-testid="input-suburb" />
                    <datalist id="known-suburbs">{KNOWN_SUBURBS.map((s) => <option key={s} value={s} />)}</datalist>
                  </Field>
                </div>
                <Field label="Venue name" hint="Optional."><input className={inputCls} value={d.venueName} onChange={(e) => set({ venueName: e.target.value })} placeholder="Trailhead Cafe" data-testid="input-venue" /></Field>
                <Field label="Street address" hint={d.isPrivateAddress ? "Shown only to people confirmed as going, and only once the event is set to run." : "Shown to people once they're going."}>
                  <input className={inputCls} value={d.addressLine} onChange={(e) => set({ addressLine: e.target.value })} placeholder="14 Aberdeen Road" data-testid="input-address" />
                </Field>
              </>
            )}

            <div>
              <GroupLabel>Kind of place</GroupLabel>
              <div className="flex flex-wrap gap-2">
                {EVENT_PLACE_TYPES.map((p) => <Chip key={p} label={p} active={d.placeType === p} onClick={() => set({ placeType: p })} />)}
              </div>
            </div>

            {!d.placeId && (
              <div className="rounded-[14px] border border-vf-line p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] text-vf-soft">This is my home / a private address</span>
                  <button
                    type="button"
                    onClick={() => set({ isPrivateAddress: !d.isPrivateAddress })}
                    aria-pressed={d.isPrivateAddress}
                    className={`w-[42px] h-[24px] rounded-full shrink-0 flex items-center p-[3px] transition-colors ${d.isPrivateAddress ? "bg-vf-gold justify-end" : "bg-vf-text/[0.14] justify-start"}`}
                    data-testid="toggle-private"
                  >
                    <span className="block w-[18px] h-[18px] rounded-full" style={{ background: d.isPrivateAddress ? "hsl(var(--vf-ink))" : "#CFC7DA" }} />
                  </button>
                </div>
                {d.isPrivateAddress && (
                  <p className="mt-3 text-[12.5px] leading-[1.55] text-vf-muted">
                    A private home runs on structure, not trust. Before it can go public it needs{" "}
                    <span className="text-vf-text">2+ photos of the place</span>,{" "}
                    <span className="text-vf-text">a short video from you</span>,{" "}
                    <span className="text-vf-text">your ID verified</span>, and it only goes ahead with{" "}
                    <span className="text-vf-text">4 or more people going</span>. Until then it stays in review.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* STEP 2 — SHOW THEM */}
        {step === 2 && (
          <div className="flex flex-col gap-7">
            <div>
              <GroupLabel>Photos of the place</GroupLabel>
              <div className="grid grid-cols-3 gap-2">
                {d.photos.map((f, i) => (
                  <div key={i} className="relative rounded-[12px] overflow-hidden border border-vf-line" style={{ aspectRatio: "3/2" }}>
                    <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => set({ photos: d.photos.filter((_, j) => j !== i) })} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {d.photos.length < 6 && (
                  <label className="rounded-[12px] border border-dashed border-vf-line flex items-center justify-center text-vf-faint hover:text-vf-text hover:border-vf-text/25 cursor-pointer text-[12px]" style={{ aspectRatio: "3/2" }}>
                    Add
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        set({ photos: [...d.photos, ...files].slice(0, 6) });
                        e.currentTarget.value = "";
                      }}
                      data-testid="input-photos"
                    />
                  </label>
                )}
              </div>
              <p className="mt-2 text-[12px] text-vf-faint">Up to 6. Location data is stripped when you upload.</p>
            </div>

            <div>
              <GroupLabel>A short video from you</GroupLabel>
              <HostVideoRecorder value={d.video} onChange={(v) => set({ video: v })} />
            </div>

            <div>
              <GroupLabel>What's on your event so far</GroupLabel>
              <div className="rounded-[14px] border border-vf-line divide-y divide-vf-line">
                {checklist.map((row) => (
                  <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-[13.5px] text-vf-soft capitalize">{row.label}</span>
                    <span className={`font-mono text-[10px] uppercase tracking-[0.14em] ${row.done ? "text-vf-mint" : "text-vf-faint"}`}>
                      {row.done ? "Added" : "Not yet"}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-vf-faint leading-[1.5]">
                People join events they can picture. Every line you add roughly doubles the chance someone unsure says yes.
              </p>
            </div>
          </div>
        )}

        {/* STEP 3 — WHO & COST */}
        {step === 3 && (
          <div className="flex flex-col gap-7">
            <div>
              <GroupLabel>Seats</GroupLabel>
              <div className="inline-flex rounded-full border border-vf-line overflow-hidden">
                {([["open", "Open"], ["capped", "Capped"], ["curated", "You pick"]] as const).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => set({ seatModel: v })} className={`px-4 h-9 text-[13px] transition-colors ${d.seatModel === v ? "bg-vf-mint/10 text-vf-text" : "text-vf-muted hover:text-vf-text"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {d.seatModel !== "open" && (
                <div className="mt-3 max-w-[160px]">
                  <input type="number" min={2} max={500} className={inputCls} value={d.seatCount} onChange={(e) => set({ seatCount: e.target.value })} placeholder="Seats" data-testid="input-seat-count" />
                </div>
              )}
            </div>

            <div>
              <GroupLabel>Who can see it</GroupLabel>
              <div className="inline-flex rounded-full border border-vf-line overflow-hidden">
                {(["public", "group"] as const).map((v) => (
                  <button key={v} type="button" onClick={() => set({ visibility: v })} className={`px-4 h-9 text-[13px] transition-colors ${d.visibility === v ? "bg-vf-mint/10 text-vf-text" : "text-vf-muted hover:text-vf-text"}`}>
                    {v === "public" ? "Anyone" : "A group"}
                  </button>
                ))}
              </div>
              {d.visibility === "group" && (
                <div className="mt-3">
                  {myGroups.length === 0 ? (
                    <p className="text-[13px] text-vf-muted">You're not in any groups yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {myGroups.map((g) => <Chip key={g.id} label={g.name} active={d.groupId === g.id} onClick={() => set({ groupId: g.id })} />)}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <GroupLabel>What it costs</GroupLabel>
              <div className="flex flex-col gap-2">
                {([
                  ["free_hosted", "I'm covering it"],
                  ["contribute", "Everyone chips in"],
                  ["pay_own_way", "Everyone pays their own"],
                ] as const).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set({ costModel: v })}
                    className={`text-left rounded-[12px] border px-3.5 h-11 text-[14px] transition-colors ${d.costModel === v ? "border-vf-mint/50 bg-vf-mint/10 text-vf-text" : "border-vf-line text-vf-muted hover:text-vf-text"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {d.costModel === "contribute" && (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-vf-faint text-[15px]">$</span>
                    <input type="number" min={1} max={200} className={`${inputCls} max-w-[120px]`} value={d.contributionAmount} onChange={(e) => set({ contributionAmount: e.target.value })} placeholder="12" data-testid="input-contribution" />
                    <span className="text-[12px] text-vf-faint">USD</span>
                  </div>
                  <input className={inputCls} value={d.contributionNote} onChange={(e) => set({ contributionNote: e.target.value })} placeholder="covers food, bring your own drink" data-testid="input-contribution-note" />
                  {Number(d.contributionAmount) > 0 && (
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.13em] text-vf-faint">{contributionLine(d.contributionAmount)}</p>
                  )}
                </div>
              )}
              {(d.costModel === "pay_own_way") && (
                <input className={`${inputCls} mt-3`} value={d.contributionNote} onChange={(e) => set({ contributionNote: e.target.value })} placeholder="rough idea of what a plate runs" data-testid="input-payown-note" />
              )}
            </div>

            <div>
              <GroupLabel>A number people can reach you on</GroupLabel>
              <div className="flex flex-col gap-2">
                <input className={inputCls} value={d.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} placeholder="Phone" data-testid="input-phone" />
                <input className={inputCls} value={d.contactWhatsapp} onChange={(e) => set({ contactWhatsapp: e.target.value })} placeholder="WhatsApp (if different)" data-testid="input-whatsapp" />
              </div>
              <p className="mt-1.5 text-[12px] text-vf-faint leading-[1.5]">
                Only people confirmed as going see this, and only the day before. You'll see who looked.
              </p>
            </div>

            <div>
              <GroupLabel>Vibe</GroupLabel>
              <div className="flex flex-wrap gap-2">
                {EVENT_VIBES.map((v) => <Chip key={v} label={v} active={d.vibes.includes(v)} onClick={() => toggle("vibes", v)} />)}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[14px] text-vf-soft">Sober event</span>
              <button
                type="button"
                onClick={() => set({ isSober: !d.isSober })}
                aria-pressed={d.isSober}
                className={`w-[42px] h-[24px] rounded-full shrink-0 flex items-center p-[3px] transition-colors ${d.isSober ? "bg-vf-mint justify-end" : "bg-vf-text/[0.14] justify-start"}`}
              >
                <span className="block w-[18px] h-[18px] rounded-full" style={{ background: d.isSober ? "hsl(var(--vf-ink))" : "#CFC7DA" }} />
              </button>
            </div>

            <div>
              <GroupLabel>Access</GroupLabel>
              <div className="flex flex-wrap gap-2">
                {EVENT_ACCESS_NEEDS.map((a) => (
                  <Chip key={a} label={a.replace("-", " ")} active={d.accessibility.includes(a)} onClick={() => toggle("accessibility", a)} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 4 — REVIEW */}
        {step === 4 && (
          <div className="flex flex-col gap-4">
            <div className="rounded-[18px] border border-vf-line bg-vf-surface2 p-5">
              <div className="font-serif text-[22px] text-vf-text leading-[1.15]">{d.title || "Untitled"}</div>
              <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-vf-faint">
                {[d.kind, d.placeType].filter(Boolean).join(" · ")}
              </div>
              {d.description && <p className="mt-3 text-[14px] text-vf-muted leading-[1.55]">{d.description}</p>}
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13.5px]">
                <dt className="text-vf-faint">When</dt>
                <dd className="text-vf-text">
                  {startsAtISO ? new Date(startsAtISO).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                  {endsAtISO ? ` – ${new Date(endsAtISO).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                </dd>
                <dt className="text-vf-faint">Where</dt>
                <dd className="text-vf-text">{[d.venueName || d.placeName, d.suburb, d.city].filter(Boolean).join(", ") || "—"}</dd>
                <dt className="text-vf-faint">Place</dt>
                <dd className="text-vf-text">{d.isPrivateAddress ? "A private home" : d.placeId ? "A verified venue" : "A public place"}</dd>
                <dt className="text-vf-faint">Seats</dt>
                <dd className="text-vf-text capitalize">{d.seatModel}{d.seatModel !== "open" && d.seatCount ? ` · ${d.seatCount}` : ""}</dd>
                <dt className="text-vf-faint">Cost</dt>
                <dd className="text-vf-text">
                  {d.costModel === "free_hosted"
                    ? "The host is covering it"
                    : d.costModel === "contribute"
                      ? `$${Number(d.contributionAmount) || 0} each, settled in person`
                      : "Everyone pays their own"}
                </dd>
                <dt className="text-vf-faint">Photos</dt>
                <dd className="text-vf-text">{d.photos.length || "none"}{d.video ? " · video recorded" : ""}</dd>
              </dl>
              {d.costModel === "contribute" && Number(d.contributionAmount) > 0 && (
                <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.13em] text-vf-faint">{contributionLine(d.contributionAmount)}</p>
              )}
            </div>
            <p className="text-[12.5px] text-vf-faint leading-[1.5]">
              {d.isPrivateAddress
                ? "Private homes are held for review until the photos, video, ID and numbers are in."
                : "Your first event gets a quick look before it goes public — after that they publish straight away. You can host 3 a week."}
            </p>
          </div>
        )}
      </div>

      <div
        className="fixed bottom-0 inset-x-0 bg-vf-ink/90 backdrop-blur border-t border-vf-line px-4 pt-3"
        style={{ paddingBottom: "max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))" }}
      >
        <div className="max-w-[560px] mx-auto flex gap-3">
          <button onClick={back} className="h-12 px-5 rounded-full border border-vf-line text-vf-muted hover:text-vf-text hover:border-vf-text/20 text-[14px] transition-colors" data-testid="button-step-back">
            {step === 0 ? "Cancel" : "Back"}
          </button>
          {step < STEPS.length - 1 ? (
            <button onClick={next} className="flex-1 h-12 rounded-full bg-vf-ember text-vf-ink font-bold text-[15px] btn-press transition-colors hover:bg-[var(--vf-ember-soft)]" data-testid="button-step-next">
              Next
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={busy}
              className="flex-1 h-12 rounded-full bg-vf-ember text-vf-ink font-bold text-[15px] btn-press transition-colors hover:bg-[var(--vf-ember-soft)] disabled:opacity-40 inline-flex items-center justify-center gap-2"
              data-testid="button-publish-event"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Put it up
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
