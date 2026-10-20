import type { ClosingLine, League, SgpLeg } from "@/types";
import { americanToDecimal, impliedProbability } from "@/lib/sgp";

/**
 * Prediction logging + scoring.
 *
 * A model you never grade is a guess with extra steps. Every leg the SGP tool
 * shows is recorded with the probability we claimed at the time; once the game
 * finishes we score it. That gives the only honest answers to "is this model
 * any good?" — calibration (when we say 65%, does it land 65% of the time?)
 * and skill against the market (are we beating the de-vigged price?).
 */

export interface PredictionRecord {
  id: string;
  gameId: string;
  league: League;
  matchup: string;
  market: string;
  selection: string;
  americanOdds: number;
  modelProbability: number;
  /** De-vigged market probability — the benchmark we must beat. */
  marketProbability: number;
  recordedAt: string;

  // everything needed to grade it later
  kind: "margin" | "total";
  /** "home"/"away" for margin legs; "over"/"under" for totals. */
  side?: "home" | "away" | "over" | "under";
  /** The team's margin must exceed this. */
  threshold?: number;
  totalLine?: number;

  /** The number we took, on its own axis: spread threshold or total line. */
  lineAtPick?: number;

  // filled in once the game is final
  graded?: boolean;
  won?: boolean;
  push?: boolean;
  finalHome?: number;
  finalAway?: number;
  gradedAt?: string;

  // filled in once the market has closed
  /** The line the market settled on, same axis as lineAtPick. */
  closingLine?: number;
  /** Points the line moved in our favour (negative = moved against us). */
  lineValue?: number;
  /** Change in de-vigged probability in our favour, from moneyline closes. */
  probabilityValue?: number;
  clvCheckedAt?: string;
}

export interface GameResult {
  gameId: string;
  homeScore: number;
  awayScore: number;
  final: boolean;
}

/** Turn a live leg into a logged prediction (null when it can't be graded). */
export function toPrediction(leg: SgpLeg): PredictionRecord | null {
  const meta = leg.modelMeta;
  if (!meta) return null;
  const totalLine =
    meta.kind === "total"
      ? (meta.totalLine ?? Number(/([\d.]+)/.exec(leg.selection)?.[1] ?? NaN))
      : undefined;
  if (meta.kind === "total" && !Number.isFinite(totalLine)) return null;

  return {
    id: `${leg.id}-${new Date().toISOString().slice(0, 10)}`,
    gameId: leg.gameId,
    league: leg.league,
    matchup: leg.matchup,
    market: leg.market,
    selection: leg.selection,
    americanOdds: leg.americanOdds,
    modelProbability: leg.modelProbability,
    marketProbability: leg.marketProbability,
    recordedAt: new Date().toISOString(),
    kind: meta.kind,
    side: meta.side,
    threshold: meta.threshold,
    totalLine,
    lineAtPick: meta.kind === "total" ? totalLine : meta.threshold,
  };
}

/* ------------------------- closing line value ------------------------- */

/**
 * Score a pick against the number the market closed at.
 *
 * This is the fast feedback loop. Outcome grading asks a binary question with
 * enormous variance — hundreds of settled picks before the signal separates
 * from the noise. CLV asks a continuous one: we took this side at this
 * number, where did the market end up? If we take a team at -3 and it closes
 * -4, we beat the market on that pick, regardless of whether the game went
 * our way. That converges in tens of picks instead of hundreds, which is what
 * makes every other model change measurable in a reasonable timeframe.
 */
