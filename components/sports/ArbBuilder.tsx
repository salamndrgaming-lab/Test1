"use client";

import { useMemo, useState } from "react";
import type { SgpRecommendation } from "@/types";
import {
  buildArbSlips,
  buildMiddleSlips,
  summarisePortfolio,
  middleKelly,
  bookCoverage,
  MAX_POSITION_FRACTION,
} from "@/lib/arbitrage";
import { formatMoney, formatOdds, classNames } from "@/lib/format";

/**
 * The arbitrage builder.
 *
 * This is the only part of the app that claims risk-free profit, so it is
 * also the part most able to mislead. Three things it insists on:
 *
 *  - every figure is recomputed AFTER rounding to placeable amounts, because
 *    the textbook return assumes fractional stakes and books do not take
 *    them;
 *  - when rounding destroys the guarantee it says so and offers a stake that
 *    works, since viability is not monotonic in size;
 *  - it states plainly what can still go wrong, because an arbitrage is only
 *    risk-free if BOTH bets actually get placed at the quoted prices.
 */
export function ArbBuilder({ rec }: { rec: SgpRecommendation }) {
  const [stake, setStake] = useState(200);
  const [unit, setUnit] = useState(1);

  const slips = useMemo(
    () =>
      buildArbSlips(
        (rec.opportunities ?? []).map((o) => ({
          matchup: o.matchup,
          league: o.league,
          arbitrage: o.arbitrage,
        })),
        stake,
        unit,
      ),
    [rec.opportunities, stake, unit],
  );

  /*
   * Positive-expectation middles, built the same way. Kept separate from the
   * arbitrage list because they are a different kind of bet: a middle
   * usually loses a little and occasionally wins a lot, which is not what
   * "risk-free" means and must not be presented as if it were.
   */
  const middles = useMemo(
    () =>
      buildMiddleSlips(
        (rec.opportunities ?? []).map((o) => ({
          matchup: o.matchup,
          league: o.league,
          middles: o.middles,
        })),
        stake,
        unit,
      ).slice(0, 6),
    [rec.opportunities, stake, unit],
  );

  /*
   * What it costs to take everything. Each slip above is priced at the full
   * stake independently, which is right for one and misleading for several:
   * three arbitrages each shown "at $200" need $600.
   */
  const portfolio = useMemo(
    () => summarisePortfolio(slips, middles),
    [slips, middles],
  );
  const coverage = useMemo(
    () => bookCoverage(slips, middles).slice(0, 4),
    [slips, middles],
  );

  const live = slips.filter((s) => s.stillArbitrage);
  const roundedAway = slips.filter((s) => !s.stillArbitrage);

  // The closest the market came, best first — so an empty list is legible.
  const near = useMemo(
    () =>
      (rec.opportunities ?? [])
        .map((o) => ({ matchup: o.matchup, n: o.nearArb }))
        .filter((x): x is { matchup: string; n: NonNullable<typeof x.n> } => x.n != null)
        .sort((a, b) => a.n.pointsFromArb - b.n.pointsFromArb)
        .slice(0, 5),
    [rec.opportunities],
  );



  const portfolioSection =
    portfolio.arbCount + portfolio.middleCount < 2 ? null : (
      <div className="mt-3 rounded-xl border border-[var(--border)] p-2.5">
        <p className="mb-1.5 text-[0.7rem] font-semibold text-[var(--text)]">
          Taking all of it
        </p>
        <p className="mb-2 text-[0.65rem] leading-relaxed text-[var(--muted)]">
          Each slip above is priced at your full stake on its own. Placing
          several costs the sum, not the stake — this is what the whole board
          actually needs.
        </p>
        <div className="grid grid-cols-2 gap-2 text-[0.7rem] sm:grid-cols-4">
          <div>
            <p className="text-[var(--muted-2)]">Total outlay</p>
            <p className="font-semibold tabular-nums">
              {formatMoney(portfolio.totalOutlay)}
            </p>
          </div>
          {portfolio.arbCount > 0 && (
            <div>
              <p className="text-[var(--muted-2)]">
                {portfolio.arbCount} arb{portfolio.arbCount === 1 ? "" : "s"} —
                guaranteed
              </p>
              <p className="font-semibold tabular-nums text-good">
                {formatMoney(portfolio.arbGuaranteed)}
              </p>
              <p className="text-[0.6rem] text-[var(--muted-2)] tabular-nums">
                {(portfolio.arbReturn * 100).toFixed(2)}% on{" "}
                {formatMoney(portfolio.arbOutlay)}
              </p>
            </div>
          )}
          {portfolio.middleCount > 0 && (
            <>
              <div>
                <p className="text-[var(--muted-2)]">
                  {portfolio.middleCount} middle
                  {portfolio.middleCount === 1 ? "" : "s"} — expected
                </p>
                <p className="font-semibold tabular-nums">
                  {formatMoney(portfolio.middleExpected)}
                </p>
              </div>
              <div>
                <p className="text-[var(--muted-2)]">If every middle misses</p>
                <p className="font-semibold tabular-nums text-bad">
                  {formatMoney(portfolio.middleWorstCase)}
                </p>
              </div>
            </>
          )}
        </div>
        {portfolio.arbCount > 0 && portfolio.middleCount > 0 && (
          <p className="mt-1.5 text-[0.62rem] leading-relaxed text-[var(--muted-2)]">
            The two are not added together. One is guaranteed and the other is
            an average over outcomes; a single combined figure would be
            neither.
          </p>
        )}
        {coverage.length > 0 && (
          <p className="mt-1.5 text-[0.65rem] leading-relaxed text-[var(--muted-2)]">
            <span className="text-[var(--muted)]">Accounts needed:</span>{" "}
            {coverage
              .map((c) => `${c.book} (${c.appearances})`)
              .join(", ")}
            . Every one of these needs two books at once, so the account that
            appears most is the one that unlocks the most of this board.
          </p>
        )}
      </div>
    );

  /* Shared by both the empty and the populated state. */
  const middleSection =
    middles.length === 0 ? null : (
      <div className="mt-4">
        <h4 className="mb-1 text-sm font-semibold text-[var(--text)]">
          Middles — positive expectation, not risk-free
        </h4>
        <p className="mb-2 text-[0.68rem] leading-relaxed text-[var(--muted)]">
          Two books posting different lines, where a band of results wins{" "}
          <em>both</em> bets. This is a different shape from an arbitrage and
          the difference matters: a middle normally loses a little, and
          occasionally wins a lot. The probability below is exact, computed
          from the discrete score distribution with pushes handled rather than
          approximated — which is the one place this model&apos;s distribution
          work pays for itself.
        </p>
        <div className="space-y-2">
          {middles.map((m, i) => (
            <div
              key={`${m.matchup}-${m.market}-${i}`}
              className="rounded-xl border border-[var(--border)] p-2.5"
            >
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">
                  {m.matchup}
                  <span className="ml-1.5 text-[0.65rem] font-normal uppercase tracking-wide text-[var(--muted-2)]">
                    {m.market}
                  </span>
                </p>
                <span
                  className={classNames(
                    "rounded px-2 py-0.5 text-[0.7rem] font-semibold tabular-nums",
                    m.expectedValue > 0
                      ? "bg-green-500/15 text-green-300"
                      : "bg-[var(--surface-2)] text-[var(--muted)]",
                  )}
                >
                  {m.expectedValue >= 0 ? "+" : ""}
                  {(m.expectedValue * 100).toFixed(2)}% EV ·{" "}
                  {formatMoney(m.expectedProfit)}
                </span>
              </div>

              <table className="w-full text-[0.72rem]">
                <tbody>
                  {m.legs.map((l) => (
                    <tr key={l.book + l.label} className="border-t border-[var(--border)]">
                      <td className="py-1 pr-2">{l.label}</td>
                      <td className="py-1 pr-2 text-[var(--muted)]">{l.book}</td>
                      <td className="py-1 text-right tabular-nums">
                        {formatOdds(l.american)}
                      </td>
                      <td className="py-1 text-right font-semibold tabular-nums">
                        {formatMoney(l.stake)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-1.5 grid grid-cols-3 gap-2 text-[0.7rem]">
                <div>
                  <p className="text-[var(--muted-2)]">Both win</p>
                  <p className="font-semibold tabular-nums text-good">
                    {formatMoney(m.middleProfit)}
                  </p>
                  <p className="text-[0.6rem] text-[var(--muted-2)] tabular-nums">
                    {(m.middleProbability * 100).toFixed(1)}% chance
                  </p>
                </div>
                <div>
                  <p className="text-[var(--muted-2)]">Otherwise</p>
                  <p
                    className={classNames(
                      "font-semibold tabular-nums",
                      m.missProfit >= 0 ? "text-good" : "text-bad",
                    )}
                  >
                    {formatMoney(m.missProfit)}
                  </p>
                  <p className="text-[0.6rem] text-[var(--muted-2)] tabular-nums">
                    {((1 - m.middleProbability) * 100).toFixed(1)}% chance
                  </p>
                </div>
                <div>
                  <p className="text-[var(--muted-2)]">Lands between</p>
                  <p className="font-semibold tabular-nums">
                    {m.gapFrom} – {m.gapTo}
                  </p>
                  <p className="text-[0.6rem] text-[var(--muted-2)]">
                    outlay {formatMoney(m.outlay)}
                  </p>
                </div>
              </div>

              {(() => {
                const k = middleKelly(m);
                if (!k) return null;
                return (
                  <p className="mt-1.5 text-[0.65rem] leading-relaxed text-[var(--muted-2)]">
                    Sizing: risk about{" "}
                    <span className="font-semibold text-[var(--text)] tabular-nums">
                      {(k.recommended * 100).toFixed(1)}%
                    </span>{" "}
                    of bankroll.{" "}
                    {k.capped ? (
                      <>
                        Kelly itself says {k.fraction.toFixed(1)}× bankroll —
                        the two legs barely lose when this misses, so the
                        formula sees almost no downside. It assumes the{" "}
                        {(m.middleProbability * 100).toFixed(1)}% is exact;
                        ours is a model estimate, so this is capped at{" "}
                        {(MAX_POSITION_FRACTION * 100).toFixed(0)}%.
                      </>
                    ) : (
                      <>Half-Kelly on the exact band probability.</>
                    )}
                  </p>
                );
              })()}

              {m.riskFree && (
                <p className="mt-1.5 text-[0.68rem] text-green-300">
                  Unusually, missing the middle still returns more than the
                  outlay — the two prices arbitrage on their own and the band
                  is pure upside.
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    );

  if (slips.length === 0) {
    return (
      <div className="card">
        <h3 className="mb-1 font-serif text-lg font-medium text-[var(--text)]">
          Arbitrage builder
        </h3>
        <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
          No two surveyed books are currently pricing the same two-way market
          at a combined under 100%, so there is nothing to place. That is the
          normal state: measured on 9,716 historical games with a median of 14
          books, a genuine arbitrage existed on <strong>2.2%</strong> of them
          at a mean <strong>1.4%</strong> guaranteed return. This feed carries{" "}
          <strong>{(rec.marketSurvey?.books ?? []).length || "a few"}</strong>{" "}
          books, so expect one every few days rather than daily.
        </p>

        {near.length > 0 && (
          <>
            <p className="mb-1.5 text-[0.7rem] font-semibold text-[var(--text)]">
              How close the market came
            </p>
            <table className="w-full text-[0.7rem]">
              <thead>
                <tr className="text-[0.6rem] uppercase tracking-wide text-[var(--muted-2)]">
                  <th className="pb-1 text-left font-medium">Game</th>
                  <th className="pb-1 text-left font-medium">Best pair</th>
                  <th className="pb-1 text-right font-medium">Combined</th>
                  <th className="pb-1 text-right font-medium">Short by</th>
                </tr>
              </thead>
              <tbody>
                {near.map(({ matchup, n }) => (
                  <tr key={matchup + n.market} className="border-t border-[var(--border)]">
                    <td className="py-1 pr-2">
                      {matchup}
                      <span className="ml-1 text-[0.6rem] uppercase text-[var(--muted-2)]">
                        {n.market}
                      </span>
                    </td>
                    <td className="py-1 pr-2 text-[var(--muted)]">
                      {n.sideA.book} / {n.sideB.book}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {(n.combinedImplied * 100).toFixed(2)}%
                    </td>
                    <td className="py-1 text-right tabular-nums text-[var(--muted-2)]">
                      {n.pointsFromArb.toFixed(2)}pp
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[0.65rem] leading-relaxed text-[var(--muted-2)]">
              Under 100% is a risk-free bet. These are the two best prices
              across books on each game, so the detector is live and working —
              the market simply has not crossed the line. The lever is more
              books: disagreement is what creates an arbitrage, and more
              quotes means more chances for two of them to disagree enough.
            </p>
          </>
        )}
        {middleSection}
        {portfolioSection}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-lg font-medium text-[var(--text)]">
          Arbitrage builder
        </h3>
        <span className="text-[0.7rem] text-[var(--muted-2)]">
          {live.length} placeable
          {roundedAway.length > 0 && ` · ${roundedAway.length} too thin at this stake`}
        </span>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
        Two books disagreeing enough that backing <em>both</em> sides profits
        whatever happens. No forecast involved. Every figure below is
        recomputed after rounding to amounts a book will actually accept — the
        textbook return assumes you can stake fractions of a dollar, and you
        cannot.
      </p>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">
            Total stake ($)
          </label>
          <input
            type="number"
            min={1}
            value={stake}
            onChange={(e) => setStake(Math.max(1, Number(e.target.value) || 1))}
            className="w-28 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-right tabular-nums"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">
            Round to
          </label>
          <div className="flex gap-1">
            {[1, 5, 25].map((u) => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                className={classNames(
                  "rounded-lg border px-2.5 py-1.5 text-xs tabular-nums transition-colors",
                  unit === u
                    ? "border-sky-400 bg-sky-400/10 text-sky-200"
                    : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]/50",
                )}
              >
                ${u}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        {slips.map((s, i) => (
          <div
            key={`${s.matchup}-${s.market}-${i}`}
            className={classNames(
              "rounded-xl border p-2.5",
              s.stillArbitrage
                ? "border-green-400/60 bg-green-500/5"
                : "border-amber-400/50 bg-amber-500/5",
            )}
          >
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold">
                {s.matchup}
                <span className="ml-1.5 text-[0.65rem] font-normal uppercase tracking-wide text-[var(--muted-2)]">
                  {s.market}
                </span>
              </p>
              {s.stillArbitrage ? (
                <span className="rounded bg-green-500/15 px-2 py-0.5 text-[0.7rem] font-semibold text-green-300 tabular-nums">
                  +{formatMoney(s.worstProfit)} guaranteed ·{" "}
                  {(s.guaranteedReturn * 100).toFixed(2)}%
                </span>
              ) : (
                <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[0.7rem] font-semibold text-amber-300">
                  rounding eats it at this stake
                </span>
              )}
            </div>

            <table className="w-full text-[0.72rem]">
              <thead>
                <tr className="text-[0.6rem] uppercase tracking-wide text-[var(--muted-2)]">
                  <th className="pb-1 text-left font-medium">Bet</th>
                  <th className="pb-1 text-left font-medium">At</th>
                  <th className="pb-1 text-right font-medium">Price</th>
                  <th className="pb-1 text-right font-medium">Stake</th>
                  <th className="pb-1 text-right font-medium">Returns</th>
                </tr>
              </thead>
              <tbody>
                {s.legs.map((l) => (
                  <tr key={l.book + l.label} className="border-t border-[var(--border)]">
                    <td className="py-1 pr-2">{l.label}</td>
                    <td className="py-1 pr-2 text-[var(--muted)]">{l.book}</td>
                    <td className="py-1 text-right tabular-nums">
                      {formatOdds(l.american)}
                    </td>
                    <td className="py-1 text-right font-semibold tabular-nums">
                      {formatMoney(l.stake)}
                    </td>
                    <td className="py-1 text-right tabular-nums text-[var(--muted)]">
                      {formatMoney(l.payout)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-[var(--border)] font-semibold">
                  <td className="py-1" colSpan={3}>
                    Total outlay
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {formatMoney(s.outlay)}
                  </td>
                  <td className="py-1 text-right tabular-nums text-[var(--muted-2)]">
                    worst {formatMoney(s.outlay + s.worstProfit)}
                  </td>
                </tr>
              </tbody>
            </table>

            {!s.stillArbitrage && (
              <p className="mt-1.5 text-[0.68rem] leading-relaxed text-amber-200">
                At {formatMoney(s.outlay)} the two legs round badly and the
                worst case is {formatMoney(s.worstProfit)} — a loss, not a
                guarantee.{" "}
                {s.suggestedStake ? (
                  <>
                    <button
                      onClick={() => setStake(s.suggestedStake as number)}
                      className="underline underline-offset-2 hover:text-amber-100"
                    >
                      Use {formatMoney(s.suggestedStake)} instead
                    </button>
                    , which does hold. Viability is not simply a matter of
                    betting more: on a thin edge $43 can work where $50 loses,
                    because the rounding lands differently.
                  </>
                ) : (
                  <>
                    No nearby stake rescues it at this rounding unit — the edge
                    is thinner than a single betting unit.
                  </>
                )}
              </p>
            )}

            {s.stillArbitrage && (
              <p className="mt-1.5 text-[0.65rem] text-[var(--muted-2)] tabular-nums">
                theoretical {(s.theoreticalReturn * 100).toFixed(2)}% · realised
                after rounding {(s.guaranteedReturn * 100).toFixed(2)}%
                {s.minimumStake != null &&
                  ` · smallest workable stake ${formatMoney(s.minimumStake)}`}
              </p>
            )}
          </div>
        ))}
      </div>

      {middleSection}
      {portfolioSection}

      <div className="mt-3 rounded-lg border-l-4 border-l-amber-400 bg-amber-500/5 px-2.5 py-2 text-[0.68rem] leading-relaxed text-amber-100">
        <strong>What can still go wrong.</strong> The guarantee holds only if
        both bets get placed at the prices shown. Books move lines in seconds,
        limit stakes on the side they do not want, void obvious palpable
        errors, and restrict accounts that only ever take the good number. A
        half-placed arbitrage is just a bet. Treat these as research, not
        instructions — and note that a 1-2% return on a two-leg outlay is what
        this is worth when it works, not a windfall.
      </div>
    </div>
  );
}
