import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGet, adminPost } from "./api";
import { PageHeader, StatTile, LABEL, MONO, LINE, SURFACE, MUTED, FAINT, TEXT, ALERT } from "./AdminShell";
import { MATCHMAKER_NOTE_MAX, MATCHMAKER_NOTE_MIN } from "@shared/matchmaker";

// The Crown matchmaker (server/admin/matchmaker.ts). Take members on, pick
// people who fit them both ways, write the "why", answer chat requests.
type Member = {
  userId: string;
  name: string;
  age: number | null;
  area: string | null;
  gender: string | null;
  seeking: string[];
  ageRange: [number, number] | null;
  intent: string | null;
  lookingFor: string | null;
  activeUntil: string | null;
  privateMode: boolean;
  matchmakerId: string | null;
  matchmakerName: string | null;
  mine: boolean;
  thisMonth: number;
};
type Chat = { id: number; crownUserId: string; name: string; message: string; status: string; reply: string | null; handledBy: string | null; requestedAt: string; mine: boolean };
type Intro = { id: number; crownUserId: string; crownName: string; candidateName: string; proposedBy: string; note: string; status: string; createdAt: string };
type Data = { me: string; monthly: number; members: Member[]; chats: Chat[]; intros: Intro[] };
type Candidate = { userId: string; name: string; age: number | null; area: string | null; intent: string | null; verified: boolean; sameArea: boolean; bio: string | null };

const GOLD = "#E9B949";
const GOOD = "#2E7D5B";
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "–");
const STATUS: Record<string, { label: string; color: string }> = {
  proposed: { label: "Waiting on the Crown member", color: MUTED },
  crown_accepted: { label: "Crown said yes · waiting on them", color: GOLD },
  matched: { label: "Matched", color: GOOD },
  declined: { label: "Crown member said no", color: FAINT },
  passed: { label: "They said no", color: FAINT },
  expired: { label: "Lapsed", color: FAINT },
};

export default function AdminMatchmaker() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Data>({ queryKey: ["admin", "matchmaker"], queryFn: () => adminGet("/api/admin/matchmaker") });
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () => {
    setError(null);
    qc.invalidateQueries({ queryKey: ["admin", "matchmaker"] });
    qc.invalidateQueries({ queryKey: ["admin", "overview"] });
  };
  const onError = (e: any) => setError(e?.message ?? "That didn't work");
  const assign = useMutation({ mutationFn: ({ userId, mine }: { userId: string; mine: boolean }) => adminPost(`/api/admin/matchmaker/${userId}/assign`, { mine }), onSuccess: refresh, onError });
  const reply = useMutation({ mutationFn: ({ id, reply }: { id: number; reply: string }) => adminPost(`/api/admin/matchmaker/chats/${id}/reply`, { reply }), onSuccess: refresh, onError });
  const done = useMutation({ mutationFn: (id: number) => adminPost(`/api/admin/matchmaker/chats/${id}/done`, {}), onSuccess: refresh, onError });

  if (isLoading || !data) return <p style={{ color: FAINT }}>Loading…</p>;
  const mine = data.members.filter((m) => m.mine);
  const unassigned = data.members.filter((m) => !m.matchmakerId);
  const others = data.members.filter((m) => m.matchmakerId && !m.mine);
  const matched = data.intros.filter((i) => i.status === "matched").length;

  const memberRow = (m: Member) => (
    <MemberRow
      key={m.userId}
      m={m}
      monthly={data.monthly}
      open={open === m.userId}
      onToggle={() => setOpen(open === m.userId ? null : m.userId)}
      onAssign={(take) => assign.mutate({ userId: m.userId, mine: take })}
      busy={assign.isPending}
      intros={data.intros.filter((i) => i.crownUserId === m.userId)}
      onProposed={refresh}
      onError={setError}
    />
  );

  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader title="Matchmaker" sub={`Each Crown member has one person on the team. Up to ${data.monthly} introductions a month each; nameless until both say yes.`} />
      {error && (
        <div role="alert" style={{ border: `1px solid ${ALERT}66`, background: `${ALERT}14`, color: TEXT, padding: "10px 12px", borderRadius: 8, marginBottom: 14, fontSize: 13 }} data-testid="matchmaker-error">
          {error}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
        <StatTile label="Yours" value={mine.length} trend={`${unassigned.length} with nobody yet`} testId="mm-mine" />
        <StatTile label="Chats asked for" value={data.chats.length} trend={`${data.chats.filter((c) => c.status === "scheduled").length} with a time set`} testId="mm-chats" />
        <StatTile label="Introductions, 60 days" value={data.intros.length} trend={`${matched} matched`} testId="mm-intros" />
      </div>

      <Section title={`Chats asked for (${data.chats.length})`} empty="Nobody is waiting for a chat.">
        {data.chats.map((c) => (
          <ChatRow key={c.id} c={c} busy={reply.isPending || done.isPending} onReply={(text) => reply.mutate({ id: c.id, reply: text })} onDone={() => done.mutate(c.id)} />
        ))}
      </Section>

      <Section title={`Your Crown members (${mine.length})`} empty="Take someone on from the list below.">{mine.map(memberRow)}</Section>
      <Section title={`Nobody looking after them yet (${unassigned.length})`} empty="Every Crown member has a matchmaker.">{unassigned.map(memberRow)}</Section>
      <Section title={`With someone else (${others.length})`} empty="None.">{others.map(memberRow)}</Section>
    </div>
  );
}

