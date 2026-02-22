import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  Heart, 
  MessageCircle, 
  Users, 
  User, 
  LogOut, 
  Search,
  ChevronLeft,
  ChevronRight
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
      <header className="sticky top-0 z-50 md:hidden bg-background/80 backdrop-blur-md border-b p-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => window.history.back()}
            data-testid="button-nav-back"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => window.history.forward()}
            data-testid="button-nav-forward"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer" data-testid="link-logo-mobile">
            <img src="/brand/logo.png" alt="VibeFlow" className="w-8 h-8 rounded-md object-cover" />
            <span className="font-display font-bold text-lg tracking-tight">VibeFlow</span>
          </div>
        </Link>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => logout()} data-testid="button-logout-mobile">
          <LogOut className="w-5 h-5 text-muted-foreground" />
        </Button>
      </header>

      <div className="flex flex-col md:flex-row min-h-screen">
        <aside className="hidden md:flex flex-col w-64 bg-card border-r sticky top-0 h-screen p-6">
          <div className="flex items-center justify-between mb-6">
            <Link href="/">
              <div className="flex items-center gap-3 cursor-pointer px-2" data-testid="link-logo-desktop">
                <img src="/brand/logo.png" alt="VibeFlow" className="w-10 h-10 rounded-md object-cover" />
                <span className="font-display font-bold text-2xl tracking-tight">VibeFlow</span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-1 px-2 mb-6">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={() => window.history.back()}
              data-testid="button-nav-back-desktop"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={() => window.history.forward()}
              data-testid="button-nav-forward-desktop"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <nav className="flex-1 space-y-1">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <div className={`
                    flex items-center gap-3 px-4 py-3 rounded-md transition-colors cursor-pointer
                    ${isActive 
                      ? 'bg-accent text-accent-foreground font-semibold' 
                      : 'text-muted-foreground hover:bg-accent/50'
                    }
                  `}>
                    <item.icon className={`w-5 h-5 ${isActive ? 'text-primary' : ''}`} />
                    <span>{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>

          <div className="pt-6 border-t">
            <div className="flex items-center gap-3 px-4 py-3 mb-4">
              <div className="w-10 h-10 rounded-full gradient-bg flex items-center justify-center font-bold text-white text-sm">
                {user.firstName?.[0] || user.email?.[0] || "U"}
              </div>
              <div className="overflow-hidden">
                <p className="font-medium truncate text-sm">{user.firstName || "User"}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              className="w-full justify-start gap-2 btn-press"
              onClick={() => logout()}
              data-testid="button-logout-desktop"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>
        </aside>

        <main className="flex-1 md:overflow-y-auto">
          <div className="max-w-5xl mx-auto p-4 md:p-8 lg:p-12 pb-24 md:pb-12">
            {children}
          </div>
        </main>

        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t p-2 z-50 flex justify-around items-center pb-safe">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div className={`
                  flex flex-col items-center gap-1 p-2 rounded-md cursor-pointer transition-colors
                  ${isActive ? 'text-primary' : 'text-muted-foreground'}
                `}>
                  <item.icon className="w-6 h-6" />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
