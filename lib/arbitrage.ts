import type { BookPrice, League } from "@/types";
import { americanToDecimal, impliedProbability } from "@/lib/sgp";
import { isBookmaker, isPlausibleAmerican } from "@/lib/market";
import type { DiscreteDist } from "@/lib/distributions";

/**
 * Edge that does not require out-forecasting the market.
 *
 * Everything else in this model has run into the same wall: the closing line
 * aggregates lineups, injuries and sharp money, our inputs are a strict
 * subset of public season data, and the backtest exists precisely because
 * claiming to out-predict that should be measured rather than asserted.
 *
 * But "beat the market" has three other meanings, and all of them are real:
 *
 *  1. **Arbitrage.** Two books price the same two-way market such that their
 *     best prices sum to under 100%. Backing both sides returns a profit
 *     whatever happens. No forecast involved — it is an inconsistency between
 *     two prices, and it either exists or it doesn't.
 *  2. **Middles.** Two books post different LINES. Buy the low side at one
 *     and the high side at the other and there is a band of outcomes where
 *     both bets win. This is where the distribution work finally pays for
 *     itself: the exact probability of landing in that band is computable
 *     from the discrete pmf, including push mass and key numbers, which a
 *     normal-curve approximation gets wrong precisely at the integer margins
 *     middles live on.
 *  3. **Stale books.** When most books have moved and one has not, that one
 *     is offering yesterday's price. The feed timestamps every bookmaker, so
 *     this is observable rather than inferred.
 *
 * None of these need the model to be smarter than the market. They need it to
 * notice when the market disagrees with itself.
 */

export interface ArbOpportunity {
  market: "moneyline" | "spread" | "total";
  sideA: { label: string; book: string; american: number };
  sideB: { label: string; book: string; american: number };
  /** Guaranteed profit per $1 of total stake, ignoring bet limits. */
  guaranteedReturn: number;
  /** Share of the total stake that belongs on side A. */
  stakeShareA: number;
}

/**
 * A placeable arbitrage: exact amounts, at exact books, with the guarantee
 * recomputed AFTER rounding.
 *
 * `guaranteedReturn` on the opportunity is the textbook figure and assumes
 * you can stake any fraction of a dollar. You cannot. Books take whole units,
 * and on a thin arbitrage rounding is not a detail — a 0.5% edge on a $100
 * outlay is 50 cents, and rounding two legs to the nearest dollar can move
 * each by up to 50 cents. That is the difference between a guarantee and a
 * coin flip, so the guarantee is recomputed from the amounts actually placed
 * and `stillArbitrage` says whether it survived.
 */
export interface ArbSlipLeg {
  label: string;
  book: string;
  american: number;
  decimal: number;
  /** The exact stake that would equalise payouts, before rounding. */
  idealStake: number;
  /** What you actually place, rounded to the unit. */
  stake: number;
  /** Returned if this side wins, stake included. */
  payout: number;
}

export interface ArbSlip {
  market: ArbOpportunity["market"];
  matchup: string;
  league: League;
  legs: [ArbSlipLeg, ArbSlipLeg];
  /** Total actually placed across both books. */
  outlay: number;
  /** Profit if the worse-paying side wins. This is the guarantee. */
  worstProfit: number;
  /** Profit if the better-paying side wins. */
  bestProfit: number;
  /** worstProfit / outlay, i.e. the return you are actually guaranteed. */
  guaranteedReturn: number;
  /** The frictionless figure, for comparison. */
  theoreticalReturn: number;
  /** False when rounding has eaten the edge at this stake. */
  stillArbitrage: boolean;
  /**
   * Smallest total outlay at which rounding still leaves a guarantee.
   *
   * Thin arbitrages need size to survive rounding, and this says how much.
   * Null when no stake up to the search ceiling works, which means the
   * opportunity is too thin to place in whole units at all.
   */
  minimumStake: number | null;
  /**
   * The nearest workable outlay at or above what was asked for.
   *
   * Needed because viability is NOT monotonic in stake. On a real 0.24%
   * arbitrage, $43 guarantees a profit and $50 loses: the rounding of the
   * two legs lands differently, and more money is not automatically safer.
   * A bare minimum would therefore mislead anyone who then typed a round
   * number. Null when nothing nearby works.
   */
  suggestedStake: number | null;
}

