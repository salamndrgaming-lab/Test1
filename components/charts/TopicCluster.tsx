"use client";

import { useMemo } from "react";
import * as d3 from "d3";
import type { Article } from "@/types";

const STOP = new Set([
  "the","a","an","and","or","of","to","in","for","on","with","as","at","by",
  "from","is","are","was","were","be","new","after","over","amid","into","out",
  "this","that","says","say","could","will","has","have","its","it","up","down",
  "more","than","not","no","but","who","what","how","why","you","your",
]);

interface WordNode {
  word?: string;
  value?: number;
  children?: WordNode[];
}

// Bubble pack of the most frequent headline keywords — clusters the news cycle
// into its dominant topics. Bubble size = frequency.
export function TopicCluster({ articles }: { articles: Article[] }) {
  const nodes = useMemo(() => {
    const freq = new Map<string, number>();
    for (const a of articles) {
      const words = a.title.toLowerCase().match(/[a-z]{4,}/g) ?? [];
      for (const w of words) {
        if (STOP.has(w)) continue;
        freq.set(w, (freq.get(w) ?? 0) + 1);
      }
    }
    const leaves: WordNode[] = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18)
      .map(([word, value]) => ({ word, value }));

    const size = 320;
    const root = d3
      .hierarchy<WordNode>({ children: leaves } as WordNode)
      .sum((d) => d.value ?? 0);
    const packed = d3.pack<WordNode>().size([size, size]).padding(4)(root);
    return packed.leaves().map((leaf) => ({
      x: leaf.x,
      y: leaf.y,
      r: leaf.r,
      word: leaf.data.word ?? "",
      value: leaf.data.value ?? 0,
    }));
  }, [articles]);

  const palette = ["#38bdf8", "#818cf8", "#34d399", "#fbbf24", "#f472b6"];

  return (
    <svg viewBox="0 0 320 320" className="h-auto w-full" role="img" aria-label="Topic clusters">
      {nodes.map((n, i) => (
        <g key={n.word} transform={`translate(${n.x},${n.y})`}>
          <circle r={n.r} fill={palette[i % palette.length]} opacity={0.25} />
          <circle r={n.r} fill="none" stroke={palette[i % palette.length]} strokeWidth={1.5} />
          {n.r > 16 && (
            <text
              textAnchor="middle"
              dy="0.32em"
              fontSize={Math.min(13, n.r / 2.2)}
              fill="#e7ecf3"
            >
              {n.word}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
