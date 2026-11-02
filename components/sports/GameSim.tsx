"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SgpLeg, SgpRecommendation } from "@/types";
import {
  gridForLeg,
  sampleScore,
  seededRandom,
  summarise,
  checkMarkets,
  venueShape,
  type SimResult,
  type SimSummary,
} from "@/lib/gameSim";
import { classNames } from "@/lib/format";

/**
 * Run a game thousands of times and watch the answer arrive.
 *
 * Every draw comes from the model's own joint distribution over final
 * scores, rebuilt in the browser from fields the leg already carries, so
 * this costs nothing to run and cannot disagree with the published
 * probabilities — it is the same object, read by sampling instead of by
 * integration.
 *
 * What it is not is a play-by-play engine. There is no drive model and no
 * player in it. The path drawn across the venue is interpolation between
 * zero and a sampled FINAL score, and the panel says so rather than letting
 * a moving dot imply a possession simulation that does not exist.
 */

const RUN_OPTIONS = [1000, 10000, 50000];
/** Draws per animation frame — enough to finish fast, few enough to watch. */
const PER_FRAME = 120;

function Venue({
  shape,
  home,
  away,
  progress,
}: {
  shape: ReturnType<typeof venueShape>;
  home: number;
  away: number;
  progress: number;
}) {
  const line = "var(--border)";
  const turf =
    shape === "court" ? "#6b4f2a" :
    shape === "rink" ? "#16263a" :
    shape === "diamond" ? "#1e3a24" : "#15361f";
  return (
    <svg viewBox="0 0 320 170" className="w-full" role="img" aria-label={`${shape} with the running simulated score`}>
      <rect x="0" y="0" width="320" height="170" rx="8" fill={turf} opacity="0.55" />
      {shape === "gridiron" && (
        <>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <line key={i} x1={30 + i * 26} y1="18" x2={30 + i * 26} y2="152"
              stroke={line} strokeWidth={i === 5 ? 1.6 : 0.6} opacity="0.5" />
          ))}
          <rect x="4" y="18" width="26" height="134" fill="#0ea5e9" opacity="0.18" />
          <rect x="290" y="18" width="26" height="134" fill="#f59e0b" opacity="0.18" />
        </>
      )}
      {shape === "court" && (
        <>
          <rect x="14" y="14" width="292" height="142" fill="none" stroke={line} opacity="0.6" />
          <line x1="160" y1="14" x2="160" y2="156" stroke={line} opacity="0.6" />
          <circle cx="160" cy="85" r="22" fill="none" stroke={line} opacity="0.6" />
          <path d="M14 40 A50 45 0 0 1 14 130" fill="none" stroke={line} opacity="0.5" />
          <path d="M306 40 A50 45 0 0 0 306 130" fill="none" stroke={line} opacity="0.5" />
        </>
      )}
      {shape === "rink" && (
        <>
          <rect x="10" y="12" width="300" height="146" rx="42" fill="none" stroke={line} opacity="0.6" />
          <line x1="160" y1="12" x2="160" y2="158" stroke="#ef4444" opacity="0.45" />
          <line x1="104" y1="12" x2="104" y2="158" stroke="#3b82f6" opacity="0.4" />
          <line x1="216" y1="12" x2="216" y2="158" stroke="#3b82f6" opacity="0.4" />
          <circle cx="160" cy="85" r="20" fill="none" stroke="#3b82f6" opacity="0.45" />
        </>
      )}
      {shape === "diamond" && (
        <>
          <path d="M160 140 L225 85 L160 30 L95 85 Z" fill="none" stroke={line} opacity="0.65" />
          <path d="M160 140 L250 60" fill="none" stroke={line} opacity="0.3" />
          <path d="M160 140 L70 60" fill="none" stroke={line} opacity="0.3" />
          <circle cx="160" cy="85" r="9" fill="none" stroke={line} opacity="0.5" />
        </>
      )}

      {/* The running score. The dot is interpolation, not a possession. */}
      <circle
        cx={30 + progress * 260}
        cy={85}
        r="4.5"
        fill="var(--accent)"
        opacity="0.9"
      />
      <text x="16" y="166" fontSize="11" fill="var(--muted-2)">away</text>
      <text x="286" y="166" fontSize="11" fill="var(--muted-2)">home</text>
      <text x="160" y="96" fontSize="30" fontWeight="700" textAnchor="middle"
        fill="var(--text)" style={{ fontVariantNumeric: "tabular-nums" }}>
        {away} – {home}
      </text>
    </svg>
  );
}

