// "Let's meet" in a direct chat (Part E): the planner sheet, the date card it
// becomes, and the private "How did it go?" the day after.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, CalendarHeart, Check, Coffee, Footprints, MapPin, Share2, Ticket, UtensilsCrossed, X } from "lucide-react";
import { Share } from "@capacitor/share";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { VfButton, VfSheet } from "@/components/ui-vf";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isNativeApp } from "@/lib/native";
import { haptic } from "@/lib/haptics";
import {
  buildIcs, CHECKIN_LABEL, DATE_KIND_LABEL, DATE_MAX_TIMES, dateTimeLabel, planTitle, shareMyDateText,
  type CheckinAnswer, type DateKind, type DatePlanView,
} from "@shared/date-plan";

const errText = (e: any, fallback: string) => String(e?.message || "").replace(/^\d+:\s*/, "") || fallback;

// ── times, always in Harare time ─────────────────────────────────────
const OFFSET_MS = 2 * 60 * 60 * 1000;
const SLOTS = ["10:00", "12:30", "15:00", "17:30", "19:00"];

function harareDays(n = 8) {
  const out: { key: string; label: string; y: number; m: number; d: number }[] = [];
  const base = new Date(Date.now() + OFFSET_MS);
  for (let i = 0; i < n; i++) {
    const t = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + i));
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : t.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
    out.push({ key: t.toISOString().slice(0, 10), label, y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() });
  }
  return out;
}
const toIso = (day: { y: number; m: number; d: number }, hhmm: string) => {
  const [h, min] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(day.y, day.m, day.d, h, min) - OFFSET_MS).toISOString();
};

const KIND_ICON: Record<DateKind, typeof Coffee> = { coffee: Coffee, lunch: UtensilsCrossed, walk: Footprints, event: Ticket };

type Ideas = { spots: { name: string; detail: string; distKm: number | null }[]; events: { id: number; title: string; where: string; startsAt: string }[] };

// ── the planner ──────────────────────────────────────────────────────

