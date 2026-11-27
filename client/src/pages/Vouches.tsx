// Vouches (docs/destira-3-upgrade-prompt.md Part O5): read what people who
// met you wrote and choose up to 3 for your dating profile; vouch for people
// you've met through a Sunday Table, an event or a circle.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Quote } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { VfAvatar } from "@/components/ui-vf";
import { useToast } from "@/hooks/use-toast";
import { VOUCH_MAX, VOUCHES_SHOWN_MAX, vouchProblem, type VouchPerson, type VouchView, type VouchesMe } from "@shared/vouches";
import { CardsSkeleton } from "@/components/ui-vf/skeletons";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";
const KEY = ["/api/vouches/me"];

async function send(method: string, url: string, data?: unknown) {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || "Something went wrong");
  return body;
}

function useAct() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: KEY });
      if (done) toast({ title: done });
      return true;
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { act, busy };
}

function VouchBody({ v }: { v: VouchView }) {
  return (
    <div className="flex gap-3">
      <VfAvatar size={38} src={v.person.photoUrl ?? undefined} name={v.person.name} seed={v.person.userId} />
      <div className="flex-1 min-w-0">
        <p className="text-[14.5px] text-vf-text leading-[1.5]">&ldquo;{v.body}&rdquo;</p>
        <div className="text-[12.5px] text-vf-faint mt-1">{v.person.name} · {v.metLabel}</div>
      </div>
    </div>
  );
}

function Received({ v, shownCount }: { v: VouchView; shownCount: number }) {
  const { act, busy } = useAct();
  const set = (status: "shown" | "hidden") => act(() => send("POST", `/api/vouches/${v.id}/status`, { status }));
  const full = shownCount >= VOUCHES_SHOWN_MAX;
  return (
    <div className="rounded-2xl border border-vf-line p-4" data-testid={`vouch-received-${v.id}`}>
      <VouchBody v={v} />
      <div className="flex items-center gap-2 mt-3 pl-[50px]">
        {v.status !== "shown" && (
          <button onClick={() => set("shown")} disabled={busy || full}
            className="h-9 px-3.5 rounded-full bg-vf-mint text-vf-ink text-[13px] font-medium disabled:opacity-50" data-testid={`vouch-show-${v.id}`}>
            Show on my profile
          </button>
        )}
        {v.status !== "hidden" && (
          <button onClick={() => set("hidden")} disabled={busy}
            className="h-9 px-3.5 rounded-full border border-vf-line text-vf-muted text-[13px]" data-testid={`vouch-hide-${v.id}`}>
            {v.status === "shown" ? "Take it off" : "Keep it private"}
          </button>
        )}
      </div>
      {v.status !== "shown" && full && <p className="text-[12px] text-vf-faint mt-2 pl-[50px]">{VOUCHES_SHOWN_MAX} are showing. Take one off to show this.</p>}
    </div>
  );
}

