"use client";

import { useMemo, useState } from "react";
import type { SgpRecommendation } from "@/types";
import { PickCard } from "./PickCard";
import { DisclaimerBanner } from "@/components/layout/DisclaimerBanner";
import { calculatePayout } from "@/lib/sgp";
import { LegEdgeChart, ParlayGrowthChart } from "./SgpCharts";
import { formatMoney, formatOdds, formatPct } from "@/lib/format";

// Interactive research slip: toggle legs, set a stake, see combined odds and an
// estimated payout. Framed strictly as research/education.
export function SgpBuilder({ rec }: { rec: SgpRecommendation }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(rec.legs.map((l) => l.id)),
  );
  const [stake, setStake] = useState(10);
  const [acknowledged, setAcknowledged] = useState(false);

  const selectedLegs = rec.legs.filter((l) => selectedIds.has(l.id));
  const payout = useMemo(
    () =>
      selectedLegs.length > 0
        ? calculatePayout(stake, selectedLegs)
        : null,
    [selectedLegs, stake],
  );

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!acknowledged) {
    return (
      <div className="card space-y-3">
        <DisclaimerBanner />
        <p className="text-sm text-[var(--muted)]">
          This tool builds an illustrative multi-leg research slip from public
          stats and odds, with the reasoning and sources behind each pick. It is
          educational only — not betting advice, and no outcome is guaranteed.
        </p>
        <button
          onClick={() => setAcknowledged(true)}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-slate-900"
        >
          I understand — show the research slip
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <DisclaimerBanner />

      {/* Sticky payout summary */}
      <div className="sticky top-2 z-10 rounded-2xl border border-sky-400/40 bg-[var(--surface-2)] p-4 shadow-lg md:top-16">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--muted)]">
              {selectedLegs.length}-leg slip · combined odds
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {payout ? formatOdds(payout.americanOdds) : "—"}
            </p>
            {payout && (
              <p className="text-xs text-[var(--muted)]">
                {payout.decimalOdds.toFixed(2)}× · implied{" "}
                {formatPct(payout.impliedProbability)}
              </p>
            )}
          </div>
          <div className="text-right">
            <label className="mb-1 block text-xs text-[var(--muted)]">
              Stake ($)
            </label>
            <input
              type="number"
              min={1}
              value={stake}
              onChange={(e) => setStake(Math.max(0, Number(e.target.value)))}
              className="w-28 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-right tabular-nums"
            />
          </div>
        </div>
        {payout && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-[var(--surface)] p-2">
              <p className="text-xs text-[var(--muted)]">Est. payout</p>
              <p className="text-lg font-bold text-good tabular-nums">
                {formatMoney(payout.payout)}
              </p>
            </div>
            <div className="rounded-lg bg-[var(--surface)] p-2">
              <p className="text-xs text-[var(--muted)]">Est. profit</p>
              <p className="text-lg font-bold tabular-nums">
                {formatMoney(payout.profit)}
              </p>
            </div>
          </div>
        )}
        <p className="mt-2 text-[0.65rem] text-[var(--muted)]">
          Estimated payout is illustrative math on the listed odds, not an offer.
          No outcome is guaranteed.
        </p>
      </div>

      {selectedLegs.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="card">
            <h3 className="font-semibold">Model vs Market</h3>
            <p className="mb-3 text-xs text-[var(--muted)]">
              Each leg&apos;s heuristic model probability (accent) vs the
              odds-implied probability (grey). Accent bars longer than grey =
              positive edge.
            </p>
            <LegEdgeChart legs={selectedLegs} />
          </div>
          <div className="card">
            <h3 className="font-semibold">Payout Growth</h3>
            <p className="mb-3 text-xs text-[var(--muted)]">
              How a {formatMoney(stake)} stake&apos;s estimated return compounds
              as each leg is added.
            </p>
            <ParlayGrowthChart legs={selectedLegs} stake={stake} />
          </div>
        </div>
      )}

      <div className="grid gap-3">
        {rec.legs.map((leg) => (
          <PickCard
            key={leg.id}
            leg={leg}
            selected={selectedIds.has(leg.id)}
            onToggle={() => toggle(leg.id)}
          />
        ))}
      </div>
    </div>
  );
}
