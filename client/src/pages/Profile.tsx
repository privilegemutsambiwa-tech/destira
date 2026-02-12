import { LayoutShell } from "@/components/layout-shell";
import { useProfile } from "@/hooks/use-profiles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Brain, Sparkles, MapPin, Edit2 } from "lucide-react";

export default function Profile() {
  const { data: profile, isLoading } = useProfile();

  if (isLoading) {
    return (
      <LayoutShell>
        <div className="h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </LayoutShell>
    );
  }

  if (!profile) {
      return (
          <LayoutShell>
              <div className="text-center mt-20">
                  <h2 className="text-2xl font-bold">Profile not found</h2>
                  <p>Please complete onboarding first.</p>
              </div>
          </LayoutShell>
      )
  }

  return (
    <LayoutShell>
      <div className="relative">
        {/* Cover / Header Area */}
        <div className="h-48 md:h-64 rounded-3xl bg-gradient-to-r from-primary to-secondary p-8 flex items-end relative overflow-hidden shadow-lg">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
          
          <div className="relative z-10 flex items-end gap-6 translate-y-12 px-4">
            <div className="w-32 h-32 md:w-40 md:h-40 rounded-3xl bg-white border-4 border-white shadow-xl flex items-center justify-center overflow-hidden">
                <span className="text-4xl md:text-6xl font-bold text-primary/20">
                    {profile.displayName?.[0] || "?"}
                </span>
            </div>
            <div className="pb-4 md:pb-6">
                <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-2">{profile.displayName}</h1>
                <div className="flex items-center gap-2 text-white/90">
                    <MapPin className="w-4 h-4" />
                    <span>San Francisco, CA</span> {/* Mock Location */}
                </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="mt-20 grid lg:grid-cols-3 gap-8">
            {/* Main Info */}
            <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-6 md:p-8 rounded-3xl border border-purple-100 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold">About Me</h2>
                        <Button variant="ghost" size="sm"><Edit2 className="w-4 h-4" /></Button>
                    </div>
                    <p className="text-muted-foreground leading-relaxed text-lg">
                        {profile.bio || "No bio yet."}
                    </p>
                </div>

                <div className="bg-white p-6 md:p-8 rounded-3xl border border-purple-100 shadow-sm">
                    <h2 className="text-xl font-bold mb-6">Personality Traits (VPP)</h2>
                    <div className="flex flex-wrap gap-3">
                        {/* Mock traits derived from VPP */}
                        <Badge variant="secondary" className="px-4 py-2 text-sm bg-purple-50 text-purple-700 hover:bg-purple-100">Introspective</Badge>
                        <Badge variant="secondary" className="px-4 py-2 text-sm bg-pink-50 text-pink-700 hover:bg-pink-100">Creative</Badge>
                        <Badge variant="secondary" className="px-4 py-2 text-sm bg-blue-50 text-blue-700 hover:bg-blue-100">Growth-Minded</Badge>
                        <Badge variant="secondary" className="px-4 py-2 text-sm bg-green-50 text-green-700 hover:bg-green-100">Empathetic</Badge>
                    </div>
                </div>
            </div>

            {/* AI Twin Status */}
            <div className="lg:col-span-1">
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white p-6 md:p-8 rounded-3xl shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-10">
                        <Brain className="w-32 h-32" />
                    </div>
                    
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-white/10 rounded-xl">
                            <Sparkles className="w-6 h-6 text-yellow-300" />
                        </div>
                        <h2 className="text-xl font-bold font-display">AI Twin Status</h2>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between text-sm mb-2 text-white/70">
                                <span>Training Level</span>
                                <span>Level 1</span>
                            </div>
                            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full w-1/3 bg-gradient-to-r from-yellow-300 to-yellow-500 rounded-full" />
                            </div>
                        </div>

                        <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                            <h3 className="font-semibold mb-2">Twin Capabilities</h3>
                            <ul className="space-y-2 text-sm text-white/70">
                                <li className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                                    Basic Conversation
                                </li>
                                <li className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                                    Value Alignment
                                </li>
                                <li className="flex items-center gap-2 opacity-50">
                                    <div className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                                    Deep Emotional Analysis
                                </li>
                            </ul>
                        </div>
                        
                        <Button className="w-full bg-white text-gray-900 hover:bg-white/90">
                            Improve Twin Accuracy
                        </Button>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </LayoutShell>
  );
}
