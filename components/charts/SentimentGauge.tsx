"use client";

// Compact radial gauge for a -1..1 sentiment score. Pure SVG (no deps) so it
// renders crisply at small sizes on mobile.
export function SentimentGauge({
  score,
  size = 72,
}: {
  score: number;
  size?: number;
}) {
  const clamped = Math.max(-1, Math.min(1, score));
  // map -1..1 to angle -90..90 deg
  const angle = clamped * 90;
  const r = size / 2 - 6;
  const cx = size / 2;
  const cy = size / 2;
  const rad = ((angle - 90) * Math.PI) / 180;
  const nx = cx + r * Math.cos(rad);
  const ny = cy + r * Math.sin(rad);
  const color =
    clamped > 0.15 ? "#16a34a" : clamped < -0.15 ? "#dc2626" : "#a3a3a3";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#dc2626" />
          <stop offset="50%" stopColor="#a3a3a3" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
      </defs>
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="url(#gaugeGrad)"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <line
        x1={cx}
        y1={cy}
        x2={nx}
        y2={ny}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={4} fill={color} />
      <text
        x={cx}
        y={cy + 16}
        textAnchor="middle"
        fontSize={11}
        fill="#93a1b5"
      >
        {clamped.toFixed(2)}
      </text>
    </svg>
  );
}
