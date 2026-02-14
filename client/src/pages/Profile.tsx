import { LayoutShell } from "@/components/layout-shell";
import { useProfile } from "@/hooks/use-profiles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Brain, Sparkles, MapPin, Shield, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

export default function Profile() {
  const { data: profile, isLoading } = useProfile();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

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
          <h2 className="text-2xl font-bold">Welcome to VibeFlow!</h2>
          <p className="text-muted-foreground mt-2 mb-6">Complete your Soul-Mapping to get started.</p>
          <Button size="lg" className="rounded-full" onClick={() => setLocation("/onboarding")} data-testid="button-start-onboarding">
            Start Soul-Mapping
          </Button>
        </div>
      </LayoutShell>
    );
  }

  const personalityTraits = profile.personalityProfile && typeof profile.personalityProfile === 'object'
    ? Object.entries(profile.personalityProfile as Record<string, any>)
    : [];

  const traitColors = ["bg-purple-50 text-purple-700", "bg-pink-50 text-pink-700", "bg-blue-50 text-blue-700", "bg-green-50 text-green-700", "bg-amber-50 text-amber-700"];

  return (
    <LayoutShell>
      <div className="relative">
        <div className="h-48 md:h-64 rounded-3xl bg-gradient-to-r from-primary to-secondary p-8 flex items-end relative overflow-hidden shadow-lg">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>

          <div className="relative z-10 flex items-end gap-6 translate-y-12 px-4">
            <div className="w-32 h-32 md:w-40 md:h-40 rounded-3xl bg-white border-4 border-white shadow-xl flex items-center justify-center overflow-hidden">
              <span className="text-4xl md:text-6xl font-bold text-primary/20">
                {profile.displayName?.[0] || user?.firstName?.[0] || "?"}
              </span>
            </div>
            <div className="pb-4 md:pb-6">
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-2" data-testid="text-display-name">
                {profile.displayName || user?.firstName}
              </h1>
              <div className="flex items-center gap-3 flex-wrap">
                {profile.location && (
                  <div className="flex items-center gap-1 text-white/90">
                    <MapPin className="w-4 h-4" />
                    <span>{profile.location}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 text-white/80 text-sm">
                  {profile.isPublic ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  {profile.isPublic ? "Public" : "Private"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-20 grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-purple-100 shadow-sm">
              <h2 className="text-xl font-bold mb-4">About Me</h2>
              <p className="text-muted-foreground leading-relaxed text-lg" data-testid="text-bio">
                {profile.bio || "No bio yet."}
              </p>
            </div>

            {personalityTraits.length > 0 && (
              <div className="bg-white p-6 md:p-8 rounded-3xl border border-purple-100 shadow-sm">
                <h2 className="text-xl font-bold mb-6">Personality Traits (VPP)</h2>
                <div className="flex flex-wrap gap-3">
                  {personalityTraits.map(([trait, value], idx) => (
                    <Badge key={trait} variant="secondary" className={`px-4 py-2 text-sm capitalize ${traitColors[idx % traitColors.length]}`}>
                      {trait}: {typeof value === 'number' ? `${value}%` : String(value).slice(0, 50)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

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
                    <span>{profile.onboardingCompleted ? "Active" : "Not Started"}</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className={`h-full bg-gradient-to-r from-yellow-300 to-yellow-500 rounded-full ${profile.onboardingCompleted ? 'w-full' : 'w-0'}`} />
                  </div>
                </div>

                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                  <h3 className="font-semibold mb-2">Twin Capabilities</h3>
                  <ul className="space-y-2 text-sm text-white/70">
                    <li className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${profile.onboardingCompleted ? 'bg-green-400' : 'bg-gray-500'}`} />
                      Basic Conversation
                    </li>
                    <li className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${profile.onboardingCompleted ? 'bg-green-400' : 'bg-gray-500'}`} />
                      Value Alignment
                    </li>
                    <li className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${profile.onboardingCompleted ? 'bg-green-400' : 'bg-gray-500'}`} />
                      Deep Emotional Analysis
                    </li>
                  </ul>
                </div>

                <div className="flex items-center gap-2 text-sm text-white/60">
                  <Shield className="w-4 h-4" />
                  Your data is encrypted and secure
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </LayoutShell>
  );
}
