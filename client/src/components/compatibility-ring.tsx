interface CompatibilityRingProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
}

export function CompatibilityRing({ percentage, size = 64, strokeWidth = 5 }: CompatibilityRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#ringGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="ring-animate"
          style={{
            '--ring-circumference': circumference,
            '--ring-offset': offset,
          } as React.CSSProperties}
        />
        <defs>
          <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(269, 83%, 56%)" />
            <stop offset="100%" stopColor="hsl(325, 90%, 52%)" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute text-sm font-bold" data-testid="text-compatibility-value">
        {percentage}%
      </span>
    </div>
  );
}
