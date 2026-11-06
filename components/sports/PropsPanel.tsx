"use client";

import { useMemo, useState } from "react";
import type { SgpRecommendation } from "@/types";
import { classNames, formatOdds } from "@/lib/format";
import { MIN_EDGE_SIGNIFICANCE } from "@/lib/sgp";

/**
 * Player props, fetched one game at a time and priced on the market only.
 *
 * Two things this panel is careful about.
 *
 * It costs real money, so it says so before spending it. Props are billed
 * per market per event rather than per league: one game is three or four
 * credits against the three a whole league's main lines cost. Fetching them
 * with the slate would drain a monthly allowance in two refreshes, which is
 * why nothing happens here until asked.
 *
 * And it carries no model probability, because there isn't one. The model
 * projects a team's margin and total and has no player-level distribution;
 * inventing one would be the fiction this project exists to avoid. What
 * props get is multi-book price edge through the same de-vigging and
 * consensus code the main board uses — the only thing here that has ever
 * tested positive.
 */

const MARKET_LABELS: Record<string, string> = {
  player_points: "Points",
  player_rebounds: "Rebounds",
  player_assists: "Assists",
  player_threes: "Threes",
  player_pass_yds: "Pass yards",
  player_rush_yds: "Rush yards",
  player_reception_yds: "Receiving yards",
  player_receptions: "Receptions",
  player_shots_on_goal: "Shots on goal",
  batter_hits: "Hits",
  batter_home_runs: "Home runs",
  pitcher_strikeouts: "Strikeouts",
};

interface PricedSide {
  bestAmerican: number;
  bestBook: string;
  priceEdge: number;
  edgeSignificance: number;
}
interface PropLine {
  player: string;
  market: string;
  line: number;
  over?: PricedSide;
  under?: PricedSide;
  books: number;
}