export interface MiddleOpportunity {
  market: "spread" | "total";
  /** The side that wins ABOVE its line. */
  lowSide: { label: string; book: string; american: number; line: number };
  /** The side that wins BELOW its line. */
  highSide: { label: string; book: string; american: number; line: number };
  /** Outcomes strictly inside this band win BOTH bets. */
  gapFrom: number;
  gapTo: number;
  /** Exact probability of landing in the band, from the discrete pmf. */
  middleProbability: number;
  /** Expected profit per $1 of total stake, with pushes handled exactly. */
  expectedValue: number;
}

export interface StaleBook {
  book: string;
  /** How far behind the freshest surveyed book, in minutes. */
  minutesBehind: number;
  /** Its price's distance from the consensus, in probability points. */
  deviation: number;
}

export interface MarketOpportunities {
  arbitrage: ArbOpportunity[];
  middles: MiddleOpportunity[];
  stale: StaleBook[];
}

/** The best (highest-paying) price on one side across books. */
function best(
  books: BookPrice[],
  pick: (b: BookPrice) => number | undefined,
): { book: string; american: number } | null {
  let out: { book: string; american: number } | null = null;
  for (const b of books) {
    /*
     * The same two guards the consensus uses, applied here too, because this
     * is the module that reports RISK-FREE profit and so is the one that must
     * not be fooled.
     *
     * Both failures were observed on real historical data: an exchange whose
     * quotes were not American odds at all produced a two-way "arbitrage"
     * paying 15% guaranteed, and the apparent arbitrage rate fell from 8.1%
     * of games to 2.2% once exchanges and impossible prices were excluded.
     * Every one of the removed opportunities was fictional.
     */
    if (!isBookmaker(b.book)) continue;
    const v = pick(b);
    if (!isPlausibleAmerican(v)) continue;
    if (!out || v > out.american) out = { book: b.book, american: v };
  }
  return out;
}

/**
 * A two-way market whose best prices sum to under 100% implied.
 *
 * This is the one genuinely risk-free result in the whole model, so it is
 * also the one most likely to be an artifact: a misparsed line, a price a
 * book has already pulled, or two quotes at different lines treated as the
 * same bet. The caller is responsible for only passing prices at a matched
 * line, and the UI states that limits and speed decide whether it is real.
 */
export function findArbitrage(
  market: ArbOpportunity["market"],
  books: BookPrice[],
  sideA: { label: string; pick: (b: BookPrice) => number | undefined },
  sideB: { label: string; pick: (b: BookPrice) => number | undefined },
): ArbOpportunity | null {
  const a = best(books, sideA.pick);
  const b = best(books, sideB.pick);
  if (!a || !b) return null;
  // The same book on both sides is its own market, not an inconsistency
  // between two markets — and a book pricing itself under 100% is a mistake
  // it will correct, not an opportunity two books created.
  if (a.book === b.book) return null;

  const impliedA = impliedProbability(americanToDecimal(a.american));
  const impliedB = impliedProbability(americanToDecimal(b.american));
  const total = impliedA + impliedB;
  if (!(total < 0.999)) return null;

  return {
    market,
    sideA: { label: sideA.label, book: a.book, american: a.american },
    sideB: { label: sideB.label, book: b.book, american: b.american },
    guaranteedReturn: Number((1 / total - 1).toFixed(4)),
    stakeShareA: Number((impliedA / total).toFixed(4)),
  };
}

/**
 * Expected value of a middle, priced off the real distribution.
 *
 * Stakes are split evenly and every outcome is enumerated over the pmf, so
 * pushes on either boundary are handled exactly rather than approximated —
 * which matters because a middle's whole value sits on the integer outcomes
 * between two half-point lines.
 */
function priceMiddle(
  dist: DiscreteDist,
  lowLine: number,
  lowDecimal: number,
  highLine: number,
  highDecimal: number,
): { middleProbability: number; expectedValue: number } {
  const stake = 0.5;
  let ev = 0;
  let middle = 0;

  for (const { k, p } of dist.support()) {
    if (p <= 0) continue;
    // The "low" bet wins above its line; the "high" bet wins below its line.
    const lowWin = k > lowLine;
    const lowPush = k === lowLine;
    const highWin = k < highLine;
    const highPush = k === highLine;

    const payout =
      stake * (lowWin ? lowDecimal : lowPush ? 1 : 0) +
      stake * (highWin ? highDecimal : highPush ? 1 : 0);
    ev += p * payout;
    if (lowWin && highWin) middle += p;
  }

  return {
    middleProbability: Number(middle.toFixed(4)),
    expectedValue: Number((ev - 1).toFixed(4)),
  };
}

