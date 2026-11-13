// Component gallery (docs/destira-upgrade-prompt.md §4.7): every piece of the
// v2 design system on one page, in whichever theme is active. Development
// builds only — App.tsx never registers the route in production.
import { useState } from "react";
import { ArrowRight, Heart, MoreHorizontal, Plus, X } from "lucide-react";
import {
  EmptyState,
  IconButton,
  LoungeGlyph,
  Note,
  PageHeader,
  ResonanceGlyph,
  SearchField,
  SeatGlyph,
  SegmentedControl,
  TonightGlyph,
  TwinGlyph,
  UnderlineTabs,
  VfAvatar,
  VfButton,
  VfSkeleton,
} from "@/components/ui-vf";
import { useTheme } from "@/hooks/use-theme";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-8 border-t border-vf-line">
      <h2 className="vf-label text-vf-faint mb-5">{title}</h2>
      {children}
    </section>
  );
}

export default function DevGallery() {
  const [seg, setSeg] = useState<"all" | "matches" | "twin" | "replies">("all");
  const [tab, setTab] = useState<"liked" | "you">("liked");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const theme = useTheme();

  return (
    <div className="min-h-screen bg-vf-ink text-vf-text">
      <div className="max-w-[880px] mx-auto px-4 sm:px-8 py-10">
        <PageHeader
          eyebrow="Design system v2"
          title="Component gallery"
          subtitle="Every v2 piece, in the current theme. Switch theme to check both."
          actions={
            <VfButton variant="secondary" size="sm" onClick={() => theme.setPreference(theme.preference === "dark" ? "light" : "dark")}>
              {theme.preference === "dark" ? "Light" : "Dark"} theme
            </VfButton>
          }
        />

        <Section title="Type scale">
          <div className="space-y-3">
            <div className="vf-display">Meet people you <em>actually click with.</em></div>
            <div className="vf-h1">Page title, H1</div>
            <div className="vf-h2">Section title or a name, H2</div>
            <div className="vf-h3">Card title, H3</div>
            <p className="vf-body text-vf-soft max-w-[60ch]">Body. All reading text sits here: 16 on 24, never below 15 on a phone. Warm, direct, adult, a bit witty.</p>
            <p className="vf-small text-vf-muted">Small. Secondary lines and metadata sentences.</p>
            <div className="vf-label text-vf-faint">Label · Friday · 19:00</div>
            <div className="vf-figure text-[32px]">87 · $9.99 · 18:30</div>
          </div>
        </Section>

        <Section title="Colour meaning and elevation">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ["Ember · human action", "bg-vf-ember"],
              ["Mint · the twin only", "bg-vf-mint"],
              ["Gold · premium only", "bg-vf-gold"],
              ["Success", "bg-vf-success"],
            ].map(([label, cls]) => (
              <div key={label} className="rounded-[16px] border border-vf-line overflow-hidden">
                <div className={`h-14 ${cls}`} />
                <div className="vf-small text-vf-muted p-3">{label}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4">
            {["vf-e1", "vf-e2", "vf-e3"].map((e) => (
              <div key={e} className={`${e} rounded-[16px] bg-vf-surface border border-vf-line h-20 flex items-center justify-center vf-label text-vf-faint`}>
                {e}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap gap-3 items-center">
            <VfButton size="lg" trailing={<ArrowRight className="w-4 h-4" />}>Primary</VfButton>
            <VfButton variant="secondary">Secondary</VfButton>
            <VfButton variant="quiet">Quiet</VfButton>
            <VfButton variant="twin" leading={<TwinGlyph size={18} />}>Ask the twin</VfButton>
            <VfButton variant="premium">See Ember</VfButton>
            <VfButton variant="destructive" size="sm">Delete</VfButton>
            <VfButton size="sm" loading={loading} onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1500); }}>
              Tap to load
            </VfButton>
            <VfButton disabled>Disabled</VfButton>
          </div>
          <div className="flex gap-3 mt-5 items-center">
            <IconButton label="Pass" variant="secondary" size={52}><X className="w-6 h-6" /></IconButton>
            <IconButton label="Like" variant="primary" size={52}><Heart className="w-6 h-6" /></IconButton>
            <IconButton label="Ask the twin" variant="twin"><TwinGlyph /></IconButton>
            <IconButton label="More"><MoreHorizontal className="w-5 h-5" /></IconButton>
            <IconButton label="Add" size={36} variant="secondary"><Plus className="w-4 h-4" /></IconButton>
          </div>
        </Section>

        <Section title="Choosing">
          <SegmentedControl
            label="Show"
            value={seg}
            onChange={setSeg}
            options={[
              { value: "all", label: "All" },
              { value: "matches", label: "Matches" },
              { value: "twin", label: "Twin" },
              { value: "replies", label: "Story replies", count: 3 },
            ]}
          />
          <UnderlineTabs
            className="mt-6"
            label="Likes"
            value={tab}
            onChange={setTab}
            options={[
              { value: "liked", label: "Liked you", count: 4 },
              { value: "you", label: "You liked", count: 6 },
            ]}
          />
          <SearchField className="mt-6 max-w-[420px]" label="Search chats" value={q} onChange={setQ} />
        </Section>

        <Section title="Avatars">
          <div className="flex items-center gap-4">
            <VfAvatar size={64} name="Tendai" seed="a1" src="/brand/destira-icon-512.png" />
            <VfAvatar size={64} name="Rutendo" seed="local-candidate-15" />
            <VfAvatar size={48} name="Kuda" seed="k2" />
            <VfAvatar size={40} name="Nyasha" seed="n3" />
            <VfAvatar size={56} name="Harare Board Gamers" seed="group-1" square />
          </div>
        </Section>

        <Section title="Glyphs">
          <div className="flex gap-6 text-vf-text">
            {[
              [TwinGlyph, "Twin", "text-vf-mint"],
              [ResonanceGlyph, "Resonance", ""],
              [TonightGlyph, "Tonight's three", ""],
              [SeatGlyph, "Seat", ""],
              [LoungeGlyph, "Lounge", ""],
            ].map(([G, label, cls]) => {
              const Glyph = G as typeof TwinGlyph;
              return (
                <div key={label as string} className="flex flex-col items-center gap-2">
                  <Glyph size={28} className={cls as string} />
                  <span className="vf-small text-vf-muted">{label as string}</span>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Notes (one at a time)">
          <div className="space-y-3 max-w-[560px]">
            <Note tone="twin" eyebrow="Your twin" onDismiss={() => {}} action={{ label: "Set the boundaries", onClick: () => {} }}>
              Your twin talks to people who are deciding about you. You choose what it may say.
            </Note>
            <Note eyebrow="Profile 45%" onDismiss={() => {}} action={{ label: "Finish your profile", onClick: () => {} }}>
              A complete profile gets more likes and shows up more.
            </Note>
          </div>
        </Section>

        <Section title="Loading and empty">
          <div className="space-y-3 max-w-[420px]">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <VfSkeleton className="w-12 h-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <VfSkeleton className="h-4 w-1/3" />
                  <VfSkeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
          <EmptyState
            title="No chats yet."
            body="When you match with someone, or ask someone's twin a question, the conversation lands here."
            action={<VfButton>Go to Discover</VfButton>}
          />
        </Section>
      </div>
    </div>
  );
}
