// Wingman (docs/destira-3-upgrade-prompt.md Part O6): the people friends in
// your circles think you'd like, who suggested each one, and why.
import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HeartHandshake } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { VfAvatar } from "@/components/ui-vf";
import type { WingmanMe, WingmanReceived } from "@shared/wingman";
import { CardsSkeleton } from "@/components/ui-vf/skeletons";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";
const KEY = ["/api/wingman/me"];

function Suggestion({ s }: { s: WingmanReceived }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const c = s.candidate;
  const dismiss = async () => {
    setBusy(true);
    await fetch(`/api/wingman/${s.id}/dismiss`, { method: "POST", credentials: "include" }).catch(() => {});
    await qc.invalidateQueries({ queryKey: KEY });
    setBusy(false);
  };
  return (
    <div className="rounded-[20px] border border-vf-line overflow-hidden" data-testid={`wingman-card-${s.id}`}>
      <Link href={`/u/${c.userId}`}>
        <div className="flex gap-3.5 p-4 cursor-pointer">
          <div className="w-[76px] shrink-0 rounded-[12px] bg-vf-surface2 overflow-hidden" style={{ aspectRatio: "4 / 5" }}>
            {c.photoUrl ? <img src={c.photoUrl} alt="" className="w-full h-full object-cover" /> : (
              <div className="w-full h-full flex items-center justify-center font-serif text-[28px] text-vf-faint">{c.name[0]}</div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-serif text-[22px] leading-[1.1] text-vf-text">{c.name}{c.age ? `, ${c.age}` : ""}</div>
            {c.area && <div className="text-[12.5px] text-vf-faint mt-0.5">{c.area}</div>}
            {s.status === "pending" && <span className="inline-block mt-2 text-[11px] font-mono uppercase tracking-[0.12em] text-vf-ember">New</span>}
          </div>
        </div>
      </Link>
      <div className="px-4 pb-4 flex gap-3">
        <VfAvatar size={30} src={s.from.photoUrl ?? undefined} name={s.from.name} seed={s.from.userId} />
        <div className="min-w-0">
          <p className="text-[14.5px] text-vf-text leading-[1.5]">&ldquo;{s.note}&rdquo;</p>
          <div className="text-[12.5px] text-vf-faint mt-1">{s.from.name} · {s.circleName}</div>
        </div>
      </div>
      <div className="flex gap-2 px-4 pb-4">
        <button onClick={dismiss} disabled={busy} className="h-10 px-4 rounded-full border border-vf-line text-vf-muted text-[13.5px]" data-testid={`wingman-dismiss-${s.id}`}>
          Not for me
        </button>
        <Link href={`/u/${c.userId}`} className="flex-1">
          <span className="flex items-center justify-center h-10 rounded-full bg-vf-ember text-vf-ink font-medium text-[13.5px]" data-testid={`wingman-view-${s.id}`}>
            See {c.name}'s profile
          </span>
        </Link>
      </div>
    </div>
  );
}

export default function WingmanPage() {
  const { data, isLoading } = useQuery<WingmanMe>({ queryKey: KEY, staleTime: 0 });
  return (
    <LayoutShell>
      <div className="max-w-[460px] mx-auto pb-10" data-testid="page-wingman">
        <div className={EYEBROW}>From your circles</div>
        <h1 className="font-serif font-normal text-[30px] leading-[1.1] text-vf-text mt-2">Wingman</h1>
        <p className="text-[14px] text-vf-muted mt-2 leading-[1.5]">
          People your friends think you'd like, and why. They're never told they were suggested.
        </p>
        {isLoading || !data ? (
          <CardsSkeleton className="mt-6" media="portrait" />
        ) : data.received.length ? (
          <div className="mt-6 flex flex-col gap-3">{data.received.map((s) => <Suggestion key={s.id} s={s} />)}</div>
        ) : (
          <div className="mt-8 text-center" data-testid="wingman-empty">
            <HeartHandshake className="w-7 h-7 text-vf-faint mx-auto" />
            <p className="text-[14px] text-vf-muted mt-3 leading-[1.5]">
              Nothing yet. When a friend in one of your circles spots someone for you, they'll show here.
            </p>
            <p className="text-[13px] text-vf-faint mt-2">You can do the same: on anyone's profile, tap "Suggest to a friend".</p>
          </div>
        )}
      </div>
    </LayoutShell>
  );
}