export function LetsMeetSheet({ matchId, otherFirst, open, onOpenChange }: { matchId: number; otherFirst: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [kind, setKind] = useState<DateKind>("coffee");
  const [place, setPlace] = useState<{ name: string; detail: string } | null>(null);
  const [custom, setCustom] = useState("");
  const [eventId, setEventId] = useState<number | null>(null);
  const days = useMemo(() => harareDays(), [open]);
  const [day, setDay] = useState(days[1]?.key ?? days[0].key);
  const [times, setTimes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPlace(null); setCustom(""); setEventId(null); setTimes([]); setDay(days[1]?.key ?? days[0].key);
  }, [open, days]);
  useEffect(() => { setPlace(null); setEventId(null); }, [kind]);

  const ideas = useQuery<Ideas>({
    queryKey: ["/api/dates", matchId, "ideas", kind],
    queryFn: async () => (await apiRequest("GET", `/api/dates/${matchId}/ideas?kind=${kind}`)).json(),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const now = Date.now() + 30 * 60_000;
  const dayObj = days.find((d) => d.key === day) ?? days[0];
  const toggleTime = (iso: string) => {
    haptic.tick();
    setTimes((t) => (t.includes(iso) ? t.filter((x) => x !== iso) : t.length >= DATE_MAX_TIMES ? t : [...t, iso].sort()));
  };

  const where = custom.trim() ? { name: custom.trim(), detail: "" } : place;
  const ready = kind === "event" ? eventId != null : !!where && times.length > 0;

  const send = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      await apiRequest("POST", `/api/dates/${matchId}`, kind === "event" ? { kind, eventId } : { kind, placeName: where!.name, placeDetail: where!.detail || undefined, times });
      haptic.send();
      queryClient.invalidateQueries({ queryKey: ["/api/messages", matchId] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/threads"] });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Couldn't send that", description: errText(e, "Check your connection and try again."), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const chip = (on: boolean) =>
    `px-3 h-9 rounded-full border text-[14px] transition-colors ${on ? "border-vf-ember bg-vf-ember/15 text-vf-text" : "border-vf-line text-vf-muted hover:border-vf-text/25"}`;

  return (
    <VfSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Meet ${otherFirst}`}
      description="Somewhere public, at a time that suits you. They pick one of your times."
      data-testid="sheet-lets-meet"
      footer={
        <VfButton fullWidth loading={busy} disabled={!ready} onClick={send} leading={<CalendarHeart className="w-4 h-4" />} data-testid="button-send-plan">
          {kind === "event" ? "Suggest going together" : times.length > 1 ? `Suggest ${times.length} times` : "Suggest it"}
        </VfButton>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="What kind of date">
          {(Object.keys(DATE_KIND_LABEL) as DateKind[]).map((k) => {
            const Icon = KIND_ICON[k];
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={`flex flex-col items-center gap-1.5 rounded-[14px] border py-3 text-[12.5px] ${kind === k ? "border-vf-ember bg-vf-ember/10 text-vf-text" : "border-vf-line text-vf-muted"}`}
                data-testid={`kind-${k}`}
              >
                <Icon className="w-5 h-5" /> {k === "event" ? "Event" : DATE_KIND_LABEL[k]}
              </button>
            );
          })}
        </div>

        {kind === "event" ? (
          <div className="flex flex-col gap-2">
            <p className="vf-label text-vf-faint">Destira events coming up</p>
            {ideas.isLoading ? (
              <p className="vf-small text-vf-muted">Looking…</p>
            ) : (ideas.data?.events ?? []).length === 0 ? (
              <p className="vf-small text-vf-muted">No public events in the next two months yet. Coffee or a walk instead?</p>
            ) : (
              ideas.data!.events.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => setEventId(ev.id)}
                  className={`text-left rounded-[14px] border px-3.5 py-3 ${eventId === ev.id ? "border-vf-ember bg-vf-ember/10" : "border-vf-line"}`}
                  data-testid={`event-${ev.id}`}
                >
                  <span className="block text-[15px] text-vf-text">{ev.title}</span>
                  <span className="block vf-small text-vf-muted">{dateTimeLabel(ev.startsAt)}{ev.where ? ` · ${ev.where}` : ""}</span>
                </button>
              ))
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <p className="vf-label text-vf-faint">Where</p>
              <div className="flex flex-col gap-1.5">
                {(ideas.data?.spots ?? []).map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => { setPlace(s); setCustom(""); }}
                    className={`text-left rounded-[14px] border px-3.5 py-2.5 flex items-center gap-2.5 ${place?.name === s.name && !custom ? "border-vf-ember bg-vf-ember/10" : "border-vf-line"}`}
                    data-testid={`spot-${s.name}`}
                  >
                    <MapPin className="w-4 h-4 text-vf-faint shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-[15px] text-vf-text truncate">{s.name}</span>
                      <span className="block vf-small text-vf-muted">{s.detail}{s.distKm != null ? ` · about ${s.distKm < 1 ? "1" : Math.round(s.distKm)} km from you both` : ""}</span>
                    </span>
                  </button>
                ))}
                {ideas.isLoading && <p className="vf-small text-vf-muted">Finding places near you both…</p>}
              </div>
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Somewhere else (a café, a park…)"
                maxLength={80}
                className="h-11 rounded-[14px] px-3.5 bg-vf-surface2 border border-vf-line text-[15px] text-vf-text placeholder:text-vf-faint outline-none focus:border-vf-text/25"
                data-testid="input-custom-place"
              />
              <p className="vf-small text-vf-faint">A first date is best somewhere busy and public.</p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="vf-label text-vf-faint">When · pick up to {DATE_MAX_TIMES}</p>
              <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
                {days.map((d) => (
                  <button key={d.key} type="button" onClick={() => setDay(d.key)} className={`${chip(day === d.key)} shrink-0`} data-testid={`day-${d.key}`}>
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SLOTS.map((s) => {
                  const iso = toIso(dayObj, s);
                  const past = new Date(iso).getTime() < now;
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={past || (!times.includes(iso) && times.length >= DATE_MAX_TIMES)}
                      onClick={() => toggleTime(iso)}
                      className={`${chip(times.includes(iso))} font-mono disabled:opacity-35`}
                      data-testid={`slot-${s}`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
              {times.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1" data-testid="chosen-times">
                  {times.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 pl-3 pr-1 h-8 rounded-full bg-vf-surface2 border border-vf-line text-[13px] text-vf-text">
                      {dateTimeLabel(t)}
                      <button type="button" onClick={() => toggleTime(t)} className="w-6 h-6 flex items-center justify-center text-vf-faint" aria-label={`Remove ${dateTimeLabel(t)}`}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p className="vf-small text-vf-faint">Times are Harare time.</p>
            </div>
          </>
        )}
      </div>
    </VfSheet>
  );
}

// ── calendar and sharing ─────────────────────────────────────────────

async function addToCalendar(plan: DatePlanView, otherName: string) {
  const ics = buildIcs(plan, otherName);
  const filename = `destira-date-${plan.id}.ics`;
  if (isNativeApp()) {
    // The share sheet hands the file to the phone's calendar app.
    const written = await Filesystem.writeFile({ path: filename, data: ics, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ files: [written.uri], dialogTitle: "Add to calendar" }).catch(() => {});
    return;
  }
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Who, where and when, to someone the member trusts (they choose who). */
async function shareMyDate(plan: DatePlanView, otherName: string) {
  const text = shareMyDateText(plan, otherName);
  if (isNativeApp()) {
    await Share.share({ text, dialogTitle: "Share my date" }).catch(() => {});
    return;
  }
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e: any) { if (e?.name === "AbortError") return; }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

// ── the card in the chat ─────────────────────────────────────────────

export function DateCard({ plan, isMe, otherFirst, onSuggestAnother }: { plan: DatePlanView; isMe: boolean; otherFirst: string; onSuggestAnother: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const Icon = KIND_ICON[plan.kind];
  const live = plan.status === "proposed" || plan.status === "confirmed";
  const mine = isMe; // the card is the proposer's message
  const upcoming = plan.startsAt ? new Date(plan.startsAt).getTime() > Date.now() : false;

  const act = async (path: string, body: object = {}, key = path) => {
    setBusy(key);
    try {
      await apiRequest("POST", `/api/dates/plan/${plan.id}/${path}`, body);
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ["/api/messages", plan.matchId] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/threads"] });
    } catch (e) {
      toast({ title: "That didn't go through", description: errText(e, "Try again in a moment."), variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/messages", plan.matchId] });
    } finally {
      setBusy(null);
    }
  };

  const status =
    plan.status === "confirmed" ? (upcoming ? "It's a date" : "You met") :
    plan.status === "proposed" ? (mine ? `Waiting for ${otherFirst} to pick a time` : `${otherFirst} suggested this. Pick a time`) :
    plan.status === "declined" ? (mine ? `${otherFirst} can't make it` : "You couldn't make it") :
    plan.status === "cancelled" ? "Cancelled" : "Replaced by a newer plan";

  return (
    <div
      className={`w-[290px] max-w-full rounded-[20px] border overflow-hidden ${plan.status === "confirmed" ? "border-vf-ember/40 bg-vf-ember/[0.08]" : "border-vf-line bg-vf-surface"} ${live ? "" : "opacity-70"}`}
      data-testid={`date-card-${plan.id}`}
      data-status={plan.status}
    >
      <div className="px-4 pt-3.5 pb-3 flex items-start gap-3">
        <span className="w-10 h-10 rounded-full bg-vf-ember/15 text-vf-ember flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <p className="vf-label text-vf-faint">{status}</p>
          <p className={`text-[16px] leading-snug text-vf-text mt-0.5 ${live ? "" : "line-through decoration-vf-faint"}`}>{planTitle(plan)}</p>
          {plan.placeDetail && <p className="vf-small text-vf-muted mt-0.5">{plan.placeDetail}</p>}
          {plan.status === "confirmed" && plan.startsAt && (
            <p className="mt-1.5 font-mono text-[14px] text-vf-text" data-testid="date-when">{dateTimeLabel(plan.startsAt)}</p>
          )}
        </div>
      </div>

      {plan.status === "proposed" && !mine && (
        <div className="px-3 pb-3 flex flex-col gap-1.5">
          {plan.times.map((t) => (
            <VfButton
              key={t}
              size="sm"
              variant="secondary"
              fullWidth
              disabled={new Date(t).getTime() < Date.now()}
              loading={busy === t}
              onClick={() => act("confirm", { time: t }, t)}
              leading={<Check className="w-4 h-4" />}
              data-testid={`confirm-time-${plan.times.indexOf(t)}`}
            >
              {dateTimeLabel(t)}
            </VfButton>
          ))}
          <div className="flex gap-1.5 mt-0.5">
            <VfButton size="sm" variant="quiet" className="flex-1" onClick={onSuggestAnother} data-testid="button-suggest-another">Suggest another</VfButton>
            <VfButton size="sm" variant="quiet" className="flex-1" loading={busy === "decline"} onClick={() => act("decline")} data-testid="button-decline-plan">Can't make it</VfButton>
          </div>
        </div>
      )}

      {plan.status === "proposed" && mine && (
        <div className="px-4 pb-3">
          <p className="vf-small text-vf-muted">{plan.times.map(dateTimeLabel).join(" · ")}</p>
          <button type="button" onClick={() => act("cancel")} className="mt-2 vf-small text-vf-faint hover:text-vf-text" data-testid="button-cancel-plan">Take it back</button>
        </div>
      )}

      {plan.status === "confirmed" && upcoming && (
        <div className="px-3 pb-3 flex flex-col gap-1.5">
          <div className="flex flex-col gap-1.5">
            <VfButton size="sm" variant="secondary" fullWidth onClick={() => addToCalendar(plan, otherFirst).catch(() => toast({ title: "Couldn't make the calendar file", variant: "destructive" }))} leading={<CalendarPlus className="w-4 h-4" />} data-testid="button-add-calendar">
              Add to calendar
            </VfButton>
            <VfButton size="sm" variant="secondary" fullWidth onClick={() => shareMyDate(plan, otherFirst)} leading={<Share2 className="w-4 h-4" />} data-testid="button-share-date">
              Share my date
            </VfButton>
          </div>
          <p className="vf-small text-vf-faint px-1">Share my date sends who, where and when to someone you trust.</p>
          <button type="button" onClick={() => act("cancel")} className="self-start px-1 vf-small text-vf-faint hover:text-vf-text" data-testid="button-cancel-plan">Cancel the date</button>
        </div>
      )}
    </div>
  );
}

// ── after the date ───────────────────────────────────────────────────

export function DateCheckin({ matchId, otherFirst, onReport }: { matchId: number; otherFirst: string; onReport: () => void }) {
  const queryClient = useQueryClient();
  const [done, setDone] = useState<CheckinAnswer | null>(null);
  const { data } = useQuery<DatePlanView[]>({
    queryKey: ["/api/dates", matchId, "checkins"],
    queryFn: async () => (await apiRequest("GET", `/api/dates/${matchId}/checkins`)).json(),
    staleTime: 60_000,
  });
  const plan = data?.[0];
  if (!plan && !done) return null;

  const answer = async (a: CheckinAnswer) => {
    if (!plan) return;
    haptic.tick();
    setDone(a);
    try {
      await apiRequest("POST", `/api/dates/plan/${plan.id}/checkin`, { answer: a });
    } catch {
      setDone(null);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["/api/dates", matchId, "checkins"] });
    if (a === "report") onReport();
  };

  return (
    <div className="mt-4 rounded-[18px] border border-vf-line bg-vf-surface px-4 py-3.5" data-testid="date-checkin">
      {done ? (
        <p className="vf-small text-vf-muted" data-testid="checkin-thanks">
          {done === "report" ? "Thank you for telling us. Our team will look into it." : "Thanks. That stays between you and Destira."}
        </p>
      ) : plan ? (
        <>
          <p className="text-[15px] text-vf-text">How did it go with {otherFirst}?</p>
          <p className="vf-small text-vf-muted mt-0.5">{planTitle(plan)}{plan.startsAt ? `, ${dateTimeLabel(plan.startsAt)}` : ""}. {otherFirst} won't see your answer.</p>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {(["great", "okay", "not_for_me"] as const).map((a) => (
              <VfButton key={a} size="sm" variant="secondary" onClick={() => answer(a)} data-testid={`checkin-${a}`}>{CHECKIN_LABEL[a]}</VfButton>
            ))}
          </div>
          <button type="button" onClick={() => answer("report")} className="mt-2 vf-small text-vf-faint hover:text-vf-text" data-testid="checkin-report">
            {CHECKIN_LABEL.report}
          </button>
        </>
      ) : null}
    </div>
  );
}
