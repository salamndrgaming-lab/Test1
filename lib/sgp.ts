import type {
  Confidence,
  Game,
  League,
  MarketOdds,
  SgpConfidenceFactor,
  SgpLeg,
  SgpLegModelMeta,
  SgpRecommendation,
} from "@/types";
import { formatOdds } from "@/lib/format";

export const SGP_DISCLAIMER =
  "For informational and educational purposes only. This is not betting or " +
  "financial advice and does not guarantee any outcome. Odds and stats are " +
  "illustrative. Must be 21+ (or legal age in your jurisdiction). If you or " +
  "someone you know has a gambling problem, call 1-800-GAMBLER.";

export const MODEL_VERSION = "margin-v2";

/* ------------------------------------------------------------------ *
 * 1. Odds math
 * ------------------------------------------------------------------ */

/** American odds -> decimal odds. */
export function americanToDecimal(american: number): number {
  if (american > 0) return american / 100 + 1;
  return 100 / Math.abs(american) + 1;
}

/** Decimal odds -> American odds. */
export function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

/** Break-even probability implied by decimal odds (INCLUDES the book's margin). */
export function impliedProbability(decimal: number): number {
  return 1 / decimal;
}

/** Fair American odds for a given true probability. */
export function fairAmericanOdds(prob: number): number {
  const p = clamp(prob, 0.001, 0.999);
  return decimalToAmerican(1 / p);
}

/**
 * Remove the bookmaker's margin ("vig") from a set of raw implied probabilities
 * so they sum to 1. Raw implieds on a two-way market sum to ~1.02–1.08; that
 * excess is the book's hold, not real probability. Comparing a model against
 * RAW implied invents edge that isn't there — de-vigging is the single most
 * important accuracy fix in this model.
 */
export function removeVig(rawImplied: number[]): {
  fair: number[];
  vig: number;
} {
  const sum = rawImplied.reduce((a, b) => a + b, 0);
  if (sum <= 0) return { fair: rawImplied, vig: 0 };
  return { fair: rawImplied.map((p) => p / sum), vig: sum - 1 };
}

/** Expected value per $1 staked at these odds, given a true probability. */
export function expectedValue(prob: number, decimal: number): number {
  return prob * (decimal - 1) - (1 - prob);
}

/** Kelly stake fraction (0 when there's no edge). Negative edge -> 0. */
export function kellyFraction(prob: number, decimal: number): number {
  const b = decimal - 1;
  if (b <= 0) return 0;
  return Math.max(0, (prob * b - (1 - prob)) / b);
}

/** Combine legs' prices into the parlay's decimal odds (what a book would pay). */
export function combineLegs(legs: SgpLeg[]): number {
  return legs.reduce((acc, leg) => acc * americanToDecimal(leg.americanOdds), 1);
}

