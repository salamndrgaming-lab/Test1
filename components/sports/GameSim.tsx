"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { League, SgpLeg, SgpRecommendation } from "@/types";
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
import {
  prepareProps,
  simulateProps,
  totalMoments,
  isScoringComponent,
  type PropFitQuotes,
  type PropSimResult,
  type PropDecline,
} from "@/lib/propSim";
import type { PlayerGameLine } from "@/lib/providers/playerlogs";
import {
  samplesFor,
  simulatePlayer,
  beatsMarket,
  MIN_GAMES,
  type PlayerMarket,
  type PlayerProjection,
} from "@/lib/playerModel";
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
 *
 * Player props ride along on the same draws when the game has them. Their
 * marginals are the market's, fitted from the several lines books post for
 * the same player; what the simulation adds is the CO-MOVEMENT, which is the
 * one part of a same-game slip a posted price cannot tell you. See
 * lib/propSim.ts for why that works for points and is refused for rebounds.
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
  const eventIds = useMemo(() => rec.propEventIds ?? {}, [rec.propEventIds]);

  /** One entry per game that can actually be simulated. */
  const games = useMemo(() => {
    const byGame = new Map<string, SgpLeg[]>();
    for (const l of pool) {
      const g = byGame.get(l.gameId);
      if (g) g.push(l);
      else byGame.set(l.gameId, [l]);
    }
    /*
     * Ordered so what the panel can do MOST with comes first.
     *
     * This was a flat list of whatever order the board happened to be in —
     * on a live Friday, 48 games with the NBA ones at positions 5, 29, 35 and
     * 37 through 45. The default selection was therefore a football game, the
     * props section correctly reported that football has no market in the
     * scoreboard's units, and the nine NBA games that COULD run props were
     * invisible unless you scrolled a 48-entry dropdown looking for them.
     * Data being present is not the same as being findable.
     *
     * Leagues whose points markets can be fitted come first, so the default
     * selection can actually run the whole panel; the rest follow. Grouped by
     * league in the markup, with the prop-capable games marked.
     */
    const all = [...byGame.entries()]
      .map(([gameId, legs]) => ({
        gameId,
        matchup: legs[0].matchup,
        league: legs[0].league,
        legs,
        grid: legs.map(gridForLeg).find((g) => g != null) ?? null,
        canProps:
          eventIds[gameId] != null &&
          isScoringComponent(legs[0].league, "player_points"),
      }))
      .filter((g) => g.grid != null);

    /*
     * League tier first, THEN league, then prop-capability within it. Sorting
     * on capability above league split NBA into two runs — the capable games
     * and the rest — which would have emitted two NBA <optgroup>s for one
     * league. Grouping is the point, so the league has to win.
     */
    const tier = (league: string) =>
      isScoringComponent(league as League, "player_points") ? 0 : 1;
    return all.sort(
      (a, b) =>
        tier(a.league) - tier(b.league) ||
        a.league.localeCompare(b.league) ||
        Number(b.canProps) - Number(a.canProps) ||
        a.matchup.localeCompare(b.matchup),
    );
  }, [pool, eventIds]);

  const propCapable = useMemo(
    () => games.filter((g) => g.canProps).length,
    [games],
  );

  /** League groups in dropdown order, for <optgroup>. */
  const leagueGroups = useMemo(() => {
    const out: { league: string; games: typeof games; withProps: number }[] = [];
    for (const g of games) {
      let grp = out.find((o) => o.league === g.league);
      if (!grp) { grp = { league: g.league, games: [], withProps: 0 }; out.push(grp); }
      grp.games.push(g);
      if (g.canProps) grp.withProps++;
    }
    return out;
  }, [games]);

  const [gameId, setGameId] = useState<string | null>(null);
  const [runs, setRuns] = useState(10000);
  const [results, setResults] = useState<SimResult[]>([]);
  const [running, setRunning] = useState(false);
  const [latest, setLatest] = useState<SimResult | null>(null);
  /*
   * The finished run, kept separately from the accumulating one. The props
   * pass is tens of thousands of draws per player; running it on every
   * animation frame would stall the browser to recompute a number that is
   * only meaningful once the run is complete.
   */
  const [completed, setCompleted] = useState<SimResult[]>([]);
  const frame = useRef<number | null>(null);

  const [props, setProps] = useState<PropFitQuotes[] | null>(null);
  const [propBusy, setPropBusy] = useState(false);
  const [propNote, setPropNote] = useState<string | null>(null);

  /* The player's own games — the statistical model's only input. */
  const [logs, setLogs] = useState<PlayerGameLine[] | null>(null);
  const [logBusy, setLogBusy] = useState(false);
  const [logNote, setLogNote] = useState<string | null>(null);
  const [logGames, setLogGames] = useState(0);
  const [market, setMarket] = useState<PlayerMarket>("points");
  const [teamSides, setTeamSides] = useState<Record<string, "home" | "away">>({});

  const game = useMemo(
    () => games.find((g) => g.gameId === gameId) ?? games[0] ?? null,
    [games, gameId],
  );

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
    setCompleted([]);
    setLatest(null);
    setGameId(id);
    setProps(null);
    setPropNote(null);
    setLogs(null);
    setLogNote(null);
    setLogGames(0);
    setTeamSides({});
  };

  const start = useCallback(() => {
    if (!game?.grid || running) return;
    const grid = game.grid;
    const rnd = seededRandom(Date.now() & 0xffffffff);
    const acc: SimResult[] = [];
    setResults([]);
    setCompleted([]);
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
        setCompleted(acc.slice());
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

  /*
   * Why props can or cannot run on THIS game, always stated.
   *
   * The first version rendered nothing at all when a game did not qualify,
   * which from the outside is identical to the feature not existing — and the
   * default selection is whichever game tops the board, usually football. So
   * the section is always present and says which of the three cases applies:
   * it can run, the stat is in the wrong units for this sport, or there is no
   * props feed for this game.
   *
   * The button is still withheld in the unusable cases, because fetching
   * would spend credits on lines nothing here can honestly use.
   */
  const propsStatus: { ok: boolean; reason?: string } = !game
    ? { ok: false, reason: "no game selected" }
    : !isScoringComponent(game.league, "player_points")
      ? {
          ok: false,
          reason: `${game.league} has no player market measured in the units of its own scoreboard. Points are a slice of a basketball game's total; passing yards, receptions, shots on goal and strikeouts are not slices of anything this model projects, so a share of the total would be a ratio between unrelated quantities. Simulating one would mean inventing the correlation, which is the single thing this tool refuses to do.`,
        }
      : eventIds[game.gameId] == null
        ? { ok: false, reason: "no props feed is available for this game." }
        : { ok: true };
  const propsAvailable = propsStatus.ok;

  const loadProps = async () => {
    if (!game || propBusy) return;
    setPropBusy(true); setPropNote(null);
    try {
      const res = await fetch(
        `/api/sgp/props?league=${encodeURIComponent(game.league)}` +
          `&eventId=${encodeURIComponent(eventIds[game.gameId])}` +
          // The alternate-line ladder, not the price-edge board. One number
          // per player cannot identify a spread, so the cheap board is of no
          // use here however many books quote it.
          `&purpose=fit`,
      );
      const json = await res.json();
      if (Array.isArray(json.fitQuotes) && json.fitQuotes.length > 0) {
        setProps(json.fitQuotes as PropFitQuotes[]);
        const feed = json.feed as
          | { outcomes: number; books: number; identifiablePlayers: number }
          | undefined;
        setPropNote(
          `${feed?.outcomes ?? 0} prop prices from ${feed?.books ?? 0} book${feed?.books === 1 ? "" : "s"}; ` +
            `${feed?.identifiablePlayers ?? 0} player${feed?.identifiablePlayers === 1 ? "" : "s"} have two or more posted numbers, which is what a fit needs.` +
            (json.creditsUsed === 0 ? " Served from cache — no credits used." : ""),
        );
      } else {
        setProps([]);
        const feed = json.feed as
          | { outcomes: number; books: number; players?: number }
          | undefined;
        setPropNote(
          json.error === "budget"
            ? "Skipped to protect the monthly props budget."
            : json.error === "no-key"
              ? "No ODDS_API_KEY configured."
              : feed != null && feed.outcomes > 0
                ? `The feed returned ${feed.outcomes} prop prices from ${feed.books} book${feed.books === 1 ? "" : "s"}, but every player had only ONE posted number. One number is one equation in two unknowns, so no distribution can be fitted — and guessing the spread would make the correlation an invention.`
                : "The props feed returned nothing for this game. That is its coverage, not a judgement about the game.",
        );
      }
    } catch {
      setPropNote("Could not reach the props feed.");
    } finally {
      setPropBusy(false);
    }
  };

  /** The posted total, so "the game went over" means the market's over. */
  const postedTotal = useMemo(() => {
    const withLine = (game?.legs ?? []).find((l) => l.modelMeta?.totalLine != null);
    const posted = withLine?.modelMeta?.totalLine;
    if (posted != null) return { line: posted, posted: true };
    return summary ? { line: summary.meanTotal, posted: false } : null;
  }, [game, summary]);

  const loadLogs = async () => {
    if (!game || logBusy) return;
    setLogBusy(true); setLogNote(null);
    try {
      const res = await fetch(
        `/api/sgp/playerlogs?league=${encodeURIComponent(game.league)}` +
          `&eventId=${encodeURIComponent(game.gameId)}`,
      );
      const json = await res.json();
      if (Array.isArray(json.lines) && json.lines.length > 0) {
        setLogs(json.lines as PlayerGameLine[]);
        setLogGames(json.gamesRead ?? 0);
        const sides: Record<string, "home" | "away"> = {};
        for (const t of json.teams ?? []) {
          if (t.id && (t.homeAway === "home" || t.homeAway === "away")) {
            sides[t.id] = t.homeAway;
          }
        }
        setTeamSides(sides);
      } else {
        setLogs([]);
        setLogNote(
          json.reason ??
            (json.error === "timeout"
              ? "Reading the box scores took too long. They are cached once read, so trying again is usually quick."
              : "No completed box scores came back for these teams yet."),
        );
      }
    } catch {
      setLogNote("Could not reach the box-score feed.");
    } finally {
      setLogBusy(false);
    }
  };

  /** The market's own de-vigged probability per player, purely to compare. */
  const marketByPlayer = useMemo(() => {
    const out = new Map<string, { line: number; p: number }>();
    for (const row of props ?? []) {
      if (row.market !== "player_points" || !row.quotes.length) continue;
      const best = row.quotes.reduce((a, b) => (b.books > a.books ? b : a));
      out.set(row.player.toLowerCase(), { line: best.line, p: best.pOver });
    }
    return out;
  }, [props]);

  /**
   * The statistical projections.
   *
   * Lines come from the book where one is posted, because grading against a
   * real number is the only way the output can be checked; where none is, the
   * player's own median is used and the row says so. The LINE is the market's
   * contribution here and nothing else is — the probability is the player's.
   */
  const playerSim = useMemo(() => {
    if (!game?.grid || !logs?.length || completed.length === 0 || !postedTotal) {
      return null;
    }
    const samples = samplesFor(logs, market);
    const eligible = samples.filter((s) => s.games >= MIN_GAMES);
    const thin = samples.length - eligible.length;
    const gameTotals = completed.map((r) => r.homeScore + r.awayScore);
    const rows: (PlayerProjection & {
      marketProbability?: number;
      verdict?: ReturnType<typeof beatsMarket>["verdict"];
    })[] = [];
    for (const s of eligible) {
      const side = teamSides[s.teamId];
      // Without knowing which side a player is on, a points projection would
      // be multiplied by the WRONG team's simulated score. Skip rather than
      // guess; the feed gives the sides, so this should not normally fire.
      if (market === "points" && side == null) continue;
      const teamTotals = completed.map((r) =>
        side === "home" ? r.homeScore : r.awayScore,
      );
      const posted = marketByPlayer.get(s.player.toLowerCase());
      const sorted = [...s.values].sort((a, b) => a - b);
      const line =
        posted?.line ??
        Math.floor(sorted[Math.floor(sorted.length / 2)]) + 0.5;
      let seed = s.games * 7919;
      for (let i = 0; i < s.player.length; i++) {
        seed = (seed * 31 + s.player.charCodeAt(i)) & 0x7fffffff;
      }
      const p = simulatePlayer(
        s, line, teamTotals, gameTotals, postedTotal.line, seededRandom(seed),
      );
      rows.push({
        ...p,
        marketProbability: posted?.p,
        verdict: posted ? beatsMarket(p, posted.p).verdict : undefined,
      });
    }
    rows.sort((a, b) => b.projected - a.projected);
    return { rows, thin, samples: samples.length };
  }, [game, logs, completed, postedTotal, market, teamSides, marketByPlayer]);

  const propSim = useMemo(() => {
    if (!game?.grid || !props?.length || completed.length === 0 || !postedTotal) {
      return null;
    }
    const agg = totalMoments(game.grid);
    const { inputs, declined } = prepareProps(game.league, props, agg.mean, agg.sd);
    const totals = completed.map((r) => r.homeScore + r.awayScore);
    // Seeded off the game and the run length, so the residual noise is
    // reproducible: the same finished run gives the same prop table twice.
    let seed = 0x5bf03635 ^ completed.length;
    for (let i = 0; i < game.gameId.length; i++) {
      seed = (seed * 31 + game.gameId.charCodeAt(i)) & 0x7fffffff;
    }
    const rnd = seededRandom(seed);
    return {
      rows: simulateProps(inputs, totals, agg.mean, postedTotal.line, rnd),
      declined,
      agg,
    };
  }, [game, props, completed, postedTotal]);

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
          {games.length} game{games.length === 1 ? "" : "s"}
          {propCapable > 0 && (
            <>
              {" · "}
              <span className="text-[var(--accent)]">
                {propCapable} with player props
              </span>
            </>
          )}
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
            {leagueGroups.map((grp) => (
              <optgroup
                key={grp.league}
                label={
                  grp.withProps > 0
                    ? `${grp.league} — ${grp.withProps} with player props`
                    : `${grp.league} — team markets only`
                }
              >
                {grp.games.map((g) => (
                  <option key={g.gameId} value={g.gameId}>
                    {g.matchup}
                    {g.canProps ? " · props" : ""}
                  </option>
                ))}
              </optgroup>
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

          {propsAvailable && (
            <div className="mt-3 border-t border-[var(--border)] pt-2.5">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[0.7rem] font-semibold text-[var(--text)]">
                  Player props from the players&apos; own games
                </p>
                <div className="flex items-center gap-1.5">
                  {(["points", "rebounds", "assists", "threes"] as PlayerMarket[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMarket(m)}
                      className={classNames(
                        "rounded-full border px-2 py-0.5 text-[0.6rem] capitalize transition-colors",
                        market === m
                          ? "border-sky-400 bg-sky-400/10 text-sky-200"
                          : "border-[var(--border)] text-[var(--muted)]",
                      )}
                    >
                      {m}
                    </button>
                  ))}
                  {logs == null && (
                    <button
                      onClick={loadLogs}
                      disabled={logBusy}
                      className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[0.65rem] text-[var(--muted)] hover:border-[var(--accent)]/50 disabled:opacity-40"
                    >
                      {logBusy ? "Reading box scores…" : "Load player games"}
                    </button>
                  )}
                </div>
              </div>
              <p className="mb-2 text-[0.65rem] leading-relaxed text-[var(--muted-2)]">
                Every probability here is simulated from the player&apos;s own
                box scores this season — no book&apos;s number is an input. Each
                run resamples one of their actual games, so nothing is assumed
                about the shape of the distribution. For points, that
                game&apos;s share of its team&apos;s scoring is applied to
                tonight&apos;s simulated team score, which is what makes this
                a projection for THIS game rather than a tally of past ones.
                The book&apos;s line is used only as the number to grade
                against, and its price only as something to disagree with.
              </p>
              {logNote && (
                <p className="mb-2 rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5 text-[0.65rem] leading-relaxed text-[var(--muted)]">
                  {logNote}
                </p>
              )}

              {playerSim && playerSim.rows.length > 0 && (
                <>
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-[0.7rem]">
                      <thead className="sticky top-0 bg-[var(--surface)]">
                        <tr className="text-[0.6rem] uppercase tracking-wide text-[var(--muted-2)]">
                          <th className="pb-1 text-left font-medium">Player</th>
                          <th className="pb-1 text-right font-medium">Gms</th>
                          <th className="pb-1 text-right font-medium">Avg</th>
                          <th className="pb-1 text-right font-medium">Proj</th>
                          <th className="pb-1 text-right font-medium">Line</th>
                          <th className="pb-1 text-right font-medium">Over</th>
                          <th className="pb-1 text-right font-medium">90% range</th>
                          <th className="pb-1 text-right font-medium">Book</th>
                        </tr>
                      </thead>
                      <tbody>
                        {playerSim.rows.map((r) => (
                          <tr
                            key={`${r.player}|${r.market}`}
                            className="border-t border-[var(--border)]"
                          >
                            <td className="py-1 pr-2 truncate">
                              {r.player}
                              <span className="ml-1 text-[0.6rem] text-[var(--muted-2)]">
                                {r.teamAbbr} · {r.meanMinutes.toFixed(0)}m
                              </span>
                            </td>
                            <td className="py-1 text-right tabular-nums text-[var(--muted-2)]">
                              {r.games}
                            </td>
                            <td className="py-1 text-right tabular-nums text-[var(--muted-2)]">
                              {r.historicalMean.toFixed(1)}
                            </td>
                            <td className="py-1 text-right tabular-nums">
                              {r.projected.toFixed(1)}
                            </td>
                            <td className="py-1 text-right tabular-nums text-[var(--muted)]">
                              {r.line}
                            </td>
                            <td className="py-1 text-right font-semibold tabular-nums">
                              {(r.hitRate * 100).toFixed(0)}%
                            </td>
                            <td className="py-1 text-right tabular-nums text-[var(--muted-2)]">
                              {(r.lo * 100).toFixed(0)}–{(r.hi * 100).toFixed(0)}%
                            </td>
                            <td className="py-1 text-right tabular-nums">
                              {r.marketProbability == null ? (
                                <span className="text-[var(--muted-2)]">—</span>
                              ) : (
                                <span
                                  className={classNames(
                                    r.verdict === "indistinguishable"
                                      ? "text-[var(--muted-2)]"
                                      : "font-semibold text-good",
                                  )}
                                >
                                  {(r.marketProbability * 100).toFixed(0)}%
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1.5 text-[0.62rem] leading-relaxed text-[var(--muted-2)]">
                    Read the <strong>90% range</strong> before anything else.
                    It comes from resampling WHICH GAMES we happened to see, so
                    it carries the fact that there are only {logGames} games of
                    this season to read. Where that range contains the
                    book&apos;s own number, the history cannot tell the two
                    apart and the difference is not a finding however large it
                    looks — those rows are greyed. A column that disagrees with
                    the book is a hypothesis to log, not a bet: nothing in this
                    project has yet measured whether these projections beat a
                    closing prop line, and the team model does not beat a
                    closing side.
                    {playerSim.thin > 0 && (
                      <>
                        {" "}
                        {playerSim.thin} further player
                        {playerSim.thin === 1 ? "" : "s"} appeared in fewer than{" "}
                        {MIN_GAMES} games and were left out rather than
                        projected from two or three nights.
                      </>
                    )}
                  </p>
                </>
              )}

              {logs != null && logs.length > 0 && completed.length === 0 && (
                <p className="text-[0.65rem] text-[var(--muted)]">
                  {logGames} games of box scores loaded. The projections need a
                  completed run — press Run.
                </p>
              )}

              {playerSim && playerSim.rows.length === 0 && (
                <p className="text-[0.65rem] leading-relaxed text-[var(--muted)]">
                  No player in these box scores has at least {MIN_GAMES} games
                  of {market} this season, so there is nothing here a
                  projection could be built from.
                </p>
              )}

              <details className="mt-2">
                <summary className="cursor-pointer text-[0.65rem] text-[var(--muted-2)]">
                  Also compare the books&apos; own prop lines (2 credits)
                </summary>
                <div className="mt-1.5">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[0.7rem] font-semibold text-[var(--text)]">
                  Player props on these same runs
                </p>
                {propsAvailable && props == null && (
                  <button
                    onClick={loadProps}
                    disabled={propBusy}
                    className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[0.65rem] text-[var(--muted)] hover:border-[var(--accent)]/50 disabled:opacity-40"
                  >
                    {propBusy ? "Loading…" : "Load props (2 credits)"}
                  </button>
                )}
              </div>
              <p className="mb-2 text-[0.65rem] leading-relaxed text-[var(--muted-2)]">
                A prop&apos;s own probability here is the market&apos;s,
                fitted from the ladder of alternate lines books post for the
                same player — the model has no player distribution and still
                does not pretend to. Several priced numbers are what make the
                fit possible at all: one number is one equation in two
                unknowns. What the run adds is how the prop moves WITH the
                game, which no single posted price can tell you.
              </p>
              {propNote && (
                <p className="mb-2 text-[0.65rem] text-[var(--muted)]">{propNote}</p>
              )}

              {propSim && propSim.rows.length > 0 && postedTotal && (
                <>
                  <div className="max-h-80 overflow-y-auto">
                    <table className="w-full text-[0.7rem]">
                      <thead className="sticky top-0 bg-[var(--surface)]">
                        <tr className="text-[0.6rem] uppercase tracking-wide text-[var(--muted-2)]">
                          <th className="pb-1 text-left font-medium">Player</th>
                          <th className="pb-1 text-right font-medium">Over</th>
                          <th className="pb-1 text-right font-medium">Hits</th>
                          <th className="pb-1 text-right font-medium">If over {postedTotal.line}</th>
                          <th className="pb-1 text-right font-medium">If under</th>
                          <th className="pb-1 text-right font-medium">ρ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {propSim.rows.map((r: PropSimResult) => (
                          <tr key={`${r.player}|${r.market}`} className="border-t border-[var(--border)]">
                            <td className="py-1 pr-2 truncate">{r.player}</td>
                            <td className="py-1 text-right tabular-nums text-[var(--muted)]">
                              {r.line}
                            </td>
                            <td className="py-1 text-right tabular-nums">
                              {(r.hitRate * 100).toFixed(1)}%
                            </td>
                            <td className="py-1 text-right tabular-nums text-good">
                              {(r.hitGivenOver * 100).toFixed(1)}%
                            </td>
                            <td className="py-1 text-right tabular-nums text-[var(--muted)]">
                              {(r.hitGivenUnder * 100).toFixed(1)}%
                            </td>
                            <td className="py-1 text-right tabular-nums text-[var(--muted-2)]">
                              {r.rho.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1.5 text-[0.62rem] leading-relaxed text-[var(--muted-2)]">
                    &ldquo;Hits&rdquo; reproduces the de-vigged market price by
                    construction — it is there as a check, not as a finding;
                    if it drifted from the posted number the fit would be
                    broken. The two columns beside it are the output, and the
                    gap between them is why pairing a scorer&apos;s over with
                    the game&apos;s over is not two independent bets. ρ is
                    derived from the player&apos;s fitted spread against the
                    game total&apos;s, not chosen.{" "}
                    {postedTotal.posted
                      ? `Split at the posted total of ${postedTotal.line}.`
                      : `No total is posted on this game, so the split is at the simulated mean of ${postedTotal.line.toFixed(1)} — a different question from the market's over.`}
                  </p>
                </>
              )}

              {props != null && props.length > 0 && completed.length === 0 && (
                <p className="text-[0.65rem] text-[var(--muted)]">
                  {props.length} priced prop{props.length === 1 ? "" : "s"}{" "}
                  loaded. They are graded on a completed run — let this one
                  finish, or press Run.
                </p>
              )}

              {propSim && propSim.rows.length === 0 && (
                <p className="text-[0.65rem] leading-relaxed text-[var(--muted)]">
                  Nothing on this game&apos;s props board can be simulated
                  honestly — see below for what each one was refused for.
                </p>
              )}

              {propSim && propSim.declined.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[0.65rem] text-[var(--muted-2)]">
                    {propSim.declined.length} prop
                    {propSim.declined.length === 1 ? "" : "s"} refused, and why
                  </summary>
                  <ul className="mt-1 space-y-0.5 text-[0.62rem] leading-relaxed text-[var(--muted-2)]">
                    {groupDeclines(propSim.declined).map((d) => (
                      <li key={d.reason}>
                        <span className="text-[var(--muted)]">{d.count}×</span>{" "}
                        {d.reason}
                        {d.examples.length > 0 && (
                          <span className="text-[var(--muted-2)]">
                            {" "}— e.g. {d.examples.join(", ")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[0.6rem] leading-relaxed text-[var(--muted-2)]">
                    These are listed rather than hidden because the players
                    this can simulate are not a shortlist of the good ones —
                    they are whichever players two books happened to disagree
                    about, in a market measured in the same units as the
                    scoreboard.
                  </p>
                </details>
              )}
                </div>
              </details>
            </div>
          )}

          {!propsAvailable && (
            <div className="mt-3 border-t border-[var(--border)] pt-2.5">
              <p className="mb-1 text-[0.7rem] font-semibold text-[var(--text)]">
                Player props
              </p>
              <p className="rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5 text-[0.65rem] leading-relaxed text-[var(--muted)]">
                Not available on this game: {propsStatus.reason}
                {game && !isScoringComponent(game.league, "player_points") && (
                  <> Pick an NBA or college basketball game above to run it.</>
                )}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Collapse the refusals so a board of forty props is readable. */
function groupDeclines(
  declined: PropDecline[],
): { reason: string; count: number; examples: string[] }[] {
  const by = new Map<string, PropDecline[]>();
  for (const d of declined) {
    const g = by.get(d.reason);
    if (g) g.push(d);
    else by.set(d.reason, [d]);
  }
  return [...by.entries()]
    .map(([reason, rows]) => ({
      reason,
      count: rows.length,
      examples: rows.slice(0, 3).map((r) => `${r.player} (${r.market.replace(/^player_|^batter_|^pitcher_/, "")})`),
    }))
    .sort((a, b) => b.count - a.count);
}