export function GameSim({ rec }: { rec: SgpRecommendation }) {
  const pool = rec.candidates.length ? rec.candidates : rec.legs;

  /** One entry per game that can actually be simulated. */
  const games = useMemo(() => {
    const byGame = new Map<string, SgpLeg[]>();
    for (const l of pool) {
      const g = byGame.get(l.gameId);
      if (g) g.push(l);
      else byGame.set(l.gameId, [l]);
    }
    return [...byGame.entries()]
      .map(([gameId, legs]) => ({
        gameId,
        matchup: legs[0].matchup,
        league: legs[0].league,
        legs,
        grid: legs.map(gridForLeg).find((g) => g != null) ?? null,
      }))
      .filter((g) => g.grid != null);
  }, [pool]);

  const [gameId, setGameId] = useState<string | null>(null);
  const [runs, setRuns] = useState(10000);
  const [results, setResults] = useState<SimResult[]>([]);
  const [running, setRunning] = useState(false);
  const [latest, setLatest] = useState<SimResult | null>(null);
  const frame = useRef<number | null>(null);

  const game = games.find((g) => g.gameId === gameId) ?? games[0] ?? null;

  // Stop a run in flight if the component goes away.
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);

  /*
   * Changing game cancels the run and clears the board in the handler, not
   * an effect. The click already knows both things, and doing it in an
   * effect would be a render-triggered cascade for something the event
   * could settle directly.
   */
  const chooseGame = (id: string) => {
    if (frame.current) { cancelAnimationFrame(frame.current); frame.current = null; }
    setRunning(false);
    setResults([]);
    setLatest(null);
    setGameId(id);
  };

  const start = useCallback(() => {
    if (!game?.grid || running) return;
    const grid = game.grid;
    const rnd = seededRandom(Date.now() & 0xffffffff);
    const acc: SimResult[] = [];
    setResults([]);
    setRunning(true);

    const step = () => {
      for (let i = 0; i < PER_FRAME && acc.length < runs; i++) {
        acc.push(sampleScore(grid, rnd));
      }
      setLatest(acc[acc.length - 1] ?? null);
      setResults(acc.slice());
      if (acc.length < runs) {
        frame.current = requestAnimationFrame(step);
      } else {
        setRunning(false);
        frame.current = null;
      }
    };
    frame.current = requestAnimationFrame(step);
  }, [game, runs, running]);

  const summary: SimSummary | null = useMemo(
    () => (results.length ? summarise(results) : null),
    [results],
  );
  const markets = useMemo(
    () => (results.length && game ? checkMarkets(results, game.legs) : []),
    [results, game],
  );

  if (games.length === 0) {
    return (
      <div className="card">
        <h3 className="mb-1 font-serif text-lg font-medium text-[var(--text)]">
          Simulate a game
        </h3>
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          No game on the board carries the distribution inputs this needs.
          Rather than guess at them, it declines to simulate — a run built on
          invented numbers would look identical to a real one.
        </p>
      </div>
    );
  }

  const progress = results.length / runs;
  const maxBucket = summary
    ? Math.max(...summary.marginBuckets.map((b) => b.share), 0.0001)
    : 1;

  return (
    <div className="card">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-lg font-medium text-[var(--text)]">
          Simulate a game
        </h3>
        <span className="text-[0.7rem] text-[var(--muted-2)]">
          {games.length} game{games.length === 1 ? "" : "s"} available
        </span>
      </div>
      <p className="mb-2.5 text-xs leading-relaxed text-[var(--muted)]">
        Every run draws a final score from the model&apos;s own joint
        distribution — the same object that prices every leg on the slip — so
        a simulated win rate and the published probability cannot disagree.
        It runs in your browser and costs nothing.
      </p>

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs text-[var(--muted)]">Game</label>
          <select
            value={game?.gameId ?? ""}
            onChange={(e) => chooseGame(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
          >
            {games.map((g) => (
              <option key={g.gameId} value={g.gameId}>
                {g.matchup} · {g.league}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">Runs</label>
          <div className="flex gap-1">
            {RUN_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setRuns(n)}
                disabled={running}
                className={classNames(
                  "rounded-lg border px-2 py-1.5 text-xs tabular-nums transition-colors disabled:opacity-40",
                  runs === n
                    ? "border-sky-400 bg-sky-400/10 text-sky-200"
                    : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]/50",
                )}
              >
                {n >= 1000 ? `${n / 1000}k` : n}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={start}
          disabled={running}
          className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-40"
        >
          {running ? "Running…" : "Run"}
        </button>
      </div>

      {game && (
        <div className="mb-2 rounded-xl bg-[var(--surface-2)] p-2">
          <Venue
            shape={venueShape(game.league)}
            home={latest?.homeScore ?? 0}
            away={latest?.awayScore ?? 0}
            progress={running ? progress : results.length ? 1 : 0}
          />
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--surface)]">
            <div
              className="h-full bg-[var(--accent)] transition-[width] duration-75"
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-center text-[0.6rem] text-[var(--muted-2)]">
            {results.length.toLocaleString()} of {runs.toLocaleString()} runs ·
            the scoreboard shows the latest draw, not a live game
          </p>
        </div>
      )}

      {summary && summary.runs > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2 text-[0.72rem] sm:grid-cols-4">
            <div className="rounded-lg bg-[var(--surface-2)] p-2">
              <p className="text-[var(--muted-2)]">Home wins</p>
              <p className="text-base font-semibold tabular-nums">
                {(summary.homeWinRate * 100).toFixed(1)}%
              </p>
            </div>
            <div className="rounded-lg bg-[var(--surface-2)] p-2">
              <p className="text-[var(--muted-2)]">Away wins</p>
              <p className="text-base font-semibold tabular-nums">
                {(summary.awayWinRate * 100).toFixed(1)}%
              </p>
            </div>
            <div className="rounded-lg bg-[var(--surface-2)] p-2">
              <p className="text-[var(--muted-2)]">Mean score</p>
              <p className="text-base font-semibold tabular-nums">
                {summary.meanAway.toFixed(1)} – {summary.meanHome.toFixed(1)}
              </p>
            </div>
            <div className="rounded-lg bg-[var(--surface-2)] p-2">
              <p className="text-[var(--muted-2)]">Margin, middle 80%</p>
              <p className="text-base font-semibold tabular-nums">
                {summary.marginP10 > 0 ? "+" : ""}{summary.marginP10} to{" "}
                {summary.marginP90 > 0 ? "+" : ""}{summary.marginP90}
              </p>
            </div>
          </div>

          <div className="mt-2 rounded-lg bg-[var(--surface-2)] p-2.5">
            <p className="mb-1 text-[0.7rem] font-semibold text-[var(--text)]">
              Most likely outcome
            </p>
            <p className="text-[0.72rem] leading-relaxed text-[var(--muted)]">
              The single commonest final score was{" "}
              <span className="font-semibold text-[var(--text)] tabular-nums">
                {summary.modalScore.away} – {summary.modalScore.home}
              </span>
              , and it came up{" "}
              <span className="tabular-nums">
                {(summary.modalScore.share * 100).toFixed(1)}%
              </span>{" "}
              of the time. That is the honest shape of this: no exact score is
              likely, which is why the useful answer is the spread of outcomes
              rather than a prediction.
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {summary.topScores.map((s) => (
                <span
                  key={`${s.home}-${s.away}`}
                  className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[0.65rem] tabular-nums text-[var(--muted)]"
                >
                  {s.away}–{s.home} · {(s.share * 100).toFixed(1)}%
                </span>
              ))}
            </div>
          </div>

          {/* Margin distribution */}
          <div className="mt-2">
            <p className="mb-1 text-[0.7rem] font-semibold text-[var(--text)]">
              Margin distribution (home perspective)
            </p>
            <div className="flex h-16 items-end gap-[1px]">
              {summary.marginBuckets
                .filter((b) => b.margin >= summary.marginP10 - 6 && b.margin <= summary.marginP90 + 6)
                .map((b) => (
                  <div
                    key={b.margin}
                    title={`${b.margin > 0 ? "+" : ""}${b.margin}: ${(b.share * 100).toFixed(2)}%`}
                    className={classNames(
                      "flex-1 rounded-t-sm",
                      b.margin > 0 ? "bg-sky-400/70" : b.margin < 0 ? "bg-amber-400/60" : "bg-[var(--muted-2)]",
                    )}
                    style={{ height: `${Math.max(2, (b.share / maxBucket) * 100)}%` }}
                  />
                ))}
            </div>
            <div className="mt-0.5 flex justify-between text-[0.6rem] text-[var(--muted-2)]">
              <span>away by {Math.abs(summary.marginP10 - 6)}</span>
              <span>tie</span>
              <span>home by {summary.marginP90 + 6}</span>
            </div>
          </div>

          {markets.length > 0 && (
            <div className="mt-2.5">
              <p className="mb-1 text-[0.7rem] font-semibold text-[var(--text)]">
                How each posted line fared
              </p>
              <table className="w-full text-[0.7rem]">
                <thead>
                  <tr className="text-[0.6rem] uppercase tracking-wide text-[var(--muted-2)]">
                    <th className="pb-1 text-left font-medium">Line</th>
                    <th className="pb-1 text-right font-medium">Sim win%</th>
                    <th className="pb-1 text-right font-medium">Needs</th>
                    <th className="pb-1 text-right font-medium">Push</th>
                  </tr>
                </thead>
                <tbody>
                  {markets.map((m) => {
                    const beats = m.breakEven != null && m.winRate > m.breakEven;
                    return (
                      <tr key={m.label} className="border-t border-[var(--border)]">
                        <td className="py-1 pr-2 truncate">{m.label}</td>
                        <td className={classNames(
                          "py-1 text-right tabular-nums",
                          beats ? "text-good" : "text-[var(--text)]",
                        )}>
                          {(m.winRate * 100).toFixed(1)}%
                        </td>
                        <td className="py-1 text-right tabular-nums text-[var(--muted-2)]">
                          {m.breakEven != null ? `${(m.breakEven * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-1 text-right tabular-nums text-[var(--muted-2)]">
                          {m.pushRate > 0 ? `${(m.pushRate * 100).toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-1.5 text-[0.62rem] leading-relaxed text-[var(--muted-2)]">
                A line clearing its break-even here is NOT an edge. The
                simulation samples the same distribution the published
                probability comes from, so it agrees with the model by
                construction — and the model does not beat the closing line.
                What this shows is the shape of the outcomes behind a price,
                not a reason to take one.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
