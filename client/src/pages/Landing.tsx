import { Button } from "@/components/ui/button";
import { ArrowRight, Brain, Heart, Shield, Play } from "lucide-react";
import { motion } from "framer-motion";

const ROMANCE_IMAGES = [
  "/romance/couple-1_1.jpg",
  "/romance/couple-1_2.jpg",
  "/romance/couple-1_3.jpg",
  "/romance/couple-walk_1.jpg",
  "/romance/couple-walk_2.jpg",
];

export default function Landing() {
  const handleLogin = () => {
    window.open("/api/login", "_blank");
  };

  const handleDemo = async () => {
    try {
      await fetch("/api/demo/seed", { method: "POST" });
    } catch (e) {}
    window.open("/api/login", "_blank");
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed w-full z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <img src="/brand/logo.png" alt="VibeFlow" className="w-9 h-9 rounded-md object-cover" data-testid="img-logo" />
            <span className="font-display font-bold text-xl tracking-tight">VibeFlow</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="ghost" className="font-medium btn-press" onClick={handleLogin} data-testid="button-login">Log In</Button>
            <Button className="font-medium gradient-bg text-white rounded-full px-6 btn-press" onClick={handleLogin} data-testid="button-get-started">
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      <section className="relative pt-16 overflow-hidden">
        <div className="relative h-[85vh] min-h-[600px]">
          <img src={ROMANCE_IMAGES[0]} alt="Couple connecting" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
          <div className="absolute inset-0 flex items-center">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="max-w-2xl"
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white text-sm font-semibold mb-6">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                  </span>
                  The Future of Dating is Here
                </div>
                <h1 className="text-5xl lg:text-7xl font-display font-bold leading-[1.1] mb-6 text-white">
                  Connect deeply. <br/>
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-300 via-pink-300 to-purple-300">Beyond the swipe.</span>
                </h1>
                <p className="text-xl text-white/80 mb-8 leading-relaxed max-w-lg">
                  Stop swiping on faces. Start connecting with personalities. VibeFlow uses an AI Twin trained on your values to find your perfect match.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button size="lg" onClick={handleLogin} className="rounded-full text-lg h-14 px-8 gradient-bg text-white shadow-lg shadow-primary/25 btn-press" data-testid="button-create-twin">
                    Create Your AI Twin <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-full text-lg h-14 px-8 border-white/30 text-white bg-white/10 backdrop-blur-sm btn-press"
                    onClick={handleDemo}
                    data-testid="button-demo"
                  >
                    <Play className="mr-2 w-5 h-5" />
                    View Demo
                  </Button>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-card">
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
    <div className="bg-background p-8 rounded-md border card-lift" data-testid={`card-feature-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="w-14 h-14 bg-accent rounded-md flex items-center justify-center mb-6">
        <Icon className="w-7 h-7 text-primary" />
      </div>
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