function MemberRow({ m, monthly, open, onToggle, onAssign, busy, intros, onProposed, onError }: {
  m: Member; monthly: number; open: boolean; onToggle: () => void; onAssign: (take: boolean) => void; busy: boolean;
  intros: Intro[]; onProposed: () => void; onError: (s: string) => void;
}) {
  const left = Math.max(0, monthly - m.thisMonth);
  return (
    <div style={{ padding: 14, borderTop: `1px solid ${LINE}` }} data-testid={`mm-member-${m.userId}`}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>
            {m.name}{m.age ? `, ${m.age}` : ""}
            {m.privateMode && <span style={{ ...LABEL, color: MUTED, marginLeft: 8 }}>private mode</span>}
          </div>
          <div style={{ ...MONO, fontSize: 11.5, color: FAINT, marginTop: 2 }}>
            {[m.area, m.gender ? `${m.gender}, seeking ${m.seeking.join(", ") || "–"}` : null, m.ageRange ? `ages ${m.ageRange[0]}–${m.ageRange[1]}` : null, m.intent, `Crown until ${day(m.activeUntil)}`].filter(Boolean).join(" · ")}
          </div>
          <div style={{ fontSize: 12.5, color: m.mine ? TEXT : FAINT, marginTop: 6 }}>
            {m.matchmakerName ? (m.mine ? "Yours" : `With ${m.matchmakerName}`) : "Nobody yet"} · <span data-testid={`mm-left-${m.userId}`}>{left} of {monthly} left this month</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {m.mine ? (
            <>
              <button style={btn(GOLD)} onClick={onToggle} data-testid={`mm-find-${m.userId}`}>{open ? "Close" : "Find someone"}</button>
              <button style={btn()} disabled={busy} onClick={() => onAssign(false)}>Let go</button>
            </>
          ) : (
            <button style={btn()} disabled={busy} onClick={() => onAssign(true)} data-testid={`mm-take-${m.userId}`}>
              {m.matchmakerId ? "Take over" : "Take on"}
            </button>
          )}
        </div>
      </div>
      {intros.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {intros.map((i) => (
            <div key={i.id} style={{ fontSize: 12.5, color: MUTED }} data-testid={`mm-intro-${i.id}`}>
              <span style={{ color: TEXT }}>{i.candidateName}</span> · {day(i.createdAt)} by {i.proposedBy} ·{" "}
              <span style={{ color: STATUS[i.status]?.color ?? MUTED }}>{STATUS[i.status]?.label ?? i.status}</span>
            </div>
          ))}
        </div>
      )}
      {open && m.mine && <Candidates m={m} left={left} onProposed={onProposed} onError={onError} />}
    </div>
  );
}

