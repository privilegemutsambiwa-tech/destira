// The dating coach and the profile writer in Twin chat (Twin Part F2, F3).
// Coach answers show as cards in the chat but aren't saved: a pasted message
// is someone else's words, so it never goes into twin memory.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { AlertTriangle, CalendarHeart, Check, Copy, Loader2, MessageCircleReply, PenLine, ShieldCheck, ShieldQuestion, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { WRITER_DRAFT_KEY, WRITER_PROMPT, type WriterDraft, type WriterStatus } from "@shared/twin-writer";

type Risk = { kind: string; label: string; tip: string; severity: "low" | "medium" | "high" };
type DatePlan = {
  withName: string | null;
  idea: string;
  place: { name: string; detail: string; offer: string | null } | null;
  otherPlaces: { name: string; detail: string }[];
  talkAbout: string[];
  safety: string[];
  matchId: number | null;
};

export type CoachResult =
  | { mode: "reply"; pasted: string; options: string[]; risks: Risk[] }
  | { mode: "scam"; pasted: string; verdict: "clear" | "caution" | "warning"; risks: Risk[]; advice: string }
  | { mode: "date"; plan: DatePlan };

type Mode = "reply" | "scam" | "date";

const MODES: { mode: Mode; label: string; icon: typeof ShieldQuestion }[] = [
  { mode: "reply", label: "Help me reply", icon: MessageCircleReply },
  { mode: "scam", label: "Is this a scam?", icon: ShieldQuestion },
  { mode: "date", label: "Plan a first date", icon: CalendarHeart },
];

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Something went wrong. Try again.");
  return data as T;
}

