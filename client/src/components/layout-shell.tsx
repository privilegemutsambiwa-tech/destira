import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  Heart, 
  MessageCircle, 
  Users, 
  User, 
  LogOut, 
  Sparkles,
  Search
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
    { href: "/interviews", icon: MessageCircle, label: "Interviews" },
    { href: "/matches", icon: Heart, label: "Matches" },
    { href: "/lounge", icon: Users, label: "Lounge" },
    { href: "/profile", icon: User, label: "Profile" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-purple-50/50 to-pink-50/50">
      {/* Mobile Header */}
      <header className="sticky top-0 z-50 md:hidden bg-white/80 backdrop-blur-md border-b border-purple-100 p-4 flex items-center justify-between">
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer">
            <div className="bg-gradient-to-br from-primary to-secondary text-white p-1.5 rounded-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight">VibeFlow</span>
          </div>
        </Link>
        <Button variant="ghost" size="icon" onClick={() => logout()}>
          <LogOut className="w-5 h-5 text-muted-foreground" />
        </Button>
      </header>

      <div className="flex flex-col md:flex-row min-h-screen">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-64 bg-white border-r border-purple-100 sticky top-0 h-screen p-6">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer mb-10 px-2">
              <div className="bg-gradient-to-br from-primary to-secondary text-white p-2 rounded-xl shadow-lg shadow-primary/20">
                <Sparkles className="w-6 h-6" />
              </div>
              <span className="font-display font-bold text-2xl tracking-tight">VibeFlow</span>
            </div>
          </Link>

          <nav className="flex-1 space-y-2">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <div className={`
                    flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 cursor-pointer group
                    ${isActive 
                      ? 'bg-primary/5 text-primary font-semibold shadow-sm' 
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }
                  `}>
                    <item.icon className={`w-5 h-5 transition-colors ${isActive ? 'text-primary' : 'group-hover:text-primary'}`} />
                    <span>{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>

          <div className="pt-6 border-t border-purple-100">
            <div className="flex items-center gap-3 px-4 py-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-200 to-pink-200 flex items-center justify-center font-bold text-primary">
                {user.firstName?.[0] || user.email?.[0] || "U"}
              </div>
              <div className="overflow-hidden">
                <p className="font-medium truncate">{user.firstName || "User"}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              className="w-full justify-start gap-2 border-purple-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
              onClick={() => logout()}
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 md:overflow-y-auto">
          <div className="max-w-5xl mx-auto p-4 md:p-8 lg:p-12 pb-24 md:pb-12">
            {children}
          </div>
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-purple-100 p-2 z-50 flex justify-around items-center pb-safe">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div className={`
                  flex flex-col items-center gap-1 p-2 rounded-lg cursor-pointer transition-colors
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
