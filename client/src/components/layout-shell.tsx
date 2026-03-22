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
import { Button } from "@/components/ui/button";

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
    <div className="min-h-screen bg-background">
      {/* Mobile header — centered logo only */}
      <header className="sticky top-0 z-50 md:hidden bg-white border-b" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div className="flex items-center justify-center h-14 relative px-4">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer" data-testid="link-logo-mobile">
              <img src="/brand/logo.png" alt="VibeFlow" className="w-8 h-8 rounded-lg object-cover" />
              <span className="font-display font-bold text-lg tracking-tight" style={{ color: "#1F2937" }}>VibeFlow</span>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-3 h-9 w-9"
            onClick={() => logout()}
            data-testid="button-logout-mobile"
          >
            <LogOut className="w-4 h-4 text-muted-foreground" />
          </Button>
        </div>
      </header>

      <div className="flex flex-col md:flex-row min-h-screen">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col w-64 bg-white border-r sticky top-0 h-screen p-6" style={{ boxShadow: "2px 0 8px rgba(0,0,0,0.04)" }}>
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer mb-8 px-2" data-testid="link-logo-desktop">
              <img src="/brand/logo.png" alt="VibeFlow" className="w-10 h-10 rounded-xl object-cover" />
              <span className="font-display font-bold text-xl tracking-tight" style={{ color: "#1F2937" }}>VibeFlow</span>
            </div>
          </Link>

          <nav className="flex-1 space-y-1">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors cursor-pointer ${
                      isActive
                        ? "font-semibold"
                        : "text-[#6B7280] hover:bg-[#F3F4F6]"
                    }`}
                    style={isActive ? { background: "#EDE9FE", color: "#7C3AED" } : {}}
                    data-testid={`nav-${item.label.toLowerCase()}`}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>

          <div className="pt-6 border-t">
            <div className="flex items-center gap-3 px-4 py-3 mb-3">
              <div
                className="w-10 h-10 rounded-full gradient-bg flex items-center justify-center font-bold text-white text-sm shrink-0"
              >
                {user.firstName?.[0] || user.email?.[0] || "U"}
              </div>
              <div className="overflow-hidden flex-1">
                <p className="font-medium truncate text-sm text-[#1F2937]">{user.firstName || "User"}</p>
                <p className="text-xs text-[#6B7280] truncate">{user.email}</p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 btn-press rounded-lg"
              onClick={() => logout()}
              data-testid="button-logout-desktop"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
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
          className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-white"
          style={{ boxShadow: "0 -2px 8px rgba(0,0,0,0.06)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="flex justify-around items-center h-16">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                    style={{ color: isActive ? "#7C3AED" : "#9CA3AF" }}
                    data-testid={`tab-${item.label.toLowerCase()}`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="text-[10px] font-medium">{item.label}</span>
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
