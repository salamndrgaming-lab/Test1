"use client";

import type { SgpLeg } from "@/types";
import { americanToDecimal, impliedProbability, legEdge } from "@/lib/sgp";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const tooltipStyle = {
  background: "#141925",
  border: "1px solid #283143",
  borderRadius: 10,
  fontSize: 12,
} as const;

function shortName(leg: SgpLeg): string {
  return leg.selection.length > 22
    ? leg.selection.slice(0, 21) + "…"
    : leg.selection;
}

/** Each leg's model probability vs odds-implied probability (the "edge"). */
export function LegEdgeChart({ legs }: { legs: SgpLeg[] }) {
  const data = legs.map((l) => {
    const implied = impliedProbability(americanToDecimal(l.americanOdds)) * 100;
    const model = l.modelProbability * 100;
    return {
      name: shortName(l),
      model: Number(model.toFixed(1)),
      implied: Number(implied.toFixed(1)),
      edge: legEdge(l),
    };
  });

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34)}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 4, right: 40, bottom: 4, left: 8 }}
        barGap={-12}
      >
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis
          type="category"
          dataKey="name"
          width={130}
          tick={{ fill: "#93a0b4", fontSize: 10 }}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, n: string) => [
            `${v}%`,
            n === "model" ? "Model" : "Implied",
          ]}
        />
        <Bar dataKey="implied" fill="#3b4458" radius={[0, 4, 4, 0]} barSize={9} />
        <Bar dataKey="model" radius={[0, 4, 4, 0]} barSize={9}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.edge >= 0 ? "var(--accent)" : "#ef4444"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** How the combined payout multiplier grows as each leg is added. */
export function ParlayGrowthChart({
  legs,
  stake,
}: {
  legs: SgpLeg[];
  stake: number;
}) {
  const data = legs.map((_, i) => {
    const cumulative = legs
      .slice(0, i + 1)
      .reduce((acc, leg) => acc * americanToDecimal(leg.americanOdds), 1);
    return {
      leg: i + 1,
      multiplier: Number(cumulative.toFixed(2)),
      payout: Number((cumulative * stake).toFixed(2)),
    };
  });

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -6 }}>
        <CartesianGrid stroke="#283143" vertical={false} />
        <XAxis
          dataKey="leg"
          tick={{ fill: "#93a0b4", fontSize: 10 }}
          label={{
            value: "legs",
            position: "insideBottomRight",
            fill: "#6b7688",
            fontSize: 10,
          }}
        />
        <YAxis tick={{ fill: "#93a0b4", fontSize: 10 }} width={44} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, n: string) =>
            n === "payout"
              ? [`$${v.toLocaleString()}`, `Payout on $${stake}`]
              : [`${v}×`, "Multiplier"]
          }
          labelFormatter={(l) => `${l} legs`}
        />
        <Line
          type="monotone"
          dataKey="payout"
          stroke="var(--accent)"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "var(--accent)" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