function Writer({ person, metLabel, initial, onDone }: { person: VouchPerson; metLabel: string; initial?: string; onDone: () => void }) {
  const { act, busy } = useAct();
  const [text, setText] = useState(initial ?? "");
  const problem = text.trim() ? vouchProblem(text) : null;
  return (
    <div className="rounded-2xl border border-vf-ember/40 bg-vf-ember/[0.04] p-4" data-testid={`vouch-writer-${person.userId}`}>
      <div className="flex items-center gap-2.5">
        <VfAvatar size={30} src={person.photoUrl ?? undefined} name={person.name} seed={person.userId} />
        <div className="text-[14px] text-vf-text">{person.name} <span className="text-vf-faint text-[12.5px]">· {metLabel}</span></div>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, VOUCH_MAX))}
        rows={3}
        placeholder={`What should people know about ${person.name}? "Genuinely kind, and the funniest at the table."`}
        className="mt-3 w-full rounded-xl border border-vf-line bg-transparent p-3 text-[14.5px] text-vf-text placeholder:text-vf-faint resize-none"
        data-testid="input-vouch"
      />
      <div className="flex items-center justify-between mt-1">
        <span className="text-[12px] text-vf-faint">{problem ?? `${person.name} chooses whether it shows on their profile.`}</span>
        <span className="text-[12px] text-vf-faint tabular-nums">{text.length}/{VOUCH_MAX}</span>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={onDone} className="h-10 px-4 rounded-full border border-vf-line text-vf-muted text-[13.5px]">Cancel</button>
        <button
          onClick={async () => { if (await act(() => send("POST", "/api/vouches", { toId: person.userId, body: text }), `Sent to ${person.name}`)) onDone(); }}
          disabled={busy || !text.trim() || !!problem}
          className="flex-1 h-10 rounded-full bg-vf-ember text-vf-ink font-medium text-[13.5px] disabled:opacity-50"
          data-testid="button-send-vouch"
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default function VouchesPage() {
  const { data, isLoading } = useQuery<VouchesMe>({ queryKey: KEY, staleTime: 0 });
  const [writing, setWriting] = useState<string | null>(null);
  const { act, busy } = useAct();
  const shown = data?.received.filter((v) => v.status === "shown") ?? [];
  const waiting = data?.received.filter((v) => v.status === "pending") ?? [];
  const hidden = data?.received.filter((v) => v.status === "hidden") ?? [];

  return (
    <LayoutShell>
      <div className="max-w-[460px] mx-auto pb-10" data-testid="page-vouches">
        <div className={EYEBROW}>Destira Friends</div>
        <h1 className="font-serif font-normal text-[30px] leading-[1.1] text-vf-text mt-2">Vouches</h1>
        <p className="text-[14px] text-vf-muted mt-2 leading-[1.5]">
          A few words from someone who has met you. Up to {VOUCHES_SHOWN_MAX} can show on your dating profile, and only the ones you choose.
        </p>

        {isLoading || !data ? (
          <CardsSkeleton className="mt-6" />
        ) : (
          <div className="mt-6 space-y-8">
            {waiting.length > 0 && (
              <section data-testid="vouches-waiting">
                <div className={`${EYEBROW} mb-2.5`}>New for you</div>
                <div className="space-y-2.5">{waiting.map((v) => <Received key={v.id} v={v} shownCount={shown.length} />)}</div>
              </section>
            )}
            <section data-testid="vouches-shown">
              <div className={`${EYEBROW} mb-2.5`}>On your profile ({shown.length}/{VOUCHES_SHOWN_MAX})</div>
              {shown.length ? (
                <div className="space-y-2.5">{shown.map((v) => <Received key={v.id} v={v} shownCount={shown.length} />)}</div>
              ) : (
                <p className="text-[13px] text-vf-faint">None yet. When someone vouches for you, you'll choose whether it shows.</p>
              )}
            </section>
            {hidden.length > 0 && (
              <section>
                <div className={`${EYEBROW} mb-2.5`}>Kept private</div>
                <div className="space-y-2.5">{hidden.map((v) => <Received key={v.id} v={v} shownCount={shown.length} />)}</div>
              </section>
            )}

            <section data-testid="vouches-can">
              <div className={`${EYEBROW} mb-2.5`}>Vouch for someone you've met</div>
              {data.canVouch.length ? (
                <div className="space-y-2">
                  {data.canVouch.map(({ person, metLabel }) =>
                    writing === person.userId ? (
                      <Writer key={person.userId} person={person} metLabel={metLabel} onDone={() => setWriting(null)} />
                    ) : (
                      <button key={person.userId} onClick={() => setWriting(person.userId)}
                        className="w-full flex items-center gap-3 rounded-2xl border border-vf-line p-3 text-left hover:border-vf-ember/50"
                        data-testid={`vouch-for-${person.userId}`}>
                        <VfAvatar size={36} src={person.photoUrl ?? undefined} name={person.name} seed={person.userId} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[14.5px] text-vf-text">{person.name}</div>
                          <div className="text-[12px] text-vf-faint truncate">{metLabel}</div>
                        </div>
                        <Quote className="w-4 h-4 text-vf-ember" />
                      </button>
                    ),
                  )}
                </div>
              ) : (
                <p className="text-[13px] text-vf-faint" data-testid="vouches-none-met">
                  Once you've met people at a Sunday Table, an event or in a circle, you can vouch for them here.
                </p>
              )}
            </section>

            {data.given.length > 0 && (
              <section data-testid="vouches-given">
                <div className={`${EYEBROW} mb-2.5`}>You vouched for</div>
                <div className="space-y-2.5">
                  {data.given.map((v) =>
                    writing === `edit-${v.id}` ? (
                      <Writer key={v.id} person={v.person} metLabel={v.metLabel} initial={v.body} onDone={() => setWriting(null)} />
                    ) : (
                      <div key={v.id} className="rounded-2xl border border-vf-line p-4" data-testid={`vouch-given-${v.id}`}>
                        <VouchBody v={v} />
                        <div className="flex items-center gap-3 mt-3 pl-[50px] text-[12.5px]">
                          <span className="text-vf-faint">{v.status === "shown" ? "On their profile" : "Sent"}</span>
                          <button onClick={() => setWriting(`edit-${v.id}`)} className="text-vf-muted underline underline-offset-2">Edit</button>
                          <button onClick={() => act(() => send("DELETE", `/api/vouches/${v.id}`))} disabled={busy} className="text-vf-muted underline underline-offset-2" data-testid={`vouch-delete-${v.id}`}>
                            Take it back
                          </button>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </LayoutShell>
  );
}