export function PropsPanel({ rec }: { rec: SgpRecommendation }) {
  const pool = rec.candidates.length ? rec.candidates : rec.legs;
  // Memoised so the `?? {}` fallback does not mint a new object each render
  // and re-run everything downstream of it.
  const eventIds = useMemo(() => rec.propEventIds ?? {}, [rec.propEventIds]);

  const games = useMemo(() => {
    const seen = new Map<string, { gameId: string; matchup: string; league: string }>();
    for (const l of pool) {
      if (!eventIds[l.gameId] || seen.has(l.gameId)) continue;
      seen.set(l.gameId, { gameId: l.gameId, matchup: l.matchup, league: l.league });
    }
    return [...seen.values()];
  }, [pool, eventIds]);

  const [gameId, setGameId] = useState<string>("");
  const [lines, setLines] = useState<PropLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [spent, setSpent] = useState<number | null>(null);
  const [onlyValue, setOnlyValue] = useState(false);

  const game = games.find((g) => g.gameId === gameId) ?? games[0];

  const load = async () => {
    if (!game || busy) return;
    setBusy(true); setNote(null); setLines(null); setSpent(null);
    try {
      const res = await fetch(
        `/api/sgp/props?league=${encodeURIComponent(game.league)}` +
          `&eventId=${encodeURIComponent(eventIds[game.gameId])}`,
      );
      const json = await res.json();
      if (Array.isArray(json.lines) && json.lines.length > 0) {
        setLines(json.lines);
        setSpent(json.creditsUsed ?? null);
      } else {
        setLines([]);
        setNote(
          json.error === "budget"
            ? "Skipped to protect the monthly budget — the main board's prices come first, because that is where the measured edge is."
            : json.error === "no-key"
              ? "No ODDS_API_KEY configured."
              : json.error === "no-props-for-this-game" ||
                  json.error === "feed-returned-no-props"
                ? "The props feed returned nothing for this game — that is its coverage, not a judgement about the game."
                : json.error === "no-two-books-on-the-same-number"
                  ? `The feed returned ${json.feed?.outcomes ?? 0} prop prices from ${json.feed?.books ?? 0} book${json.feed?.books === 1 ? "" : "s"}, but no two of them posted the same number for the same player, so nothing here can be priced.`
                  : json.error
                    ? `Could not load props (${json.error}).`
                    : "No two books quote the same prop line here, so nothing can be priced.",
        );
      }
    } catch {
      setNote("Could not reach the props feed.");
    } finally {
      setBusy(false);
    }
  };

  if (games.length === 0) return null;

  const shown = (lines ?? []).filter((l) =>
    !onlyValue ||
    (l.over?.priceEdge ?? 0) > 0 ||
    (l.under?.priceEdge ?? 0) > 0,
  );

  const sideCell = (s: PricedSide | undefined) => {
    if (!s) return <td className="py-1 text-right text-[var(--muted-2)]">—</td>;
    const clears = s.priceEdge > 0 && s.edgeSignificance >= MIN_EDGE_SIGNIFICANCE;
    return (
      <td className="py-1 text-right tabular-nums">
        <span className={clears ? "font-semibold text-good" : ""}>
          {formatOdds(s.bestAmerican)}
        </span>
        <span className="ml-1 text-[0.6rem] text-[var(--muted-2)]">
          {s.bestBook}
        </span>
        <span
          className={classNames(
            "ml-1 text-[0.6rem]",
            s.priceEdge > 0 ? "text-good" : "text-[var(--muted-2)]",
          )}
        >
          {s.priceEdge > 0 ? "+" : ""}
          {(s.priceEdge * 100).toFixed(1)}pp
        </span>
      </td>
    );
  };

  return (
    <div className="card">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-lg font-medium text-[var(--text)]">
          Player props
        </h3>
        <span className="text-[0.7rem] text-[var(--muted-2)]">
          {rec.marketSurvey.priceFeed?.remainingCredits != null
            ? `${rec.marketSurvey.priceFeed.remainingCredits} credits left`
            : "on demand"}
        </span>
      </div>
      <p className="mb-2.5 text-xs leading-relaxed text-[var(--muted)]">
        Points, rebounds, receptions and the rest — loaded for one game at a
        time, because props are billed per market <em>per game</em> rather
        than per league. There is no model probability on a prop: the model
        has no player-level distribution and will not pretend otherwise.
        These are priced the way the main board is, on disagreement between
        books. The simulator can take a points market further: not a
        probability of its own, but how the prop moves with the game total.
      </p>

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs text-[var(--muted)]">Game</label>
          <select
            value={game?.gameId ?? ""}
            onChange={(e) => { setGameId(e.target.value); setLines(null); setNote(null); }}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
          >
            {games.map((g) => (
              <option key={g.gameId} value={g.gameId}>
                {g.matchup} · {g.league}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={load}
          disabled={busy}
          className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-40"
        >
          {busy ? "Loading…" : "Load props"}
        </button>
      </div>

      {spent != null && (
        <p className="mb-2 text-[0.65rem] text-[var(--muted-2)]">
          {spent === 0
            ? "Served from cache — no credits used."
            : `Used ${spent} credit${spent === 1 ? "" : "s"}. Cached for 30 minutes.`}
        </p>
      )}
      {note && (
        <p className="mb-2 rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5 text-[0.7rem] leading-relaxed text-[var(--muted)]">
          {note}
        </p>
      )}

      {lines && lines.length > 0 && (
        <>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <button
              onClick={() => setOnlyValue((v) => !v)}
              className={classNames(
                "rounded-full border px-2 py-0.5 text-[0.65rem] transition-colors",
                onlyValue
                  ? "border-sky-400 bg-sky-400/10 text-sky-200"
                  : "border-[var(--border)] text-[var(--muted)]",
              )}
            >
              {onlyValue ? "✓ " : ""}only above fair value
            </button>
            <span className="text-[0.65rem] text-[var(--muted-2)]">
              {shown.length} of {lines.length} lines
            </span>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-[0.7rem]">
              <thead className="sticky top-0 bg-[var(--surface)]">
                <tr className="text-[0.6rem] uppercase tracking-wide text-[var(--muted-2)]">
                  <th className="pb-1 text-left font-medium">Player</th>
                  <th className="pb-1 text-left font-medium">Market</th>
                  <th className="pb-1 text-right font-medium">Line</th>
                  <th className="pb-1 text-right font-medium">Over</th>
                  <th className="pb-1 text-right font-medium">Under</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={`${l.player}|${l.market}|${l.line}`} className="border-t border-[var(--border)]">
                    <td className="py-1 pr-2 truncate">{l.player}</td>
                    <td className="py-1 pr-2 text-[var(--muted)]">
                      {MARKET_LABELS[l.market] ?? l.market}
                      <span className="ml-1 text-[0.6rem] text-[var(--muted-2)]">
                        {l.books}bk
                      </span>
                    </td>
                    <td className="py-1 text-right tabular-nums">{l.line}</td>
                    {sideCell(l.over)}
                    {sideCell(l.under)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[0.62rem] leading-relaxed text-[var(--muted-2)]">
            Edge is the gap between consensus fair value across the books
            quoting this exact line and the best price available, in
            percentage points — the same measure the main board uses, with no
            forecast in it. Green means it also clears {MIN_EDGE_SIGNIFICANCE}σ
            against the books&apos; own disagreement. Props are a softer market
            than sides, so this inconsistency should in theory be larger here;
            whether it actually is remains untested, and the honest answer
            will come from the prediction log rather than from this table.
          </p>
        </>
      )}
    </div>
  );
}
