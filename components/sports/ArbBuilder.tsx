"use client";

import { useMemo, useState } from "react";
import type { SgpRecommendation } from "@/types";
import { buildArbSlips } from "@/lib/arbitrage";
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

  const live = slips.filter((s) => s.stillArbitrage);
  const roundedAway = slips.filter((s) => !s.stillArbitrage);

  if (slips.length === 0) {
    return (
      <div className="card">
        <h3 className="mb-1 font-serif text-lg font-medium text-[var(--text)]">
          Arbitrage builder
        </h3>
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          No two surveyed books are currently pricing the same two-way market
          at a combined under 100%. That is the normal state — measured on
          9,716 historical games with a median of 14 books, a genuine
          arbitrage existed on <strong>2.2%</strong> of them at a mean{" "}
          <strong>1.4%</strong> guaranteed return. Nothing to place right now.
        </p>
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
