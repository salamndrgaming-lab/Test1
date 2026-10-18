"use client";

import { useEffect, useMemo, useState } from "react";
import type { SgpRecommendation } from "@/types";
import { PickCard } from "./PickCard";
import { DisclaimerBanner } from "@/components/layout/DisclaimerBanner";
import { calculatePayout } from "@/lib/sgp";
import { usePredictions } from "@/lib/usePredictions";
import { LegEdgeChart, ParlayGrowthChart } from "./SgpCharts";
import { formatMoney, formatOdds, formatPct, classNames } from "@/lib/format";

// Interactive research slip: toggle legs, set a stake, see combined odds and an
// estimated payout. Framed strictly as research/education.
export function SgpBuilder({ rec }: { rec: SgpRecommendation }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(rec.legs.map((l) => l.id)),
  );
  const [stake, setStake] = useState(10);
  const [acknowledged, setAcknowledged] = useState(false);
  const { record } = usePredictions();

  // Log every pick the model shows, so it can be graded once games finish.
  const legIds = rec.legs.map((l) => l.id).join(",");
  useEffect(() => {
    record(rec.legs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legIds]);

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
          <>
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

            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div
                className="rounded-lg bg-[var(--surface)] p-2"
                title="Our correlation-adjusted probability that every leg wins"
              >
                <p className="text-xs text-[var(--muted)]">Model win chance</p>
                <p className="text-lg font-bold tabular-nums">
                  {formatPct(payout.modelProbability)}
                </p>
                {payout.correlated && (
                  <p className="text-[0.6rem] text-[var(--muted-2)]">
                    naive {formatPct(payout.naiveProbability)}
                  </p>
                )}
              </div>
              <div
                className="rounded-lg bg-[var(--surface)] p-2"
                title={
                  payout.correlated
                    ? "Theoretical only: correlated legs are priced here as if independent, which no sportsbook would offer"
                    : "Expected profit or loss on this stake, at our model probability"
                }
              >
                <p className="text-xs text-[var(--muted)]">
                  {payout.correlated ? "Theoretical EV" : "Expected value"}
                </p>
                <p
                  className={classNames(
                    "text-lg font-bold tabular-nums",
                    payout.correlated
                      ? "text-amber-300"
                      : payout.expectedValue >= 0
                        ? "text-good"
                        : "text-bad",
                  )}
                >
                  {payout.expectedValue >= 0 ? "+" : ""}
                  {formatMoney(payout.expectedValue)}
                  {payout.correlated && "*"}
                </p>
              </div>
            </div>

            {payout.correlated && (
              <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[0.65rem] text-amber-200">
                ⚠ This slip has multiple legs from the same game. Those outcomes
                are <strong>correlated</strong>, so the real win chance is higher
                than the naive product — and a sportsbook would price a true
                same-game parlay well below the combined odds shown here.{" "}
                <strong>
                  *The EV above is therefore theoretical, not an obtainable edge.
                </strong>
              </p>
            )}
          </>
        )}
        <p className="mt-2 text-[0.65rem] text-[var(--muted)]">
          Estimated payout is illustrative math on the listed odds, not an offer.
          No outcome is guaranteed.
        </p>
      </div>

      {/* The honest headline: did the survey find a play, or not? */}
      <div
        className={classNames(
          "card border-l-4",
          rec.verdict === "value"
            ? "border-l-green-400"
            : "border-l-amber-400",
        )}
      >
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-serif text-lg font-medium text-[var(--text)]">
            {rec.verdict === "value"
              ? `${rec.marketSurvey.valueLegs} price edge${rec.marketSurvey.valueLegs === 1 ? "" : "s"} found`
              : rec.verdict === "no-edge"
                ? "No edge on this slate"
                : "One book only — no edge measurable"}
          </h3>
          <span className="text-[0.7rem] text-[var(--muted-2)]">
            {rec.marketSurvey.books.length > 0
              ? rec.marketSurvey.books.slice(0, 4).join(", ")
              : "single price source"}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          {rec.verdict === "value" ? (
            <>
              The best available price beats the consensus fair value by up to{" "}
              <span className="font-semibold text-good">
                {(rec.marketSurvey.bestPriceEdge * 100).toFixed(1)} points
              </span>
              . That edge is in the price, not the forecast — the same bet at a
              number one book has moved and others haven&apos;t. It decays as
              they catch up.
            </>
          ) : rec.verdict === "no-edge" ? (
            <>
              Every surveyed book is pricing these games at or inside the
              consensus fair value, so nothing below is a play — it&apos;s the
              least-bad set. An efficient market producing no edge is the
              expected result, not a fault.
            </>
          ) : (
            <>
              Only one price source was available, so there was nothing to shop
              against. Expected value is negative by construction here: you
              pay the book&apos;s hold (~
              {(rec.marketSurvey.meanVig * 100).toFixed(1)}%) with no better
              number to compare it to.
            </>
          )}
        </p>
      </div>

      <div className="card">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
          <h3 className="font-semibold">Model inputs</h3>
          <span className="text-[0.7rem] text-[var(--muted-2)]">
            {rec.modelVersion}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {rec.inputs.map((i) => (
            <div key={i.label} className="rounded-xl bg-[var(--surface-2)] p-2.5">
              <p className="text-[0.65rem] uppercase tracking-wide text-[var(--muted-2)]">
                {i.label}
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">
                {i.detail}
              </p>
            </div>
          ))}
        </div>
      </div>

      {rec.notes.length > 0 && (
        <details className="card text-xs text-[var(--muted)]">
          <summary className="cursor-pointer font-semibold text-[var(--text)]">
            How this model works ({rec.modelVersion})
          </summary>
          <ul className="mt-2 list-disc space-y-1.5 pl-4">
            {rec.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </details>
      )}

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
