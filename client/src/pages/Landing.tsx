import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight, Brain, Heart, Shield, Play } from "lucide-react";
import { motion } from "framer-motion";

export default function Landing() {
  const [, setLocation] = useLocation();

  const handleDemo = async () => {
    try {
      await fetch("/api/demo/seed", { method: "POST" });
    } catch (e) {}
    setLocation("/api/login");
  };

  return (
    <div className="min-h-screen bg-white">
      <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-purple-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-br from-primary to-secondary text-white p-1.5 rounded-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight text-foreground">VibeFlow</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/api/login">
              <Button variant="ghost" className="font-medium" data-testid="button-login">Log In</Button>
            </Link>
            <Link href="/api/login">
              <Button className="font-medium bg-primary text-white rounded-full px-6" data-testid="button-get-started">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="max-w-2xl"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 border border-purple-100 text-primary text-sm font-semibold mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                The Future of Dating is Here
              </div>
              <h1 className="text-5xl lg:text-7xl font-display font-bold leading-[1.1] mb-6">
                Connect deeply. <br/>
                <span className="gradient-text">Beyond the swipe.</span>
              </h1>
              <p className="text-xl text-muted-foreground mb-8 leading-relaxed max-w-lg">
                Stop swiping on faces. Start connecting with personalities. VibeFlow uses an AI Twin trained on your values to find your perfect match.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/api/login">
                  <Button size="lg" className="rounded-full text-lg h-14 px-8 bg-primary shadow-lg shadow-primary/25 transition-all" data-testid="button-create-twin">
                    Create Your AI Twin <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </Link>
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-full text-lg h-14 px-8 border-2"
                  onClick={handleDemo}
                  data-testid="button-demo"
                >
                  <Play className="mr-2 w-5 h-5" />
                  View Demo
                </Button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative lg:h-[600px] w-full flex items-center justify-center"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-purple-200/50 to-pink-200/50 rounded-full blur-3xl opacity-50" />
              <div className="relative z-10 w-full max-w-md aspect-square bg-gradient-to-tr from-primary to-secondary rounded-[2rem] shadow-2xl p-8 flex items-center justify-center transform rotate-3">
                <div className="absolute inset-0 bg-white/10 backdrop-blur-sm rounded-[2rem]" />
                <div className="relative text-white text-center">
                  <Brain className="w-32 h-32 mx-auto mb-6 text-white/90" />
                  <h3 className="text-3xl font-display font-bold mb-2">AI Twin</h3>
                  <p className="text-white/80">Analysis complete. <br/> 98% Compatibility found.</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-5xl font-display font-bold mb-6">Built for meaningful connections</h2>
            <p className="text-lg text-muted-foreground">We replaced superficial swiping with deep personality mapping to help you find someone who truly gets you.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={Brain}
              title="Soul-Mapping"
              description="Our conversational interview builds a comprehensive vector profile of your personality, values, and goals."
            />
            <FeatureCard
              icon={Shield}
              title="The Vibe Check"
              description="Interview a match's AI Twin before you even say hello. Validate compatibility safely without the awkward small talk."
            />
            <FeatureCard
              icon={Heart}
              title="Deep Matching"
              description="Our algorithm doesn't just match keywords. It understands emotional intelligence, communication style, and long-term vision."
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <div className="bg-white p-8 rounded-3xl border border-purple-100 shadow-sm group" data-testid={`card-feature-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center mb-6">
        <Icon className="w-7 h-7 text-primary" />
      </div>
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