/* ------------------------------------------------------------------ *
 * 2. Statistics helpers
 * ------------------------------------------------------------------ */

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Abramowitz & Stegun 7.1.26 — |error| < 1.5e-7. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/** Standard normal CDF. */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Inverse standard normal CDF (Acklam's approximation). */
export function normalQuantile(p: number): number {
  const a = [
    -3.969683028665376e1, 2.20946098424521e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pl = 0.02425;
  const q0 = clamp(p, 1e-9, 1 - 1e-9);
  if (q0 < pl) {
    const q = Math.sqrt(-2 * Math.log(q0));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (q0 <= 1 - pl) {
    const q = q0 - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - q0));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

/**
 * Log5 (Bill James): probability team A beats team B given each team's win
 * rate, on neutral ground. The standard way to turn two win% values into a
 * head-to-head probability.
 */
export function log5(pA: number, pB: number): number {
  const a = clamp(pA, 0.02, 0.98);
  const b = clamp(pB, 0.02, 0.98);
  const denom = a + b - 2 * a * b;
  if (denom <= 0) return 0.5;
  return (a - a * b) / denom;
}

/* ------------------------------------------------------------------ *
 * 3. League parameters
 * ------------------------------------------------------------------ */

export interface LeagueModel {
  /** SD of final margin, in the sport's own units. */
  marginSigma: number;
  /** Home advantage expressed in margin units. */
  homeEdge: number;
  /** Shrinkage constant: games needed before records carry real weight. */
  priorGames: number;
  unit: string;
}

export const LEAGUE_MODEL: Record<League, LeagueModel> = {
  NBA: { marginSigma: 12.0, homeEdge: 2.2, priorGames: 20, unit: "pts" },
  NFL: { marginSigma: 13.2, homeEdge: 1.6, priorGames: 6, unit: "pts" },
  NHL: { marginSigma: 2.3, homeEdge: 0.25, priorGames: 25, unit: "goals" },
  MLB: { marginSigma: 4.2, homeEdge: 0.2, priorGames: 40, unit: "runs" },
  NCAAF: { marginSigma: 16.5, homeEdge: 2.4, priorGames: 6, unit: "pts" },
  NCAAB: { marginSigma: 11.0, homeEdge: 3.0, priorGames: 15, unit: "pts" },
};

/**
 * Hard cap on how much our record-based prior can move off the market.
 * Betting markets are highly efficient; a win%-only model deserves a minority
 * vote. Keeping this explicit (and low) is what stops the tool inventing edge.
 */
export const MAX_MODEL_WEIGHT = 0.35;

/**
 * Leagues whose spread is a true point spread priced at the standard -110.
 * NHL (puck line) and MLB (run line) are excluded: they are fixed at ±1.5 and
 * priced like moneylines, so -110 must never be assumed for them.
 */
export const STANDARD_SPREAD_LEAGUES = new Set<League>([
  "NBA",
  "NFL",
  "NCAAF",
  "NCAAB",
]);

/* ------------------------------------------------------------------ *
 * 4. Team records
 * ------------------------------------------------------------------ */

export interface ParsedRecord {
  wins: number;
  games: number;
  winPct: number;
}

/** Parse "41-15" or "34-16-5" (NHL: W-L-OTL). An OTL is still a loss. */
export function parseRecord(record?: string): ParsedRecord | null {
  if (!record) return null;
  const nums = record.split("-").map((n) => Number(n.trim()));
  if (nums.length < 2 || nums.some((n) => !Number.isFinite(n))) return null;
  const games = nums.reduce((a, b) => a + b, 0);
  if (games <= 0) return null;
  return { wins: nums[0], games, winPct: nums[0] / games };
}

/* ------------------------------------------------------------------ *
 * 5. The game model — one coherent margin distribution per game
 * ------------------------------------------------------------------ *
 * Everything (moneyline, spread) is derived from a single projected margin and
 * its standard deviation, so the markets stay internally consistent and the
 * same-game correlation becomes exactly computable.
 */

export interface GameModel {
  league: League;
  sigma: number;
  /** Market's projected home margin (positive = home favoured). */
  marketMargin: number;
  /** Our record-based projected home margin (null when records are missing). */
  modelMargin: number | null;
  /** Final blended projection used for all legs in this game. */
  blendedMargin: number;
  /** Weight given to our model (0..MAX_MODEL_WEIGHT). */
  modelWeight: number;
  /** De-vigged market probability that the home team wins. */
  marketHomeWinProb: number;
  /** Book margin on the moneyline (0 when unavailable). */
  vig: number;
  /** Games played by the less-established team (drives shrinkage). */
  sampleGames: number;
}

export function buildGameModel(game: Game, odds: MarketOdds): GameModel | null {
  const lm = LEAGUE_MODEL[game.league];
  if (!lm) return null;
  const { marginSigma: sigma } = lm;

  // --- market view -------------------------------------------------
  let marketHomeWinProb = 0.5;
  let vig = 0;
  if (odds.homeMoneyline != null && odds.awayMoneyline != null) {
    const rawHome = impliedProbability(americanToDecimal(odds.homeMoneyline));
    const rawAway = impliedProbability(americanToDecimal(odds.awayMoneyline));
    const dv = removeVig([rawHome, rawAway]);
    marketHomeWinProb = dv.fair[0];
    vig = dv.vig;
  }

  // The posted spread IS the market's projected margin — prefer it when
  // present; otherwise invert the de-vigged moneyline through the margin model.
  const marketMargin =
    odds.spread != null && Number.isFinite(odds.spread)
      ? -odds.spread // stored as the HOME spread (negative = home favoured)
      : sigma * normalQuantile(clamp(marketHomeWinProb, 0.01, 0.99));

  // --- our view ----------------------------------------------------
  const homeRec = parseRecord(game.home.record);
  const awayRec = parseRecord(game.away.record);
  let modelMargin: number | null = null;
  let sampleGames = 0;
  if (homeRec && awayRec) {
    sampleGames = Math.min(homeRec.games, awayRec.games);
    const neutralHomeWin = log5(homeRec.winPct, awayRec.winPct);
    modelMargin =
      sigma * normalQuantile(clamp(neutralHomeWin, 0.02, 0.98)) + lm.homeEdge;
  }

  // --- blend with shrinkage ---------------------------------------
  const modelWeight =
    modelMargin === null
      ? 0
      : MAX_MODEL_WEIGHT * (sampleGames / (sampleGames + lm.priorGames));
  const blendedMargin =
    modelMargin === null
      ? marketMargin
      : modelWeight * modelMargin + (1 - modelWeight) * marketMargin;

  return {
    league: game.league,
    sigma,
    marketMargin,
    modelMargin,
    blendedMargin,
    modelWeight,
    marketHomeWinProb,
    vig,
    sampleGames,
  };
}

/** P(home margin > threshold) under the model. */
function pHomeMarginAbove(gm: GameModel, threshold: number): number {
  return clamp(normalCdf((gm.blendedMargin - threshold) / gm.sigma), 0.01, 0.99);
}

/* ------------------------------------------------------------------ *
 * 6. Confidence — how much we trust THIS estimate (not how likely it is)
 * ------------------------------------------------------------------ */

export type ConfidenceFactor = SgpConfidenceFactor;

export interface ConfidenceResult {
  score: number; // 0..1
  level: Confidence;
  factors: ConfidenceFactor[];
}

/**
 * Confidence reflects the RELIABILITY of the estimate, combining:
 *  - sample size behind the record prior,
 *  - how far our model strays from an efficient market (big gaps usually mean
 *    bad inputs, not free money),
 *  - the price quality (high vig = a worse, noisier market),
 *  - whether we actually model this market at all.
 */
export function computeConfidence(opts: {
  sampleGames: number;
  priorGames: number;
  modelProb: number;
  marketProb: number;
  vig: number;
  isModelled: boolean;
}): ConfidenceResult {
  const { sampleGames, priorGames, modelProb, marketProb, vig, isModelled } =
    opts;

  const sample = clamp(sampleGames / (sampleGames + priorGames), 0, 1);
  const divergence = Math.abs(modelProb - marketProb);
  // 0 divergence -> 1.0 ; 15pp divergence -> ~0.0
  const agreement = clamp(1 - divergence / 0.15, 0, 1);
  // 2% hold -> ~1.0 ; 10% hold -> ~0.0
  const priceQuality = clamp(1 - (vig - 0.02) / 0.08, 0, 1);

  const base = 0.4 * sample + 0.3 * agreement + 0.3 * priceQuality;
  // An unmodelled market scores perfect "agreement" only because the model IS
  // the market — that must never read as confidence, so gate it hard.
  const score = clamp(isModelled ? base : Math.min(base * 0.35, 0.3), 0, 1);

  const level: Confidence = score >= 0.7 ? "high" : score >= 0.45 ? "medium" : "low";

  return {
    score: Number(score.toFixed(3)),
    level,
    factors: [
      {
        label: "Sample size",
        value: Number(sample.toFixed(2)),
        note: `${sampleGames} games of record behind the prior`,
      },
      {
        label: "Market agreement",
        value: Number(agreement.toFixed(2)),
        note: `model differs from market by ${(divergence * 100).toFixed(1)}pp`,
      },
      {
        label: "Price quality",
        value: Number(priceQuality.toFixed(2)),
        note: `book margin ${(vig * 100).toFixed(1)}%`,
      },
      {
        label: "Market coverage",
        value: isModelled ? 1 : 0,
        note: isModelled
          ? "this market is modelled"
          : "no directional model for this market — confidence capped",
      },
    ],
  };
}

/* ------------------------------------------------------------------ *
 * 7. Leg construction
 * ------------------------------------------------------------------ */

/** Everything needed to compute exact same-game correlation later. */
export type LegModelMeta = SgpLegModelMeta;

interface LegInput {
  id: string;
  game: Game;
  gm: GameModel;
  market: string;
  selection: string;
  americanOdds: number;
  modelProb: number;
  marketProb: number;
  isModelled: boolean;
  rationale: string;
  stats: { label: string; value: string }[];
  reference: { label: string; url: string };
  meta: LegModelMeta;
}

function makeLeg(input: LegInput): SgpLeg {
  const decimal = americanToDecimal(input.americanOdds);
  const rawImplied = impliedProbability(decimal);
  const edge = input.modelProb - rawImplied;
  const conf = computeConfidence({
    sampleGames: input.gm.sampleGames,
    priorGames: LEAGUE_MODEL[input.game.league].priorGames,
    modelProb: input.modelProb,
    marketProb: input.marketProb,
    vig: input.gm.vig,
    isModelled: input.isModelled,
  });

  return {
    id: input.id,
    gameId: input.game.id,
    league: input.game.league,
    matchup: `${input.game.away.abbreviation} @ ${input.game.home.abbreviation}`,
    market: input.market,
    selection: input.selection,
    americanOdds: input.americanOdds,
    modelProbability: Number(input.modelProb.toFixed(4)),
    marketProbability: Number(input.marketProb.toFixed(4)),
    breakEvenProbability: Number(rawImplied.toFixed(4)),
    fairAmericanOdds: fairAmericanOdds(input.modelProb),
    edge: Number(edge.toFixed(4)),
    expectedValue: Number(expectedValue(input.modelProb, decimal).toFixed(4)),
    kellyFraction: Number(kellyFraction(input.modelProb, decimal).toFixed(4)),
    confidence: conf.level,
    confidenceScore: conf.score,
    confidenceFactors: conf.factors,
    rationale: input.rationale,
    supportingStats: input.stats,
    references: [input.reference],
    modelMeta: input.meta,
  };
}

/**
 * Turn upcoming games with real odds into research legs.
 *
 * For each game we build one margin distribution (see buildGameModel) and read
 * every market off it, so moneyline and spread can never contradict each other.
 * Both sides of each market are evaluated and the better-value side is kept —
 * the old version always took the favourite, which ignored underdog value.
 */
export function legsFromGames(
  games: Game[],
  odds: MarketOdds[],
  gameLinks: Record<string, string> = {},
): SgpLeg[] {
  const oddsByGame = new Map(odds.map((o) => [o.gameId, o]));
  const legs: SgpLeg[] = [];

  for (const g of games) {
    if (g.status === "final") continue;
    const o = oddsByGame.get(g.id);
    if (!o) continue;
    const gm = buildGameModel(g, o);
    if (!gm) continue;

    const lm = LEAGUE_MODEL[g.league];
    const ref = gameLinks[g.id]
      ? { label: "ESPN — Game preview & odds", url: gameLinks[g.id] }
      : { label: "ESPN — Scoreboard", url: "https://www.espn.com/" };

    const marginStat = {
      label: "Proj. margin",
      value: `${gm.blendedMargin > 0 ? g.home.abbreviation : g.away.abbreviation} by ${Math.abs(gm.blendedMargin).toFixed(1)} ${lm.unit}`,
    };
    const weightStat = {
      label: "Model weight",
      value: `${(gm.modelWeight * 100).toFixed(0)}%`,
    };

    // ---- Moneyline: evaluate BOTH sides, keep the better value ----
    if (o.homeMoneyline != null && o.awayMoneyline != null) {
      const pHome = pHomeMarginAbove(gm, 0);
      const sides = [
        {
          team: g.home,
          opp: g.away,
          isHome: true,
          american: o.homeMoneyline,
          model: pHome,
          market: gm.marketHomeWinProb,
        },
        {
          team: g.away,
          opp: g.home,
          isHome: false,
          american: o.awayMoneyline,
          model: 1 - pHome,
          market: 1 - gm.marketHomeWinProb,
        },
      ];
      const best = sides.reduce((a, b) =>
        b.model - impliedProbability(americanToDecimal(b.american)) >
        a.model - impliedProbability(americanToDecimal(a.american))
          ? b
          : a,
      );
      legs.push(
        makeLeg({
          id: `${g.id}-ml`,
          game: g,
          gm,
          market: "Moneyline",
          selection: `${best.team.name} ML`,
          americanOdds: best.american,
          modelProb: best.model,
          marketProb: best.market,
          isModelled: true,
          rationale:
            `Model projects ${marginStat.value}. That puts ${best.team.name} at ` +
            `${(best.model * 100).toFixed(1)}% to win outright versus a de-vigged market price of ` +
            `${(best.market * 100).toFixed(1)}%. Records: ${g.home.abbreviation} ${g.home.record ?? "N/A"}, ` +
            `${g.away.abbreviation} ${g.away.record ?? "N/A"}.`,
          stats: [
            { label: "Price", value: formatOdds(best.american) },
            { label: "Model", value: `${(best.model * 100).toFixed(1)}%` },
            { label: "Market (no vig)", value: `${(best.market * 100).toFixed(1)}%` },
            marginStat,
            weightStat,
          ],
          reference: ref,
          meta: {
            kind: "margin",
            side: best.isHome ? "home" : "away",
            threshold: 0,
            blendedMargin: gm.blendedMargin,
            sigma: gm.sigma,
          },
        }),
      );
    }

    // ---- Spread: P(cover) straight off the margin distribution ----
    // Only assume the standard -110 price for true point-spread sports. NHL
    // puck lines and MLB run lines are fixed at ±1.5 and priced like a
    // moneyline (often -200/+170), so defaulting them to -110 would invent a
    // large fake edge. Without a real price we skip the leg.
    const spreadPriced =
      (o.spreadHomeOdds != null && o.spreadAwayOdds != null) ||
      STANDARD_SPREAD_LEAGUES.has(g.league);
    if (o.spread != null && Number.isFinite(o.spread) && spreadPriced) {
      const homeLine = o.spread; // e.g. -4.5 => home must win by >4.5
      const pHomeCover = pHomeMarginAbove(gm, -homeLine);
      const priceHome = o.spreadHomeOdds ?? -110;
      const priceAway = o.spreadAwayOdds ?? -110;
      const sides = [
        {
          team: g.home,
          isHome: true,
          line: homeLine,
          american: priceHome,
          model: pHomeCover,
          threshold: -homeLine,
        },
        {
          team: g.away,
          isHome: false,
          line: -homeLine,
          american: priceAway,
          model: 1 - pHomeCover,
          threshold: homeLine,
        },
      ];
      const best = sides.reduce((a, b) =>
        b.model - impliedProbability(americanToDecimal(b.american)) >
        a.model - impliedProbability(americanToDecimal(a.american))
          ? b
          : a,
      );
      const lineStr = `${best.line > 0 ? "+" : ""}${best.line}`;
      // de-vigged market view of a spread is ~50/50 by construction
      const rawPair = removeVig([
        impliedProbability(americanToDecimal(priceHome)),
        impliedProbability(americanToDecimal(priceAway)),
      ]);
      const marketProb = best.isHome ? rawPair.fair[0] : rawPair.fair[1];

      legs.push(
        makeLeg({
          id: `${g.id}-spread`,
          game: g,
          gm,
          market: "Spread",
          selection: `${best.team.name} ${lineStr}`,
          americanOdds: best.american,
          modelProb: best.model,
          marketProb,
          isModelled: true,
          rationale:
            `The market line implies a ${Math.abs(gm.marketMargin).toFixed(1)}-${lm.unit} margin; ` +
            `our blended projection is ${Math.abs(gm.blendedMargin).toFixed(1)}. ` +
            `Against ${lineStr}, that gives ${best.team.name} a ${(best.model * 100).toFixed(1)}% cover probability.`,
          stats: [
            { label: "Line", value: `${best.team.abbreviation} ${lineStr}` },
            { label: "Price", value: formatOdds(best.american) },
            { label: "Model cover", value: `${(best.model * 100).toFixed(1)}%` },
            marginStat,
            weightStat,
          ],
          reference: ref,
          meta: {
            kind: "margin",
            side: best.isHome ? "home" : "away",
            threshold: best.threshold,
            blendedMargin: gm.blendedMargin,
            sigma: gm.sigma,
          },
        }),
      );
    }

    // ---- Total: we have no scoring data, so stay explicitly neutral ----
    if (o.total != null && Number.isFinite(o.total)) {
      const priceOver = o.overOdds ?? -110;
      const priceUnder = o.underOdds ?? -110;
      const dv = removeVig([
        impliedProbability(americanToDecimal(priceOver)),
        impliedProbability(americanToDecimal(priceUnder)),
      ]);
      legs.push(
        makeLeg({
          id: `${g.id}-total`,
          game: g,
          gm,
          market: "Total",
          selection: `Over ${o.total}`,
          americanOdds: priceOver,
          modelProb: dv.fair[0], // == market: no directional opinion
          marketProb: dv.fair[0],
          isModelled: false,
          rationale:
            `Posted total is ${o.total}. We have no team scoring data from this feed, so ` +
            `no directional model is applied — this leg is priced at the market and carries ` +
            `negative expected value equal to the book's margin. Shown for completeness.`,
          stats: [
            { label: "Total", value: String(o.total) },
            { label: "Price", value: formatOdds(priceOver) },
            { label: "Model", value: "market-neutral" },
          ],
          reference: ref,
          meta: { kind: "total" },
        }),
      );
    }
  }

  return legs;
}

/* ------------------------------------------------------------------ *
 * 8. Correlation — the honest joint probability of a slip
 * ------------------------------------------------------------------ */

/**
 * True probability that every leg wins.
 *
 * Legs from DIFFERENT games are independent, so they multiply. Legs from the
 * SAME game are not: "Team A ML" and "Team A -4.5" are nested events, and
 * multiplying them understates the joint probability badly. Because every
 * margin leg is a threshold on the same normal margin, the exact joint is the
 * probability that the margin lands in the intersection of those thresholds.
 */
export function jointProbability(legs: SgpLeg[]): number {
  const byGame = new Map<string, SgpLeg[]>();
  for (const leg of legs) {
    const list = byGame.get(leg.gameId) ?? [];
    list.push(leg);
    byGame.set(leg.gameId, list);
  }

  let joint = 1;
  for (const group of byGame.values()) {
    const marginLegs = group.filter(
      (l) => l.modelMeta?.kind === "margin" && l.modelMeta.sigma != null,
    );
    const otherLegs = group.filter((l) => l.modelMeta?.kind !== "margin");

    if (marginLegs.length > 0) {
      const meta = marginLegs[0].modelMeta!;
      const m = meta.blendedMargin ?? 0;
      const sigma = meta.sigma ?? 1;
      // Convert every constraint into bounds on the HOME margin.
      let lower = -Infinity;
      let upper = Infinity;
      for (const leg of marginLegs) {
        const mm = leg.modelMeta!;
        const t = mm.threshold ?? 0;
        if (mm.side === "home") lower = Math.max(lower, t);
        else upper = Math.min(upper, -t);
      }
      const pUpper = upper === Infinity ? 1 : normalCdf((upper - m) / sigma);
      const pLower = lower === -Infinity ? 0 : normalCdf((lower - m) / sigma);
      joint *= clamp(pUpper - pLower, 0.0001, 0.9999);
    }

    // totals are treated as independent of the margin within a game
    for (const leg of otherLegs) joint *= leg.modelProbability;
  }

  return joint;
}

/** True when a slip contains more than one leg from the same game. */
export function hasCorrelatedLegs(legs: SgpLeg[]): boolean {
  const seen = new Set<string>();
  for (const l of legs) {
    if (seen.has(l.gameId)) return true;
    seen.add(l.gameId);
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * 9. Payout + slip assembly
 * ------------------------------------------------------------------ */

export interface PayoutBreakdown {
  stake: number;
  decimalOdds: number;
  americanOdds: number;
  payout: number;
  profit: number;
  /** Break-even probability implied by the combined price. */
  impliedProbability: number;
  /** Our correlation-adjusted probability that the slip wins. */
  modelProbability: number;
  /** Naive product of leg probabilities (ignores same-game correlation). */
  naiveProbability: number;
  /** Expected profit/loss on this stake. */
  expectedValue: number;
  correlated: boolean;
}

export function calculatePayout(
  stake: number,
  legs: SgpLeg[],
): PayoutBreakdown {
  const decimalOdds = combineLegs(legs);
  const payout = stake * decimalOdds;
  const adjusted = jointProbability(legs);
  const naive = legs.reduce((acc, l) => acc * l.modelProbability, 1);
  return {
    stake,
    decimalOdds: Number(decimalOdds.toFixed(2)),
    americanOdds: decimalToAmerican(decimalOdds),
    payout: Number(payout.toFixed(2)),
    profit: Number((payout - stake).toFixed(2)),
    impliedProbability: Number(impliedProbability(decimalOdds).toFixed(4)),
    modelProbability: Number(adjusted.toFixed(4)),
    naiveProbability: Number(naive.toFixed(4)),
    expectedValue: Number(
      (stake * expectedValue(adjusted, decimalOdds)).toFixed(2),
    ),
    correlated: hasCorrelatedLegs(legs),
  };
}

/** Edge of a single leg: model probability minus the break-even price. */
export function legEdge(leg: SgpLeg): number {
  if (typeof leg.edge === "number") return leg.edge;
  const implied = impliedProbability(americanToDecimal(leg.americanOdds));
  return Number((leg.modelProbability - implied).toFixed(4));
}

/** Rank score: edge, discounted by how much we trust the estimate. */
function legScore(leg: SgpLeg): number {
  return legEdge(leg) * (0.4 + 0.6 * (leg.confidenceScore ?? 0.5));
}

/**
 * Assemble the research slip.
 *
 * Legs are ranked by confidence-weighted edge and diversified across games
 * (one per game by default) so the independence assumption behind the combined
 * price actually holds. Same-game legs are only pulled in to reach the minimum
 * length, and the slip is flagged when that happens.
 */
export function buildRecommendation(
  candidates: SgpLeg[],
  minLegs = 6,
  cap = 10,
  maxPerGame = 1,
): SgpRecommendation {
  const ranked = [...candidates].sort((a, b) => legScore(b) - legScore(a));
  const perGame = new Map<string, number>();
  const legs: SgpLeg[] = [];

  // Pass 1 — one leg per game, so the independence behind the combined price
  // actually holds. Take as many as we can up to the cap.
  for (const leg of ranked) {
    if (legs.length >= cap) break;
    const used = perGame.get(leg.gameId) ?? 0;
    if (used >= maxPerGame) continue;
    perGame.set(leg.gameId, used + 1);
    legs.push(leg);
  }

  // Pass 2 — only to reach the minimum slip length when there simply aren't
  // enough games. Stop at minLegs rather than padding with correlated legs.
  const taken = new Set(legs.map((l) => l.id));
  for (const leg of ranked) {
    if (legs.length >= minLegs) break;
    if (taken.has(leg.id)) continue;
    taken.add(leg.id);
    legs.push(leg);
  }

  const combinedDecimalOdds = combineLegs(legs);
  const adjusted = jointProbability(legs);
  const naive = legs.reduce((acc, l) => acc * l.modelProbability, 1);
  const correlated = hasCorrelatedLegs(legs);

  const notes: string[] = [
    `Model ${MODEL_VERSION}: a single projected margin per game (log5 from season records + home advantage, shrunk toward the de-vigged market by at most ${Math.round(MAX_MODEL_WEIGHT * 100)}%).`,
    "Probabilities are compared against de-vigged market prices, so the book's margin is never counted as edge.",
  ];
  const ev = expectedValue(adjusted, combinedDecimalOdds);
  if (correlated) {
    notes.push(
      "This slip contains multiple legs from the same game. Those outcomes are correlated, so the true win probability is higher than the naive product — and a sportsbook would price a real same-game parlay well below the combined odds shown.",
    );
    if (ev > 0) {
      notes.push(
        "Heads up: the positive expected value above is an artifact of pricing correlated legs as if they were independent. That price is not obtainable — treat it as a demonstration of why correlation matters, not as a betting edge.",
      );
    }
  }
  if (legs.every((l) => legEdge(l) <= 0)) {
    notes.push(
      "No leg currently shows positive expected value: efficient markets plus the book's margin usually leave every side negative-EV. The slip is ranked least-bad first.",
    );
  }

  return {
    id: `sgp-${legs.map((l) => l.id).join("-").slice(0, 40)}`,
    title: `${legs.length}-Leg ${correlated ? "Same-Game" : "Cross-Game"} Research Slip`,
    legs,
    combinedDecimalOdds: Number(combinedDecimalOdds.toFixed(2)),
    combinedAmericanOdds: decimalToAmerican(combinedDecimalOdds),
    impliedProbability: Number(
      impliedProbability(combinedDecimalOdds).toFixed(4),
    ),
    modelProbability: Number(adjusted.toFixed(4)),
    naiveProbability: Number(naive.toFixed(4)),
    fairAmericanOdds: fairAmericanOdds(adjusted),
    expectedValue: Number(
      expectedValue(adjusted, combinedDecimalOdds).toFixed(4),
    ),
    correlated,
    /** EV is only meaningful when the combined price is actually obtainable. */
    expectedValueIsTheoretical: correlated,
    modelVersion: MODEL_VERSION,
    notes,
    disclaimer: SGP_DISCLAIMER,
  };
}