export function applyClosingLine(
  p: PredictionRecord,
  closing: ClosingLine,
): PredictionRecord {
  let closingLine: number | undefined;
  let lineValue: number | undefined;

  if (p.kind === "total" && closing.total != null) {
    closingLine = closing.total;
    // An over wants the line to have been lower than where it closed.
    const delta = closing.total - (p.lineAtPick ?? closing.total);
    lineValue = p.side === "under" ? -delta : delta;
  } else if (p.kind === "margin" && closing.spread != null) {
    // closing.spread is the HOME spread; the threshold axis is the team's own
    // margin, so a home leg's closing threshold is -spread and an away leg's
    // is +spread.
    const closingThreshold =
      p.side === "home" ? -closing.spread : closing.spread;
    closingLine = closingThreshold;
    // Getting a LOWER threshold than the close means we got the better number.
    lineValue = closingThreshold - (p.lineAtPick ?? closingThreshold);
  }

  // Moneylines have no line to move, so they are scored on price instead.
  let probabilityValue: number | undefined;
  if (closing.homeMoneyline != null && closing.awayMoneyline != null) {
    const raw = [
      impliedProbability(americanToDecimal(closing.homeMoneyline)),
      impliedProbability(americanToDecimal(closing.awayMoneyline)),
    ];
    const sum = raw[0] + raw[1];
    if (sum > 0) {
      const fairHome = raw[0] / sum;
      const closingProb = p.side === "away" ? 1 - fairHome : fairHome;
      // Market closing HIGHER than our entry price means we got value.
      probabilityValue = closingProb - p.marketProbability;
    }
  }

  if (closingLine === undefined && probabilityValue === undefined) return p;

  return {
    ...p,
    closingLine,
    lineValue:
      lineValue === undefined ? undefined : Number(lineValue.toFixed(2)),
    probabilityValue:
      probabilityValue === undefined
        ? undefined
        : Number(probabilityValue.toFixed(4)),
    clvCheckedAt: new Date().toISOString(),
  };
}

export interface ClvScore {
  /** Picks with a closing line to compare against. */
  checked: number;
  /** Share of those where the line moved toward us. */
  beatRate: number;
  /** Mean points of line value (positive = we got the better number). */
  avgLineValue: number;
  /** Mean probability value in points, from moneyline closes. */
  avgProbabilityValue: number;
  /** CLV is informative far sooner than outcomes — tens, not hundreds. */
  meaningful: boolean;
}

const EMPTY_CLV: ClvScore = {
  checked: 0,
  beatRate: 0,
  avgLineValue: 0,
  avgProbabilityValue: 0,
  meaningful: false,
};

export function scoreClv(records: PredictionRecord[]): ClvScore {
  const withLine = records.filter((r) => r.lineValue !== undefined);
  const withProb = records.filter((r) => r.probabilityValue !== undefined);
  const checked = records.filter(
    (r) => r.lineValue !== undefined || r.probabilityValue !== undefined,
  );
  if (checked.length === 0) return EMPTY_CLV;

  // A pick "beat the close" on whichever measure it has; line movement is the
  // more direct signal, so it wins when both are present.
  const beat = checked.filter((r) =>
    r.lineValue !== undefined
      ? r.lineValue > 0
      : (r.probabilityValue ?? 0) > 0,
  ).length;

  const mean = (xs: number[]) =>
    xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

  return {
    checked: checked.length,
    beatRate: Number((beat / checked.length).toFixed(4)),
    avgLineValue: Number(mean(withLine.map((r) => r.lineValue!)).toFixed(3)),
    avgProbabilityValue: Number(
      mean(withProb.map((r) => r.probabilityValue!)).toFixed(4),
    ),
    // Roughly an order of magnitude fewer picks than outcome grading needs.
    meaningful: checked.length >= 20,
  };
}

/** Grade one prediction against a final score. */
export function gradePrediction(
  p: PredictionRecord,
  r: GameResult,
): PredictionRecord {
  if (!r.final) return p;
  const homeMargin = r.homeScore - r.awayScore;
  let won: boolean;
  let push = false;

  if (p.kind === "total") {
    const total = r.homeScore + r.awayScore;
    const line = p.totalLine ?? 0;
    if (total === line) push = true;
    won = p.side === "under" ? total < line : total > line;
  } else {
    const t = p.threshold ?? 0;
    // "home" legs need homeMargin > t; "away" legs need awayMargin > t
    const value = p.side === "home" ? homeMargin : -homeMargin;
    if (value === t) push = true;
    won = value > t;
  }

  return {
    ...p,
    graded: true,
    won,
    push,
    finalHome: r.homeScore,
    finalAway: r.awayScore,
    gradedAt: new Date().toISOString(),
  };
}

