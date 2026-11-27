// The bell: everything Destira told you, grouped by day, each opening the
// screen it's about (the same links push uses). docs Part I.
import { useLocation } from "wouter";
import { PeopleWhoFit } from "@/components/suggestions";
import {
  BadgeCheck, Bell, CalendarDays, Crown, Heart, Loader2, MessageCircle, Settings as SettingsIcon, Shield, Sparkles, Gift,
} from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { useActivity, useOpenActivityItem, useReadAllActivity, type ActivityItem } from "@/hooks/use-activity";

const EYEBROW = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-vf-faint";

function iconFor(type: string) {
  if (type === "match" || type === "like" || type === "event_like") return Heart;
  if (type.startsWith("event") || type.startsWith("host_video")) return CalendarDays;
  if (type === "plan" || type === "crown") return Crown;
  if (type === "verification") return BadgeCheck;
  if (type === "proximity" || type.startsWith("twin")) return Sparkles;
  if (type === "disclosure") return Shield;
  if (type.startsWith("group") || type.startsWith("chat_request")) return MessageCircle;
  if (type.startsWith("referral")) return Gift;
  return Bell;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function dayLabel(d: Date, now = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-GB", { weekday: "long" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

const timeLabel = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

export function groupByDay(items: ActivityItem[]): { label: string; items: ActivityItem[] }[] {
  const out: { key: string; label: string; items: ActivityItem[] }[] = [];
  for (const n of items) {
    const d = new Date(n.createdAt);
    const key = dayKey(d);
    const last = out[out.length - 1];
    if (last?.key === key) last.items.push(n);
    else out.push({ key, label: dayLabel(d), items: [n] });
  }
  return out;
}

export default function NotificationsPage() {
  const [, setLocation] = useLocation();
  const { data: items, isLoading } = useActivity();
  const open = useOpenActivityItem();
  const readAll = useReadAllActivity();
  const unread = (items ?? []).filter((n) => !n.read).length;

  const go = (n: ActivityItem) => {
    if (!n.read) open.mutate(n.id);
    if (/^\/(?!\/)/.test(n.url)) setLocation(n.url);
  };

  return (
    <LayoutShell>
      <div className="max-w-[640px]" data-testid="page-activity">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className={EYEBROW}>Activity</div>
            <h1 className="font-serif font-normal text-[30px] leading-[1.1] text-vf-text mt-2">What's new for you</h1>
          </div>
          {unread > 0 && (
            <button
              onClick={() => readAll.mutate()}
              className="shrink-0 text-[13px] text-vf-muted hover:text-vf-text underline underline-offset-2"
              data-testid="button-read-all"
            >
              Mark all read
            </button>
          )}
        </div>

        {isLoading ? (
          <Loader2 className="w-6 h-6 animate-spin text-vf-faint mt-8" />
        ) : !items?.length ? (
          <div className="mt-10 text-center" data-testid="activity-empty">
            <Bell className="w-8 h-8 text-vf-faint mx-auto" />
            <p className="text-[15px] text-vf-text mt-3">Nothing yet</p>
            <p className="text-[13px] text-vf-faint mt-1">Matches, event reminders and news about your account will show up here.</p>
            <PeopleWhoFit from="/notifications" title="Start something: three people who fit" className="mt-8" />
          </div>
        ) : (
          groupByDay(items).map((g) => (
            <section key={g.label} className="mt-7" data-testid="activity-day">
              <div className={EYEBROW} data-testid="activity-day-label">{g.label}</div>
              <ul className="mt-2 rounded-2xl border border-vf-line overflow-hidden">
                {g.items.map((n) => {
                  const Icon = iconFor(n.type);
                  return (
                    <li key={n.id} className="border-b border-vf-line last:border-b-0">
                      <button
                        onClick={() => go(n)}
                        className={`w-full text-left flex items-start gap-3 px-4 py-3.5 hover:bg-vf-text/[0.04] transition-colors ${n.read ? "" : "bg-vf-ember/[0.05]"}`}
                        data-testid={`activity-item-${n.id}`}
                        data-read={n.read ? "1" : "0"}
                      >
                        <span className="mt-0.5 w-8 h-8 shrink-0 rounded-full border border-vf-line inline-flex items-center justify-center text-vf-muted">
                          <Icon className="w-4 h-4" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-baseline justify-between gap-3">
                            <span className={`text-[14.5px] leading-snug ${n.read ? "text-vf-muted" : "text-vf-text font-medium"}`}>{n.title}</span>
                            <span className="font-mono text-[11px] text-vf-faint shrink-0">{timeLabel(new Date(n.createdAt))}</span>
                          </span>
                          <span className="block text-[13px] text-vf-faint mt-0.5 leading-[1.45] line-clamp-2">{n.body}</span>
                        </span>
                        {!n.read && <span className="mt-2 w-2 h-2 shrink-0 rounded-full bg-vf-ember" aria-label="Unread" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}

        <button
          onClick={() => setLocation("/settings#notifications")}
          className="mt-8 inline-flex items-center gap-1.5 text-[13px] text-vf-muted hover:text-vf-text"
          data-testid="link-activity-settings"
        >
          <SettingsIcon className="w-4 h-4" /> Choose what you hear about
        </button>
      </div>
    </LayoutShell>
  );
}
