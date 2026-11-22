import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useIncomingLikes, useSubscription } from "@/hooks/use-interactions";
import { useProfile } from "@/hooks/use-profiles";
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
  Bell,
  Hand,
  Command as CommandIcon,
} from "lucide-react";
import { lookingForOf } from "@shared/friends";
import { useActivityUnread, useNewSince } from "@/hooks/use-activity";
import { PLAN_CARDS } from "@shared/entitlements";
import { VfAvatar } from "./ui-vf";
import { TwinOrbMini } from "./twin-orb";
import { LocationPermissionModal } from "./location-permission-modal";
import { PushNudge } from "./push-nudge";
import { ProximityAlerts } from "./proximity-alerts";
import { DestiraLockup, DestiraMark } from "./brand/logo";
import { TrialBanner } from "./trial-banner";

interface LayoutShellProps {
  children: React.ReactNode;
}

export function LayoutShell({ children }: LayoutShellProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const { data: likesData } = useIncomingLikes();
  const { data: readiness } = useTwinReadiness();
  const { data: profile } = useProfile();
  const { data: sub } = useSubscription();
  // Same cache key as Profile, so this is usually already loaded.
  const { data: photos } = useQuery<any[]>({
    queryKey: ["/api/photos", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/photos/${user!.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });
  useCaptureTimezone();
  const { data: unread } = useActivityUnread(!!user);
  const { data: fresh } = useNewSince(!!user);

  if (!user) {
    return <>{children}</>;
  }

  const likesBadge = likesData?.totalCount || 0;
  const friendsOnly = lookingForOf((profile as any)?.lookingFor) === "friends";

  const navItems = [
    // `dot`: something new since you last looked (Part I). No counts, no streaks.
    // Here for friends only: the first tab is their Friends deck (Part O).
    friendsOnly
      ? { href: "/friends", icon: Hand, label: "Friends", badge: 0, dot: false }
      : { href: "/discover", icon: Search, label: "Discover", badge: 0, dot: !!fresh?.discover },
    { href: "/chats", icon: MessageCircle, label: "Chats", badge: 0, dot: false },
    { href: "/matches", icon: Heart, label: "Likes", badge: likesBadge, dot: false },
    { href: "/lounge", icon: Users, label: "Lounge", badge: 0, dot: !!fresh?.lounge },
    { href: "/events", icon: CalendarDays, label: "Events", badge: 0, dot: !!fresh?.events },
    { href: "/profile", icon: User, label: "Profile", badge: 0, dot: false },
  ];
  const unreadCount = unread?.count ?? 0;
  const bellLabel = unreadCount > 0 ? `Activity, ${unreadCount} unread` : "Activity";

  const score = readiness?.pct ?? 0;
  const remaining = readiness ? readiness.totalCount - readiness.answeredCount : 0;
  const twinLine = remaining <= 0 ? `${score}% ready` : `${score}% ready · ${remaining} to go`;
  const twinHref = remaining > 0 ? "/onboarding" : "/twin-chat";

  const myPhoto =
    (photos ?? []).find((ph: any) => ph.role === "portrait")?.photoUrl ??
    (photos ?? []).find((ph: any) => ph.isMainProfilePhoto)?.photoUrl ??
    (photos ?? [])[0]?.photoUrl ??
    profile?.coverPhotoUrl ??
    null;
  const myName = profile?.displayName || user.firstName || "You";
  const tier = (sub as any)?.tier ?? "free";
  const planName = PLAN_CARDS.find((c) => c.tier === tier)?.name ?? "Free";
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  // A section counts as active on its own sub-pages too (an event, a room).
  const isActive = (href: string) => location === href || location.startsWith(`${href}/`);

  // Rail: icons only on tablets (md, 768–1023), with labels from lg (1024),
  // a little wider from 1440 (brief section 9).
  const railLabel = "hidden lg:inline";

  return (
    <div className="min-h-dvh bg-vf-ink vf-ambient">
      <LocationPermissionModal />
      <PushNudge />
      <ProximityAlerts />

      {/* Phone header, logo centred. From md (768) the rail takes over. */}
      <header
        className="sticky top-0 z-50 md:hidden flex items-center justify-center h-14 px-4 bg-vf-ink border-b border-vf-line"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)", height: "calc(56px + env(safe-area-inset-top, 0px))" }}
      >
        <Link href="/">
          <div className="flex items-center cursor-pointer text-vf-text" data-testid="link-logo-mobile">
            <DestiraLockup orientation="horizontal" size={28} />
          </div>
        </Link>
        <Link href="/notifications">
          <span
            role="link"
            className={`absolute right-2 w-11 h-11 cursor-pointer inline-flex items-center justify-center rounded-full ${isActive("/notifications") ? "text-vf-text" : "text-vf-faint"} hover:text-vf-text`}
            style={{ bottom: "6px" }}
            aria-label={bellLabel}
            data-testid="button-bell-mobile"
          >
            <span className="relative">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-vf-ember text-vf-ink font-mono text-[9px] leading-[14px] text-center" data-testid="badge-bell-mobile">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </span>
          </span>
        </Link>
      </header>

      <div className="flex flex-col md:flex-row min-h-dvh">
        <aside
          className="hidden md:flex flex-col shrink-0 sticky top-0 h-dvh border-r border-vf-line w-[76px] lg:w-[232px] min-[1440px]:w-[264px] px-3 lg:px-[18px] py-[18px] gap-5 vf-scroll overflow-y-auto"
          aria-label="Main"
        >
          <Link href="/">
            <div className="flex items-center justify-center lg:justify-start cursor-pointer lg:px-2 text-vf-text h-10" data-testid="link-logo-desktop">
              <span className="lg:hidden"><DestiraMark size={36} /></span>
              <span className="hidden lg:inline-flex"><DestiraLockup orientation="horizontal" size={30} /></span>
            </div>
          </Link>

          <button
            onClick={() => window.dispatchEvent(new Event("vf:open-palette"))}
            className="flex items-center justify-center lg:justify-between gap-2 h-10 lg:px-3 rounded-[10px] border border-vf-line text-vf-faint hover:text-vf-text hover:border-vf-text/20 transition-colors"
            title={`Go anywhere (${isMac ? "⌘" : "Ctrl"}+K)`}
            aria-label="Go anywhere"
            data-testid="button-open-palette"
          >
            <span className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              <span className={`${railLabel} text-[13.5px]`}>Go anywhere</span>
            </span>
            <span className={`${railLabel} font-mono text-[11px] items-center gap-0.5`}>
              {isMac ? <CommandIcon className="w-3 h-3 inline" /> : "Ctrl"} K
            </span>
          </button>

          <nav className="flex-1 space-y-0.5">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={`relative flex items-center justify-center lg:justify-between gap-2 px-0 lg:px-4 h-11 rounded-xl cursor-pointer transition-colors ${
                      active ? "bg-vf-text/[0.08] text-vf-text font-medium" : "text-vf-faint hover:text-vf-text hover:bg-vf-text/[0.04]"
                    }`}
                    title={item.label}
                    aria-current={active ? "page" : undefined}
                    data-testid={`nav-${item.label.toLowerCase()}`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="relative">
                        <item.icon className="w-5 h-5 shrink-0" />
                        {item.dot && item.badge === 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-vf-ember ring-2 ring-vf-ink" aria-label="New since you last looked" data-testid={`dot-${item.label.toLowerCase()}`} />
                      )}
                      </span>
                      <span className={`${railLabel} text-[14.5px]`}>{item.label}</span>
                    </span>
                    {item.badge > 0 && (
                      <span className="absolute top-1.5 right-2 lg:static font-mono text-[10.5px] min-w-[18px] text-center px-1.5 py-0.5 rounded-full bg-vf-ember text-vf-ink">
                        {item.badge}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
            <Link href="/notifications">
              <div
                className={`relative flex items-center justify-center lg:justify-between gap-2 px-0 lg:px-4 h-11 rounded-xl cursor-pointer transition-colors ${
                  isActive("/notifications") ? "bg-vf-text/[0.08] text-vf-text font-medium" : "text-vf-faint hover:text-vf-text hover:bg-vf-text/[0.04]"
                }`}
                title={bellLabel}
                aria-label={bellLabel}
                aria-current={isActive("/notifications") ? "page" : undefined}
                data-testid="nav-activity"
              >
                <span className="flex items-center gap-3">
                  <Bell className="w-5 h-5 shrink-0" />
                  <span className={`${railLabel} text-[14.5px]`}>Activity</span>
                </span>
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-2 lg:static font-mono text-[10.5px] min-w-[18px] text-center px-1.5 py-0.5 rounded-full bg-vf-ember text-vf-ink" data-testid="badge-bell-rail">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
            </Link>
          </nav>

          <div className="flex flex-col gap-3">
            <Link href={twinHref}>
              <div
                className="flex items-center justify-center lg:justify-start gap-3 rounded-2xl lg:p-3 py-2 border border-transparent lg:border-vf-mint/20 lg:bg-gradient-to-b lg:from-vf-mint/[0.08] lg:to-transparent cursor-pointer hover:border-vf-mint/40 transition-colors"
                title={`Your twin: ${twinLine}`}
                data-testid="link-rail-twin"
              >
                <TwinOrbMini size={28} />
                <span className={`${railLabel} min-w-0`}>
                  <span className="block text-[13.5px] text-vf-text leading-tight">Your twin</span>
                  <span className="block font-mono text-[11px] text-vf-mint mt-0.5" data-testid="text-rail-twin-status">{twinLine}</span>
                </span>
              </div>
            </Link>

            <div className="border-t border-vf-line pt-3 flex flex-col lg:flex-row items-center gap-2">
              <Link href="/profile">
                <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer rounded-xl lg:px-1 py-1 hover:bg-vf-text/[0.04]" title={`${myName} · ${planName}`} data-testid="link-rail-me">
                  <VfAvatar src={myPhoto} name={myName} seed={user.id} size={36} />
                  <span className={`${railLabel} overflow-hidden`}>
                    <span className="block text-[13.5px] truncate text-vf-text">{myName}</span>
                    <span className={`block font-mono text-[11px] truncate ${tier === "ember" ? "text-vf-gold" : "text-vf-faint"}`} data-testid="text-rail-plan">{planName}</span>
                  </span>
                </div>
              </Link>
              <button
                className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-full text-vf-faint hover:text-vf-text hover:bg-vf-text/[0.06] transition-colors"
                onClick={() => logout()}
                title="Sign out"
                aria-label="Sign out"
                data-testid="button-logout-desktop"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main content — width is per-surface (each page decides its own
            reading vs. grid ceiling), not one global cap; this just keeps
            an outer sanity limit so nothing runs edge-to-edge on an
            ultra-wide display. */}
        <main className="flex-1 min-w-0 md:overflow-y-auto">
          <div
            className="max-w-[1600px] mx-auto p-4 md:p-8 lg:p-12 pb-24 md:pb-12"
            style={{ paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))", paddingRight: "max(1rem, env(safe-area-inset-right, 0px))" }}
          >
            <TrialBanner />
            {children}
          </div>
        </main>

        {/* Bottom tab bar — phone and tablet portrait (to lg, 1024) */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-vf-ink border-t border-vf-line"
          style={{
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            paddingLeft: "env(safe-area-inset-left, 0px)",
            paddingRight: "env(safe-area-inset-right, 0px)",
            height: "calc(64px + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <div className="flex justify-around items-center h-16 px-2">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={`flex flex-col items-center justify-center gap-0.5 cursor-pointer relative ${
                      active ? "text-vf-text" : "text-vf-faint"
                    }`}
                    style={{ minWidth: "52px", minHeight: "44px", paddingTop: "6px", paddingBottom: "6px" }}
                    data-testid={`tab-${item.label.toLowerCase()}`}
                  >
                    <span className="relative">
                      <item.icon className="w-5 h-5" />
                      {item.dot && item.badge === 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-vf-ember ring-2 ring-vf-ink" aria-label="New since you last looked" data-testid={`dot-${item.label.toLowerCase()}`} />
                      )}
                      {item.badge > 0 && (
                        <span className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-vf-ember text-vf-ink font-mono text-[9px] leading-[14px] text-center">
                          {item.badge}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] font-medium">{item.label}</span>
                    {active && (
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
