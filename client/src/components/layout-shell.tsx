import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  Heart,
  MessageCircle,
  Users,
  User,
  LogOut,
  Search,
} from "lucide-react";

interface LayoutShellProps {
  children: React.ReactNode;
}

export function LayoutShell({ children }: LayoutShellProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  if (!user) {
    return <>{children}</>;
  }

  const navItems = [
    { href: "/discover", icon: Search, label: "Discover" },
    { href: "/interviews", icon: MessageCircle, label: "Chat" },
    { href: "/matches", icon: Heart, label: "Likes" },
    { href: "/lounge", icon: Users, label: "Lounge" },
    { href: "/profile", icon: User, label: "Profile" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "#0F0F14" }}>
      {/* Mobile header — logo centered */}
      <header
        className="sticky top-0 z-50 md:hidden flex items-center justify-center h-14 px-4"
        style={{ background: "#0F0F14", borderBottom: "1px solid #2E2E42" }}
      >
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer" data-testid="link-logo-mobile">
            <img src="/brand/logo.png" alt="VibeFlow" className="w-8 h-8 rounded-lg object-cover" />
            <span
              className="font-bold text-lg tracking-tight"
              style={{ color: "#FFFFFF" }}
            >
              VibeFlow
            </span>
          </div>
        </Link>
      </header>

      <div className="flex flex-col md:flex-row min-h-screen">
        {/* Desktop sidebar */}
        <aside
          className="hidden md:flex flex-col w-64 sticky top-0 h-screen p-6"
          style={{ background: "#1A1A24", borderRight: "1px solid #2E2E42" }}
        >
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer mb-8 px-2" data-testid="link-logo-desktop">
              <img src="/brand/logo.png" alt="VibeFlow" className="w-10 h-10 rounded-xl object-cover" />
              <span
                className="font-bold text-xl tracking-tight text-white"
              >
                VibeFlow
              </span>
            </div>
          </Link>

          <nav className="flex-1 space-y-1">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all"
                    style={
                      isActive
                        ? {
                            background: "rgba(124,58,237,0.15)",
                            color: "#FFFFFF",
                            fontWeight: 600,
                          }
                        : {
                            color: "#9090A8",
                          }
                    }
                    data-testid={`nav-${item.label.toLowerCase()}`}
                  >
                    <item.icon
                      className="w-5 h-5 shrink-0"
                      style={isActive ? { color: "#7C3AED" } : {}}
                    />
                    <span>{item.label}</span>
                    {isActive && (
                      <div
                        className="ml-auto w-1 h-5 rounded-full"
                        style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)" }}
                      />
                    )}
                  </div>
                </Link>
              );
            })}
          </nav>

          <div style={{ borderTop: "1px solid #2E2E42", paddingTop: "24px" }}>
            <div className="flex items-center gap-3 px-4 py-3 mb-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm shrink-0"
                style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)" }}
              >
                {user.firstName?.[0] || user.email?.[0] || "U"}
              </div>
              <div className="overflow-hidden flex-1">
                <p className="font-medium truncate text-sm text-white">{user.firstName || "User"}</p>
                <p className="text-xs truncate" style={{ color: "#9090A8" }}>{user.email}</p>
              </div>
            </div>
            <button
              className="w-full flex items-center justify-start gap-2 px-4 py-3 rounded-xl transition-all btn-press text-sm font-medium"
              style={{ color: "#9090A8", border: "1px solid #2E2E42" }}
              onClick={() => logout()}
              data-testid="button-logout-desktop"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 md:overflow-y-auto">
          <div className="max-w-5xl mx-auto p-4 md:p-8 lg:p-12 pb-24 md:pb-12">
            {children}
          </div>
        </main>

        {/* Mobile bottom tab bar — 64px, dark, gradient underline active */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 z-50"
          style={{
            background: "#0F0F14",
            borderTop: "1px solid #2E2E42",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            height: "64px",
          }}
        >
          <div className="flex justify-around items-center h-full px-2">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className="flex flex-col items-center justify-center gap-0.5 cursor-pointer relative"
                    style={{
                      color: isActive ? "#FFFFFF" : "#9090A8",
                      minWidth: "52px",
                      paddingTop: "6px",
                      paddingBottom: "6px",
                    }}
                    data-testid={`tab-${item.label.toLowerCase()}`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span style={{ fontSize: "10px", fontWeight: 500 }}>{item.label}</span>
                    {isActive && (
                      <div
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full"
                        style={{
                          width: "24px",
                          height: "2px",
                          background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                        }}
                      />
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
