import { LayoutShell } from "@/components/layout-shell";
import { Button } from "@/components/ui/button";
import { Users, Lock, Coffee, Tent } from "lucide-react";

export default function Lounge() {
  return (
    <LayoutShell>
      <div className="text-center mb-12">
        <h1 className="text-4xl font-display font-bold mb-4">Serendipity Lounge</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Connect organically in interest-based groups or try anonymous chats. 
          Real identities are revealed only when both sides agree.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <GroupCard 
            icon={Coffee}
            name="Morning Coffee"
            description="For early risers who love a good brew."
            members={128}
          />
          <GroupCard 
            icon={Tent}
            name="Adventure Seekers"
            description="Hikers, travelers, and adrenaline junkies."
            members={342}
          />
          <GroupCard 
            icon={Users}
            name="Book Club"
            description="Discussing the latest sci-fi & fantasy novels."
            members={85}
          />
      </div>

      <div className="mt-16 bg-gradient-to-r from-purple-900 to-indigo-900 rounded-3xl p-8 md:p-12 text-white text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20"></div>
          
          <div className="relative z-10 max-w-xl mx-auto">
              <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Lock className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-3xl font-bold font-display mb-4">Anonymous Random Chat</h2>
              <p className="text-white/80 mb-8 text-lg">
                  Get paired with someone random. Your identity is hidden until you both choose to reveal it. Pure personality first.
              </p>
              <Button size="lg" className="bg-white text-purple-900 hover:bg-white/90 rounded-full px-8 h-14 text-lg font-bold">
                  Enter Lounge
              </Button>
          </div>
      </div>
    </LayoutShell>
  );
}

function GroupCard({ icon: Icon, name, description, members }: { icon: any, name: string, description: string, members: number }) {
    return (
        <div className="bg-white p-6 rounded-2xl border border-purple-100 shadow-sm hover:shadow-lg transition-all cursor-pointer group">
            <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                    <Icon className="w-6 h-6" />
                </div>
                <div className="text-xs font-semibold bg-gray-100 px-2 py-1 rounded-full text-gray-600">
                    {members} Online
                </div>
            </div>
            <h3 className="font-bold text-lg mb-2">{name}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
        </div>
    )
}
