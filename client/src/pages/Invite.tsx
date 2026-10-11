// Invite friends: one place for the referral link, what it earns ("you both
// get a free week"), who has joined, and the three ways to send it — a
// WhatsApp message, a Status card, or a copied link. Profile's nudge and
// Settings' invite row both lead here.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MessageCircle, ImageIcon, Link2 } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { useProfile } from "@/hooks/use-profiles";
import { useToast } from "@/hooks/use-toast";
import { shareStatusCard, logShare } from "@/lib/status-card";

interface ReferralSummary {
  code: string;
  url: string;
  counts: { pending: number; qualified: number; rewarded: number };
  viewsEarned: number;
  daysEarned: number;
  rewardDays: number;
  paidRewardViews: number;
  monthlyCap: number;
  friends: { firstName: string; status: "setting_up" | "joined"; joinedAt: string | null }[];
}

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em]";

export default function Invite() {
  const { toast } = useToast();
  const { data: me } = useProfile();
  const { data, isLoading } = useQuery<ReferralSummary>({ queryKey: ["/api/referrals/me"] });
  const [making, setMaking] = useState(false);

  const first = (me?.displayName || "").trim().split(/\s+/)[0];
  const weeks = data ? Math.floor(data.daysEarned / 7) : 0;
  const message = data
    ? `I'm on Destira. Your AI twin meets someone's twin first, so you skip the awkward part. Join with my link and we both get a free week: ${data.url}`
    : "";

  const sendWhatsApp = () => {
    if (!data) return;
    logShare("invite", "link");
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  const copy = async () => {
    if (!data) return;
    logShare("invite", "link");
    try {
      await navigator.clipboard.writeText(data.url);
      toast({ title: "Invite link copied" });
    } catch {
      toast({ title: "Couldn't copy", description: data.url });
    }
  };

  const statusCard = async () => {
    if (!data) return;
    setMaking(true);
    try {
      const url = `${data.url}&utm_source=status&utm_content=invite`;
      const outcome = await shareStatusCard(
        {
          eyebrow: first ? `${first} is on Destira` : "Come find your person",
          title: "Let your twin say hello first.",
          lines: [
            "Your AI twin meets theirs before you do.",
            `Join with my code and we both get a free week.`,
          ],
          footer: `Code ${data.code}`,
          imageUrl: null,
        },
        `Join me on Destira, we both get a free week: ${url}`,
        "destira-invite.png",
      );
      if (outcome !== "cancelled") logShare("invite", "status_card");
      if (outcome === "downloaded") {
        toast({ title: "Card saved", description: "Post it as your Status. The link is copied for the caption." });
      }
    } catch {
      toast({ title: "Couldn't make the card", variant: "destructive" });
    } finally {
      setMaking(false);
    }
  };

  return (
    <LayoutShell>
      <div className="max-w-xl mx-auto flex flex-col gap-7 pb-10" data-testid="page-invite">
        <div>
          <div className={`${EYEBROW} text-vf-faint`}>Bring your people</div>
          <h1 className="font-serif font-normal mt-3 text-[clamp(30px,6vw,42px)] leading-[1.06] tracking-[-0.02em] text-vf-text">
            Invite a friend. You both get a free week.
          </h1>
          <p className="text-[14.5px] text-vf-muted leading-[1.6] mt-3">
            When someone joins with your link and finishes setting up, you each get an extra week of your
            trial, or a week of Spark if you're on Free. On a paid plan you get{" "}
            {data?.paidRewardViews ?? 20} extra profile views instead. It never buys a match.
          </p>
        </div>

        {isLoading || !data ? (
          <div className="flex items-center gap-2 text-[14px] text-vf-muted py-6">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading your invite…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[18px] border border-vf-line bg-vf-surface2 p-4">
                <div className="font-serif text-[34px] leading-none text-vf-text" data-testid="text-friends-joined">
                  {data.friends.length}
                </div>
                <div className="text-[12.5px] text-vf-muted mt-1.5">{data.friends.length === 1 ? "friend joined" : "friends joined"}</div>
              </div>
              <div className="rounded-[18px] border border-vf-line bg-vf-surface2 p-4">
                <div className="font-serif text-[34px] leading-none text-vf-text" data-testid="text-weeks-earned">
                  {weeks}
                </div>
                <div className="text-[12.5px] text-vf-muted mt-1.5">{weeks === 1 ? "free week earned" : "free weeks earned"}</div>
              </div>
            </div>

            {data.viewsEarned > 0 && (
              <p className="text-[12.5px] text-vf-muted -mt-3" data-testid="text-views-earned">
                Plus {data.viewsEarned} profile views earned from invites.
              </p>
            )}

            <div className="flex flex-col gap-2.5">
              <button
                onClick={sendWhatsApp}
                className="h-12 rounded-full bg-vf-ember text-vf-ink font-semibold text-[15px] btn-press inline-flex items-center justify-center gap-2 hover:bg-[var(--vf-ember-soft)] transition-colors"
                data-testid="button-invite-whatsapp"
              >
                <MessageCircle className="w-4 h-4" /> Send on WhatsApp
              </button>
              <button
                onClick={statusCard}
                disabled={making}
                className="h-12 rounded-full border border-vf-line text-vf-text font-semibold text-[15px] btn-press inline-flex items-center justify-center gap-2 hover:border-vf-text/25 transition-colors disabled:opacity-60"
                data-testid="button-invite-status"
              >
                {making ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                Post to your Status
              </button>
              <button
                onClick={copy}
                className="h-11 rounded-full text-vf-muted hover:text-vf-text text-[14px] inline-flex items-center justify-center gap-2 transition-colors"
                data-testid="button-invite-copy"
              >
                <Link2 className="w-4 h-4" /> Copy link
              </button>
            </div>

            <div className="rounded-[14px] border border-vf-line bg-vf-surface2 px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-[13px] text-vf-muted">Your code</span>
              <span className="font-mono text-[14px] tracking-[0.14em] text-vf-text select-all" data-testid="text-invite-code">
                {data.code}
              </span>
            </div>

            {data.friends.length > 0 && (
              <div>
                <div className={`${EYEBROW} text-vf-faint mb-2.5`}>Who's joined</div>
                <ul className="flex flex-col divide-y divide-vf-line rounded-[18px] border border-vf-line" data-testid="list-invited-friends">
                  {data.friends.map((f, i) => (
                    <li key={i} className="flex items-center justify-between px-4 py-3">
                      <span className="text-[14.5px] text-vf-text">{f.firstName}</span>
                      <span className={`text-[12.5px] ${f.status === "joined" ? "text-vf-ember" : "text-vf-muted"}`}>
                        {f.status === "joined" ? "You both got a week" : "Still setting up"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[12px] text-vf-faint leading-[1.55]">
              Up to {data.monthlyCap} invite rewards a month. Your friend's reward only arrives once they've
              finished setting up their twin.
            </p>
          </>
        )}
      </div>
    </LayoutShell>
  );
}
