"use client";

import { useMemo, useState } from "react";
import type { Article } from "@/types";
import { LEAN_SCORE } from "@/lib/bias";
import { useArticleModal } from "@/components/ArticleModalProvider";
import { BiasBadge } from "@/components/ui";
import { sentimentLabel } from "@/lib/sentiment";
import { classNames, timeAgo } from "@/lib/format";

type ToneFilter = "all" | "positive" | "neutral" | "negative";

const TONE_COLOR = {
  positive: "#22c55e",
  neutral: "#94a3b8",
  negative: "#ef4444",
} as const;

const FILTERS: [ToneFilter, string][] = [
  ["all", "All"],
  ["positive", "Positive"],
  ["neutral", "Neutral"],
  ["negative", "Negative"],
];

interface Dot {
  a: Article;
  x: number;
  y: number;
  color: string;
}

/**
 * Every headline placed on the left-right spectrum, coloured by tone.
 * Tap or hover a dot to see the story; tap again to open it.
 */
export function BiasSpectrum({ articles }: { articles: Article[] }) {
  const [tone, setTone] = useState<ToneFilter>("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const { open } = useArticleModal();

  const W = 340;
  const H = 210;
  const pad = 26;
  const innerW = W - pad * 2;
  const baseY = H - 34;

  const visible = useMemo(
    () =>
      articles.filter(
        (a) =>
          a.bias !== "unknown" &&
          (tone === "all" || sentimentLabel(a.sentiment) === tone),
      ),
    [articles, tone],
  );

  const dots = useMemo(() => {
    const counts: Record<number, number> = {};
    const rows = 7;
    return visible.map((a): Dot => {
      const lean = LEAN_SCORE[a.bias];
      const n = counts[lean] ?? 0;
      counts[lean] = n + 1;
      const col = Math.floor(n / rows);
      const row = n % rows;
      // fan columns out alternately so dense leans stay readable
      const offset = (col % 2 === 0 ? 1 : -1) * Math.ceil(col / 2) * 8;
      return {
        a,
        x: pad + ((lean + 2) / 4) * innerW + offset,
        y: baseY - 10 - row * 15,
        color: TONE_COLOR[sentimentLabel(a.sentiment)],
      };
    });
  }, [visible, innerW, baseY]);

  const active = dots.find((d) => d.a.id === activeId)?.a ?? null;

  const ticks: [number, string][] = [
    [pad, "Left"],
    [pad + innerW * 0.25, "Lean L"],
    [pad + innerW * 0.5, "Center"],
    [pad + innerW * 0.75, "Lean R"],
    [pad + innerW, "Right"],
  ];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {FILTERS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => {
              setTone(id);
              setActiveId(null);
            }}
            className={classNames("chip text-[0.7rem]", tone === id && "chip-active")}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-[0.7rem] text-[var(--muted-2)]">
          {visible.length} stories
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-manipulation"
        role="img"
        aria-label="Headlines plotted across the political spectrum"
      >
        <defs>
          <linearGradient id="bs-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="50%" stopColor="#a3a3a3" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>

        <rect x={pad} y={baseY} width={innerW} height={4} rx={2} fill="url(#bs-grad)" />
        {ticks.map(([x, label]) => (
          <text key={label} x={x} y={H - 14} textAnchor="middle" fontSize={9} fill="#93a0b4">
            {label}
          </text>
        ))}

        {dots.map((d) => {
          const isActive = d.a.id === activeId;
          return (
            <g key={d.a.id}>
              {/* generous invisible hit target for touch */}
              <circle
                cx={d.x}
                cy={d.y}
                r={11}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setActiveId(d.a.id)}
                onClick={() => (isActive ? open(d.a) : setActiveId(d.a.id))}
              />
              <circle
                cx={d.x}
                cy={d.y}
                r={isActive ? 7 : 5}
                fill={d.color}
                opacity={activeId && !isActive ? 0.35 : 0.9}
                stroke={isActive ? "#fff" : "none"}
                strokeWidth={isActive ? 2 : 0}
                style={{ pointerEvents: "none", transition: "r 120ms ease" }}
              />
            </g>
          );
        })}

        {dots.length === 0 && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={11} fill="#6b7688">
            No stories match this filter
          </text>
        )}
      </svg>

      {active ? (
        <button
          onClick={() => open(active)}
          className="mt-2 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-2.5 text-left transition-colors hover:border-[var(--accent)]/50"
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <BiasBadge lean={active.bias} />
            <span className="text-xs text-[var(--muted)]">{active.source}</span>
            <span className="ml-auto text-[0.65rem] text-[var(--muted-2)]">
              {timeAgo(active.publishedAt)}
            </span>
          </div>
          <p className="font-serif text-sm leading-snug text-[var(--text)]">
            {active.title}
          </p>
          <p className="mt-1 text-[0.65rem] text-[var(--accent)]">Tap to read →</p>
        </button>
      ) : (
        <p className="mt-2 text-center text-[0.7rem] text-[var(--muted-2)]">
          Tap a dot to see the story · colour shows tone
        </p>
      )}
    </div>
  );
}
