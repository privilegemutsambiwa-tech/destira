import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/use-profiles";
import { useGroups } from "@/hooks/use-interactions";
import { useHostEvent, type HostEventInput, type SeatModel } from "@/hooks/use-events";
import {
  EVENT_KINDS,
  EVENT_VIBES,
  EVENT_PLACE_TYPES,
  EVENT_ACCESS_NEEDS,
} from "@shared/schema";

const KNOWN_SUBURBS = [
  "Avondale", "Borrowdale", "Mount Pleasant", "Newlands", "Milton Park",
  "Belgravia", "Highlands", "Msasa", "Hillside", "Suburbs", "Kumalo", "Famona",
];

type Draft = {
  title: string;
  kind: string;
  description: string;
  date: string; // yyyy-mm-dd
  startTime: string; // HH:mm
  endTime: string; // HH:mm, optional
  city: string;
  suburb: string;
  venueName: string;
  placeType: string;
  visibility: "public" | "group";
  groupId: number | null;
  seatModel: SeatModel;
  seatCount: string;
  vibes: string[];
  isSober: boolean;
  accessibility: string[];
};

const EMPTY: Draft = {
  title: "",
  kind: "",
  description: "",
  date: "",
  startTime: "18:00",
  endTime: "",
  city: "",
  suburb: "",
  venueName: "",
  placeType: "",
  visibility: "public",
  groupId: null,
  seatModel: "open",
  seatCount: "",
  vibes: [],
  isSober: false,
  accessibility: [],
};

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint mb-3">{children}</div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3.5 h-9 text-[13px] capitalize transition-colors ${
        active
          ? "border-vf-mint/50 bg-vf-mint/10 text-vf-text"
          : "border-vf-line text-vf-muted hover:text-vf-text hover:border-white/20"
      }`}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
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

const STEPS = ["Basics", "Where", "Seats & vibe", "Review"];

export default function HostEvent() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: profile } = useProfile();
  const { data: groups } = useGroups();
  const host = useHostEvent();

  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(() => ({ ...EMPTY }));
  const set = (p: Partial<Draft>) => setD((cur) => ({ ...cur, ...p }));
  const toggle = (key: "vibes" | "accessibility", v: string) =>
    setD((cur) => {
      const arr = cur[key];
      return { ...cur, [key]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] };
    });

  const myGroups: { id: number; name: string }[] = useMemo(
    () => (groups ?? []).map((g: any) => ({ id: g.id, name: g.name })),
    [groups],
  );

  // Prefill city once the profile lands.
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
      if (d.visibility === "group" && d.groupId == null) return "Choose which group.";
      return null;
    }
    if (s === 2) {
      if (d.seatModel !== "open" && (!d.seatCount || Number(d.seatCount) < 2))
        return "Set how many seats (2+).";
      return null;
    }
    return null;
  };

  const next = () => {
    const err = stepValid(step);
    if (err) {
      toast({ title: err, variant: "destructive" });
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => (step === 0 ? setLocation("/events") : setStep((s) => s - 1));

  const submit = () => {
    for (let s = 0; s <= 2; s++) {
      const err = stepValid(s);
      if (err) {
        setStep(s);
        toast({ title: err, variant: "destructive" });
        return;
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
    };
    host.mutate(payload, {
      onSuccess: (ev) => {
        toast({
          title: ev.status === "pending_review" ? "Sent for a quick look" : "Your event is live",
          description:
            ev.status === "pending_review"
              ? "First events get a once-over before they go public. We'll be quick."
              : undefined,
        });
        setLocation(`/events/${ev.id}`);
      },
      onError: (err: Error) => toast({ title: "Couldn't create it", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <div className="min-h-screen bg-vf-ink text-vf-text">
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
              {i < STEPS.length - 1 && <div className="w-6 h-px bg-vf-line" />}
            </div>
          ))}
          <span className="ml-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint">{STEPS[step]}</span>
        </div>

        {step === 0 && (
          <div className="flex flex-col gap-6">
            <Field label="Title">
              <input
                className={inputCls}
                value={d.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="Sunrise trail run, then breakfast"
                data-testid="input-title"
              />
            </Field>
            <div>
              <GroupLabel>What kind of thing</GroupLabel>
              <div className="flex flex-wrap gap-2">
                {EVENT_KINDS.map((k) => (
                  <Chip key={k} label={k} active={d.kind === k} onClick={() => set({ kind: k })} />
                ))}
              </div>
            </div>
            <Field label="Description" hint="Optional. What to expect, what to bring, how to find you.">
              <textarea
                className={`${inputCls} h-24 py-2.5 leading-[1.5]`}
                value={d.description}
                onChange={(e) => set({ description: e.target.value })}
                placeholder="Easy 5k out, coffee and eggs after. Bring layers."
                data-testid="input-description"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <input
                  type="date"
                  className={inputCls}
                  value={d.date}
                  onChange={(e) => set({ date: e.target.value })}
                  data-testid="input-date"
                />
              </Field>
              <Field label="Start">
                <input
                  type="time"
                  className={inputCls}
                  value={d.startTime}
                  onChange={(e) => set({ startTime: e.target.value })}
                  data-testid="input-start-time"
                />
              </Field>
            </div>
            <Field label="End" hint="Optional.">
              <input
                type="time"
                className={inputCls}
                value={d.endTime}
                onChange={(e) => set({ endTime: e.target.value })}
                data-testid="input-end-time"
              />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3">
              <Field label="City">
                <input
                  className={inputCls}
                  value={d.city}
                  onChange={(e) => set({ city: e.target.value })}
                  placeholder="Harare"
                  data-testid="input-city"
                />
              </Field>
              <Field label="Suburb" hint="A known suburb lets your event show up by distance.">
                <input
                  className={inputCls}
                  list="known-suburbs"
                  value={d.suburb}
                  onChange={(e) => set({ suburb: e.target.value })}
                  placeholder="Borrowdale"
                  data-testid="input-suburb"
                />
                <datalist id="known-suburbs">
                  {KNOWN_SUBURBS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </Field>
            </div>
            <Field label="Venue name" hint="Optional.">
              <input
                className={inputCls}
                value={d.venueName}
                onChange={(e) => set({ venueName: e.target.value })}
                placeholder="Trailhead Cafe"
                data-testid="input-venue"
              />
            </Field>
            <div>
              <GroupLabel>Kind of place</GroupLabel>
              <div className="flex flex-wrap gap-2">
                {EVENT_PLACE_TYPES.map((p) => (
                  <Chip key={p} label={p} active={d.placeType === p} onClick={() => set({ placeType: p })} />
                ))}
              </div>
            </div>
            <div>
              <GroupLabel>Who can see it</GroupLabel>
              <div className="inline-flex rounded-full border border-vf-line overflow-hidden">
                {(["public", "group"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set({ visibility: v })}
                    className={`px-4 h-9 text-[13px] capitalize transition-colors ${
                      d.visibility === v ? "bg-vf-mint/10 text-vf-text" : "text-vf-muted hover:text-vf-text"
                    }`}
                  >
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
                      {myGroups.map((g) => (
                        <Chip
                          key={g.id}
                          label={g.name}
                          active={d.groupId === g.id}
                          onClick={() => set({ groupId: g.id })}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div>
              <GroupLabel>Seats</GroupLabel>
              <div className="inline-flex rounded-full border border-vf-line overflow-hidden">
                {([
                  ["open", "Open"],
                  ["capped", "Capped"],
                  ["curated", "You pick"],
                ] as const).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set({ seatModel: v })}
                    className={`px-4 h-9 text-[13px] transition-colors ${
                      d.seatModel === v ? "bg-vf-mint/10 text-vf-text" : "text-vf-muted hover:text-vf-text"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {d.seatModel !== "open" && (
                <div className="mt-3 max-w-[160px]">
                  <input
                    type="number"
                    min={2}
                    max={500}
                    className={inputCls}
                    value={d.seatCount}
                    onChange={(e) => set({ seatCount: e.target.value })}
                    placeholder="Seats"
                    data-testid="input-seat-count"
                  />
                </div>
              )}
              <p className="mt-2 text-[12px] text-vf-faint">
                {d.seatModel === "open"
                  ? "No cap. Anyone who wants in is in."
                  : d.seatModel === "capped"
                    ? "Hard cap. Overflow joins a waitlist."
                    : "Requests come to you; you choose who's in."}
              </p>
            </div>

            <div>
              <GroupLabel>Vibe</GroupLabel>
              <div className="flex flex-wrap gap-2">
                {EVENT_VIBES.map((v) => (
                  <Chip key={v} label={v} active={d.vibes.includes(v)} onClick={() => toggle("vibes", v)} />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[14px] text-vf-soft">Sober event</span>
              <button
                type="button"
                onClick={() => set({ isSober: !d.isSober })}
                aria-pressed={d.isSober}
                className={`w-[42px] h-[24px] rounded-full shrink-0 flex items-center p-[3px] transition-colors ${
                  d.isSober ? "bg-vf-mint justify-end" : "bg-white/[0.14] justify-start"
                }`}
              >
                <span
                  className="block w-[18px] h-[18px] rounded-full"
                  style={{ background: d.isSober ? "#0C0910" : "#CFC7DA" }}
                />
              </button>
            </div>

            <div>
              <GroupLabel>Access</GroupLabel>
              <div className="flex flex-wrap gap-2">
                {EVENT_ACCESS_NEEDS.map((a) => (
                  <Chip
                    key={a}
                    label={a.replace("-", " ")}
                    active={d.accessibility.includes(a)}
                    onClick={() => toggle("accessibility", a)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
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
                  {startsAtISO
                    ? new Date(startsAtISO).toLocaleString([], {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                  {endsAtISO ? ` – ${new Date(endsAtISO).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                </dd>
                <dt className="text-vf-faint">Where</dt>
                <dd className="text-vf-text">
                  {[d.venueName, d.suburb, d.city].filter(Boolean).join(", ") || "—"}
                </dd>
                <dt className="text-vf-faint">Seats</dt>
                <dd className="text-vf-text capitalize">
                  {d.seatModel}
                  {d.seatModel !== "open" && d.seatCount ? ` · ${d.seatCount}` : ""}
                </dd>
                <dt className="text-vf-faint">Who</dt>
                <dd className="text-vf-text">
                  {d.visibility === "public"
                    ? "Anyone"
                    : myGroups.find((g) => g.id === d.groupId)?.name ?? "A group"}
                </dd>
                {(d.vibes.length > 0 || d.isSober || d.accessibility.length > 0) && (
                  <>
                    <dt className="text-vf-faint">Notes</dt>
                    <dd className="text-vf-text capitalize">
                      {[...d.vibes, d.isSober ? "sober" : "", ...d.accessibility.map((a) => a.replace("-", " "))]
                        .filter(Boolean)
                        .join(" · ")}
                    </dd>
                  </>
                )}
              </dl>
            </div>
            <p className="text-[12.5px] text-vf-faint leading-[1.5]">
              Your first event gets a quick look from us before it goes public — after that they publish straight away.
              You can host 3 a week.
            </p>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-vf-ink/90 backdrop-blur border-t border-vf-line px-4 py-3">
        <div className="max-w-[560px] mx-auto flex gap-3">
          <button
            onClick={back}
            className="h-12 px-5 rounded-full border border-vf-line text-vf-muted hover:text-vf-text hover:border-white/20 text-[14px] transition-colors"
            data-testid="button-step-back"
          >
            {step === 0 ? "Cancel" : "Back"}
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={next}
              className="flex-1 h-12 rounded-full bg-vf-ember text-vf-ink font-bold text-[15px] btn-press transition-colors hover:bg-[#FF8163]"
              data-testid="button-step-next"
            >
              Next
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={host.isPending}
              className="flex-1 h-12 rounded-full bg-vf-ember text-vf-ink font-bold text-[15px] btn-press transition-colors hover:bg-[#FF8163] disabled:opacity-40 inline-flex items-center justify-center gap-2"
              data-testid="button-publish-event"
            >
              {host.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Put it up
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