/**
 * Pairs of books whose lines differ enough to leave a winning band.
 *
 * Only pairs where the gap actually contains an achievable outcome are
 * returned — two books half a point apart leave nothing to win.
 */
export function findMiddles(
  market: MiddleOpportunity["market"],
  books: BookPrice[],
  dist: DiscreteDist,
  lineOf: (b: BookPrice) => number | undefined,
  lowPrice: (b: BookPrice) => number | undefined,
  highPrice: (b: BookPrice) => number | undefined,
  labels: { low: (line: number) => string; high: (line: number) => string },
): MiddleOpportunity[] {
  const out: MiddleOpportunity[] = [];

  // Same guards as findArbitrage: an exchange's non-American quotes or an
  // impossible price would otherwise invent a middle that cannot be placed.
  const usable = books.filter((b) => isBookmaker(b.book));
  for (const a of usable) {
    for (const b of usable) {
      if (a.book === b.book) continue;
      const lowLine = lineOf(a);
      const highLine = lineOf(b);
      const lowOdds = lowPrice(a);
      const highOdds = highPrice(b);
      if (
        lowLine == null || highLine == null ||
        !Number.isFinite(lowLine) || !Number.isFinite(highLine) ||
        !isPlausibleAmerican(lowOdds) || !isPlausibleAmerican(highOdds)
      ) {
        continue;
      }
      // A middle needs the low side's line BELOW the high side's.
      if (!(lowLine < highLine)) continue;

      const priced = priceMiddle(
        dist,
        lowLine,
        americanToDecimal(lowOdds),
        highLine,
        americanToDecimal(highOdds),
      );
      // No achievable outcome in the band means there is no middle.
      if (priced.middleProbability <= 0) continue;

      out.push({
        market,
        lowSide: { label: labels.low(lowLine), book: a.book, american: lowOdds, line: lowLine },
        highSide: { label: labels.high(highLine), book: b.book, american: highOdds, line: highLine },
        gapFrom: lowLine,
        gapTo: highLine,
        ...priced,
      });
    }
  }

  // Best expected value first; a middle with negative EV is still reported so
  // the cost of chasing one is visible rather than hidden.
  return out.sort((x, y) => y.expectedValue - x.expectedValue).slice(0, 4);
}

/**
 * How stale is each book, and how far from the consensus?
 *
 * Staleness is measured against the FRESHEST surveyed book rather than the
 * clock, deliberately. Our own slate is cached for up to four hours, so
 * comparing to "now" would mark every book stale whenever the cache was warm.
 * Comparing books to each other asks the question that matters: has this one
 * moved since the others did?
 */
export function findStaleBooks(
  books: BookPrice[],
  consensusHomeProb: number | null,
): StaleBook[] {
  const stamped = books.filter(
    (b) =>
      isBookmaker(b.book) &&
      b.lastUpdate &&
      Number.isFinite(Date.parse(b.lastUpdate)),
  );
  if (stamped.length < 2) return [];

  const times = stamped.map((b) => Date.parse(b.lastUpdate as string));
  const freshest = Math.max(...times);

  const out: StaleBook[] = [];
  for (const b of stamped) {
    const t = Date.parse(b.lastUpdate as string);
    const minutesBehind = (freshest - t) / 60_000;
    // A couple of minutes is ordinary jitter between feeds.
    if (minutesBehind < 5) continue;

    let deviation = 0;
    if (
      consensusHomeProb != null &&
      b.homeMoneyline != null &&
      b.awayMoneyline != null
    ) {
      const raw = [
        impliedProbability(americanToDecimal(b.homeMoneyline)),
        impliedProbability(americanToDecimal(b.awayMoneyline)),
      ];
      const sum = raw[0] + raw[1];
      if (sum > 0) deviation = raw[0] / sum - consensusHomeProb;
    }

    out.push({
      book: b.book,
      minutesBehind: Number(minutesBehind.toFixed(0)),
      deviation: Number(deviation.toFixed(4)),
    });
  }

  // Most stale first, and only books that are actually behind.
  return out
    .sort((a, b) => b.minutesBehind - a.minutesBehind)
    .slice(0, 5);
}

/** Leagues whose markets are thin enough that softness is plausible. */
export const SOFTER_MARKETS: League[] = ["NCAAB", "NCAAF", "NHL"];

