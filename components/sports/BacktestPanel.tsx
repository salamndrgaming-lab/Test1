"use client";

import type { BacktestResult } from "@/lib/backtest";
import { useProvider } from "@/lib/useProvider";
import { Card, Spinner, ErrorState } from "@/components/ui";
import { classNames } from "@/lib/format";

function Row({
  label,
  model,
  market,
  unit = "",
  lowerIsBetter = true,
}: {
  label: string;
  model: number;
  market: number;
  unit?: string;
  lowerIsBetter?: boolean;
}) {
  const modelWins = lowerIsBetter ? model < market : model > market;
  return (
    <tr className="border-t border-[var(--border)]">
      <td className="py-1.5 pr-3 text-[var(--muted)]">{label}</td>
      <td
        className={classNames(
          "py-1.5 pr-3 text-right tabular-nums",
          modelWins ? "font-semibold text-good" : "text-[var(--text)]",
        )}
      >
        {model.toFixed(2)}
        {unit}
      </td>
      <td
        className={classNames(
          "py-1.5 text-right tabular-nums",
          !modelWins ? "font-semibold text-[var(--text)]" : "text-[var(--muted)]",
        )}
      >
        {market.toFixed(2)}
        {unit}
      </td>
    </tr>
  );
}

/**
 * The model measured against the closing line, on games it never trained on.
 *
 * This is the only place in the app that answers "is the projection any good"
 * with data rather than with an argument, so it leads with the verdict and
 * states the sample size next to it.
 */
export function BacktestPanel() {
  const { data, loading, error, refetch } =
    useProvider<BacktestResult[]>("/api/sgp/backtest");

  if (loading) {
    return (
      <Card>
        <Spinner label="Replaying recent games…" />
      </Card>
    );
  }
  if (error || !data || data.length === 0) {
    return (
      <Card>
        <h3 className="mb-1 font-serif text-lg font-medium text-[var(--text)]">
          Measured accuracy
        </h3>
        <ErrorState
          message={
            error ??
            "No completed games with closing lines in the window yet."
          }
          onRetry={refetch}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-1 font-serif text-lg font-medium text-[var(--text)]">
          Measured against the closing line
        </h3>
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          Every completed game in the last few weeks, replayed. For each date,
          the ratings are rebuilt from games <em>strictly before</em> it, then
          used to project that day&apos;s games — so nothing is scored on data
          it was fitted to. The benchmark is the number each game actually
          closed at, which is the sharpest public forecast there is.
        </p>
      </Card>

      {data.map((r) => {
        const beatsMarket = r.skillVsMarket > 0;
        return (
          <Card key={r.league}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="font-semibold">{r.league}</h4>
              <span className="text-[0.7rem] text-[var(--muted-2)]">
                {r.games} games out-of-sample · {r.gamesWithLine} with a
                closing line
              </span>
            </div>

            <div
              className={classNames(
                "mb-3 rounded-lg border-l-4 px-2.5 py-2 text-xs leading-relaxed",
                beatsMarket
                  ? "border-l-green-400 bg-green-500/5 text-green-200"
                  : "border-l-amber-400 bg-amber-500/5 text-amber-200",
              )}
            >
              {beatsMarket ? (
                <>
                  Our projection beat the closing line by{" "}
                  <span className="font-semibold">
                    {(r.skillVsMarket * 100).toFixed(1)}%
                  </span>{" "}
                  on error, winning {(r.beatLineRate * 100).toFixed(0)}% of
                  games.{" "}
                  {r.meaningful
                    ? "The sample is large enough to take seriously, though one window is not a season."
                    : "The sample is still small — treat this as a hint, not a result."}
                </>
              ) : (
                <>
                  The closing line beat our projection by{" "}
                  <span className="font-semibold">
                    {(Math.abs(r.skillVsMarket) * 100).toFixed(1)}%
                  </span>{" "}
                  on error; we were closer in{" "}
                  {(r.beatLineRate * 100).toFixed(0)}% of games. That is the
                  expected result and the measured reason the projection gets
                  no vote in the published probability.
                </>
              )}
            </div>

            <table className="w-full text-xs">
              <thead>
                <tr className="text-[0.65rem] uppercase tracking-wide text-[var(--muted-2)]">
                  <th className="pb-1 text-left font-medium">Margin error</th>
                  <th className="pb-1 text-right font-medium">Model</th>
                  <th className="pb-1 text-right font-medium">Closing line</th>
                </tr>
              </thead>
              <tbody>
                <Row label="Mean absolute error" model={r.modelMae} market={r.marketMae} unit=" pts" />
                <Row label="Root mean squared error" model={r.modelRmse} market={r.marketRmse} unit=" pts" />
                <Row label="Brier (win probability)" model={r.brierModel} market={r.brierMarket} />
              </tbody>
            </table>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[0.7rem] sm:grid-cols-3">
              <div className="rounded-lg bg-[var(--surface-2)] p-2">
                <p className="text-[var(--muted-2)]">No-information baseline</p>
                <p className="mt-0.5 font-semibold tabular-nums">
                  {r.baselineMae.toFixed(2)} pts
                </p>
                <p className="text-[var(--muted-2)]">
                  {r.modelMae < r.baselineMae
                    ? "the model does beat knowing nothing"
                    : "the model fails to beat knowing nothing"}
                </p>
              </div>
              <div className="rounded-lg bg-[var(--surface-2)] p-2">
                <p className="text-[var(--muted-2)]">σ fitted on this window</p>
                <p className="mt-0.5 font-semibold tabular-nums">
                  {r.fittedSigma.toFixed(1)}
                </p>
                <p className="text-[var(--muted-2)]">
                  configured {r.configuredSigma.toFixed(1)}
                </p>
              </div>
              <div className="rounded-lg bg-[var(--surface-2)] p-2">
                <p className="text-[var(--muted-2)]">Sample</p>
                <p className="mt-0.5 font-semibold tabular-nums">
                  {r.games}
                </p>
                <p className="text-[var(--muted-2)]">
                  {r.meaningful ? "error figures usable" : "still thin"}
                </p>
              </div>
            </div>
          </Card>
        );
      })}

      <Card className="text-xs leading-relaxed text-[var(--muted)]">
        <p className="mb-1.5 font-semibold text-[var(--text)]">
          How to read this
        </p>
        <p className="mb-1.5">
          Mean absolute error is how many points the projection missed by, on
          average. The closing line typically lands around 9–11 points of error
          in basketball and football — that is the standard a forecast has to
          beat, and most do not.
        </p>
        <p>
          The <strong>no-information baseline</strong> is the honest floor: a
          model that knows only who is at home. Beating the closing line is
          rare; failing to beat the baseline would mean the ratings carry no
          signal at all. The gap between those two is where this model lives,
          and the σ fitted here is what the data says the distribution&apos;s
          width should be rather than what was assumed.
        </p>
      </Card>
    </div>
  );
}
