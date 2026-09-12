import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      // The one breakpoint scale for the whole app — written down here so
      // it stops being decided per-file. Tailwind's sm/md/lg/xl defaults
      // already line up with this; only 2xl is widened (1536 -> 1680) to
      // mark "large desktop", not just "slightly wider desktop".
      //   <640          phone
      //   640–767  sm   large phone
      //   768–1023 md   tablet portrait — bottom tab bar still, not the sidebar (see layout-shell.tsx)
      //   1024–1279 lg  tablet landscape / small laptop — sidebar appears here
      //   1280–1679 xl  desktop
      //   1680+    2xl  large desktop
      screens: {
        "2xl": "1680px",
      },
      borderRadius: {
        lg: "1.25rem",   /* 20px — card radius */
        md: "0.875rem",  /* 14px — button radius */
        sm: "0.25rem",   /* 4px  — small elements */
        xl: "6.25rem",   /* 100px — pill/tag radius */
        pill: "6.25rem", /* 100px — alias */
      },
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
          border: "hsl(var(--card-border) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
          border: "hsl(var(--popover-border) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
          border: "var(--primary-border)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
          border: "var(--secondary-border)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
          border: "var(--muted-border)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
          border: "var(--accent-border)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
          border: "var(--destructive-border)",
        },
        ring: "hsl(var(--ring) / <alpha-value>)",
        chart: {
          "1": "hsl(var(--chart-1) / <alpha-value>)",
          "2": "hsl(var(--chart-2) / <alpha-value>)",
          "3": "hsl(var(--chart-3) / <alpha-value>)",
          "4": "hsl(var(--chart-4) / <alpha-value>)",
          "5": "hsl(var(--chart-5) / <alpha-value>)",
        },
        sidebar: {
          ring: "hsl(var(--sidebar-ring) / <alpha-value>)",
          DEFAULT: "hsl(var(--sidebar) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)",
          border: "hsl(var(--sidebar-border) / <alpha-value>)",
        },
        "sidebar-primary": {
          DEFAULT: "hsl(var(--sidebar-primary) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-primary-foreground) / <alpha-value>)",
          border: "var(--sidebar-primary-border)",
        },
        "sidebar-accent": {
          DEFAULT: "hsl(var(--sidebar-accent) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-accent-foreground) / <alpha-value>)",
          border: "var(--sidebar-accent-border)",
        },
        status: {
          online: "rgb(34 197 94)",
          away: "rgb(245 158 11)",
          busy: "rgb(239 68 68)",
          offline: "rgb(156 163 175)",
        },
        // Destira redesign tokens (docs/redesign-handoff.md §1). Semantic,
        // not decorative — mint is the AI-twin layer and ONLY the AI-twin
        // layer; gold is Ember (premium) only. See the handoff before using
        // any of these outside their documented role.
        //
        // The `vf` prefix (and `--vf-*` CSS vars, `vf-*` classes) is historical
        // — from the pre-rename "VibeFlow" name. Kept deliberately: renaming it
        // touches hundreds of class names with zero user-visible benefit and a
        // real chance of silently dropping a colour.
        // Theme-aware: dark values live on bare :root, light overrides under
        // :root[data-theme="light"] / (prefers-color-scheme: light) — see
        // index.css. ink/gold/mint/ember/text are wrapped in hsl(.../
        // <alpha-value>) because they're used with Tailwind's /NN opacity
        // modifier in ~85 places (bg-vf-mint/20 etc) — that needs a bare HSL
        // triple behind the scenes, not a hex. The rest are never used with a
        // modifier, so they stay plain var() referencing a real color value
        // (hex, or for vf-line an already-translucent rgba — baking in its
        // own alpha, not meant to take a further modifier).
        vf: {
          ink: "hsl(var(--vf-ink) / <alpha-value>)", // page ground
          surface: "var(--vf-surface)", // primary card
          surface2: "var(--vf-surface2)", // secondary card
          line: "var(--vf-line)",
          text: "hsl(var(--vf-text) / <alpha-value>)",
          muted: "var(--vf-muted)",
          faint: "var(--vf-faint)", // 12-13px metadata only, never body copy
          ember: "hsl(var(--vf-ember) / <alpha-value>)", // human action
          emberSoft: "var(--vf-ember-soft)",
          mint: "hsl(var(--vf-mint) / <alpha-value>)", // AI-twin layer, never anything else
          gold: "hsl(var(--vf-gold) / <alpha-value>)", // Ember premium only
          warn: "var(--vf-warn)",
          soft: "var(--vf-soft)", // secondary text on dark cards (lighter than vf-muted)
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', "var(--font-sans)", "system-ui", "sans-serif"],
        serif: ['"Instrument Serif"', "serif"],
        mono: ['"DM Mono"', "monospace"],
        display: ["Inter", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