/* ------------------------------------------------------------------ *
 * Arbitrage slip builder
 * ------------------------------------------------------------------ */

/** Round to the nearest whole unit the book will actually accept. */
function roundTo(x: number, unit: number): number {
  return Math.max(unit, Math.round(x / unit) * unit);
}

/**
 * Turn an opportunity into exact instructions at a given outlay.
 *
 * The split that equalises payouts is stakeA = total · (1/dA)/(1/dA + 1/dB),
 * which `findArbitrage` already computed as `stakeShareA`. Everything here is
 * about what happens once that ideal is rounded to placeable amounts.
 */
export function buildArbSlip(
  opp: ArbOpportunity,
  matchup: string,
  league: League,
  totalStake: number,
  unit = 1,
): ArbSlip {
  const dA = americanToDecimal(opp.sideA.american);
  const dB = americanToDecimal(opp.sideB.american);
  const idealA = totalStake * opp.stakeShareA;
  const idealB = totalStake - idealA;
  const stakeA = roundTo(idealA, unit);
  const stakeB = roundTo(idealB, unit);
  const payoutA = stakeA * dA;
  const payoutB = stakeB * dB;
  const outlay = stakeA + stakeB;
  // Whichever side wins, you collect that side's payout and lose the other
  // stake. The guarantee is the worse of the two.
  const worstProfit = Math.min(payoutA, payoutB) - outlay;
  const bestProfit = Math.max(payoutA, payoutB) - outlay;

  /*
   * The smallest outlay at which rounding still leaves a profit. Searched
   * rather than derived: the rounding boundaries are not smooth, so the
   * answer is not simply "edge divided by unit".
   */
  let minimumStake: number | null = null;
  for (let s = unit * 2; s <= unit * 2000; s += unit) {
    const a = roundTo(s * opp.stakeShareA, unit);
    const b = roundTo(s - s * opp.stakeShareA, unit);
    if (Math.min(a * dA, b * dB) - (a + b) > 0) {
      minimumStake = a + b;
      break;
    }
  }

  /*
   * Viability is not monotonic in stake, so this is a local search upward
   * from the request rather than a formula. Capped so a hopeless
   * opportunity returns null instead of scanning forever.
   */
  let suggestedStake: number | null = null;
  if (worstProfit > 0) {
    suggestedStake = outlay;
  } else {
    for (let s = totalStake + unit; s <= totalStake + unit * 200; s += unit) {
      const a = roundTo(s * opp.stakeShareA, unit);
      const b = roundTo(s - s * opp.stakeShareA, unit);
      if (Math.min(a * dA, b * dB) - (a + b) > 0) { suggestedStake = a + b; break; }
    }
  }

  const round2 = (x: number) => Number(x.toFixed(2));
  return {
    market: opp.market,
    matchup,
    league,
    legs: [
      { label: opp.sideA.label, book: opp.sideA.book, american: opp.sideA.american,
        decimal: Number(dA.toFixed(4)), idealStake: round2(idealA),
        stake: stakeA, payout: round2(payoutA) },
      { label: opp.sideB.label, book: opp.sideB.book, american: opp.sideB.american,
        decimal: Number(dB.toFixed(4)), idealStake: round2(idealB),
        stake: stakeB, payout: round2(payoutB) },
    ],
    outlay: round2(outlay),
    worstProfit: round2(worstProfit),
    bestProfit: round2(bestProfit),
    guaranteedReturn: Number((worstProfit / outlay).toFixed(4)),
    theoreticalReturn: opp.guaranteedReturn,
    stillArbitrage: worstProfit > 0,
    minimumStake,
    suggestedStake,
  };
}

/**
 * Every arbitrage on the slate, best guarantee first.
 *
 * Ranked by the return that survives rounding at the requested stake, not by
 * the textbook figure — a 2% arbitrage that rounding destroys is worth less
 * than a 0.5% one that does not.
 */
export function buildArbSlips(
  found: { matchup: string; league: League; arbitrage: ArbOpportunity[] }[],
  totalStake: number,
  unit = 1,
): ArbSlip[] {
  return found
    .flatMap((g) =>
      g.arbitrage.map((a) => buildArbSlip(a, g.matchup, g.league, totalStake, unit)),
    )
    .sort((x, y) => y.guaranteedReturn - x.guaranteedReturn);
}
