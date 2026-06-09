"use client";

import type { Article } from "@/types";
import { LEAN_SCORE } from "@/lib/bias";

// Plots each article as a dot along a left↔right axis. Dots at the same lean
// stack vertically (beeswarm-ish). Color encodes sentiment. Touch-friendly.
export function BiasSpectrum({ articles }: { articles: Article[] }) {
  const width = 320;
  const height = 200;
  const pad = 24;
  const innerW = width - pad * 2;

  // bucket by lean score (-2..2) -> x; stack within bucket
  const counts: Record<number, number> = {};
  const dots = articles
    .filter((a) => a.bias !== "unknown")
    .map((a) => {
      const lean = LEAN_SCORE[a.bias];
      const n = counts[lean] ?? 0;
      counts[lean] = n + 1;
      const x = pad + ((lean + 2) / 4) * innerW;
      const y = height - pad - 14 - (n % 8) * 16;
      const color =
        a.sentiment > 0.15
          ? "#16a34a"
          : a.sentiment < -0.15
            ? "#dc2626"
            : "#94a3b8";
      return { x, y, color, title: a.title };
    });

  const ticks = [
    { x: pad, label: "Left" },
    { x: pad + innerW * 0.25, label: "Lean L" },
    { x: pad + innerW * 0.5, label: "Center" },
    { x: pad + innerW * 0.75, label: "Lean R" },
    { x: pad + innerW, label: "Right" },
  ];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Bias spectrum of current headlines"
    >
      <defs>
        <linearGradient id="spectrumGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="50%" stopColor="#a3a3a3" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
      </defs>
      <rect
        x={pad}
        y={height - pad - 6}
        width={innerW}
        height={4}
        rx={2}
        fill="url(#spectrumGrad)"
      />
      {ticks.map((t) => (
        <text
          key={t.label}
          x={t.x}
          y={height - 6}
          textAnchor="middle"
          fontSize={9}
          fill="#93a1b5"
        >
          {t.label}
        </text>
      ))}
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={5} fill={d.color} opacity={0.85}>
          <title>{d.title}</title>
        </circle>
      ))}
    </svg>
  );
}
