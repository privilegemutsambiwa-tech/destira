import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useIncomingLikes } from "@/hooks/use-interactions";
import { useTwinReadiness } from "@/hooks/use-onboarding";
import { useCaptureTimezone } from "@/hooks/use-profiles";
import {
  Heart,
  MessageCircle,
  Users,
  User,
  LogOut,
  Search,
  CalendarDays,
} from "lucide-react";
import { LocationPermissionModal } from "./location-permission-modal";
import { ProximityAlerts } from "./proximity-alerts";
import { VibeFlowLockup } from "./brand/logo";

interface LayoutShellProps {
  children: React.ReactNode;
}

export function LayoutShell({ children }: LayoutShellProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const { data: likesData } = useIncomingLikes();
  const { data: readiness } = useTwinReadiness();
  useCaptureTimezone();

  if (!user) {
    return <>{children}</>;
  }

  const likesBadge = likesData?.totalCount || 0;

  const navItems = [
    { href: "/discover", icon: Search, label: "Discover", badge: 0 },
    { href: "/interviews", icon: MessageCircle, label: "Chat", badge: 0 },
    { href: "/matches", icon: Heart, label: "Likes", badge: likesBadge },
    { href: "/lounge", icon: Users, label: "Lounge", badge: 0 },
    { href: "/events", icon: CalendarDays, label: "Events", badge: 0 },
    { href: "/profile", icon: User, label: "Profile", badge: 0 },
  ];

  const score = readiness?.pct ?? 0;
  const remaining = readiness ? readiness.totalCount - readiness.answeredCount : 0;
  const readinessCopy =
    remaining <= 0
      ? "Every question answered — your twin has the full picture."
      : `Answer ${remaining === 1 ? "one more" : `${remaining} more`} — your twin gets sharper.`;

  return (
    <div className="min-h-screen bg-vf-ink">
      <LocationPermissionModal />
      <ProximityAlerts />

      {/* Mobile header — logo centered */}
      <header className="sticky top-0 z-50 md:hidden flex items-center justify-center h-14 px-4 bg-vf-ink border-b border-vf-line">
        <Link href="/">
          <div className="flex items-center cursor-pointer text-vf-text" data-testid="link-logo-mobile">
            <VibeFlowLockup orientation="horizontal" size={28} />
          </div>
        </Link>
      </header>

      <div className="flex flex-col md:flex-row min-h-screen">
        {/* Desktop rail */}
        <aside className="hidden md:flex flex-col w-[216px] shrink-0 sticky top-0 h-screen p-[18px] gap-[26px] border-r border-vf-line">
          <Link href="/">
            <div className="flex items-center gap-2.5 cursor-pointer px-2 text-vf-text" data-testid="link-logo-desktop">
              <VibeFlowLockup orientation="horizontal" size={30} />
              <span
                className="w-[7px] h-[7px] rounded-full bg-vf-mint animate-[vf-pulse_2.6s_ease-in-out_infinite] shrink-0"
                style={{ boxShadow: "0 0 10px var(--vf-mint)" }}
              />
            </div>
          </Link>

          <nav className="flex-1 space-y-0.5">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={`flex items-center justify-between gap-2 px-4 py-3 rounded-xl cursor-pointer transition-colors ${
                      isActive ? "bg-white/[0.08] text-vf-text font-medium" : "text-vf-faint hover:text-vf-text"
                    }`}
                    data-testid={`nav-${item.label.toLowerCase()}`}
                  >
                    <span className="flex items-center gap-3">
                      <item.icon className="w-5 h-5 shrink-0" />
                      <span className="text-[14.5px]">{item.label}</span>
                    </span>
                    {item.badge > 0 && (
                      <span className="font-mono text-[10.5px] min-w-[18px] text-center px-1.5 py-0.5 rounded-full bg-vf-ember text-vf-ink">
                        {item.badge}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </nav>

          <div className="flex flex-col gap-3.5">
            <div className="rounded-2xl p-3.5 border border-vf-mint/20 bg-gradient-to-b from-vf-mint/[0.09] to-transparent">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-vf-mint mb-1.5">
                twin readiness
              </div>
              <div className="font-serif text-[26px] leading-none text-vf-text">
                {score}
                <span className="text-[14px] text-vf-muted">%</span>
              </div>
              <div className="h-1 rounded-full bg-white/10 my-2.5 overflow-hidden">
                <div className="h-full bg-vf-mint" style={{ width: `${score}%` }} />
              </div>
              {remaining > 0 ? (
                <Link href="/onboarding">
                  <a className="text-[12px] text-vf-mint hover:text-vf-text leading-snug transition-colors" data-testid="link-readiness-next">
                    {readinessCopy}
                  </a>
                </Link>
              ) : (
                <div className="text-[12px] text-vf-muted leading-snug">{readinessCopy}</div>
              )}
            </div>

            <div className="border-t border-vf-line pt-3.5">
              <div className="flex items-center gap-3 px-1 pb-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-serif text-vf-ink text-sm shrink-0 bg-vf-mint">
                  {user.firstName?.[0] || user.email?.[0] || "U"}
                </div>
                <div className="overflow-hidden flex-1">
                  <p className="text-[13.5px] truncate text-vf-text">{user.firstName || "User"}</p>
                  <p className="text-[11.5px] truncate text-vf-faint">{user.email}</p>
                </div>
              </div>
              <button
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13px] text-vf-faint border border-vf-line hover:text-vf-text hover:border-white/20 transition-colors"
                onClick={() => logout()}
                data-testid="button-logout-desktop"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 md:overflow-y-auto">
          <div className="max-w-5xl mx-auto p-4 md:p-8 lg:p-12 pb-24 md:pb-12">
            {children}
          </div>
        </main>

        {/* Mobile bottom tab bar */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-vf-ink border-t border-vf-line"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)", height: "64px" }}
        >
          <div className="flex justify-around items-center h-full px-2">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={`flex flex-col items-center justify-center gap-0.5 cursor-pointer relative ${
                      isActive ? "text-vf-text" : "text-vf-faint"
                    }`}
                    style={{ minWidth: "52px", minHeight: "44px", paddingTop: "6px", paddingBottom: "6px" }}
                    data-testid={`tab-${item.label.toLowerCase()}`}
                  >
                    <span className="relative">
                      <item.icon className="w-5 h-5" />
                      {item.badge > 0 && (
                        <span className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-vf-ember text-vf-ink font-mono text-[9px] leading-[14px] text-center">
                          {item.badge}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] font-medium">{item.label}</span>
                    {isActive && (
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full w-6 h-0.5 bg-vf-ember" />
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