/** The three coach chips above the message box, and the small form each opens. */
export function CoachBar({ disabled, onResult }: { disabled?: boolean; onResult: (r: CoachResult) => void }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = useQuery<{ matchId: number; name: string }[]>({ queryKey: ["/api/twin/coach/matches"], enabled: mode === "date" });

  const close = () => { setMode(null); setText(""); setError(null); };
  const run = async (fn: () => Promise<CoachResult>) => {
    setBusy(true);
    setError(null);
    try {
      onResult(await fn());
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submitText = () => {
    const pasted = text.trim();
    if (!pasted) return setError("Paste the message first.");
    if (mode === "reply") run(async () => ({ mode: "reply", pasted, ...(await post<{ options: string[]; risks: Risk[] }>("/api/twin/coach/reply", { text: pasted })) }));
    if (mode === "scam") run(async () => ({ mode: "scam", pasted, ...(await post<{ verdict: "clear" | "caution" | "warning"; risks: Risk[]; advice: string }>("/api/twin/coach/scam", { text: pasted })) }));
  };
  const planDate = (matchId: number | null) => run(async () => ({ mode: "date", plan: (await post<{ plan: DatePlan }>("/api/twin/coach/date", { matchId })).plan }));

  return (
    <div className="max-w-4xl mx-auto mb-2.5" data-testid="coach-bar">
      {mode ? (
        <div className="rounded-[16px] border border-vf-mint/25 bg-vf-mint/[0.05] p-3.5" data-testid={`coach-panel-${mode}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[13px] font-medium text-vf-mint">{MODES.find((m) => m.mode === mode)!.label}</div>
            <button onClick={close} className="p-1 -m-1 text-vf-faint hover:text-vf-text" aria-label="Close" data-testid="coach-close">
              <X className="w-4 h-4" />
            </button>
          </div>
          {mode === "date" ? (
            <div className="mt-2.5">
              <p className="text-[12.5px] text-vf-muted leading-[1.5]">Who with? I'll use what you two share and a public place near you both.</p>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {matches.isLoading && <Loader2 className="w-4 h-4 animate-spin text-vf-mint" />}
                {(matches.data ?? []).map((m) => (
                  <button key={m.matchId} disabled={busy} onClick={() => planDate(m.matchId)} className="text-[13px] px-3 py-1.5 rounded-full border border-vf-line bg-vf-surface2 text-vf-text hover:border-vf-mint/40 disabled:opacity-50" data-testid={`coach-date-match-${m.matchId}`}>
                    {m.name}
                  </button>
                ))}
                <button disabled={busy} onClick={() => planDate(null)} className="text-[13px] px-3 py-1.5 rounded-full border border-dashed border-vf-line text-vf-muted hover:text-vf-text disabled:opacity-50" data-testid="coach-date-anyone">
                  Someone I met elsewhere
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2.5">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 2000))}
                rows={3}
                placeholder={mode === "reply" ? "Paste what they said to you" : "Paste the message you're unsure about"}
                className="text-[14px] leading-[1.5] text-vf-text resize-none bg-vf-ink border-vf-line rounded-[12px]"
                data-testid="coach-input"
              />
              <div className="flex items-center gap-3 mt-2.5">
                <button
                  onClick={submitText}
                  disabled={busy || !text.trim()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-vf-mint text-vf-ink font-semibold px-4 h-9 text-[13px] disabled:opacity-40"
                  data-testid="coach-submit"
                >
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {mode === "reply" ? "Suggest replies" : "Check it"}
                </button>
                <span className="text-[11.5px] text-vf-faint">Not saved to your twin's memory.</span>
              </div>
            </div>
          )}
          {busy && mode === "date" && <p className="text-[12.5px] text-vf-muted mt-2 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Planning…</p>}
          {error && <p className="text-[12.5px] text-[var(--vf-danger)] mt-2" data-testid="coach-error">{error}</p>}
        </div>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] -mx-4 px-4" role="toolbar" aria-label="Dating coach">
          {MODES.map(({ mode: m, label, icon: Icon }) => (
            <button
              key={m}
              disabled={disabled}
              onClick={() => setMode(m)}
              className="shrink-0 inline-flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded-full border border-vf-line text-vf-muted hover:text-vf-text hover:border-vf-mint/40 transition-colors disabled:opacity-50"
              data-testid={`coach-chip-${m}`}
            >
              <Icon className="w-3.5 h-3.5 text-vf-mint" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CopyLine({ text, testId }: { text: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); })}
      className="w-full text-left flex items-start gap-2.5 rounded-[12px] border border-vf-line bg-vf-ink/60 px-3 py-2.5 hover:border-vf-mint/40 transition-colors"
      data-testid={testId}
    >
      <span className="flex-1 text-[14px] leading-[1.45] text-vf-text">{text}</span>
      {copied ? <Check className="w-4 h-4 text-vf-mint shrink-0 mt-0.5" /> : <Copy className="w-4 h-4 text-vf-faint shrink-0 mt-0.5" />}
    </button>
  );
}

function RiskList({ risks }: { risks: Risk[] }) {
  return (
    <ul className="flex flex-col gap-2 mt-2.5">
      {risks.map((r) => (
        <li key={r.kind} className="rounded-[12px] border px-3 py-2.5" style={{ borderColor: "color-mix(in srgb, var(--vf-warn) 40%, transparent)", background: "color-mix(in srgb, var(--vf-warn) 8%, transparent)" }} data-testid={`coach-risk-${r.kind}`}>
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-vf-text">
            <AlertTriangle className="w-3.5 h-3.5 text-vf-warn" /> {r.label}
          </div>
          <p className="text-[12.5px] text-vf-muted leading-[1.5] mt-1">{r.tip}</p>
        </li>
      ))}
    </ul>
  );
}

/** A coach answer, shown in the chat like a twin message. */
export function CoachCard({ result }: { result: CoachResult }) {
  if (result.mode === "reply") {
    return (
      <div data-testid="coach-card-reply">
        <p className="text-[14px] text-vf-text">Three ways you could answer. Tap one to copy it, then make it yours.</p>
        <div className="flex flex-col gap-2 mt-2.5">
          {result.options.map((o, i) => <CopyLine key={i} text={o} testId={`coach-option-${i}`} />)}
        </div>
        {result.risks.length > 0 && (
          <>
            <p className="text-[13px] text-vf-muted mt-3">Before you reply, something in their message:</p>
            <RiskList risks={result.risks} />
          </>
        )}
      </div>
    );
  }
  if (result.mode === "scam") {
    const Icon = result.verdict === "clear" ? ShieldCheck : AlertTriangle;
    const title = result.verdict === "warning" ? "This looks like a scam" : result.verdict === "caution" ? "Worth being careful" : "Nothing alarming in this";
    return (
      <div data-testid={`coach-card-scam-${result.verdict}`}>
        <div className="flex items-center gap-2 text-[15px] font-medium text-vf-text">
          <Icon className={`w-4 h-4 ${result.verdict === "clear" ? "text-vf-mint" : "text-vf-warn"}`} /> {title}
        </div>
        <p className="text-[13.5px] text-vf-muted leading-[1.55] mt-1.5">{result.advice}</p>
        {result.risks.length > 0 && <RiskList risks={result.risks} />}
      </div>
    );
  }
  const p = result.plan;
  return (
    <div data-testid="coach-card-date">
      <div className="text-[15px] font-medium text-vf-text">A first date{p.withName ? ` with ${p.withName}` : ""}</div>
      <p className="text-[14px] text-vf-text leading-[1.55] mt-1.5" data-testid="coach-date-idea">{p.idea}</p>
      {p.place && (
        <div className="mt-2.5 rounded-[12px] border border-vf-line bg-vf-ink/60 px-3 py-2.5" data-testid="coach-date-place">
          <div className="text-[14px] text-vf-text">{p.place.name}</div>
          <div className="text-[12.5px] text-vf-faint">{p.place.detail}</div>
          {p.place.offer && <div className="text-[12.5px] text-vf-mint mt-1">Destira partner: {p.place.offer}</div>}
          {p.otherPlaces.length > 0 && <div className="text-[12px] text-vf-faint mt-1.5">Or: {p.otherPlaces.map((o) => o.name).join(", ")}</div>}
        </div>
      )}
      <div className="text-[12px] uppercase tracking-[0.12em] font-mono text-vf-faint mt-3">Things to talk about</div>
      <ul className="mt-1 flex flex-col gap-1">
        {p.talkAbout.map((t, i) => <li key={i} className="text-[13.5px] text-vf-muted leading-[1.5]">· {t}</li>)}
      </ul>
      <div className="text-[12px] uppercase tracking-[0.12em] font-mono text-vf-faint mt-3">Staying safe</div>
      <ul className="mt-1 flex flex-col gap-1">
        {p.safety.map((t, i) => <li key={i} className="text-[13.5px] text-vf-muted leading-[1.5]">· {t}</li>)}
      </ul>
      {p.matchId && (
        <Link href={`/chat/${p.matchId}`} className="inline-block mt-3 text-[13px] text-vf-mint underline underline-offset-2" data-testid="coach-date-open-chat">
          Suggest it in your chat with {p.withName ?? "them"}
        </Link>
      )}
    </div>
  );
}

/** The profile writer: offered while the profile has no words of its own
 *  (no bio, or no prompt answered). The draft goes into the profile page's
 *  editor; nothing is saved until they press Save there. */
export function WriterCard() {
  const [, setLocation] = useLocation();
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem("vf_writer_hidden") === "1"; } catch { return false; }
  });
  const [draft, setDraft] = useState<WriterDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(false);
  const status = useQuery<WriterStatus>({ queryKey: ["/api/twin/writer"] });
  const need = status.data?.need;
  if (hidden || !need) return null;

  const hide = () => {
    try { sessionStorage.setItem("vf_writer_hidden", "1"); } catch {}
    setHidden(true);
  };
  const makeDraft = async () => {
    setBusy(true);
    try {
      const r = await post<{ text: string | null }>("/api/twin/writer/draft", need === "bio" ? { kind: "bio" } : { kind: "prompt", q: WRITER_PROMPT });
      if (!r.text) setEmpty(true);
      else setDraft(need === "bio" ? { kind: "bio", text: r.text } : { kind: "prompt", q: WRITER_PROMPT, text: r.text });
    } catch {
      setEmpty(true);
    } finally {
      setBusy(false);
    }
  };
  const useIt = () => {
    if (!draft) return;
    try { sessionStorage.setItem(WRITER_DRAFT_KEY, JSON.stringify(draft)); } catch {}
    setLocation("/profile");
  };

  return (
    <div className="rounded-[18px] border border-vf-mint/25 bg-vf-mint/[0.05] p-4 text-left" data-testid={`writer-card-${need}`}>
      <div className="flex items-start gap-3">
        <PenLine className="w-4 h-4 text-vf-mint mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[14.5px] text-vf-text">
            {need === "bio" ? "Your profile has no words of your own yet" : "You haven't answered a prompt yet"}
          </div>
          <p className="text-[13px] text-vf-muted leading-[1.5] mt-0.5">
            {need === "bio"
              ? "It's the first thing people read. Want a draft from what you've told me? You can change every word."
              : `People open conversations from these. Want me to draft "${WRITER_PROMPT}" from what you've told me?`}
          </p>
          {draft ? (
            <>
              <p className="mt-3 rounded-[12px] border border-vf-line bg-vf-ink/60 px-3 py-2.5 text-[14px] leading-[1.55] text-vf-text whitespace-pre-line" data-testid="writer-draft">
                {draft.text}
              </p>
              <div className="flex items-center gap-3 mt-3">
                <button onClick={useIt} className="rounded-full bg-vf-mint text-vf-ink font-semibold px-4 h-9 text-[13px]" data-testid="writer-use">
                  Edit it on my profile
                </button>
                <button onClick={makeDraft} disabled={busy} className="text-[13px] text-vf-muted hover:text-vf-text" data-testid="writer-again">
                  {busy ? "Drafting…" : "Try another"}
                </button>
              </div>
              <p className="text-[11.5px] text-vf-faint mt-2">Nothing changes on your profile until you save it there.</p>
            </>
          ) : empty ? (
            <p className="text-[13px] text-vf-muted mt-2.5" data-testid="writer-empty">
              I don't know enough about you to write it honestly yet. Tell me a bit about yourself here first.
            </p>
          ) : (
            <div className="flex items-center gap-3 mt-3">
              <button onClick={makeDraft} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-vf-mint text-vf-ink font-semibold px-4 h-9 text-[13px] disabled:opacity-50" data-testid="writer-draft-button">
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {busy ? "Drafting…" : "Draft it"}
              </button>
              <button onClick={hide} className="text-[13px] text-vf-muted hover:text-vf-text" data-testid="writer-later">
                Not now
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
