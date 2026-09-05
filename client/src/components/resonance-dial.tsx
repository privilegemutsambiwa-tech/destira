interface ResonanceDialProps {
  /** 0-100 compatibility read. */
  score: number;
  /** Diameter in px. */
  size?: number;
}

// Replaces compatibility-ring.tsx (docs/redesign-handoff.md §3.2). The ring
// is no longer a flat gradient stroke — it's a breathing glow + a conic
// sweep from ember -> warn -> mint that fills only as far as the score, so a
// low score visibly reads as "mostly grey" rather than "smaller gradient".
export function ResonanceDial({ score, size = 104 }: ResonanceDialProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const filled = clamped / 100;
  const gradient =
    `conic-gradient(var(--vf-ember) 0turn, var(--vf-warn) ${(filled * 0.6).toFixed(3)}turn, ` +
    `var(--vf-mint) ${filled.toFixed(3)}turn, rgba(255,255,255,.08) ${filled.toFixed(3)}turn)`;
  const inset = Math.round(size * 0.09);
  const fontSize = Math.round(size * 0.32);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} data-testid="resonance-dial">
      <div
        className="absolute rounded-full animate-[vf-breathe_4.5s_ease-in-out_infinite]"
        style={{ inset: -inset, background: "radial-gradient(circle, rgba(255,122,87,.28), transparent 70%)" }}
      />
      <div className="absolute inset-0 rounded-full" style={{ background: gradient }} />
      <div
        className="absolute rounded-full bg-vf-surface flex items-center justify-center"
        style={{ inset }}
      >
        <span className="font-serif leading-none text-vf-text" style={{ fontSize }} data-testid="text-resonance-score">
          {clamped}
        </span>
      </div>
    </div>
  );
}
