// Crown matchmaker (shared/matchmaker.ts): introductions a Destira matchmaker
// proposed. Nameless until both say yes. A Crown member also asks for this
// month's chat here; someone picked for a Crown member just sees their card.
import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown as CrownIcon, Loader2, ShieldCheck } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { apiRequest } from "@/lib/queryClient";
import { MATCHMAKER_CHAT_MAX, type MatchmakerIntroView, type MatchmakerMe } from "@shared/matchmaker";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";
const GOLD = "#E9B949";
const KEY = ["/api/matchmaker/me"];
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

const errorText = (e: unknown) => String((e as any)?.message ?? "") || "That didn't work";

function IntroCard({ i }: { i: MatchmakerIntroView }) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const answer = useMutation({
    mutationFn: async (yes: boolean) => (await apiRequest("POST", `/api/matchmaker/intros/${i.id}/answer`, { yes })).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e) => setErr(errorText(e)),
  });
  const who = i.role === "crown" ? "Someone your matchmaker picked" : "A Crown member";
  const facts = [i.card.age, i.card.area, i.card.intent].filter(Boolean).join(" · ");

  if (i.stage === "matched") {
    return (
      <div className="rounded-[20px] border p-4 flex gap-3.5 items-center" style={{ borderColor: "rgba(233,185,73,0.4)" }} data-testid={`intro-${i.id}`}>
        <div className="w-14 h-14 shrink-0 rounded-full bg-vf-surface2 overflow-hidden">
          {i.photoUrl ? <img src={i.photoUrl} alt="" className="w-full h-full object-cover" /> : (
            <div className="w-full h-full flex items-center justify-center font-serif text-[22px] text-vf-faint">{i.name?.[0]}</div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-serif text-[20px] text-vf-text leading-[1.15]" data-testid={`intro-name-${i.id}`}>{i.name}{i.card.age ? `, ${i.card.age}` : ""}</div>
          <div className="text-[12.5px] text-vf-faint">You both said yes</div>
        </div>
        {i.matchId && (
          <Link href={`/chat/${i.matchId}`}>
            <span className="h-10 px-4 rounded-full bg-vf-ember text-vf-ink font-medium text-[13.5px] inline-flex items-center" data-testid={`intro-chat-${i.id}`}>Say hi</span>
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-vf-line p-4" data-testid={`intro-${i.id}`}>
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-vf-muted">{who}</span>
        {i.card.verified && <ShieldCheck className="w-3.5 h-3.5 text-vf-faint" aria-label="Verified" />}
      </div>
      <div className="font-serif text-[22px] leading-[1.15] text-vf-text mt-1" data-testid={`intro-facts-${i.id}`}>{facts || "Details to come"}</div>
      <p className="text-[14.5px] text-vf-text leading-[1.5] mt-3">&ldquo;{i.note}&rdquo;</p>
      <div className="text-[12.5px] text-vf-faint mt-1">Your Destira matchmaker</div>

      {i.stage === "yours" && (
        <>
          <div className="flex gap-2 mt-4">
            <button onClick={() => answer.mutate(false)} disabled={answer.isPending} className="h-10 px-4 rounded-full border border-vf-line text-vf-muted text-[13.5px]" data-testid={`intro-no-${i.id}`}>
              Not for me
            </button>
            <button onClick={() => answer.mutate(true)} disabled={answer.isPending} className="flex-1 h-10 rounded-full bg-vf-ember text-vf-ink font-medium text-[13.5px]" data-testid={`intro-yes-${i.id}`}>
              {answer.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "I'd like to meet"}
            </button>
          </div>
          <p className="text-[12px] text-vf-faint mt-2 leading-[1.45]">
            {i.role === "crown" ? "If you say yes, they see the same card. " : "They've said yes. "}
            Names are shared only if you both do. Nobody is told about a no.{i.answerBy ? ` Answer by ${shortDate(i.answerBy)}.` : ""}
          </p>
        </>
      )}
      {i.stage === "theirs" && <p className="text-[13px] text-vf-muted mt-3" data-testid={`intro-waiting-${i.id}`}>You said yes. Waiting on them{i.answerBy ? ` until ${shortDate(i.answerBy)}` : ""}.</p>}
      {i.stage === "over" && <p className="text-[13px] text-vf-faint mt-3" data-testid={`intro-over-${i.id}`}>This one didn't go further.</p>}
      {err && <p className="text-[13px] text-red-400 mt-2" role="alert">{err}</p>}
    </div>
  );
}

function ChatPanel({ me }: { me: MatchmakerMe }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const ask = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/matchmaker/chat", { message: text.trim() })).json(),
    onSuccess: () => { setText(""); qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e) => setErr(errorText(e)),
  });
  const c = me.chat;
  const showLast = c && (!me.canAskChat || c.status !== "done");
  return (
    <div className="mt-6 rounded-[20px] border p-4" style={{ borderColor: "rgba(233,185,73,0.35)", background: "rgba(233,185,73,0.05)" }} data-testid="matchmaker-chat">
      <div className="text-[15px] text-vf-text">This month's chat</div>
      {showLast && c ? (
        <>
          <p className="text-[13.5px] text-vf-muted mt-1.5 leading-[1.5]">You asked on {shortDate(c.requestedAt)}: &ldquo;{c.message}&rdquo;</p>
          {c.reply ? (
            <p className="text-[14px] text-vf-text mt-2 leading-[1.5]" data-testid="matchmaker-reply">{me.matchmakerName ?? "Your matchmaker"}: {c.reply}</p>
          ) : (
            <p className="text-[13px] text-vf-faint mt-2" data-testid="matchmaker-chat-waiting">Your matchmaker will reply here with a time.</p>
          )}
          {c.status === "done" && <p className="text-[12.5px] text-vf-faint mt-2">Done. You can ask again next month.</p>}
        </>
      ) : (
        <>
          <p className="text-[13.5px] text-vf-muted mt-1.5 leading-[1.5]">
            Tell {me.matchmakerName ?? "your matchmaker"} what you're looking for and when suits you. They'll reply here with a time.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MATCHMAKER_CHAT_MAX}
            rows={3}
            placeholder="Someone who loves the outdoors. Weekday evenings suit me."
            className="mt-3 w-full rounded-[14px] bg-vf-surface border border-vf-line p-3 text-[14px] text-vf-text placeholder:text-vf-faint"
            data-testid="input-matchmaker-chat"
          />
          <button onClick={() => ask.mutate()} disabled={ask.isPending || text.trim().length < 10} className="mt-2 h-10 px-5 rounded-full font-semibold text-[13.5px] text-[#1A1418] disabled:opacity-50" style={{ background: GOLD }} data-testid="button-matchmaker-chat">
            Ask for a chat
          </button>
          {err && <p className="text-[13px] text-red-400 mt-2" role="alert">{err}</p>}
        </>
      )}
    </div>
  );
}

export default function IntroductionsPage() {
  const { data, isLoading } = useQuery<MatchmakerMe>({ queryKey: KEY, staleTime: 0 });
  const live = data?.intros.filter((i) => i.stage !== "over") ?? [];
  const over = data?.intros.filter((i) => i.stage === "over") ?? [];
  return (
    <LayoutShell>
      <div className="max-w-[460px] mx-auto pb-10" data-testid="page-introductions">
        <div className={EYEBROW}>Your Destira matchmaker</div>
        <h1 className="font-serif font-normal text-[30px] leading-[1.1] text-vf-text mt-2">Introductions</h1>
        {isLoading || !data ? (
          <Loader2 className="w-6 h-6 animate-spin text-vf-faint mt-6" />
        ) : (
          <>
            <p className="text-[14px] text-vf-muted mt-2 leading-[1.5]">
              {data.crown
                ? data.matchmakerName
                  ? `${data.matchmakerName} from the Destira team looks after you: up to ${data.monthly} hand-picked introductions a month, and a chat whenever you'd like one.`
                  : "Someone from the Destira team will be looking after you shortly. Your introductions will show here."
                : "Someone on the Destira team thought you'd get on with a Crown member. Names are shared only if you both say yes."}
            </p>
            {data.crown && (
              <div className="mt-3 inline-flex items-center gap-1.5 font-mono text-[12px] text-vf-text" data-testid="text-intros-month">
                <CrownIcon className="w-3.5 h-3.5" style={{ color: GOLD }} /> {data.introsThisMonth} of {data.monthly} this month
              </div>
            )}
            {live.length ? (
              <div className="mt-5 flex flex-col gap-3">{live.map((i) => <IntroCard key={i.id} i={i} />)}</div>
            ) : (
              <p className="mt-6 text-[14px] text-vf-muted" data-testid="introductions-empty">Nothing waiting right now.</p>
            )}
            {data.crown && <ChatPanel me={data} />}
            {over.length > 0 && (
              <div className="mt-8">
                <div className={EYEBROW}>Earlier</div>
                <div className="mt-3 flex flex-col gap-3 opacity-80">{over.map((i) => <IntroCard key={i.id} i={i} />)}</div>
              </div>
            )}
          </>
        )}
      </div>
    </LayoutShell>
  );
}