/* ---------------------------- scoring ---------------------------- */

export interface CalibrationBin {
  label: string;
  /** Mean probability we predicted in this bin. */
  predicted: number;
  /** Share that actually won. */
  actual: number;
  count: number;
}

export interface ScoreCard {
  graded: number;
  wins: number;
  losses: number;
  pushes: number;
  /** Mean squared error of our probabilities. Lower is better; 0.25 = coinflip. */
  brierModel: number;
  /** Same metric for the de-vigged market price. */
  brierMarket: number;
  /** 1 - model/market. Positive means we beat the market. */
  skillScore: number;
  /** Profit per unit staked if every logged leg were backed flat. */
  roi: number;
  bins: CalibrationBin[];
  /** Brier needs real volume before it means anything. */
  meaningful: boolean;
  /**
   * Median absolute gap between the probability we published and the
   * consensus, across the settled picks, in probability.
   *
   * This answers a question the win-loss record cannot: WHOSE forecast is
   * being graded. While the model's vote is gated at zero the published
   * probability is the consensus plus a distribution-shape correction, so a
   * record built on it is mostly the market's record, not ours. When this is
   * near zero, a hot or cold streak says nothing about the model either way.
   */
  medianLean: number;
}

const EMPTY: ScoreCard = {
  graded: 0, wins: 0, losses: 0, pushes: 0,
  brierModel: 0, brierMarket: 0, skillScore: 0, roi: 0,
  bins: [], meaningful: false, medianLean: 0,
};

/**
 * Score the graded predictions. Pushes are excluded — they're not a test of
 * the probability, they're a refund.
 */
export function scorePredictions(
  records: PredictionRecord[],
  binCount = 5,
): ScoreCard {
  const settled = records.filter((r) => r.graded && !r.push);
  if (settled.length === 0) {
    return { ...EMPTY, pushes: records.filter((r) => r.push).length };
  }

  let seModel = 0;
  let seMarket = 0;
  let profit = 0;
  let wins = 0;

  for (const r of settled) {
    const o = r.won ? 1 : 0;
    seModel += (r.modelProbability - o) ** 2;
    seMarket += (r.marketProbability - o) ** 2;
    profit += r.won ? americanToDecimal(r.americanOdds) - 1 : -1;
    if (r.won) wins++;
  }

  const brierModel = seModel / settled.length;
  const brierMarket = seMarket / settled.length;

  // calibration bins across the probability range we actually produce
  const bins: CalibrationBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const lo = i / binCount;
    const hi = (i + 1) / binCount;
    const inBin = settled.filter(
      (r) =>
        r.modelProbability >= lo &&
        (i === binCount - 1 ? r.modelProbability <= hi : r.modelProbability < hi),
    );
    if (inBin.length === 0) continue;
    bins.push({
      label: `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`,
      predicted:
        inBin.reduce((s, r) => s + r.modelProbability, 0) / inBin.length,
      actual: inBin.filter((r) => r.won).length / inBin.length,
      count: inBin.length,
    });
  }

  return {
    graded: settled.length,
    wins,
    losses: settled.length - wins,
    pushes: records.filter((r) => r.push).length,
    brierModel: Number(brierModel.toFixed(4)),
    brierMarket: Number(brierMarket.toFixed(4)),
    skillScore:
      brierMarket > 0 ? Number((1 - brierModel / brierMarket).toFixed(4)) : 0,
    roi: Number((profit / settled.length).toFixed(4)),
    medianLean: (() => {
      const gaps = settled
        .map((r) => Math.abs(r.modelProbability - r.marketProbability))
        .sort((a, b) => a - b);
      const mid = Math.floor(gaps.length / 2);
      const med =
        gaps.length % 2 === 0
          ? (gaps[mid - 1] + gaps[mid]) / 2
          : gaps[mid];
      return Number(med.toFixed(4));
    })(),
    bins,
    // below ~50 settled legs the differences are noise, not signal
    meaningful: settled.length >= 50,
  };
}
