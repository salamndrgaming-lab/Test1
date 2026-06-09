"use client";

import type { Game, MarketOdds } from "@/types";
import { americanToDecimal, impliedProbability } from "@/lib/sgp";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Moneyline implied win probability per team — a quick read on favorites.
export function OddsBarChart({
  games,
  odds,
}: {
  games: Game[];
  odds: MarketOdds[];
}) {
  const byGame = new Map(games.map((g) => [g.id, g]));
  const data = odds
    .filter((o) => o.homeMoneyline !== undefined && o.awayMoneyline !== undefined)
    .flatMap((o) => {
      const g = byGame.get(o.gameId);
      if (!g) return [];
      return [
        {
          name: g.away.abbreviation,
          prob: Number(
            (impliedProbability(americanToDecimal(o.awayMoneyline!)) * 100).toFixed(1),
          ),
          fav: o.awayMoneyline! < o.homeMoneyline!,
        },
        {
          name: g.home.abbreviation,
          prob: Number(
            (impliedProbability(americanToDecimal(o.homeMoneyline!)) * 100).toFixed(1),
          ),
          fav: o.homeMoneyline! <= o.awayMoneyline!,
        },
      ];
    });

  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 28)}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 4, right: 36, bottom: 4, left: 8 }}
      >
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis
          type="category"
          dataKey="name"
          width={44}
          tick={{ fill: "#93a1b5", fontSize: 11 }}
        />
        <Tooltip
          formatter={(v: number) => [`${v}%`, "Implied win prob"]}
          contentStyle={{
            background: "#141a26",
            border: "1px solid #283246",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar dataKey="prob" radius={[0, 4, 4, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.fav ? "#38bdf8" : "#475569"} />
          ))}
          <LabelList
            dataKey="prob"
            position="right"
            formatter={(v: number) => `${v}%`}
            fill="#93a1b5"
            fontSize={11}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
