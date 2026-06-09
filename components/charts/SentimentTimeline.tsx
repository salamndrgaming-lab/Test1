"use client";

import type { Article } from "@/types";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";

// Average sentiment bucketed by hour-of-publish — shows the mood of the news
// cycle over time (good vs bad).
export function SentimentTimeline({ articles }: { articles: Article[] }) {
  // Bucket relative to the most recent article (pure — no Date.now in render).
  const latest = articles.reduce(
    (max, a) => Math.max(max, +new Date(a.publishedAt)),
    0,
  );
  const buckets = new Map<number, { sum: number; n: number }>();
  for (const a of articles) {
    const h = Math.round((latest - +new Date(a.publishedAt)) / 3600_000);
    const b = buckets.get(h) ?? { sum: 0, n: 0 };
    b.sum += a.sentiment;
    b.n += 1;
    buckets.set(h, b);
  }
  const data = [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([h, v]) => ({
      label: h <= 0 ? "latest" : `-${h}h`,
      sentiment: Number((v.sum / v.n).toFixed(2)),
    }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16a34a" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={{ fill: "#93a1b5", fontSize: 10 }} />
        <YAxis domain={[-1, 1]} tick={{ fill: "#93a1b5", fontSize: 10 }} />
        <ReferenceLine y={0} stroke="#283246" />
        <Tooltip
          contentStyle={{
            background: "#141a26",
            border: "1px solid #283246",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey="sentiment"
          stroke="#38bdf8"
          fill="url(#sentGrad)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
