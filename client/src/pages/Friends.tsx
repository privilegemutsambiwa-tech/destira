// Destira Friends (docs/destira-3-upgrade-prompt.md Part O1): a deck of people
// here for friends, any gender, never romantic. "Wave" is the Friends side's
// like; two waves and you can chat (in Chats → Friends).
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Hand, Loader2, MapPin, MessageCircle, Users, X } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { VfAvatar } from "@/components/ui-vf";
import { useToast } from "@/hooks/use-toast";
import { useProfile, useUpdateProfile } from "@/hooks/use-profiles";
import { lookingForOf, type FriendCard } from "@shared/friends";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";

type Deck = { on: boolean; cards: FriendCard[] };

async function post(url: string) {
  const res = await fetch(url, { method: "POST", credentials: "include" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || "Something went wrong");
  return body;
}

function Card({ c }: { c: FriendCard }) {
  const sharedSet = new Set(c.shared.map((s) => s.toLowerCase()));
  return (
    <article className="rounded-[24px] border border-vf-line overflow-hidden bg-vf-surface" data-testid={`friend-card-${c.userId}`}>
      <div className="relative aspect-[4/5] bg-vf-text/[0.04]">
        {c.photoUrl ? (
          <img src={c.photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <VfAvatar size={120} name={c.name} seed={c.userId} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 p-4 pt-16 bg-gradient-to-t from-black/70 to-transparent text-white">
          {c.wavedAtYou && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 text-black text-[12px] font-medium px-2.5 py-1 mb-2" data-testid="label-waved-at-you">
              <Hand className="w-3.5 h-3.5" /> Waved at you
            </span>
          )}
          <div className="flex items-baseline gap-2">
            <h2 className="font-serif text-[30px] leading-none">{c.name}</h2>
            {c.age != null && <span className="text-[20px] opacity-90">{c.age}</span>}
            {c.isVerified && <BadgeCheck className="w-5 h-5 self-center" aria-label="Verified" />}
          </div>
          {c.area && (
            <div className="flex items-center gap-1 text-[13.5px] opacity-90 mt-1.5">
              <MapPin className="w-3.5 h-3.5" /> {c.area}
            </div>
          )}
        </div>
      </div>
      <div className="p-4">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-vf-mint" data-testid="label-here-for-friends">
          <Users className="w-3.5 h-3.5" /> Here for friends
        </span>
        {c.bio && <p className="text-[14.5px] text-vf-text leading-[1.5] mt-2.5">{c.bio}</p>}
        {c.interests.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {c.interests.map((i) => (
              <span
                key={i}
                className={`text-[12.5px] rounded-full px-2.5 py-1 border ${sharedSet.has(i.toLowerCase()) ? "border-vf-mint/50 text-vf-mint bg-vf-mint/[0.08]" : "border-vf-line text-vf-muted"}`}
              >
                {i}
              </span>
            ))}
          </div>
        )}
        {c.shared.length > 0 && (
          <p className="text-[12.5px] text-vf-faint mt-2">You both like {c.shared.slice(0, 2).join(" and ")}.</p>
        )}
      </div>
    </article>
  );
}

export default function FriendsPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const { data, isLoading } = useQuery<Deck>({ queryKey: ["/api/friends/deck"], staleTime: 0 });
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [friendsWith, setFriendsWith] = useState<{ name: string; matchId: number } | null>(null);

  const mode = lookingForOf((profile as any)?.lookingFor);
  const cards = (data?.cards ?? []).filter((c) => !gone.has(c.userId));
  const current = cards[0];

  const act = async (kind: "wave" | "pass") => {
    if (!current || busy) return;
    setBusy(true);
    try {
      const out = await post(`/api/friends/${kind}/${current.userId}`);
      if (kind === "wave" && out.status === "friends") {
        setFriendsWith({ name: current.name, matchId: out.matchId });
        qc.invalidateQueries({ queryKey: ["/api/chat/threads"] });
      }
      setGone((g) => new Set(g).add(current.userId));
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const turnOn = async () => {
    if (!profile) return;
    await updateProfile.mutateAsync({ userId: profile.userId, data: { lookingFor: "both" } as any });
    qc.invalidateQueries({ queryKey: ["/api/friends/deck"] });
  };

  return (
    <LayoutShell>
      <div className="max-w-[460px] mx-auto" data-testid="page-friends">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className={EYEBROW}>Destira Friends</div>
            <h1 className="font-serif font-normal text-[30px] leading-[1.1] text-vf-text mt-2">Find your people</h1>
          </div>
          {mode === "both" && (
            <Link href="/discover">
              <span className="shrink-0 cursor-pointer text-[13px] text-vf-muted hover:text-vf-text underline underline-offset-2" data-testid="link-to-love">
                Back to Love
              </span>
            </Link>
          )}
        </div>
        <p className="text-[14px] text-vf-muted mt-2 leading-[1.5]">
          People nearby who want new friends. Wave at anyone you'd hang out with. If they wave back, you can chat.
        </p>

        {friendsWith && (
          <div className="mt-5 rounded-2xl border border-vf-mint/40 bg-vf-mint/[0.08] p-4 flex items-center gap-3" data-testid="banner-new-friend">
            <Hand className="w-5 h-5 text-vf-mint shrink-0" />
            <div className="flex-1 text-[14px] text-vf-text">You and {friendsWith.name} are friends. Say hi?</div>
            <button
              onClick={() => setLocation(`/chat/${friendsWith.matchId}`)}
              className="h-9 px-3.5 rounded-full bg-vf-text text-vf-ink text-[13px] font-medium inline-flex items-center gap-1.5"
              data-testid="button-say-hi"
            >
              <MessageCircle className="w-4 h-4" /> Chat
            </button>
          </div>
        )}

        <div className="mt-6">
          {isLoading ? (
            <Loader2 className="w-6 h-6 animate-spin text-vf-faint" />
          ) : data && !data.on ? (
            <div className="rounded-2xl border border-vf-line p-5 text-center" data-testid="friends-off">
              <Users className="w-8 h-8 text-vf-faint mx-auto" />
              <p className="text-[15px] text-vf-text mt-3">Friends is off for you</p>
              <p className="text-[13px] text-vf-faint mt-1">Turn it on to meet people for friendship. Your dating side stays exactly as it is.</p>
              <button onClick={turnOn} className="mt-4 h-11 px-5 rounded-full bg-vf-ember text-vf-ink font-medium text-[14px]" data-testid="button-friends-on">
                Turn on Friends
              </button>
            </div>
          ) : current ? (
            <>
              <Card c={current} />
              <div className="grid grid-cols-2 gap-3 mt-4">
                <button
                  onClick={() => act("pass")}
                  disabled={busy}
                  className="h-12 rounded-full border border-vf-line text-vf-muted hover:text-vf-text inline-flex items-center justify-center gap-2 text-[14.5px] disabled:opacity-50"
                  data-testid="button-friend-pass"
                >
                  <X className="w-4 h-4" /> Not now
                </button>
                <button
                  onClick={() => act("wave")}
                  disabled={busy}
                  className="h-12 rounded-full bg-vf-ember text-vf-ink font-medium inline-flex items-center justify-center gap-2 text-[14.5px] disabled:opacity-50"
                  data-testid="button-friend-wave"
                >
                  <Hand className="w-4 h-4" /> {current.wavedAtYou ? "Wave back" : "Wave"}
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-vf-line p-5 text-center" data-testid="friends-empty">
              <Hand className="w-8 h-8 text-vf-faint mx-auto" />
              <p className="text-[15px] text-vf-text mt-3">That's everyone for now</p>
              <p className="text-[13px] text-vf-faint mt-1">New people join every day. Your friends are in Chats, under Friends.</p>
              <button onClick={() => setLocation("/chats?filter=friends")} className="mt-4 h-11 px-5 rounded-full border border-vf-line text-vf-text text-[14px]" data-testid="button-open-friend-chats">
                Open Friends chats
              </button>
            </div>
          )}
        </div>
      </div>
    </LayoutShell>
  );
}
