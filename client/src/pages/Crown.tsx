// Destira Crown: what it is, seats left (the real count), and the member's
// own way in: verify -> apply -> approved by the team -> pay (PlansPay).
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Crown as CrownIcon, Loader2, ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { priceLabel } from "@shared/entitlements";
import { CROWN_PERKS, CROWN_PERIOD_LABEL, type CrownPeriod } from "@shared/crown";
import { CROWN_GRADIENT } from "@/components/crown-badge";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";
const GOLD = "#E9B949";

type State = {
  status: "applied" | "approved" | "declined" | "active" | "revoked" | null;
  active: boolean;
  activeUntil: string | null;
  reason: string | null;
  verified: boolean;
  hasPhoto: boolean;
  seatCap: number;
  seatsLeft: number;
  open: boolean;
  applyBlock: string | null;
  payBlock: string | null;
  prices: Record<CrownPeriod, number>;
  city: string;
};

const longDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

export default function CrownPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { data: s, isLoading } = useQuery<State>({ queryKey: ["/api/crown"] });
  const [note, setNote] = useState("");
  const apply = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/crown/apply", { note })).json(),
    onSuccess: (next) => qc.setQueryData(["/api/crown"], next),
  });

  if (isLoading || !s) {
    return (
      <Shell>
        <Loader2 className="w-5 h-5 animate-spin text-vf-faint" />
      </Shell>
    );
  }

  const taken = Math.max(0, s.seatCap - s.seatsLeft);
  const pay = (period: CrownPeriod) => setLocation(`/plans/pay?tier=crown&period=${period}`);

  return (
    <Shell>
      <button onClick={() => setLocation("/plans")} className="text-[13px] text-vf-muted hover:text-vf-text transition-colors">
        ← Plans
      </button>

      <div className="mt-7 flex items-center gap-2.5">
        <span className="inline-flex items-center justify-center rounded-full w-9 h-9" style={{ background: CROWN_GRADIENT }}>
          <CrownIcon className="w-[18px] h-[18px]" style={{ color: "#1A1418" }} strokeWidth={2.4} />
        </span>
        <span className={EYEBROW}>Destira Crown · by application</span>
      </div>
      <h1 className="font-serif font-normal text-vf-text mt-4 text-[clamp(32px,9vw,46px)] leading-[1.04]" data-testid="text-crown-title">
        A smaller room, for people who mean it.
      </h1>
      <p className="text-[15px] text-vf-muted mt-3 leading-[1.6]">
        Every Crown member is checked by our team. You get a crown wherever people see you, everything in Ember, and a
        more personal way to meet.
      </p>
      <p className="mt-4 font-mono text-[13px] text-vf-text" data-testid="text-crown-price">
        {priceLabel(s.prices.monthly)} a month · {priceLabel(s.prices.threeMonth)} for 3 months
      </p>

      <div className="mt-6" data-testid="crown-seats">
        <div className="flex justify-between text-[13px]">
          <span className="text-vf-text">
            <strong>{s.seatsLeft}</strong> of {s.seatCap} seats left in {s.city}
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-vf-text/10 overflow-hidden" aria-hidden="true">
          <div className="h-full rounded-full" style={{ width: `${s.seatCap ? (taken / s.seatCap) * 100 : 0}%`, background: CROWN_GRADIENT }} />
        </div>
      </div>

      <div className="mt-7 rounded-[20px] border p-5" style={{ borderColor: "rgba(233,185,73,0.35)", background: "rgba(233,185,73,0.05)" }} data-testid="crown-state">
        <StateCard s={s} note={note} setNote={setNote} apply={apply} pay={pay} goVerify={() => setLocation("/settings#verify")} goPhotos={() => setLocation("/photos")} />
      </div>

      <div className={`${EYEBROW} mt-9 mb-3`}>What Crown gives you</div>
      <ul className="flex flex-col gap-3" data-testid="crown-perks">
        {CROWN_PERKS.map((p) => (
          <li key={p.title} className="flex gap-3">
            <span className="mt-0.5 shrink-0">
              {p.status === "live" ? <Check className="w-4 h-4" style={{ color: GOLD }} strokeWidth={3} /> : <span className="block w-4 h-4 rounded-full border border-vf-line" />}
            </span>
            <span className="min-w-0">
              <span className="text-[15px] text-vf-text">{p.title}</span>
              {p.status === "soon" && <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] text-vf-faint">coming</span>}
              <span className="block text-[13px] text-vf-muted leading-[1.5]">{p.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className={`${EYEBROW} mt-9 mb-3`}>What the crown promises everyone</div>
      <div className="flex flex-col gap-3 text-[13.5px] text-vf-muted leading-[1.55]">
        <p className="flex gap-2.5">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-vf-text" /> A crown means verified, by people on our team. No exceptions.
        </p>
        <p className="flex gap-2.5">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-vf-text" /> It never changes who anyone sees: everyone's filters, blocks and choices still apply.
        </p>
        <p className="flex gap-2.5">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-vf-text" /> Nobody can be bought. Offering money or gifts for company loses the crown, with no refund.
        </p>
      </div>
      <p className="text-[12px] text-vf-faint mt-9">Questions? support@destira.date</p>
    </Shell>
  );
}

function StateCard({
  s,
  note,
  setNote,
  apply,
  pay,
  goVerify,
  goPhotos,
}: {
  s: State;
  note: string;
  setNote: (v: string) => void;
  apply: { mutate: () => void; isPending: boolean; isError: boolean; error: unknown };
  pay: (p: CrownPeriod) => void;
  goVerify: () => void;
  goPhotos: () => void;
}) {
  const PayButtons = () => (
    <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
      <button onClick={() => pay("monthly")} className="h-12 px-5 rounded-full font-semibold text-[14px] text-[#1A1418] btn-press" style={{ background: CROWN_GRADIENT }} data-testid="button-crown-pay-monthly">
        {priceLabel(s.prices.monthly)} for a month
      </button>
      <button onClick={() => pay("threeMonth")} className="h-12 px-5 rounded-full border border-vf-line text-[14px] text-vf-text hover:border-vf-text/25" data-testid="button-crown-pay-threeMonth">
        {priceLabel(s.prices.threeMonth)} for {CROWN_PERIOD_LABEL.threeMonth}
      </button>
    </div>
  );

  if (s.active) {
    return (
      <>
        <div className="text-[17px] text-vf-text font-serif">You're Crown until {longDate(s.activeUntil!)}.</div>
        <p className="text-[13.5px] text-vf-muted mt-1.5">Nothing renews by itself; we'll remind you before it ends. Add time whenever you like.</p>
        {!s.payBlock && <PayButtons />}
        <PerksPanel />
      </>
    );
  }
  if (s.status === "approved" || (s.status === "active" && !s.active)) {
    return (
      <>
        <div className="text-[17px] text-vf-text font-serif" data-testid="text-crown-approved">
          {s.status === "approved" ? "You're approved. Your seat is held for you." : "Your crown has lapsed."}
        </div>
        {s.payBlock ? (
          <p className="text-[13.5px] text-vf-muted mt-1.5">{s.payBlock}</p>
        ) : (
          <>
            <p className="text-[13.5px] text-vf-muted mt-1.5">Pay with EcoCash, OneMoney, InnBucks or card. It's on the moment the payment goes through.</p>
            <PayButtons />
          </>
        )}
      </>
    );
  }
  if (s.status === "applied") {
    return (
      <>
        <div className="text-[17px] text-vf-text font-serif" data-testid="text-crown-applied">Your application is with the team.</div>
        <p className="text-[13.5px] text-vf-muted mt-1.5">We read every one. You'll hear from us here and by notification, usually within two days.</p>
      </>
    );
  }

  const reason = s.reason ? <p className="text-[13.5px] text-vf-muted mt-1.5">"{s.reason}"</p> : null;
  if (s.applyBlock) {
    return (
      <>
        {s.status === "declined" && <div className="text-[17px] text-vf-text font-serif">Not this time.</div>}
        {s.status === "revoked" && <div className="text-[17px] text-vf-text font-serif">Your crown was removed.</div>}
        {reason}
        <p className="text-[13.5px] text-vf-muted mt-1.5" data-testid="text-crown-block">{s.applyBlock}</p>
        {!s.verified && (
          <button onClick={goVerify} className="mt-4 h-11 px-5 rounded-full bg-vf-ember text-vf-ink font-semibold text-[14px] btn-press" data-testid="button-crown-verify">
            Verify with a selfie
          </button>
        )}
        {s.verified && !s.hasPhoto && (
          <button onClick={goPhotos} className="mt-4 h-11 px-5 rounded-full bg-vf-ember text-vf-ink font-semibold text-[14px] btn-press">
            Add a photo
          </button>
        )}
      </>
    );
  }
  return (
    <>
      {s.status === "declined" && <div className="text-[17px] text-vf-text font-serif mb-2">You can apply again.</div>}
      <label htmlFor="crown-note" className="block text-[15px] text-vf-text">Tell us about you</label>
      <p className="text-[13px] text-vf-muted mt-1">Who you are, and what you're hoping to find. Only our team reads this.</p>
      <textarea
        id="crown-note"
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 600))}
        rows={4}
        className="mt-3 w-full rounded-[12px] border border-vf-line bg-vf-text/5 px-3.5 py-3 text-[15px] text-vf-text placeholder:text-vf-faint outline-none focus:border-[rgba(233,185,73,0.6)]"
        placeholder="I'm a … in Harare, looking for …"
        data-testid="input-crown-note"
      />
      <div className="flex items-center justify-between mt-1 text-[11.5px] text-vf-faint">
        <span>{note.trim().length < 20 ? "A couple of sentences" : " "}</span>
        <span>{note.length}/600</span>
      </div>
      {apply.isError && <p className="text-[13px] text-vf-ember mt-2">{(apply.error as Error).message.replace(/^\d+:\s*/, "")}</p>}
      <button
        disabled={note.trim().length < 20 || apply.isPending}
        onClick={() => apply.mutate()}
        className="mt-4 inline-flex items-center gap-2 h-12 px-6 rounded-full font-semibold text-[14px] text-[#1A1418] btn-press disabled:opacity-40"
        style={{ background: CROWN_GRADIENT }}
        data-testid="button-crown-apply"
      >
        {apply.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        Apply for Crown
      </button>
      <p className="text-[12px] text-vf-faint mt-3">Applying is free. You only pay once the team approves you.</p>
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-vf-ink text-vf-text px-6 py-12">
      <div className="w-full max-w-[560px] mx-auto">{children}</div>
    </div>
  );
}

type Perks = { crown: boolean; privateMode: boolean; introsLeft: number; introsPerDay: number };

// A Crown member's own switches: private mode, and introductions left today.
function PerksPanel() {
  const qc = useQueryClient();
  const { data: p } = useQuery<Perks>({ queryKey: ["/api/crown/perks"] });
  const toggle = useMutation({
    mutationFn: async (on: boolean) => (await apiRequest("PATCH", "/api/crown/private-mode", { on })).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/crown/perks"] }),
  });
  if (!p?.crown) return null;
  return (
    <div className="mt-5 pt-5 border-t border-vf-line flex flex-col gap-4" data-testid="crown-my-perks">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[14.5px] text-vf-text">Private mode</div>
          <p className="text-[13px] text-vf-muted mt-0.5 leading-[1.45]">
            {p.privateMode
              ? "On. Only people you've liked can see you: you're out of everyone else's Discover and Tonight's three."
              : "Off. Turn it on and only people you've liked can see you."}
          </p>
        </div>
        <button
          role="switch"
          aria-checked={p.privateMode}
          aria-label="Private mode"
          disabled={toggle.isPending}
          onClick={() => toggle.mutate(!p.privateMode)}
          className="shrink-0 w-12 h-7 rounded-full relative transition-colors disabled:opacity-50"
          style={{ background: p.privateMode ? GOLD : "var(--vf-line)" }}
          data-testid="switch-private-mode"
        >
          <span
            className="absolute top-1 w-5 h-5 rounded-full bg-white transition-all"
            style={{ left: p.privateMode ? 24 : 4 }}
          />
        </button>
      </div>
      <div>
        <div className="text-[14.5px] text-vf-text">
          Introductions: <span className="font-mono" data-testid="text-intros-left">{p.introsLeft}</span> of {p.introsPerDay} left today
        </div>
        <p className="text-[13px] text-vf-muted mt-0.5 leading-[1.45]">
          Open someone's profile and tap "Introduce yourself" to send a like with a short note. They choose; you won't be told if they decline.
        </p>
      </div>
      <Link href="/introductions">
        <span className="flex items-center justify-between gap-3 cursor-pointer" data-testid="link-matchmaker">
          <span>
            <span className="block text-[14.5px] text-vf-text">Your matchmaker</span>
            <span className="block text-[13px] text-vf-muted mt-0.5 leading-[1.45]">Hand-picked introductions, and this month's chat.</span>
          </span>
          <span className="text-[13px] font-medium shrink-0" style={{ color: GOLD }}>Open</span>
        </span>
      </Link>
    </div>
  );
}
