"use client";

import type { Article } from "@/types";
import { ALL_LEANS, LEAN_LABEL, biasDistribution } from "@/lib/bias";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const LEAN_COLOR: Record<string, string> = {
  left: "#2563eb",
  "lean-left": "#60a5fa",
  center: "#a3a3a3",
  "lean-right": "#f87171",
  right: "#dc2626",
};

// How many outlets at each lean are covering the current topic — reveals
// which side of the spectrum is over/under-covering a story.
export function CoverageSpread({ articles }: { articles: Article[] }) {
  const dist = biasDistribution(articles);
  const data = ALL_LEANS.map((l) => ({
    lean: l,
    label: LEAN_LABEL[l],
    count: dist[l],
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <XAxis
          dataKey="label"
          tick={{ fill: "#93a1b5", fontSize: 10 }}
          interval={0}
        />
        <YAxis allowDecimals={false} tick={{ fill: "#93a1b5", fontSize: 10 }} />
        <Tooltip
          contentStyle={{
            background: "#141a26",
            border: "1px solid #283246",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.lean} fill={LEAN_COLOR[d.lean]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