function Candidates({ m, left, onProposed, onError }: { m: Member; left: number; onProposed: () => void; onError: (s: string) => void }) {
  const qc = useQueryClient();
  const key = ["admin", "matchmaker", m.userId, "candidates"];
  const { data, isLoading } = useQuery<{ candidates: Candidate[] }>({ queryKey: key, queryFn: () => adminGet(`/api/admin/matchmaker/${m.userId}/candidates`) });
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const propose = useMutation({
    mutationFn: () => adminPost(`/api/admin/matchmaker/${m.userId}/propose`, { candidateId: pick, note }),
    onSuccess: () => {
      setPick(null);
      setNote("");
      qc.invalidateQueries({ queryKey: key });
      onProposed();
    },
    onError: (e: any) => onError(e?.message ?? "That didn't work"),
  });
  if (isLoading || !data) return <p style={{ color: FAINT, fontSize: 13 }}>Looking…</p>;
  if (!data.candidates.length) return <p style={{ color: FAINT, fontSize: 13, marginTop: 12 }}>Nobody fits {m.name} both ways right now who hasn't been introduced already.</p>;
  return (
    <div style={{ marginTop: 12, borderTop: `1px dashed ${LINE}`, paddingTop: 12 }} data-testid={`mm-candidates-${m.userId}`}>
      <div style={{ ...LABEL, color: MUTED, marginBottom: 8 }}>Fits {m.name} both ways · same area first</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.candidates.map((c) => (
          <label key={c.userId} style={{ display: "flex", gap: 10, padding: 10, borderRadius: 8, border: `1px solid ${pick === c.userId ? `${GOLD}aa` : LINE}`, cursor: "pointer" }} data-testid={`mm-candidate-${c.userId}`}>
            <input type="radio" name={`pick-${m.userId}`} checked={pick === c.userId} onChange={() => setPick(c.userId)} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, color: TEXT, fontWeight: 600 }}>
                {c.name}{c.age ? `, ${c.age}` : ""}
                {c.verified && <span style={{ ...LABEL, color: GOOD, marginLeft: 8 }}>verified</span>}
                {c.sameArea && <span style={{ ...LABEL, color: GOLD, marginLeft: 8 }}>same area</span>}
              </div>
              <div style={{ ...MONO, fontSize: 11.5, color: FAINT }}>{[c.area, c.intent].filter(Boolean).join(" · ")}</div>
              {c.bio && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4 }}>{c.bio}</div>}
            </div>
          </label>
        ))}
      </div>
      {pick && (
        <div style={{ marginTop: 10 }}>
          <label style={{ ...LABEL, color: MUTED }} htmlFor={`mm-note-${m.userId}`}>Why them? Both will read this, before names.</label>
          <textarea
            id={`mm-note-${m.userId}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={MATCHMAKER_NOTE_MAX}
            rows={3}
            placeholder="You both hike on weekends and want something that lasts…"
            style={{ display: "block", width: "100%", marginTop: 6, background: SURFACE, border: `1px solid ${LINE}`, color: TEXT, borderRadius: 8, padding: 10, fontSize: 13.5, fontFamily: "inherit" }}
            data-testid={`mm-note-${m.userId}`}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
            <button style={btn(GOLD)} disabled={propose.isPending || left === 0 || note.trim().length < MATCHMAKER_NOTE_MIN} onClick={() => propose.mutate()} data-testid={`mm-propose-${m.userId}`}>
              Propose
            </button>
            <span style={{ fontSize: 12, color: FAINT }}>{left === 0 ? "No introductions left this month." : `${note.trim().length}/${MATCHMAKER_NOTE_MAX}`}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ChatRow({ c, busy, onReply, onDone }: { c: Chat; busy: boolean; onReply: (text: string) => void; onDone: () => void }) {
  const [text, setText] = useState("");
  return (
    <div style={{ padding: 14, borderTop: `1px solid ${LINE}` }} data-testid={`mm-chat-${c.id}`}>
      <div style={{ fontSize: 14.5, color: TEXT, fontWeight: 600 }}>
        {c.name} {c.mine && <span style={{ ...LABEL, color: GOLD, marginLeft: 6 }}>yours</span>}
        <span style={{ ...MONO, fontSize: 11.5, color: FAINT, fontWeight: 400, marginLeft: 8 }}>asked {day(c.requestedAt)}</span>
      </div>
      <p style={{ fontSize: 13.5, color: MUTED, margin: "6px 0 0", whiteSpace: "pre-wrap" }}>“{c.message}”</p>
      {c.reply && <p style={{ fontSize: 13, color: TEXT, margin: "6px 0 0" }}>Reply from {c.handledBy}: {c.reply}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={c.reply ? "Change the time…" : "Thursday 6pm, I'll call you on WhatsApp"}
          style={{ flex: "1 1 260px", background: SURFACE, border: `1px solid ${LINE}`, color: TEXT, borderRadius: 8, padding: "6px 10px", fontSize: 13 }}
          data-testid={`mm-reply-${c.id}`}
        />
        <button style={btn(GOLD)} disabled={busy || text.trim().length < 5} onClick={() => { onReply(text.trim()); setText(""); }} data-testid={`mm-send-reply-${c.id}`}>Send</button>
        <button style={btn()} disabled={busy} onClick={onDone} data-testid={`mm-done-${c.id}`}>Mark done</button>
      </div>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ ...LABEL, color: MUTED, marginBottom: 8 }}>{title}</div>
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: SURFACE, overflow: "hidden" }}>
        {has ? children : <p style={{ color: FAINT, padding: 14, margin: 0, fontSize: 13 }}>{empty}</p>}
      </div>
    </div>
  );
}

function btn(color: string = MUTED): React.CSSProperties {
  return { fontSize: 13, fontWeight: 600, padding: "6px 12px", borderRadius: 8, cursor: "pointer", background: "transparent", color: color === MUTED ? TEXT : color, border: `1px solid ${color === MUTED ? LINE : `${color}88`}` };
}
